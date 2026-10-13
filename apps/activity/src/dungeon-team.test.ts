import { describe, expect, it } from 'vitest';
import type { Creature } from './api';
import {
  EMPTY_SLOTS,
  buildRunRequest,
  isComplete,
  place,
  placedCount,
  pruneSlots,
  reduceTap,
  requestSignature,
  resolveDrop,
  slotIndexOf,
  slotStatuses,
  strongestFirst,
  strongestThree,
  unplace,
  type Slots,
} from './dungeon-team';

function make(id: string, species: string, level: number, extra: Partial<Creature> = {}): Creature {
  return {
    id,
    species,
    line: species,
    level,
    levelCap: 15,
    fusionCount: 0,
    shiny: false,
    nickname: null,
    away: false,
    quirk: null,
    stats: { hp: 100 + level, atk: 10, spd: 10 },
    statsWithGear: { hp: 100 + level, atk: 10, spd: 10 },
    gear: null,
    busy: null,
    trainCost: null,
    ability: null,
    explorer: { rank: 1, xp: 0, nextRankXp: 200, trips: 0 },
    ...extra,
  };
}

const names: Record<string, string> = { a: 'Ann', b: 'Bo', c: 'Cy', d: 'Di' };
const nameOf = (id: string): string => names[id] ?? id;

