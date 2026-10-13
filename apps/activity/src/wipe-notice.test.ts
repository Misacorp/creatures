import { describe, expect, it } from 'vitest';
import { parseGameState } from './api';
import type { CancelledTrip } from './expedition-types';
import stateOffer from './fixtures/expedition-state-offer.json';
import {
  WIPE_NOTICE_KEY,
  WIPE_NOTICE_TEXT,
  browserStorage,
  cancelledLine,
  markSeen,
  seenIds,
  unseenCancelled,
  type NoticeStorage,
} from './wipe-notice';

const trip = (id: string, creatureId = 'c1'): CancelledTrip => ({
  id,
  creatureId,
  destination: 'old-crossroads',
  duration: 'long',
  startedAt: 1,
  reason: 'slot_wipe',
});

function fakeStorage(initial: Record<string, string> = {}): NoticeStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('the slot wipe notice', () => {
  it('says what happened in friendly words', () => {
    expect(WIPE_NOTICE_TEXT).toBe(
      'Expeditions got bigger: everyone starts with one slot. Your trips in slots 2–3 were called home and their Bait refunded.',
    );
  });

  it('is needed for a cancelled trip that has not been seen, and for nothing else', () => {
    expect(unseenCancelled([], new Set())).toEqual([]);
    expect(unseenCancelled([trip('a')], new Set())).toEqual([trip('a')]);
    expect(unseenCancelled([trip('a'), trip('b')], new Set(['a']))).toEqual([trip('b')]);
    expect(unseenCancelled([trip('a')], new Set(['a']))).toEqual([]);
  });

  it('remembers what was seen, so it shows once', () => {
    const storage = fakeStorage();
    expect(seenIds(storage).size).toBe(0);
    expect(markSeen(storage, [trip('a'), trip('b')])).toBe(true);
    expect([...seenIds(storage)].sort()).toEqual(['a', 'b']);
    expect(unseenCancelled([trip('a'), trip('b')], seenIds(storage))).toEqual([]);
    // A later one is new; the earlier ones stay seen.
    expect(markSeen(storage, [trip('c')])).toBe(true);
    expect([...seenIds(storage)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps nothing but ids, under its own key', () => {
    const storage = fakeStorage();
    markSeen(storage, [trip('a')]);
    expect(Object.keys(storage.data)).toEqual([WIPE_NOTICE_KEY]);
    expect(JSON.parse(storage.data[WIPE_NOTICE_KEY] ?? 'null')).toEqual(['a']);
  });

  it('copes with storage that is missing, blocked or holds rubbish', () => {
    expect(seenIds(null).size).toBe(0);
    expect(markSeen(null, [trip('a')])).toBe(false);
    const blocked: NoticeStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(seenIds(blocked).size).toBe(0);
    expect(markSeen(blocked, [trip('a')])).toBe(false);
    expect(seenIds(fakeStorage({ [WIPE_NOTICE_KEY]: '{not json' })).size).toBe(0);
    expect(seenIds(fakeStorage({ [WIPE_NOTICE_KEY]: '{"a":1}' })).size).toBe(0);
    expect([...seenIds(fakeStorage({ [WIPE_NOTICE_KEY]: '["a", 5, null]' }))]).toEqual(['a']);
  });

  it('finds the storage of the browser, or null where there is none (a test run)', () => {
    expect(browserStorage()).toBeNull();
  });

  it('names who was called home from where, as text', () => {
    const creatures = parseGameState(stateOffer).creatures;
    const cindle = creatures.find((c) => c.species === 'cindle');
    expect(cancelledLine(trip('a', cindle?.id), creatures)).toBe('Cindle at Old Crossroads');
    expect(cancelledLine(trip('a', 'gone'), creatures)).toBe('A creature at Old Crossroads');
    const nicknamed = creatures.map((c) => ({ ...c, nickname: '<b>Bold</b>' }));
    expect(cancelledLine(trip('a', cindle?.id), nicknamed)).toBe('<b>Bold</b> at Old Crossroads');
  });
});
