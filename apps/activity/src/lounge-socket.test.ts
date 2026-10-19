import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type RoomResident } from './api';
import {
  BACKOFF_MAX_MS,
  CLOSE_REPLACED,
  DEAD_AFTER_MS,
  HEARTBEAT_MS,
  HELLO_TIMEOUT_MS,
  MAX_FAILURES,
  backoffDelay,
  createLoungeSocket,
  type SocketLike,
} from './lounge-socket';

class FakeSocket implements SocketLike {
  sent: string[] = [];
  closedWith: number | null | undefined = undefined;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {}
  send(text: string): void {
    this.sent.push(text);
  }
  close(code?: number): void {
    this.closedWith = code ?? null;
  }
  /** What the server does. */
  push(data: unknown): void {
    this.onmessage?.({ data });
  }
  hello(): void {
    this.push(JSON.stringify({ v: 1, type: 'hello', serverNow: 1 }));
  }
  drop(code = 1006): void {
    this.onclose?.({ code });
  }
}

const resident: RoomResident = { userId: '2', name: 'Two', creature: null, spot: null };
const residentMessage = JSON.stringify({ v: 1, type: 'resident', resident });

/** A controller over fake sockets, a fake ticket source and a fixed "dice" value. */
function setup(options: { tickets?: () => Promise<string>; supported?: boolean } = {}) {
  const sockets: FakeSocket[] = [];
  const events: string[] = [];
  const residents: RoomResident[] = [];
  const socket = createLoungeSocket({
    getTicket: options.tickets ?? (() => Promise.resolve('ticket')),
    url: (ticket) => `wss://host/api/lounge/live?ticket=${ticket}`,
    createSocket: (url) => {
      if (options.supported === false) return null;
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    onLive: (live) => events.push(live ? 'live' : 'down'),
    onResident: (r) => residents.push(r),
    random: () => 1,
  });
  return { socket, sockets, events, residents };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Lets the controller try again until the `n`th socket exists (a second at a time, so no timeout fires). */
async function reach(sockets: readonly FakeSocket[], n: number): Promise<FakeSocket> {
  for (let i = 0; i < 40 && sockets.length < n; i++) await vi.advanceTimersByTimeAsync(1000);
  const found = sockets[n - 1];
  if (found === undefined) throw new Error(`socket ${String(n)} never opened`);
  return found;
}

describe('connecting', () => {
  it('opens one socket with a fresh ticket and is live only after the hello', async () => {
    const { socket, sockets, events } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.url).toBe('wss://host/api/lounge/live?ticket=ticket');
    expect(socket.state()).toBe('connecting');
    expect(events).toEqual([]);
    sockets[0]?.hello();
    expect(socket.state()).toBe('live');
    expect(events).toEqual(['live']);
  });

  it('hands pushed residents on, and ignores junk and a push before the hello', async () => {
    const { socket, sockets, residents } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    const s = sockets[0];
    s?.push(residentMessage);
    expect(residents).toEqual([]);
    s?.hello();
    s?.push('{nope');
    s?.push(42);
    s?.push('pong');
    s?.push(residentMessage);
    expect(residents).toEqual([resident]);
  });

  it('is unsupported (and never live) without a WebSocket', async () => {
    const { socket, events } = setup({ supported: false });
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.state()).toBe('unsupported');
    expect(events).toEqual([]);
  });

  it('stops for good when the server says the flag is off (404 on the ticket)', async () => {
    const { socket, sockets } = setup({
      tickets: () => Promise.reject(new ApiError(404, 'not_found')),
    });
    socket.start();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(socket.state()).toBe('failed');
    expect(sockets).toHaveLength(0);
  });

  it('stop closes the socket, reports not live and cancels everything', async () => {
    const { socket, sockets, events } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]?.hello();
    socket.stop();
    expect(sockets[0]?.closedWith).toBe(1000);
    expect(events).toEqual(['live', 'down']);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(sockets).toHaveLength(1);
    expect(socket.state()).toBe('idle');
  });

  it('ignores a ticket that arrives after stop', async () => {
    let release: (t: string) => void = () => undefined;
    const { socket, sockets } = setup({
      tickets: () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    });
    socket.start();
    socket.stop();
    release('late');
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(0);
  });
});

describe('reconnecting', () => {
  it('backs off 1 s, 2 s, 4 s with jitter, up to 30 s', () => {
    expect(backoffDelay(0, 1)).toBe(1000);
    expect(backoffDelay(0, 0)).toBe(500);
    expect(backoffDelay(1, 1)).toBe(2000);
    expect(backoffDelay(2, 1)).toBe(4000);
    expect(backoffDelay(9, 1)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(50, 0)).toBe(BACKOFF_MAX_MS / 2);
  });

  it('goes back to polling at once on a drop, then reconnects with a new ticket', async () => {
    const { socket, sockets, events } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]?.hello();
    sockets[0]?.drop();
    expect(events).toEqual(['live', 'down']);
    expect(socket.state()).toBe('backoff');
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    sockets[1]?.hello();
    expect(events).toEqual(['live', 'down', 'live']);
  });

  it('gives up after 6 tries in a row that never got a hello', async () => {
    const { socket, sockets } = setup();
    socket.start();
    for (let i = 1; i <= MAX_FAILURES; i++) (await reach(sockets, i)).drop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(socket.state()).toBe('failed');
    expect(sockets).toHaveLength(MAX_FAILURES);
  });

  it('a hello resets the count of failures', async () => {
    const { socket, sockets } = setup();
    socket.start();
    for (let i = 1; i < MAX_FAILURES; i++) (await reach(sockets, i)).drop();
    const last = await reach(sockets, MAX_FAILURES);
    last.hello();
    last.drop();
    expect(socket.state()).toBe('backoff');
  });

  it('treats an open that never says hello as a failure', async () => {
    const { socket, sockets, events } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(HELLO_TIMEOUT_MS);
    expect(sockets[0]?.closedWith).toBe(1000);
    expect(socket.state()).toBe('backoff');
    expect(events).toEqual([]);
  });

  it('does not fight when the server replaced it (code 4000)', async () => {
    const { socket, sockets } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]?.hello();
    sockets[0]?.drop(CLOSE_REPLACED);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(socket.state()).toBe('failed');
    expect(sockets).toHaveLength(1);
  });

  it('can be started again after stop', async () => {
    const { socket, sockets } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    socket.stop();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(2);
  });
});

describe('the heartbeat', () => {
  it('pings after 60 s of silence, not while frames keep arriving', async () => {
    const { socket, sockets } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    const s = sockets[0];
    s?.hello();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS - 20_000);
    expect(s?.sent).toEqual([]);
    // A push counts as life: no ping is due until 60 s after it.
    s?.push(residentMessage);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS - 20_000);
    expect(s?.sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(s?.sent).toEqual(['ping']);
    // The pong is life too.
    s?.push('pong');
    await vi.advanceTimersByTimeAsync(40_000);
    expect(s?.sent).toEqual(['ping']);
  });

  it('drops a connection that has been silent for 150 s and reconnects', async () => {
    const { socket, sockets, events } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]?.hello();
    await vi.advanceTimersByTimeAsync(DEAD_AFTER_MS + 20_000);
    expect(events).toEqual(['live', 'down']);
    expect(sockets[0]?.closedWith).toBe(1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sockets).toHaveLength(2);
  });
});
