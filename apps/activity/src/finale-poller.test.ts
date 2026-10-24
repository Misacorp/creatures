import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { createFinalePoller } from './finale-poller';
import { PUSH_GRACE_MS, SAFETY_POLL_MS, pickNewer } from './live';
import type { LiveSnapshot } from './live-api';

const START = 1_000_000;

const roundOf = (s: LiveSnapshot | null): number | null =>
  s === null || s.status === 'none' ? null : s.round;

/** A snapshot of a fight in round `round`, the next round `nextIn` ms after `serverNow`. */
function snap(serverNow: number, round: number, nextIn: number | null): LiveSnapshot {
  return {
    status: 'live',
    practice: false,
    week: '2027-W02',
    party: 1,
    you: 'm1',
    startsAt: START,
    roundMs: null,
    rounds: 12,
    round,
    roundStarts: [],
    nextRoundAt: nextIn === null ? null : serverNow + nextIn,
    serverNow,
    boss: { id: 'b', name: 'B', element: 'tide', hpMax: 10, hpStart: 10 },
    row: [],
    rules: null,
    board: null,
    abilities: [],
    events: [],
    watching: [],
    loot: null,
    names: { players: {}, creatures: {}, bossName: 'B' },
    bossHp: 10,
  } as unknown as LiveSnapshot;
}

/**
 * A poller over a fake server: the server clock is real (fake) time plus START, the screen keeps the newer
 * snapshot like `Live.tsx` does, and every poll is counted.
 */
function setup(answer: () => Promise<LiveSnapshot> | LiveSnapshot) {
  let shown: LiveSnapshot | null = null;
  const polls: number[] = [];
  const errors: { retrying: boolean }[] = [];
  let recovered = 0;
  const serverNow = (): number => START + Date.now() - 1_000_000_000;
  const poller = createFinalePoller({
    fetchSnapshot: () => {
      polls.push(Date.now());
      return Promise.resolve(answer());
    },
    accept: (next) => {
      shown = pickNewer(shown, next);
    },
    latest: () => shown,
    serverNow,
    onError: (_e, retrying) => errors.push({ retrying }),
    onRecovered: () => {
      recovered++;
    },
  });
  return { poller, polls, errors, shown: () => shown, recovered: () => recovered, serverNow };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('polling without the socket', () => {
  it('polls every 2 s, as it always did', async () => {
    const t = setup(() => snap(t.serverNow(), 3, 60_000));
    t.poller.start(snap(START, 3, 60_000));
    expect(t.polls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(t.polls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(t.polls).toHaveLength(3);
    t.poller.stop();
  });

  it('polls at once with no first snapshot', async () => {
    const t = setup(() => snap(t.serverNow(), 1, 10_000));
    t.poller.start(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.polls).toHaveLength(1);
    expect(t.shown()?.status).toBe('live');
    t.poller.stop();
  });

  it('stops by itself when the fight is done', async () => {
    const done = { ...snap(START, 12, null), status: 'done' } as unknown as LiveSnapshot;
    const t = setup(() => done);
    t.poller.start(null);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.polls).toHaveLength(1);
  });
});

describe('with the live socket', () => {
  it('drops to a slow safety poll while the socket delivers', async () => {
    const t = setup(() => snap(t.serverNow(), 3, 600_000));
    t.poller.start(snap(START, 3, 600_000));
    t.poller.setLive(true);
    await vi.advanceTimersByTimeAsync(SAFETY_POLL_MS - 1);
    expect(t.polls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.polls).toHaveLength(1);
    t.poller.stop();
  });

  it('feeds a pushed snapshot through the same path and plans the next look from it', async () => {
    const t = setup(() => snap(t.serverNow(), 3, 600_000));
    t.poller.start(snap(START, 3, 8_000));
    t.poller.setLive(true);
    // Round 4 is pushed at the boundary: the poll waits for round 5 plus the grace, not for the old boundary.
    await vi.advanceTimersByTimeAsync(8_000);
    expect(t.polls).toHaveLength(0);
    t.poller.push(snap(START + 8_000, 4, 9_000));
    expect(roundOf(t.shown())).toBe(4);
    await vi.advanceTimersByTimeAsync(9_000 + PUSH_GRACE_MS - 1);
    expect(t.polls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    // The push for round 5 never came: the grace is over, so the poll asks.
    expect(t.polls).toHaveLength(1);
    t.poller.stop();
  });

  it('keeps the newer snapshot when a slow poll answer arrives after a push', async () => {
    let release: (value: LiveSnapshot) => void = () => undefined;
    const slow = new Promise<LiveSnapshot>((resolve) => {
      release = resolve;
    });
    const t = setup(() => slow);
    t.poller.start(snap(START, 3, 600_000));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(t.polls).toHaveLength(1);
    t.poller.push(snap(START + 5_000, 4, 600_000));
    release(snap(START + 2_000, 3, 600_000));
    await vi.advanceTimersByTimeAsync(0);
    expect(roundOf(t.shown())).toBe(4);
    t.poller.stop();
  });

  it('falls back at once when the socket drops, with the fast pace after', async () => {
    const t = setup(() => snap(t.serverNow(), 3, 600_000));
    t.poller.start(snap(START, 3, 600_000));
    t.poller.setLive(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(t.polls).toHaveLength(0);
    t.poller.setLive(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.polls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(t.polls).toHaveLength(2);
    // And live again: slow once more.
    t.poller.setLive(true);
    await vi.advanceTimersByTimeAsync(SAFETY_POLL_MS - 1);
    expect(t.polls).toHaveLength(2);
    t.poller.stop();
  });

  it('stops with a pushed "done"', async () => {
    const t = setup(() => snap(t.serverNow(), 3, 600_000));
    t.poller.start(snap(START, 3, 600_000));
    t.poller.setLive(true);
    t.poller.push({ ...snap(START + 1_000, 12, null), status: 'done' } as unknown as LiveSnapshot);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(t.polls).toHaveLength(0);
  });

  it('does nothing after stop: no timer, no push, no late answer', async () => {
    const t = setup(() => snap(t.serverNow(), 3, 600_000));
    t.poller.start(snap(START, 3, 600_000));
    t.poller.stop();
    t.poller.push(snap(START + 1, 9, 1));
    t.poller.setLive(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.polls).toHaveLength(0);
    expect(roundOf(t.shown())).toBe(3);
  });
});

describe('errors', () => {
  it('retries a network error with a back-off and reports it, then recovers', async () => {
    let fail = true;
    const t = setup(() =>
      fail ? Promise.reject(new Error('net')) : snap(t.serverNow(), 3, 60_000),
    );
    t.poller.start(snap(START, 3, 60_000));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(t.errors).toEqual([{ retrying: true }]);
    fail = false;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(t.polls).toHaveLength(2);
    expect(t.recovered()).toBe(1);
    t.poller.stop();
  });

  it('stops on an answer a retry cannot fix', async () => {
    const t = setup(() => Promise.reject(new ApiError(403, 'forbidden')));
    t.poller.start(null);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.errors).toEqual([{ retrying: false }]);
    expect(t.polls).toHaveLength(1);
  });
});
