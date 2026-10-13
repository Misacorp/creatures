import { describe, expect, it } from 'vitest';
import type { Creature } from './api';
import {
  DEFAULT_ABILITY_SETTINGS,
  EMPTY_SLOTS,
  MAX_FIRE_ROUND,
  basicParams,
  buildRunRequest,
  creatureAbilityChoices,
  defaultRoundOf,
  isComplete,
  parseRound,
  place,
  placedCount,
  pruneSlots,
  reduceTap,
  requestSignature,
  resolveDrop,
  roundOptions,
  slotIndexOf,
  slotStatuses,
  strongestFirst,
  strongestThree,
  unplace,
  uselessInDungeon,
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
    ...extra,
  };
}

const names: Record<string, string> = { a: 'Ann', b: 'Bo', c: 'Cy', d: 'Di' };
const nameOf = (id: string): string => names[id] ?? id;

describe('placing creatures in the zones', () => {
  it('starts empty and fills the chosen zone', () => {
    expect(isComplete(EMPTY_SLOTS)).toBe(false);
    const one = place(EMPTY_SLOTS, 'a', 1);
    expect(one).toEqual([null, 'a', null]);
    expect(placedCount(one)).toBe(1);
    expect(slotIndexOf(one, 'a')).toBe(1);
    expect(slotIndexOf(one, 'b')).toBeNull();
  });

  it('swaps a placed creature with whoever stands in the target zone', () => {
    expect(place(['a', 'b', null], 'a', 1)).toEqual(['b', 'a', null]);
  });

  it('moves a placed creature into an empty zone and leaves its old one empty', () => {
    expect(place(['a', null, null], 'a', 2)).toEqual([null, null, 'a']);
  });

  it('sends the occupant back to the list when a creature from the list takes its zone', () => {
    const next = place(['a', 'b', 'c'], 'd', 1);
    expect(next).toEqual(['a', 'd', 'c']);
    expect(slotIndexOf(next, 'b')).toBeNull();
  });

  it('ignores a zone that does not exist and a drop on its own zone', () => {
    const slots: Slots = ['a', null, null];
    expect(place(slots, 'b', 3)).toBe(slots);
    expect(place(slots, 'b', -1)).toBe(slots);
    expect(place(slots, 'a', 0)).toBe(slots);
  });

  it('takes a creature out of its zone', () => {
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

  it('stands guards in front and payoffs at the back', () => {
    const list = [
      make('payoff', 'cindle', 12),
      make('setter', 'splashet', 11),
      make('guard', 'sproutle', 10),
      make('weak', 'cindle', 1),
    ];
    expect(strongestThree(list)).toEqual(['guard', 'setter', 'payoff']);
  });

  it('leaves zones empty when there are fewer than three creatures', () => {
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

  it('puts the selected creature in the tapped zone', () => {
    const result = reduceTap(EMPTY_SLOTS, 'a', { kind: 'slot', index: 2 });
    expect(result.slots).toEqual([null, null, 'a']);
    expect(result.selected).toBeNull();
  });

  it('picks up a placed creature by tapping its zone, and explains a tap on an empty zone', () => {
    expect(reduceTap(['a', null, null], null, { kind: 'slot', index: 0 }).selected).toBe('a');
    const none = reduceTap(EMPTY_SLOTS, null, { kind: 'slot', index: 0 });
    expect(none.slots).toBe(EMPTY_SLOTS);
    expect(none.hint).toContain('first');
  });

  it('lets go when the selected creature is tapped in its own zone', () => {
    expect(reduceTap(['a', null, null], 'a', { kind: 'slot', index: 0 }).selected).toBeNull();
  });

  it('refuses a zone that does not exist', () => {
    expect(reduceTap(EMPTY_SLOTS, 'a', { kind: 'slot', index: 5 }).hint).toContain(
      'does not exist',
    );
  });
});

describe('drops', () => {
  it('moves a creature to a zone and says so', () => {
    const { slots, outcome } = resolveDrop(EMPTY_SLOTS, 'a', { kind: 'slot', slot: 0 }, nameOf);
    expect(slots).toEqual(['a', null, null]);
    expect(outcome.status).toBe('valid');
    expect(outcome.announce).toBe('Ann placed in the front zone.');
    expect(outcome.intent).toBeNull();
  });

  it('says who went back to the list, and who swapped', () => {
    const fromList = resolveDrop(['b', null, null], 'a', { kind: 'slot', slot: 0 }, nameOf);
    expect(fromList.outcome.announce).toBe(
      'Ann placed in the front zone. Bo went back to the list.',
    );
    const swap = resolveDrop(['b', 'a', null], 'a', { kind: 'slot', slot: 0 }, nameOf);
    expect(swap.slots).toEqual(['a', 'b', null]);
    expect(swap.outcome.announce).toBe('Swapped Ann with Bo.');
  });

  it('takes a creature out of its zone when dropped on the list', () => {
    const { slots, outcome } = resolveDrop(['a', null, null], 'a', { kind: 'tray' }, nameOf);
    expect(slots).toEqual([null, null, null]);
    expect(outcome.status).toBe('valid');
    expect(resolveDrop(EMPTY_SLOTS, 'a', { kind: 'tray' }, nameOf).outcome.status).toBe('none');
  });

  it('cancels off the board and does nothing on its own zone', () => {
    const cancelled = resolveDrop(['a', null, null], 'a', null, nameOf);
    expect(cancelled.slots).toEqual(['a', null, null]);
    expect(cancelled.outcome.announce).toBe('Cancelled.');
    expect(
      resolveDrop(['a', null, null], 'a', { kind: 'slot', slot: 0 }, nameOf).outcome.status,
    ).toBe('none');
  });

  it('refuses a zone that does not exist', () => {
    expect(resolveDrop(EMPTY_SLOTS, 'a', { kind: 'slot', slot: 9 }, nameOf).outcome.status).toBe(
      'invalid',
    );
  });

  it('gives every zone a status for the creature being dragged', () => {
    const statuses = slotStatuses(['a', null, null], 'a', nameOf);
    expect([...statuses.entries()]).toEqual([
      [0, 'none'],
      [1, 'valid'],
      [2, 'valid'],
    ]);
  });
});

describe('ability settings', () => {
  it('knows which basic abilities ask for a zone or an element', () => {
    expect(basicParams('shield-wall')).toEqual({ zone: true, element: false });
    expect(basicParams('re-mark')).toEqual({ zone: false, element: true });
    expect(basicParams('rally')).toEqual({ zone: false, element: false });
    expect(basicParams('nothing-like-it')).toEqual({ zone: false, element: false });
  });

  it('flags Purge, which has nothing to remove in the dungeon', () => {
    expect(uselessInDungeon('purge')).toBe(true);
    expect(uselessInDungeon('rally')).toBe(false);
    expect(uselessInDungeon('shield-wall')).toBe(false);
  });

  it('reads the default round of an ability from the content', () => {
    expect(defaultRoundOf('rally')).toBe(6);
    expect(defaultRoundOf('shield-wall')).toBe(3);
    expect(defaultRoundOf('not-an-ability')).toBeNull();
  });

  it('offers Auto and every round up to the longest room', () => {
    const options = roundOptions();
    expect(options[0]).toEqual({ value: null, label: 'Auto' });
    expect(options).toHaveLength(MAX_FIRE_ROUND + 1);
    expect(options.at(-1)?.value).toBe(MAX_FIRE_ROUND);
    expect(MAX_FIRE_ROUND).toBeGreaterThanOrEqual(8);
  });

  it('reads a select value back into a round, and anything odd into Auto', () => {
    expect(parseRound('')).toBeNull();
    expect(parseRound('3')).toBe(3);
    expect(parseRound('0')).toBeNull();
    expect(parseRound(String(MAX_FIRE_ROUND + 1))).toBeNull();
    expect(parseRound('2.5')).toBeNull();
    expect(parseRound('abc')).toBeNull();
  });
});

describe('the run request', () => {
  const ability = { id: 'static-zap', unlocked: true, unlockLevel: 10 };
  const creatures = [
    make('a', 'sproutle', 12),
    make('b', 'splashet', 12, { ability }),
    make('c', 'cindle', 12, { ability: { ...ability, unlocked: false } }),
  ];
  const slots: Slots = ['a', 'b', 'c'];

  it('is null until the team is complete', () => {
    expect(
      buildRunRequest(['a', 'b', null], creatures, DEFAULT_ABILITY_SETTINGS, 'key-0001'),
    ).toBeNull();
  });

  it('sends the zones front to back, the basic pick on Auto, and no rounds nobody set', () => {
    const request = buildRunRequest(slots, creatures, DEFAULT_ABILITY_SETTINGS, 'key-00001');
    expect(request).toEqual({
      team: ['a', 'b', 'c'],
      formation: ['front', 'middle', 'back'],
      abilities: { basic: { abilityId: 'rally', fireAtRound: null }, creatures: [] },
      idempotencyKey: 'key-00001',
    });
  });

  it('sends a zone only for Shield Wall and an element only for Re-mark', () => {
    const shield = buildRunRequest(
      slots,
      creatures,
      { ...DEFAULT_ABILITY_SETTINGS, basicId: 'shield-wall', basicRound: 2, zone: 'middle' },
      'key-00001',
    );
    expect(shield?.abilities.basic).toEqual({
      abilityId: 'shield-wall',
      fireAtRound: 2,
      zone: 'middle',
    });
    const mark = buildRunRequest(
      slots,
      creatures,
      { ...DEFAULT_ABILITY_SETTINGS, basicId: 're-mark', element: 'grove' },
      'key-00001',
    );
    expect(mark?.abilities.basic).toEqual({
      abilityId: 're-mark',
      fireAtRound: null,
      element: 'grove',
    });
  });

  it('lists a creature ability only when it is unlocked, in the team and given a round', () => {
    const settings = {
      ...DEFAULT_ABILITY_SETTINGS,
      creatureRounds: { a: 2, b: 4, c: 5, gone: 3 },
    };
    const request = buildRunRequest(slots, creatures, settings, 'key-00001');
    expect(request?.abilities.creatures).toEqual([{ creatureId: 'b', fireAtRound: 4 }]);
  });

  it('shows the unlocked creature abilities of the team, front to back', () => {
    const choices = creatureAbilityChoices(slots, creatures, DEFAULT_ABILITY_SETTINGS, (c) => c.id);
    expect(choices).toEqual([{ creatureId: 'b', name: 'b', abilityId: 'static-zap', round: null }]);
    expect(
      creatureAbilityChoices([null, null, null], creatures, DEFAULT_ABILITY_SETTINGS, (c) => c.id),
    ).toEqual([]);
  });

  it('has one signature for the same picks, whatever the key, and another for different picks', () => {
    const one = buildRunRequest(slots, creatures, DEFAULT_ABILITY_SETTINGS, 'key-00001');
    const two = buildRunRequest(slots, creatures, DEFAULT_ABILITY_SETTINGS, 'key-00002');
    const other = buildRunRequest(
      ['b', 'a', 'c'],
      creatures,
      DEFAULT_ABILITY_SETTINGS,
      'key-00001',
    );
    if (one === null || two === null || other === null) throw new Error('team is complete');
    expect(requestSignature(one)).toBe(requestSignature(two));
    expect(requestSignature(one)).not.toBe(requestSignature(other));
  });
});
