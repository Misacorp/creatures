import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFinalePoller } from './finale-poller';
import { createFinaleSocket } from './finale-socket';
import liveLobby from './fixtures/live-lobby.json';
import liveMid from './fixtures/live-mid.json';
import liveNone from './fixtures/live-none.json';
import { SAFETY_POLL_MS, finaleSocketTarget, pickNewer } from './live';
import { parseLiveSnapshot, type LiveSnapshot } from './live-api';
import type { SocketLike } from './live-socket';

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {}
  send(): void {}
  close(): void {}
  push(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

/** A fight in progress whose next round is far away, so only the poller's own pacing is in play. */
const mid = {
  ...parseLiveSnapshot(liveMid),
  nextRoundAt: liveMid.serverNow + 600_000,
} as LiveSnapshot;
const roundOf = (s: LiveSnapshot | null): number | null =>
  s === null || s.status === 'none' ? null : s.round;
const later = (n: number): unknown => ({ ...liveMid, serverNow: liveMid.serverNow + n, round: 5 });

/** The socket wired to a poller over a fake server, like `Live.tsx` wires them. */
function setup() {
  let shown: LiveSnapshot | null = mid;
  const sockets: FakeSocket[] = [];
  const tickets: [string, number][] = [];
  let polls = 0;
  const poller = createFinalePoller({
    fetchSnapshot: () => {
      polls++;
      return Promise.resolve(mid);
    },
    accept: (next) => {
      shown = pickNewer(shown, next);
    },
    latest: () => shown,
    serverNow: () => (shown?.serverNow ?? 0) + 1,
    onError: () => undefined,
    onRecovered: () => undefined,
  });
  const socket = createFinaleSocket({
    week: '2027-W02',
    party: 1,
    poller,
    getTicket: () => {
      tickets.push(['2027-W02', 1]);
      return Promise.resolve('t');
    },
    url: (ticket) => `wss://host/api/finale/live?ticket=${ticket}`,
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    random: () => 1,
  });
  return { poller, socket, sockets, tickets, shown: () => shown, polls: () => polls };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('when the finale screen opens its socket', () => {
  it('only while the server offers it and a lobby or a fight is on', () => {
    expect(finaleSocketTarget(true, mid)).toEqual({ week: '2027-W02', party: 1 });
    expect(finaleSocketTarget(true, parseLiveSnapshot(liveLobby))).toEqual({
      week: '2027-W02',
      party: 1,
    });
    expect(finaleSocketTarget(false, mid)).toBeNull();
    expect(finaleSocketTarget(true, null)).toBeNull();
    expect(finaleSocketTarget(true, parseLiveSnapshot(liveNone))).toBeNull();
    expect(finaleSocketTarget(true, { ...mid, status: 'done' } as LiveSnapshot)).toBeNull();
  });
});

describe('the finale socket and the poller together', () => {
  it('goes live on hello: the fast poll stops, and a pushed snapshot reaches the screen', async () => {
    const t = setup();
    t.poller.start(mid);
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.tickets).toEqual([['2027-W02', 1]]);
    expect(t.sockets[0]?.url).toBe('wss://host/api/finale/live?ticket=t');
    // Before the hello the poll still runs at its normal pace.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(t.polls()).toBe(1);
    t.sockets[0]?.push({ v: 1, type: 'hello', serverNow: 1 });
    const before = t.polls();
    await vi.advanceTimersByTimeAsync(SAFETY_POLL_MS - 2_000 - 1_000);
    expect(t.polls()).toBe(before);
    // The push is checked like a polled snapshot and shown (it is newer).
    t.sockets[0]?.push({ v: 1, type: 'finale', snapshot: later(5_000) });
    expect(roundOf(t.shown())).toBe(5);
    t.poller.stop();
    t.socket.stop();
  });

  it('ignores a push that is not a snapshot, and pushes of the lounge', async () => {
    const t = setup();
    t.poller.start(mid);
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    const s = t.sockets[0];
    s?.push({ v: 1, type: 'hello', serverNow: 1 });
    s?.push({ v: 1, type: 'finale', snapshot: { status: 'live' } });
    s?.push({
      v: 1,
      type: 'resident',
      resident: { userId: '2', name: 'Two', creature: null, spot: null },
    });
    expect(t.shown()).toBe(mid);
    t.poller.stop();
    t.socket.stop();
  });

  it('polls at the normal pace again when the socket drops', async () => {
    const t = setup();
    t.poller.start(mid);
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    const s = t.sockets[0];
    s?.push({ v: 1, type: 'hello', serverNow: 1 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(t.polls()).toBe(0);
    s?.onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(0);
    // Not live any more: a poll at once, then every 2 s (until the socket is back).
    expect(t.polls()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(t.polls()).toBe(2);
    t.poller.stop();
    t.socket.stop();
  });
});
