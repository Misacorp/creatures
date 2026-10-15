import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomResident } from './api';
import { ROOM_DEBOUNCE_MS, ROOM_POLL_MS, ROOM_STALE_MS, type Resident } from './room-data';
import { createRoomLoader } from './room-loader';

const answer = (ids: readonly string[]): RoomResident[] =>
  ids.map((userId) => ({ userId, name: `Name ${userId}`, creature: null, spot: null }));

/** A loader over a fake server that records every request. */
function setup(failWith?: () => boolean) {
  const requests: string[][] = [];
  let latest: ReadonlyMap<string, Resident> = new Map();
  let clock = 1_000_000;
  const loader = createRoomLoader({
    selfId: '1',
    fetch: (ids) => {
      requests.push([...ids]);
      if (failWith?.() === true) return Promise.reject(new Error('down'));
      return Promise.resolve(answer(ids));
    },
    onChange: (known) => {
      latest = known;
    },
    now: () => clock,
  });
  return {
    loader,
    requests,
    known: () => [...latest.keys()],
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the first look', () => {
  it('asks about everyone present except the player, in chunks of 25', async () => {
    const { loader, requests, known } = setup();
    const ids = ['1', ...Array.from({ length: 30 }, (_, i) => String(100 + i))];
    loader.start(ids);
    await vi.advanceTimersByTimeAsync(0);
    expect(requests.map((r) => r.length)).toEqual([25, 5]);
    expect(requests.flat()).not.toContain('1');
    expect(known()).toHaveLength(30);
  });

  it('sends nothing when the player is alone', async () => {
    const { loader, requests } = setup();
    loader.start(['1']);
    await vi.advanceTimersByTimeAsync(ROOM_DEBOUNCE_MS * 5);
    expect(requests).toEqual([]);
  });
});

describe('joins and leaves', () => {
  it('waits 2 s after the last update and then asks only about the newcomers', async () => {
    const { loader, requests, known } = setup();
    loader.start(['1', '2']);
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toEqual([['2']]);

    loader.update(['1', '2', '3']);
    await vi.advanceTimersByTimeAsync(ROOM_DEBOUNCE_MS - 1);
    expect(requests).toHaveLength(1);
    loader.update(['1', '2', '3', '4']);
    await vi.advanceTimersByTimeAsync(ROOM_DEBOUNCE_MS - 1);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    // A burst of joins is one request.
    expect(requests).toEqual([['2'], ['3', '4']]);
    expect(known().sort()).toEqual(['2', '3', '4']);
  });

  it('drops leavers locally and sends no request', async () => {
    const { loader, requests, known } = setup();
    loader.start(['1', '2', '3']);
    await vi.advanceTimersByTimeAsync(0);
    loader.update(['1', '3']);
    await vi.advanceTimersByTimeAsync(ROOM_DEBOUNCE_MS * 3);
    expect(known()).toEqual(['3']);
    expect(requests).toHaveLength(1);
  });

  it('does not ask again about someone who left and came back while known data is kept', async () => {
    const { loader, requests } = setup();
    loader.start(['1', '2']);
    await vi.advanceTimersByTimeAsync(0);
    loader.update(['1', '2']);
    await vi.advanceTimersByTimeAsync(ROOM_DEBOUNCE_MS * 3);
    expect(requests).toHaveLength(1);
  });

  it('ignores answers for people who left while the request was on its way', async () => {
    const { loader, known } = setup();
    loader.start(['1', '2']);
    loader.update(['1']);
    await vi.advanceTimersByTimeAsync(0);
    expect(known()).toEqual([]);
  });
});

describe('refreshIfStale', () => {
  it('does nothing within a minute and refetches everyone after it', async () => {
    const { loader, requests, advance } = setup();
    loader.start(['1', '2', '3']);
    await vi.advanceTimersByTimeAsync(0);
    advance(ROOM_STALE_MS);
    loader.refreshIfStale();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(1);

    advance(1);
    loader.refreshIfStale();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toEqual([
      ['2', '3'],
      ['2', '3'],
    ]);

    // That refetch counts as the last full fetch.
    loader.refreshIfStale();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(2);
  });

  it('does not start a second refetch while one is on its way', async () => {
    const { loader, requests, advance } = setup();
    loader.start(['1', '2']);
    advance(ROOM_STALE_MS + 1);
    loader.refreshIfStale();
    loader.refreshIfStale();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(1);
  });
});

describe('failures', () => {
  it('keep the old data and let the next tab switch try again', async () => {
    let failing = false;
    const { loader, requests, known, advance } = setup(() => failing);
    loader.start(['1', '2']);
    await vi.advanceTimersByTimeAsync(0);
    expect(known()).toEqual(['2']);

    advance(ROOM_STALE_MS + 1);
    failing = true;
    loader.refreshIfStale();
    await vi.advanceTimersByTimeAsync(0);
    expect(known()).toEqual(['2']);

    failing = false;
    loader.refreshIfStale();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(3);
  });
});

describe('dispose', () => {
  it('cancels a pending join request and drops late answers', async () => {
    const { loader, requests, known } = setup();
    loader.start(['1', '2']);
    await vi.advanceTimersByTimeAsync(0);
    loader.update(['1', '2', '3']);
    loader.dispose();
    await vi.advanceTimersByTimeAsync(ROOM_DEBOUNCE_MS * 2);
    expect(requests).toHaveLength(1);
    expect(known()).toEqual(['2']);
  });
});

