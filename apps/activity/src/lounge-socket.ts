/**
 * The client end of the lounge's live socket (`docs/design/lounge-live.md`). Framework-free, with the
 * socket, the clock, the timers and the dice all injected, so the tests drive it deterministically.
 *
 * What it does: asks for a one-time ticket, opens the socket, reports `live` once the server's `hello`
 * arrives, hands every pushed resident to the room, pings every 60 s when nothing else arrived (the
 * server answers without waking its object), and reconnects after a drop with a jittered exponential
 * backoff (1 s up to 30 s). While it is not live the room polls, as it always did; that is the fallback
 * for an unsupported browser, a proxy that refuses the upgrade, a full guild or a server with the flag
 * off. After 6 failed tries in a row it stops trying until it is started again.
 */
import { ApiError, parseLiveMessage, type LiveMessage, type RoomResident } from './api';

/** Ping when nothing has arrived for this long. */
export const HEARTBEAT_MS = 60_000;
/** How often the socket looks at its own health. */
const TICK_MS = 20_000;
/** Nothing at all (not even a pong) for this long: the connection is dead. */
export const DEAD_AFTER_MS = 150_000;
/** The server's `hello` must arrive this soon after the socket opens. */
export const HELLO_TIMEOUT_MS = 15_000;
export const BACKOFF_FIRST_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;
/** Tries in a row that never reached `hello` before it gives up. */
export const MAX_FAILURES = 6;
/** The server closes the older socket of a player's 4th with this code: do not fight for it. */
export const CLOSE_REPLACED = 4000;

/** The part of a browser `WebSocket` that is used. */
export interface SocketLike {
  send(text: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

export type SocketState = 'idle' | 'connecting' | 'live' | 'backoff' | 'failed' | 'unsupported';

export interface LoungeSocketDeps {
  getTicket: () => Promise<string>;
  url: (ticket: string) => string;
  /** Null when the browser has no WebSocket. */
  createSocket: (url: string) => SocketLike | null;
  /** True while the socket delivers: the room stops polling. False again when it drops. */
  onLive: (live: boolean) => void;
  onResident: (resident: RoomResident) => void;
  now?: () => number;
  /** A number in [0, 1) for the backoff's jitter. */
  random?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface LoungeSocket {
  start(): void;
  stop(): void;
  state(): SocketState;
}

/** The wait before try number `attempt` (0 for the first retry): doubling, capped, half to full jitter. */
export function backoffDelay(attempt: number, random: number): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** Math.min(attempt, 10));
  return Math.round(base * (0.5 + 0.5 * random));
}

/** A random number from the browser's crypto (`Math.random` is banned). */
function cryptoRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] ?? 0) / 2 ** 32;
}

export function browserSocket(url: string): SocketLike | null {
  return typeof WebSocket === 'undefined' ? null : (new WebSocket(url) as unknown as SocketLike);
}

export function createLoungeSocket(deps: LoungeSocketDeps): LoungeSocket {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? cryptoRandom;
  const setTimer = deps.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let state: SocketState = 'idle';
  /** Bumped by every start and stop: a late answer from an older run is dropped. */
  let run = 0;
  let socket: SocketLike | null = null;
  let retryTimer: unknown = null;
  let tickTimer: unknown = null;
  let helloTimer: unknown = null;
  let failures = 0;
  let lastHeardAt = 0;
  let lastPingAt = 0;
  let announcedLive = false;

  const clearTimers = (): void => {
    for (const t of [retryTimer, tickTimer, helloTimer]) if (t !== null) clearTimer(t);
    retryTimer = null;
    tickTimer = null;
    helloTimer = null;
  };

  function setLive(live: boolean): void {
    if (announcedLive === live) return;
    announcedLive = live;
    deps.onLive(live);
  }

  function dropSocket(): void {
    const old = socket;
    socket = null;
    if (old !== null) {
      old.onopen = null;
      old.onmessage = null;
      old.onclose = null;
      old.onerror = null;
      try {
        old.close(1000);
      } catch {
        // Already closed.
      }
    }
  }

  /** A try ended without a working socket (or a working one dropped): wait, then try again. */
  function fail(thisRun: number, giveUp = false): void {
    if (thisRun !== run) return;
    clearTimers();
    dropSocket();
    setLive(false);
    failures++;
    if (giveUp || failures >= MAX_FAILURES) {
      state = 'failed';
      return;
    }
    state = 'backoff';
    retryTimer = setTimer(
      () => {
        retryTimer = null;
        void connect(thisRun);
      },
      backoffDelay(failures - 1, random()),
    );
  }

  function onFrame(thisRun: number, data: unknown): void {
    if (thisRun !== run) return;
    lastHeardAt = now();
    if (typeof data !== 'string' || data === 'pong') return;
    const message: LiveMessage | null = parseLiveMessage(data);
    if (message === null) return;
    if (message.type === 'hello') {
      if (helloTimer !== null) clearTimer(helloTimer);
      helloTimer = null;
      state = 'live';
      failures = 0;
      setLive(true);
      return;
    }
    if (state === 'live') deps.onResident(message.resident);
  }

  function tick(thisRun: number): void {
    if (thisRun !== run || socket === null) return;
    const t = now();
    if (t - lastHeardAt >= DEAD_AFTER_MS) {
      fail(thisRun);
      return;
    }
    if (t - lastHeardAt >= HEARTBEAT_MS && t - lastPingAt >= HEARTBEAT_MS) {
      lastPingAt = t;
      try {
        socket.send('ping');
      } catch {
        fail(thisRun);
        return;
      }
    }
    tickTimer = setTimer(() => {
      tick(thisRun);
    }, TICK_MS);
  }

  async function connect(thisRun: number): Promise<void> {
    if (thisRun !== run) return;
    state = 'connecting';
    let ticket: string;
    try {
      ticket = await deps.getTicket();
    } catch (err) {
      // A 404 means the server has the flag off: never try again this run.
      fail(thisRun, err instanceof ApiError && err.status === 404);
      return;
    }
    if (thisRun !== run) return;
    let opened: SocketLike | null;
    try {
      opened = deps.createSocket(deps.url(ticket));
    } catch {
      fail(thisRun);
      return;
    }
    if (opened === null) {
      state = 'unsupported';
      return;
    }
    socket = opened;
    lastHeardAt = now();
    lastPingAt = lastHeardAt;
    opened.onmessage = (event) => {
      onFrame(thisRun, event.data);
    };
    opened.onerror = () => {
      // A close follows; nothing to do here.
    };
    opened.onclose = (event) => {
      if (thisRun !== run) return;
      fail(thisRun, event.code === CLOSE_REPLACED);
    };
    helloTimer = setTimer(() => {
      helloTimer = null;
      fail(thisRun);
    }, HELLO_TIMEOUT_MS);
    tickTimer = setTimer(() => {
      tick(thisRun);
    }, TICK_MS);
  }

  return {
    start() {
      if (state !== 'idle') return;
      run++;
      failures = 0;
      void connect(run);
    },
    stop() {
      run++;
      clearTimers();
      dropSocket();
      setLive(false);
      if (state !== 'unsupported') state = 'idle';
    },
    state: () => state,
  };
}
