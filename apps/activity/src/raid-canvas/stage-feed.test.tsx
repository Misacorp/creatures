/** `useStageFeed`: one fetch per round, backed off after errors, never a storm; and the pure waits behind it. */
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayingReplayV2 } from '../fight-v2-api';
import type { RaidView } from '../raid-api';
import { createPage, type Page } from '../test-dom';
import { raidV2Sample } from '../workbench/raid-v2-sample';
import { heldView } from './hold';
import { SAME_ROUND_MIN_MS, backoffMs, nextFetchAfter, type Playing } from './playing';
import { useStageFeed } from './play';

const playing: Playing = {
  stage: 1,
  startsAt: 0,
  roundMs: 30_000,
  nextRoundAt: 30_000,
  endsAt: 240_000,
};

describe('the waits', () => {
  it('back off from 3 s, doubling, at most 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(backoffMs)).toEqual([
      3_000, 6_000, 12_000, 24_000, 30_000, 30_000, 30_000,
    ]);
  });
  it('an error waits the back-off whatever the window says', () => {
    expect(nextFetchAfter(playing, 29_900, { failures: 2, round: null, previousRound: null })).toBe(
      6_000,
    );
  });
  it('the same round twice waits at least a second', () => {
    // The clock is behind: the next round looks 300 ms away, but the answer did not move.
    expect(nextFetchAfter(playing, 29_900, { failures: 0, round: 1, previousRound: 1 })).toBe(
      SAME_ROUND_MIN_MS,
    );
    expect(nextFetchAfter(playing, 29_900, { failures: 0, round: 2, previousRound: 1 })).toBe(400);
  });
});

describe('the feed', () => {
  let page: Page | null = null;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    page?.unmount();
    page = null;
    vi.useRealTimers();
  });

  function run(fetcher: () => Promise<PlayingReplayV2>, clock: () => number): void {
    function Probe() {
      useStageFeed({
        playing,
        week: 'w',
        party: 1,
        fetcher: fetcher as never,
        clock,
      });
      return null;
    }
    page = createPage();
    page.draw(<Probe />);
  }
  const answer = (round: number): PlayingReplayV2 =>
    ({ playing: true, round, nextRoundAt: 30_000 }) as unknown as PlayingReplayV2;

  it('backs off after errors: 3 s, then 6 s', async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error('down')));
    run(fetcher, () => 0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_900);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_700);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('waits at least a second when the round did not move (a device clock behind the server)', async () => {
    const fetcher = vi.fn(() => Promise.resolve(answer(1)));
    // The clock stands 100 ms before the next round for good: the plain wait would be 300 ms.
    run(fetcher, () => 29_900);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    // The second answer is the same round as the first; the third is not asked for within a second of it.
    const afterSecond = fetcher.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(afterSecond + 1);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(3);
  });
});

describe('the reveal is held during any playing stage', () => {
  it('stage 1 hides an unseen reveal too', () => {
    const { view } = raidV2Sample({
      slot: 1,
      players: 4,
      stagesPlayed: 1,
      mine: 3,
      bestShareBp: 0,
      knockedOut: false,
      swaps: 'none',
    });
    const withReveal: RaidView = {
      ...view,
      you: {
        ...view.you,
        reveal: {
          week: 'w',
          party: 1,
          cleared: true,
          essence: 5,
          rankChange: null,
          festivalGrant: null,
        },
      },
    };
    expect(heldView(withReveal, playing, 100).you.reveal).toBeNull();
    expect(heldView(withReveal, null, 100).you.reveal).not.toBeNull();
  });
});