describe('the slow poll', () => {
  /** A loader on the (fake) clock, with a page that can be hidden. */
  function pollSetup(failWith?: () => boolean) {
    let hidden = false;
    const requests: string[][] = [];
    const loader = createRoomLoader({
      selfId: '1',
      fetch: (ids) => {
        requests.push([...ids]);
        if (failWith?.() === true) return Promise.reject(new Error('down'));
        return Promise.resolve(answer(ids));
      },
      onChange: () => undefined,
      now: () => Date.now(),
      isHidden: () => hidden,
    });
    return {
      loader,
      requests,
      hide: (next: boolean) => {
        hidden = next;
        loader.setHidden(next);
      },
    };
  }

  it('refetches everyone but the player every 45 s while someone else is here', async () => {
    const { loader, requests } = pollSetup();
    loader.start(['1', '2', '3']);
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS - 1);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toEqual([
      ['2', '3'],
      ['2', '3'],
    ]);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS);
    expect(requests).toHaveLength(3);
    loader.dispose();
  });

  it('uses one request per 25 ids', async () => {
    const { loader, requests } = pollSetup();
    const ids = ['1', ...Array.from({ length: 30 }, (_, i) => String(100 + i))];
    loader.start(ids);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS);
    expect(requests.map((r) => r.length)).toEqual([25, 5, 25, 5]);
    loader.dispose();
  });

  it('keeps a single timer, and none when alone', async () => {
    const { loader } = pollSetup();
    loader.start(['1']);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    loader.update(['1', '2']);
    expect(vi.getTimerCount()).toBe(2); // the join's debounce and the poll
    await vi.advanceTimersByTimeAsync(ROOM_DEBOUNCE_MS);
    expect(vi.getTimerCount()).toBe(1);
    loader.update(['1']);
    expect(vi.getTimerCount()).toBe(0);
    loader.dispose();
  });

  it('does not poll when alone, however long it takes', async () => {
    const { loader, requests } = pollSetup();
    loader.start(['1']);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS * 4);
    expect(requests).toEqual([]);
    loader.dispose();
  });

  it('starts a whole interval after somebody joins an empty room, behind the join request', async () => {
    const { loader, requests } = pollSetup();
    loader.start(['1']);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS * 3);
    loader.update(['1', '2']);
    await vi.advanceTimersByTimeAsync(ROOM_DEBOUNCE_MS);
    // Only the newcomer was asked about, once.
    expect(requests).toEqual([['2']]);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS - ROOM_DEBOUNCE_MS);
    expect(requests).toHaveLength(2);
    loader.dispose();
  });

  it('stops when the last other player leaves', async () => {
    const { loader, requests } = pollSetup();
    loader.start(['1', '2']);
    await vi.advanceTimersByTimeAsync(0);
    loader.update(['1']);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS * 3);
    expect(requests).toHaveLength(1);
    loader.dispose();
  });

  it('pauses while the page is hidden', async () => {
    const { loader, requests, hide } = pollSetup();
    loader.start(['1', '2']);
    await vi.advanceTimersByTimeAsync(0);
    hide(true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS * 4);
    expect(requests).toHaveLength(1);
    loader.dispose();
  });

  it('refreshes at once on becoming visible when the data is over 45 s old, then goes on', async () => {
    const { loader, requests, hide } = pollSetup();
    loader.start(['1', '2']);
    await vi.advanceTimersByTimeAsync(0);
    hide(true);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS + 1);
    hide(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(2);
    // The next poll counts from that refresh.
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS - 1);
    expect(requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toHaveLength(3);
    loader.dispose();
  });

  it('does not refresh on becoming visible when the data is fresh, and polls on schedule', async () => {
    const { loader, requests, hide } = pollSetup();
    loader.start(['1', '2']);
    await vi.advanceTimersByTimeAsync(10_000);
    hide(true);
    await vi.advanceTimersByTimeAsync(5000);
    hide(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(1);
    // 15 s have passed since the fetch: 30 s left.
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS - 15_000 - 1);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toHaveLength(2);
    loader.dispose();
  });

  it('starts hidden without polling, and polls once shown', async () => {
    let hidden = true;
    const requests: string[][] = [];
    const loader = createRoomLoader({
      selfId: '1',
      fetch: (ids) => {
        requests.push([...ids]);
        return Promise.resolve(answer(ids));
      },
      onChange: () => undefined,
      now: () => Date.now(),
      isHidden: () => hidden,
    });
    loader.start(['1', '2']);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS * 2);
    expect(vi.getTimerCount()).toBe(0);
    hidden = false;
    loader.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(2);
    loader.dispose();
  });

  it('does not retry a failed poll early, and keeps going', async () => {
    let failing = false;
    const { loader, requests } = pollSetup(() => failing);
    loader.start(['1', '2']);
    await vi.advanceTimersByTimeAsync(0);
    failing = true;
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS);
    expect(requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS - 1);
    expect(requests).toHaveLength(2);
    failing = false;
    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toHaveLength(3);
    loader.dispose();
  });

  it('leaves the tab-switch rule alone: data polled 15 s ago is not refetched, the poll goes on', async () => {
    const { loader, requests } = pollSetup();
    loader.start(['1', '2']);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS);
    expect(requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(15_000);
    loader.refreshIfStale();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS - 15_000);
    expect(requests).toHaveLength(3);
    loader.dispose();
  });

  it('stops with dispose and drops its timer', async () => {
    const { loader, requests } = pollSetup();
    loader.start(['1', '2']);
    await vi.advanceTimersByTimeAsync(0);
    loader.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS * 3);
    expect(requests).toHaveLength(1);
  });
});
