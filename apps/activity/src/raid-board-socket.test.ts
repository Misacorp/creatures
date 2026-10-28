import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocketLike } from './live-socket';
import type { RaidView } from './raid-api';
import { createRaidBoardSocket } from './raid-board-socket';

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

const mate = { ownerName: 'Mira', species: 'splashet', name: 'Splashet', level: 7, mine: false };
const shown = {
  weekId: '2027-W02',
  roster: [],
  parties: [],
  party: {
    party: 1,
    rowLength: 3,
    row: [0, 1, 2].map((slot) => ({ slot, zone: 'front', creature: null })),
  },
} as unknown as RaidView;
const raid = (extra: Record<string, unknown> = {}): unknown => ({
  v: 1,
  type: 'raid',
  week: '2027-W02',
  party: 1,
  cells: [{ slot: 1, creature: mate }],
  ...extra,
});
const hello = { v: 1, type: 'hello', serverNow: 1 };

function setup() {
  const sockets: FakeSocket[] = [];
  const tickets: string[] = [];
  const shownViews: RaidView[] = [];
  const reload = vi.fn();
  let current: RaidView | null = shown;
  const socket = createRaidBoardSocket({
    week: '2027-W02',
    party: 1,
    current: () => current,
    show: (view) => {
      shownViews.push(view);
      current = view;
    },
    reload,
    getTicket: () => {
      tickets.push('t');
      return Promise.resolve('t');
    },
    url: (ticket) => `wss://host/api/raid/board/live?ticket=${ticket}`,
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    random: () => 1,
  });
  return {
    socket,
    sockets,
    tickets,
    shownViews,
    reload,
    setCurrent: (v: RaidView | null) => {
      current = v;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the raid board socket', () => {
  it('asks for a ticket, connects, and shows a pushed cell in the board in place', async () => {
    const t = setup();
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.tickets).toHaveLength(1);
    expect(t.sockets[0]?.url).toBe('wss://host/api/raid/board/live?ticket=t');
    // Nothing is applied before the greeting.
    t.sockets[0]?.push(raid());
    expect(t.shownViews).toHaveLength(0);
    t.sockets[0]?.push(hello);
    t.sockets[0]?.push(raid());
    expect(t.shownViews).toHaveLength(1);
    expect(t.shownViews[0]?.party?.row[1]?.creature).toEqual(mate);
    expect(t.reload).not.toHaveBeenCalled();
    t.socket.stop();
  });

  it('reloads once for a message it cannot apply, a stale one, or junk, and ignores other kinds', async () => {
    const t = setup();
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    t.sockets[0]?.push(hello);
    t.sockets[0]?.push(raid({ cells: [{ slot: 7, creature: mate }] })); // an unknown slot
    expect(t.reload).toHaveBeenCalledTimes(1);
    t.sockets[0]?.push(raid({ party: 2 })); // another party
    expect(t.reload).toHaveBeenCalledTimes(2);
    t.sockets[0]?.push(raid({ surprise: true })); // not a shape we know
    expect(t.reload).toHaveBeenCalledTimes(3);
    t.setCurrent(null); // nothing on screen to apply it to
    t.sockets[0]?.push(raid());
    expect(t.reload).toHaveBeenCalledTimes(4);
    // Another socket kind's message is not ours: nothing happens.
    t.sockets[0]?.push({ v: 1, type: 'finale', snapshot: {} });
    expect(t.reload).toHaveBeenCalledTimes(4);
    expect(t.shownViews).toHaveLength(0);
    t.socket.stop();
  });

  it('reloads when it comes back after a drop, not on the first connect', async () => {
    const t = setup();
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    t.sockets[0]?.push(hello);
    expect(t.reload).not.toHaveBeenCalled();
    t.sockets[0]?.onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(t.sockets).toHaveLength(2);
    t.sockets[1]?.push(hello);
    expect(t.reload).toHaveBeenCalledTimes(1);
    t.socket.stop();
  });

  it('stays closed once stopped, and does nothing of its own while down', async () => {
    const t = setup();
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    t.sockets[0]?.push(hello);
    t.socket.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(t.sockets).toHaveLength(1);
    expect(t.tickets).toHaveLength(1);
    expect(t.reload).not.toHaveBeenCalled();
    // A refused ticket (the flag is off): no socket, no reload.
    const refused = createRaidBoardSocket({
      week: '2027-W02',
      party: 1,
      current: () => shown,
      show: () => undefined,
      reload: t.reload,
      getTicket: () => Promise.reject(new Error('down')),
      createSocket: () => null,
    });
    refused.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.reload).not.toHaveBeenCalled();
    refused.stop();
  });
});