describe('placing creatures in the row', () => {
  it('starts empty and fills the chosen place', () => {
    expect(isComplete(EMPTY_SLOTS)).toBe(false);
    const one = place(EMPTY_SLOTS, 'a', 1);
    expect(one).toEqual([null, 'a', null]);
    expect(placedCount(one)).toBe(1);
    expect(slotIndexOf(one, 'a')).toBe(1);
    expect(slotIndexOf(one, 'b')).toBeNull();
  });

  it('swaps a placed creature with whoever stands in the target place', () => {
    expect(place(['a', 'b', null], 'a', 1)).toEqual(['b', 'a', null]);
  });

  it('moves a placed creature into an empty place and leaves its old one empty', () => {
    expect(place(['a', null, null], 'a', 2)).toEqual([null, null, 'a']);
  });

  it('sends the occupant back to the list when a creature from the list takes its place', () => {
    const next = place(['a', 'b', 'c'], 'd', 1);
    expect(next).toEqual(['a', 'd', 'c']);
    expect(slotIndexOf(next, 'b')).toBeNull();
  });

  it('ignores a place that does not exist and a drop on its own place', () => {
    const slots: Slots = ['a', null, null];
    expect(place(slots, 'b', 3)).toBe(slots);
    expect(place(slots, 'b', -1)).toBe(slots);
    expect(place(slots, 'a', 0)).toBe(slots);
  });

  it('takes a creature out of the row', () => {
    expect(unplace(['a', 'b', 'c'], 'b')).toEqual(['a', null, 'c']);
    const slots: Slots = ['a', null, null];
    expect(unplace(slots, 'z')).toBe(slots);
  });

  it('is complete only with three different creatures', () => {
    expect(isComplete(['a', 'b', 'c'])).toBe(true);
    expect(isComplete(['a', 'b', null])).toBe(false);
    expect(isComplete(['a', 'a', 'c'])).toBe(false);
  });

  it('drops creatures that are gone from the collection', () => {
    expect(pruneSlots(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', null, 'c']);
  });
});

describe('the strongest three', () => {
  it('ranks by level, then HP, then id, whatever the order the server listed them in', () => {
    const list = [
      make('z', 'cindle', 5),
      make('y', 'cindle', 9),
      make('x', 'cindle', 9, { stats: { hp: 500, atk: 1, spd: 1 } }),
    ];
    expect(strongestFirst(list).map((c) => c.id)).toEqual(['x', 'y', 'z']);
    expect(strongestFirst([...list].reverse()).map((c) => c.id)).toEqual(['x', 'y', 'z']);
  });

  it('stands setters left, a guard in the middle and payoffs on the right', () => {
    const list = [
      make('payoff', 'cindle', 12),
      make('setter', 'splashet', 11),
      make('guard', 'sproutle', 10),
      make('weak', 'cindle', 1),
    ];
    expect(strongestThree(list)).toEqual(['setter', 'guard', 'payoff']);
  });

  it('leaves places empty when there are fewer than three creatures', () => {
    expect(strongestThree([make('only', 'cindle', 3)])).toEqual(['only', null, null]);
    expect(strongestThree([])).toEqual([null, null, null]);
  });
});

describe('taps', () => {
  it('selects a creature, and a second tap on it lets go', () => {
    const picked = reduceTap(EMPTY_SLOTS, null, { kind: 'creature', id: 'a' });
    expect(picked.selected).toBe('a');
    expect(reduceTap(EMPTY_SLOTS, 'a', { kind: 'creature', id: 'a' }).selected).toBeNull();
  });

  it('puts the selected creature in the tapped place', () => {
    const result = reduceTap(EMPTY_SLOTS, 'a', { kind: 'slot', index: 2 });
    expect(result.slots).toEqual([null, null, 'a']);
    expect(result.selected).toBeNull();
  });

  it('picks up a placed creature by tapping its place, and explains a tap on an empty place', () => {
    expect(reduceTap(['a', null, null], null, { kind: 'slot', index: 0 }).selected).toBe('a');
    const none = reduceTap(EMPTY_SLOTS, null, { kind: 'slot', index: 0 });
    expect(none.slots).toBe(EMPTY_SLOTS);
    expect(none.hint).toContain('first');
  });

  it('lets go when the selected creature is tapped in its own place', () => {
    expect(reduceTap(['a', null, null], 'a', { kind: 'slot', index: 0 }).selected).toBeNull();
  });

  it('refuses a place that does not exist', () => {
    expect(reduceTap(EMPTY_SLOTS, 'a', { kind: 'slot', index: 5 }).hint).toContain(
      'does not exist',
    );
  });
});

describe('drops', () => {
  it('moves a creature to a place and says so', () => {
    const { slots, outcome } = resolveDrop(EMPTY_SLOTS, 'a', { kind: 'slot', slot: 0 }, nameOf);
    expect(slots).toEqual(['a', null, null]);
    expect(outcome.status).toBe('valid');
    expect(outcome.announce).toBe('Ann placed on the left.');
    expect(outcome.intent).toBeNull();
  });

  it('says who went back to the list, and who swapped', () => {
    const fromList = resolveDrop(['b', null, null], 'a', { kind: 'slot', slot: 0 }, nameOf);
    expect(fromList.outcome.announce).toBe('Ann placed on the left. Bo went back to the list.');
    const swap = resolveDrop(['b', 'a', null], 'a', { kind: 'slot', slot: 0 }, nameOf);
    expect(swap.slots).toEqual(['a', 'b', null]);
    expect(swap.outcome.announce).toBe('Swapped Ann with Bo.');
  });

  it('takes a creature out of the row when dropped on the list', () => {
    const { slots, outcome } = resolveDrop(['a', null, null], 'a', { kind: 'tray' }, nameOf);
    expect(slots).toEqual([null, null, null]);
    expect(outcome.status).toBe('valid');
    expect(resolveDrop(EMPTY_SLOTS, 'a', { kind: 'tray' }, nameOf).outcome.status).toBe('none');
  });

  it('cancels off the board and does nothing on its own place', () => {
    const cancelled = resolveDrop(['a', null, null], 'a', null, nameOf);
    expect(cancelled.slots).toEqual(['a', null, null]);
    expect(cancelled.outcome.announce).toBe('Cancelled.');
    expect(
      resolveDrop(['a', null, null], 'a', { kind: 'slot', slot: 0 }, nameOf).outcome.status,
    ).toBe('none');
  });

  it('refuses a place that does not exist', () => {
    expect(resolveDrop(EMPTY_SLOTS, 'a', { kind: 'slot', slot: 9 }, nameOf).outcome.status).toBe(
      'invalid',
    );
  });

  it('gives every place a status for the creature being dragged', () => {
    const statuses = slotStatuses(['a', null, null], 'a', nameOf);
    expect([...statuses.entries()]).toEqual([
      [0, 'none'],
      [1, 'valid'],
      [2, 'valid'],
    ]);
  });
});

describe('the run request', () => {
  const slots: Slots = ['a', 'b', 'c'];

  it('is null until the team is complete', () => {
    expect(buildRunRequest(['a', 'b', null], 'key-0001')).toBeNull();
    expect(buildRunRequest(['a', 'a', 'b'], 'key-0001')).toBeNull();
  });

  it('is the row left to right and the key, with no abilities and no rounds', () => {
    const request = buildRunRequest(slots, 'key-00001');
    expect(request).toEqual({ team: ['a', 'b', 'c'], idempotencyKey: 'key-00001' });
    expect(Object.keys(request ?? {}).sort()).toEqual(['idempotencyKey', 'team']);
  });

  it('sends the order of the row as the order of the team, and nothing about zones', () => {
    const forward = buildRunRequest(slots, 'key-00001');
    const reversed = buildRunRequest(['c', 'b', 'a'], 'key-00001');
    expect(forward?.team).toEqual(['a', 'b', 'c']);
    expect(reversed?.team).toEqual(['c', 'b', 'a']);
    // A different order is a different run, so it gets its own idempotency key.
    expect(requestSignature(reversed ?? ({} as never))).not.toBe(
      requestSignature(forward ?? ({} as never)),
    );
  });

  it('has one signature for the same picks, whatever the key, and another for different picks', () => {
    const one = buildRunRequest(slots, 'key-00001');
    const two = buildRunRequest(slots, 'key-00002');
    const other = buildRunRequest(['b', 'a', 'c'], 'key-00001');
    if (one === null || two === null || other === null) throw new Error('team is complete');
    expect(requestSignature(one)).toBe(requestSignature(two));
    expect(requestSignature(one)).not.toBe(requestSignature(other));
  });
});
