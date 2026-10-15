import { content, rowScore } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { ActionIds } from './actions';
import type { PickerCreature } from './roster-picker';
import {
  EMPTY_SLOTS,
  NO_REACTION_HINT,
  buildRunRequest,
  cleanDraft,
  completeTeam,
  isComplete,
  orderHint,
  place,
  placedCount,
  pruneSlots,
  resolveDrop,
  sameSlots,
  setupTeam,
  slotIndexOf,
  slotStatuses,
  startingTeam,
  strongestThree,
  unplace,
  type Slots,
} from './dungeon-team';

/** A creature as the picker knows it. Power follows the level unless a test sets it. */
function make(
  id: string,
  species: string,
  level: number,
  extra: Partial<PickerCreature> = {},
): PickerCreature {
  return { id, species, nickname: null, level, power: level * 10, caughtAt: 1_000, ...extra };
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

  it('lets a new creature take over a place (the picker only offers empty ones)', () => {
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
  it('ranks by power as the server does, not by level, whatever the order they were listed in', () => {
    const list = [
      make('weak', 'cindle', 20, { power: 10 }),
      make('mid', 'splashet', 3, { power: 30 }),
      make('top', 'sproutle', 5, { power: 50 }),
      make('low', 'ashmole', 9, { power: 20 }),
    ];
    const ids = (slots: Slots): string[] => slots.filter((x): x is string => x !== null).sort();
    expect(ids(strongestThree(list))).toEqual(['low', 'mid', 'top']);
    expect(ids(strongestThree([...list].reverse()))).toEqual(['low', 'mid', 'top']);
  });

  it('breaks a tie with the older creature, then the smaller id', () => {
    const list = [
      make('c', 'cindle', 5, { power: 40, caughtAt: 3 }),
      make('b', 'splashet', 5, { power: 40, caughtAt: 1 }),
      make('a', 'sproutle', 5, { power: 40, caughtAt: 2 }),
      make('z', 'ashmole', 5, { power: 40, caughtAt: 2 }),
    ];
    expect(
      strongestThree(list)
        .filter((x) => x !== null)
        .sort(),
    ).toEqual(['a', 'b', 'z']);
  });

  it('stands setters left, a guard in the middle and payoffs on the right when that order reacts', () => {
    // Zipmouse (Spark) marks Charged and Sproutle (Grove) sets off Grounding.
    const list = [
      make('payoff', 'cindle', 12),
      make('setter', 'zipmouse', 11),
      make('guard', 'sproutle', 10),
      make('weak', 'cindle', 1),
    ];
    expect(strongestThree(list)).toEqual(['setter', 'guard', 'payoff']);
  });

  it('puts the starters in the order that sets off a reaction every round', () => {
    // In role order (Splashet, Sproutle, Cindle) Tide marks and nobody has Spark: never a reaction.
    const list = [
      make('setter', 'splashet', 8),
      make('guard', 'sproutle', 8),
      make('payoff', 'cindle', 8),
    ];
    const slots = strongestThree(list);
    expect(slots).toEqual(['payoff', 'guard', 'setter']);
    expect(orderHint(hintTeam(slots, list))).toBe(
      'Cindle marks Scorched → Splashet sets off Steam.',
    );
    expect(orderHint(hintTeam(['setter', 'guard', 'payoff'], list))).toBe(NO_REACTION_HINT);
  });

  it('leaves places empty when there are fewer than three creatures', () => {
    expect(strongestThree([make('only', 'cindle', 3)])).toEqual(['only', null, null]);
    expect(strongestThree([])).toEqual([null, null, null]);
  });
});

describe('the team the setup opens with', () => {
  const list = [
    make('a', 'cindle', 9, { power: 90 }),
    make('b', 'splashet', 8, { power: 80 }),
    make('c', 'sproutle', 7, { power: 70 }),
    make('d', 'ashmole', 1, { power: 10 }),
  ];

  it('falls back to the strongest three on the first run', () => {
    expect(startingTeam(null, list)).toEqual(strongestThree(list));
  });

  it('puts the last team back in the same slot order, not the strongest order', () => {
    // The weakest creature opens the row: the strongest three would not pick it at all.
    expect(startingTeam(['d', 'c', 'a'], list)).toEqual(['d', 'c', 'a']);
    expect(startingTeam(['c', 'a', 'b'], list)).toEqual(['c', 'a', 'b']);
  });

  it('leaves the slot of a creature that is gone empty and moves nobody up', () => {
    expect(startingTeam(['a', 'gone', 'c'], list)).toEqual(['a', null, 'c']);
    expect(startingTeam(['gone', 'b', 'c'], list)).toEqual([null, 'b', 'c']);
    expect(startingTeam(['a', 'b', 'gone'], list)).toEqual(['a', 'b', null]);
  });

  it('leaves the slot of a creature the picker does not offer empty', () => {
    expect(
      startingTeam(
        ['a', 'b', 'c'],
        list.filter((x) => x.id !== 'b'),
      ),
    ).toEqual(['a', null, 'c']);
  });

  it('keeps a creature in its first slot only, and ignores extra ids', () => {
    expect(startingTeam(['a', 'a', 'b'], list)).toEqual(['a', null, 'b']);
    expect(startingTeam(['a', 'b', 'c', 'd'], list)).toEqual(['a', 'b', 'c']);
    expect(startingTeam(['a'], list)).toEqual(['a', null, null]);
  });

  it('falls back to the strongest three when none of the last team can be placed', () => {
    expect(startingTeam(['x', 'y', 'z'], list)).toEqual(strongestThree(list));
    expect(startingTeam([], list)).toEqual(strongestThree(list));
  });

  it('never hands out a team the request builder would refuse for a reason other than empty slots', () => {
    const slots = startingTeam(['c', 'gone', 'a'], list);
    expect(isComplete(slots)).toBe(false);
    expect(completeTeam(slots)).toBeNull();
    expect(startingTeam(['c', 'b', 'a'], list)).toEqual(['c', 'b', 'a']);
    expect(completeTeam(startingTeam(['c', 'b', 'a'], list))).toEqual(['c', 'b', 'a']);
  });
});

describe('the row of a draft', () => {
  const list = [
    make('a', 'cindle', 9, { power: 90 }),
    make('b', 'splashet', 8, { power: 80 }),
    make('c', 'sproutle', 7, { power: 70 }),
    make('d', 'ashmole', 1, { power: 10 }),
  ];

  it('keeps every place as saved, empty places included', () => {
    expect(cleanDraft(['d', null, 'a'], list)).toEqual(['d', null, 'a']);
    expect(cleanDraft(['a', 'b', 'c'], list)).toEqual(['a', 'b', 'c']);
  });

  it('empties a place whose creature is not offered, and moves nobody up', () => {
    expect(cleanDraft(['gone', 'b', 'c'], list)).toEqual([null, 'b', 'c']);
    expect(
      cleanDraft(
        ['a', 'b', 'c'],
        list.filter((x) => x.id !== 'b'),
      ),
    ).toEqual(['a', null, 'c']);
  });

  it('keeps a creature in its first place only, and reads a short or long row', () => {
    expect(cleanDraft(['a', 'a', 'b'], list)).toEqual(['a', null, 'b']);
    expect(cleanDraft(['a'], list)).toEqual(['a', null, null]);
    expect(cleanDraft(['a', 'b', 'c', 'd'], list)).toEqual(['a', 'b', 'c']);
  });

  it('keeps an all-empty row empty: the player cleared it on purpose', () => {
    expect(cleanDraft([null, null, null], list)).toEqual([null, null, null]);
    expect(cleanDraft(['x', 'y', 'z'], list)).toEqual([null, null, null]);
  });

  it('compares two rows place by place', () => {
    expect(sameSlots(['a', null, 'c'], ['a', null, 'c'])).toBe(true);
    expect(sameSlots(['a', null, 'c'], ['a', 'c', null])).toBe(false);
  });
});

describe('the row the setup opens with, from all its sources', () => {
  const list = [
    make('a', 'cindle', 9, { power: 90 }),
    make('b', 'splashet', 8, { power: 80 }),
    make('c', 'sproutle', 7, { power: 70 }),
    make('d', 'ashmole', 1, { power: 10 }),
  ];
  const none = { memory: null, saved: null, lastTeam: null, creatures: list };

  it('prefers the row of this session over the saved draft and the last team', () => {
    expect(
      setupTeam({
        ...none,
        memory: ['c', null, 'a'],
        saved: ['b', 'b', 'd'],
        lastTeam: ['a', 'b', 'c'],
      }),
    ).toEqual(['c', null, 'a']);
  });

  it('uses the saved draft over the last team', () => {
    expect(setupTeam({ ...none, saved: ['d', 'c', null], lastTeam: ['a', 'b', 'c'] })).toEqual([
      'd',
      'c',
      null,
    ]);
  });

  it('keeps a cleared draft cleared, in memory or saved', () => {
    expect(setupTeam({ ...none, memory: [null, null, null], lastTeam: ['a', 'b', 'c'] })).toEqual([
      null,
      null,
      null,
    ]);
    expect(setupTeam({ ...none, saved: [null, null, null], lastTeam: ['a', 'b', 'c'] })).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('drops creatures that are no longer owned or are doubled, in either draft', () => {
    expect(setupTeam({ ...none, memory: ['gone', 'a', 'a'] })).toEqual([null, 'a', null]);
    expect(setupTeam({ ...none, saved: ['b', 'gone', 'b'] })).toEqual(['b', null, null]);
  });

  it('falls back to the last team, then to the strongest three, without any draft', () => {
    expect(setupTeam({ ...none, lastTeam: ['d', 'c', 'a'] })).toEqual(['d', 'c', 'a']);
    expect(setupTeam(none)).toEqual(strongestThree(list));
  });
});

describe('drops', () => {
  it('moves a team creature to an empty place and says so', () => {
    const { slots, outcome } = resolveDrop(
      ['a', null, null],
      'a',
      { kind: 'slot', slot: 2 },
      nameOf,
    );
    expect(slots).toEqual([null, null, 'a']);
    expect(outcome.status).toBe('valid');
    expect(outcome.announce).toBe('Moved Ann to the right slot.');
    expect(outcome.intent).toBeNull();
  });

  it('swaps two creatures of the team when one is dropped on the other', () => {
    const swap = resolveDrop(['b', 'a', null], 'a', { kind: 'slot', slot: 0 }, nameOf);
    expect(swap.slots).toEqual(['a', 'b', null]);
    expect(swap.outcome.status).toBe('valid');
    expect(swap.outcome.announce).toBe('Swapped Ann with Bo.');
  });

  it('never places a creature that is not in the team by a drag: the picker does that', () => {
    const refused = resolveDrop(['b', null, null], 'a', { kind: 'slot', slot: 1 }, nameOf);
    expect(refused.slots).toEqual(['b', null, null]);
    expect(refused.outcome.status).toBe('invalid');
    expect(refused.outcome.hint).toContain('Pick a creature');
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
    expect(
      resolveDrop(['a', null, null], 'a', { kind: 'slot', slot: 9 }, nameOf).outcome.status,
    ).toBe('invalid');
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
    // A different order is a different run, so it gets its own action name, and so its own key.
    expect(ActionIds.dungeonRun(reversed?.team ?? ['x', 'x', 'x'])).not.toBe(
      ActionIds.dungeonRun(forward?.team ?? ['x', 'x', 'x']),
    );
  });

  it('names the same picks as one action, and different picks as another', () => {
    const team = completeTeam(slots);
    const again = completeTeam(['a', 'b', 'c']);
    const other = completeTeam(['b', 'a', 'c']);
    if (team === null || again === null || other === null) throw new Error('team is complete');
    expect(ActionIds.dungeonRun(team)).toBe(ActionIds.dungeonRun(again));
    expect(ActionIds.dungeonRun(team)).not.toBe(ActionIds.dungeonRun(other));
  });

  it('has no complete team until all three places are filled with different creatures', () => {
    expect(completeTeam(['a', 'b', null])).toBeNull();
    expect(completeTeam(['a', 'a', 'b'])).toBeNull();
    expect(completeTeam(slots)).toEqual(['a', 'b', 'c']);
  });
});

/** The members of a full team in slot order, as the hint reads them (names are the species names here). */
function hintTeam(
  slots: readonly (string | null)[],
  list: readonly PickerCreature[],
): { name: string; species: string }[] {
  return slots.map((id) => {
    const c = list.find((x) => x.id === id);
    if (c === undefined) throw new Error('slot is empty');
    return { name: speciesLabel(c.species), species: c.species };
  });
}

function speciesLabel(species: string): string {
  return species.charAt(0).toUpperCase() + species.slice(1);
}

describe('the hint about reactions under the slot row', () => {
  const species = content.creatures.slice(0, 12);
  const team = (ids: readonly string[]) =>
    ids.map((id) => ({ name: speciesLabel(id), species: id }));

  it('says nobody can set off a reaction when the order never does', () => {
    expect(orderHint(team(['splashet', 'sproutle', 'cindle']))).toBe(
      'In this order nobody can set off a reaction.',
    );
  });

  it('names who marks and who sets it off, in the game words', () => {
    expect(orderHint(team(['cindle', 'sproutle', 'splashet']))).toBe(
      'Cindle marks Scorched → Splashet sets off Steam.',
    );
    expect(orderHint(team(['zipmouse', 'sproutle', 'cindle']))).toBe(
      'Zipmouse marks Charged → Sproutle sets off Grounding.',
    );
  });

  it('is only there for a full team of known species', () => {
    expect(orderHint(team(['cindle', 'splashet']))).toBeNull();
    expect(orderHint([])).toBeNull();
    expect(orderHint(team(['cindle', 'splashet', 'not-a-species']))).toBeNull();
  });

  it('uses the names it is given as plain text', () => {
    const evil = [
      { name: '<b>x</b>', species: 'cindle' },
      { name: 'Sprout', species: 'sproutle' },
      { name: 'Splash', species: 'splashet' },
    ];
    expect(orderHint(evil)).toBe('<b>x</b> marks Scorched → Splash sets off Steam.');
  });

  it('agrees with the order scorer: a reaction is named exactly when the row scores', () => {
    let seen = 0;
    for (const a of species) {
      for (const b of species) {
        for (const c of species) {
          if (a.id === b.id || a.id === c.id || b.id === c.id) continue;
          const hint = orderHint(team([a.id, b.id, c.id]));
          const score = rowScore([a, b, c]);
          expect(hint === NO_REACTION_HINT, `${a.id} ${b.id} ${c.id}`).toBe(score === 0);
          if (score > 0) seen += 1;
        }
      }
    }
    expect(seen).toBeGreaterThan(50);
  });

  it('never names a reaction the row cannot set off, and keeps to a sentence for each pair', () => {
    const reactions = new Set(content.reactions.map((r) => r.name));
    const hint = orderHint(team(['solmane', 'cindle', 'mistnewt'])) ?? '';
    for (const sentence of hint.split('. ').filter(Boolean)) {
      expect([...reactions].some((r) => sentence.includes(`sets off ${r}`))).toBe(true);
    }
  });
});
