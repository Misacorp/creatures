import { RULES, content } from '@creatures/game';
import type { AffectMode, AffectRow } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { getSpecies } from '../game';
import {
  affectSlotOf,
  cueClasses,
  cueElementClass,
  cuesFor,
  effectLine,
  movedKeys,
  sceneOf,
} from './slot-cue';

const DUNGEON: AffectMode = { row: 'dungeon' };

/** A row of real species ids, as the dungeon team reads it. */
function rowOf(...species: (string | null)[]): AffectRow {
  return species.map((id) => (id === null ? null : affectSlotOf(getSpecies(id))));
}

describe('cuesFor: the reaction pair', () => {
  // Cindle (Ember) marks Scorched, Splashet (Tide) sets off Steam: slot 0 marks, slot 1 sets off.
  const row = rowOf('cindle', 'splashet', 'ashmole');

  it('lights up both creatures with the name from the content', () => {
    const cues = cuesFor({ row, mode: DUNGEON, focus: 1, scope: 'row' });
    const steam = content.reactions.find((r) => r.id === 'steam');
    expect(steam).toBeDefined();
    expect(cues.slots.get(0)?.reaction).toEqual({
      id: 'steam',
      name: steam?.name,
      role: 'marker',
      element: steam?.markElement,
    });
    expect(cues.slots.get(1)?.reaction).toMatchObject({
      name: steam?.name,
      role: 'payoff',
      element: steam?.triggerElement,
    });
    expect(cues.none).toBe(false);
  });

  it('uses the names of whatever content it is given', () => {
    const renamed = content.reactions.map((r) => (r.id === 'steam' ? { ...r, name: 'Mist' } : r));
    const cues = cuesFor({ row, mode: DUNGEON, focus: 0, scope: 'row', reactions: renamed });
    expect(cues.slots.get(1)?.reaction?.name).toBe('Mist');
  });

  it('shows a row-wide cue for the whole row, a focus cue only for the creature in focus', () => {
    // Round 1 gives Steam (slot 0 to 1), round 2 Wildfire (slot 2 to 0): all three take part.
    const three = rowOf('cindle', 'splashet', 'sproutle');
    const wide = cuesFor({ row: three, mode: DUNGEON, focus: 2, scope: 'row' });
    expect([...wide.slots.keys()].sort()).toEqual([0, 1, 2]);
    const one = cuesFor({ row: three, mode: DUNGEON, focus: 1, scope: 'focus' });
    expect(one.slots.has(1)).toBe(true);
    expect(one.slots.has(0)).toBe(true);
  });

  it('says "no reaction" when nothing in the order can react', () => {
    // Tide, Grove, Ember in this order: nobody has the element that cashes a mark in.
    const silent = rowOf('splashet', 'sproutle', 'cindle');
    const cues = cuesFor({ row: silent, mode: DUNGEON, focus: 0, scope: 'row' });
    expect(cues.slots.size).toBe(0);
    expect(cues.none).toBe(true);
  });

  it('calls a whole row silent only when it is full, a single creature in a raid row as it stands', () => {
    const half = rowOf('splashet', null, 'cindle');
    expect(cuesFor({ row: half, mode: DUNGEON, focus: 0, scope: 'row' }).none).toBe(false);
    expect(cuesFor({ row: half, mode: DUNGEON, focus: 0, scope: 'focus' }).none).toBe(true);
  });

  it('has nothing to show with no focus or an empty slot in focus', () => {
    expect(cuesFor({ row, mode: DUNGEON, focus: null, scope: 'row' }).slots.size).toBe(0);
    expect(
      cuesFor({ row: rowOf('cindle', null), mode: DUNGEON, focus: 1, scope: 'row' }).none,
    ).toBe(false);
  });

  it('follows the boss turn order in the raid', () => {
    // Both are Payoffs, so only the first to act can leave a mark: Ember first gives Steam.
    const pair: AffectRow = [
      { role: 'payoff', element: 'ember', speed: 5 },
      { role: 'payoff', element: 'tide', speed: 9 },
    ];
    const ltr = cuesFor({
      row: pair,
      mode: { row: 'raid', turnOrder: 'left_to_right' },
      focus: 0,
      scope: 'focus',
    });
    expect(ltr.slots.get(1)?.reaction?.name).toBe('Steam');
    const rtl = cuesFor({
      row: pair,
      mode: { row: 'raid', turnOrder: 'right_to_left' },
      focus: 0,
      scope: 'focus',
    });
    expect(rtl.none).toBe(true);
    const speed = cuesFor({
      row: pair,
      mode: { row: 'raid', turnOrder: 'speed' },
      focus: 0,
      scope: 'focus',
    });
    expect(speed.none).toBe(true);
  });
});

describe('the scene', () => {
  const keys = ['a', 'b', null];

  it('shows the creature under the pointer when nothing is carried', () => {
    expect(sceneOf({ keys, carried: null, pointer: 1 })).toEqual({ keys, focus: 1 });
    expect(sceneOf({ keys, carried: null, pointer: 2 }).focus).toBeNull();
    expect(sceneOf({ keys, carried: null, pointer: null }).focus).toBeNull();
  });

  it('previews a carried creature at the slot it is over', () => {
    expect(sceneOf({ keys, carried: 'a', pointer: 2 })).toEqual({
      keys: [null, 'b', 'a'],
      focus: 2,
    });
    expect(sceneOf({ keys, carried: 'a', pointer: 1 })).toEqual({
      keys: ['b', 'a', null],
      focus: 1,
    });
    // From the tray: the creature takes the slot, whoever stood there leaves.
    expect(sceneOf({ keys, carried: 'z', pointer: 0 })).toEqual({
      keys: ['z', 'b', null],
      focus: 0,
    });
  });

  it('shows a carried creature where it stands now when it is not over a slot it can go to', () => {
    expect(sceneOf({ keys, carried: 'b', pointer: null })).toEqual({ keys, focus: 1 });
    expect(sceneOf({ keys, carried: 'z', pointer: null }).focus).toBeNull();
    expect(sceneOf({ keys, carried: 'b', pointer: 0, canDrop: () => false })).toEqual({
      keys,
      focus: 1,
    });
    expect(sceneOf({ keys, carried: 'b', pointer: 7 }).focus).toBe(1);
  });

  it('shows the creature of an open popover over the one under the pointer, a carried one over both', () => {
    expect(sceneOf({ keys, carried: null, pointer: 0, inspected: 1 }).focus).toBe(1);
    // A popover on an empty slot is nothing: the pointer's creature shows.
    expect(sceneOf({ keys, carried: null, pointer: 0, inspected: 2 }).focus).toBe(0);
    expect(sceneOf({ keys, carried: 'a', pointer: null, inspected: 1 }).focus).toBe(0);
  });

  it('moves keys like a drop does', () => {
    expect(movedKeys(['a', 'b', 'c'], 'a', 2)).toEqual(['c', 'b', 'a']);
    expect(movedKeys(['a', null, null], 'a', 1)).toEqual([null, 'a', null]);
    expect(movedKeys([null, null], 'z', 1)).toEqual([null, 'z']);
  });
});

describe('cuesFor: influence', () => {
  const raid = (turnOrder: 'left_to_right' | 'speed'): AffectMode => ({ row: 'raid', turnOrder });

  it("shades a Support's neighbours as buffed, and a Guard's as covered", () => {
    // Ashmole (Support) in the middle of Cindle and Splashet.
    const support = cuesFor({
      row: rowOf('cindle', 'ashmole', 'splashet'),
      mode: DUNGEON,
      focus: 1,
      scope: 'row',
    });
    expect(support.slots.get(0)?.buff).toBe(true);
    expect(support.slots.get(2)?.buff).toBe(true);
    expect(support.slots.get(1)?.buff).toBeUndefined();
    // Sproutle (Guard) covers the two beside it.
    const guard = cuesFor({
      row: rowOf('cindle', 'sproutle', 'splashet'),
      mode: DUNGEON,
      focus: 1,
      scope: 'row',
    });
    expect(guard.slots.get(0)?.cover).toBe(true);
    expect(guard.slots.get(2)?.cover).toBe(true);
  });

  it('follows the raid rules: the buff stops at a row edge, a Guard covers its whole row', () => {
    // Zones of two: Front 0-1, Middle 2-3, Back 4-5. A Support at the end of Front buffs only slot 0.
    const row = rowOf('cindle', 'ashmole', 'splashet', 'sproutle', 'zipmouse', 'cindle');
    const buff = cuesFor({ row, mode: raid('left_to_right'), focus: 1, scope: 'focus' });
    expect([...buff.slots].filter(([, c]) => c.buff === true).map(([slot]) => slot)).toEqual([0]);
    // Sproutle (Guard) at slot 3 covers slot 2 only (the rest of its zone).
    const cover = cuesFor({ row, mode: raid('left_to_right'), focus: 3, scope: 'focus' });
    expect([...cover.slots].filter(([, c]) => c.cover === true).map(([slot]) => slot)).toEqual([2]);
  });

  it('keeps a reaction ring and an influence shade on one tile', () => {
    // Ashmole (Ember Support) buffs Cindle (slot 0), and also marks Scorched for Splashet (slot 2) to set off.
    const row = rowOf('cindle', 'ashmole', 'splashet');
    const cues = cuesFor({ row, mode: DUNGEON, focus: 1, scope: 'row' });
    const both = cues.slots.get(2);
    expect(both?.buff).toBe(true);
    expect(both?.reaction).toBeDefined();
    expect(cueClasses(both)).toEqual(expect.arrayContaining(['cue-buff', 'cue-react']));
  });
});

describe('effectLine', () => {
  const name = (slot: number): string => ['Cindle', 'Ashmole', 'Splashet'][slot] ?? '?';

  it('says what a Support does, with the number from the rules', () => {
    const line = effectLine({
      row: rowOf('splashet', 'ashmole', 'zipmouse'),
      mode: DUNGEON,
      focus: 1,
      nameOf: name,
    });
    expect(line).toContain(`${String(RULES.combat.supportBuffBp / 100)}%`);
    expect(line).toContain('next hit');
  });

  it('says what a Guard does, and for whom (beside it in the dungeon, its row in the raid)', () => {
    const row = rowOf('splashet', 'sproutle', 'zipmouse');
    const dungeon = effectLine({ row, mode: DUNGEON, focus: 1, nameOf: name });
    expect(dungeon).toContain('beside it');
    // The live Guard has armor, not extra HP: the line says "less damage", from the number.
    expect(dungeon).toContain(`takes ${String(RULES.combat.guard.armorBp / 100)}% less damage`);
    expect(dungeon).not.toContain('more HP');
    const raid = effectLine({
      row,
      mode: { row: 'raid', turnOrder: 'left_to_right' },
      focus: 1,
      nameOf: name,
    });
    expect(raid).toContain('its row');
  });

  it('describes the bonus from the numbers it is given: armor, extra HP, both or neither', () => {
    const row = rowOf('splashet', 'sproutle', 'zipmouse');
    const line = (guard: { hpBp: number; armorBp: number }) =>
      effectLine({ row, mode: DUNGEON, focus: 1, nameOf: name, guard });
    expect(line({ hpBp: 0, armorBp: 2_500 })).toBe(
      "Takes the boss's hits for the creatures beside it, and takes 25% less damage from every hit.",
    );
    expect(line({ hpBp: 3_000, armorBp: 0 })).toBe(
      "Takes the boss's hits for the creatures beside it, and has 30% more HP.",
    );
    expect(line({ hpBp: 1_000, armorBp: 1_000 })).toContain(
      'takes 10% less damage from every hit and has 10% more HP',
    );
    expect(line({ hpBp: 0, armorBp: 0 })).toBe(
      "Takes the boss's hits for the creatures beside it.",
    );
  });

  it('names the reaction and its partner, with its multiplier from the content', () => {
    const row = rowOf('cindle', 'splashet');
    const steam = content.reactions.find((r) => r.id === 'steam');
    const times = String(steam === undefined ? 0 : steam.multiplierBp / 10_000);
    const who = (slot: number): string => ['Cindle', 'Splashet', 'Zipmouse'][slot] ?? '?';
    const marker = effectLine({ row, mode: DUNGEON, focus: 0, nameOf: who });
    expect(marker).toBe(`Sets up Steam (x${times}) for Splashet.`);
    const payoff = effectLine({ row, mode: DUNGEON, focus: 1, nameOf: who });
    expect(payoff).toBe(`Sets off Steam (x${times}) on Cindle's mark.`);
  });

  it('has nothing to say for a creature that does nothing, or an empty slot', () => {
    const row = rowOf('splashet', 'sproutle', 'cindle', null);
    expect(
      effectLine({ row: rowOf('splashet', 'splashet'), mode: DUNGEON, focus: 0, nameOf: name }),
    ).toBeNull();
    expect(effectLine({ row, mode: DUNGEON, focus: 3, nameOf: name })).toBeNull();
  });
});

describe('the class names', () => {
  it('colours a pair by the elements of the content, and refuses odd ids', () => {
    expect(cueElementClass('tide')).toBe('cue-el-tide');
    expect(cueElementClass('x"><img')).toBe('');
    expect(cueClasses(undefined)).toEqual([]);
    expect(
      cueClasses({ reaction: { id: 'steam', name: 'Steam', role: 'marker', element: 'ember' } }),
    ).toEqual(['cue-react', 'cue-marker', 'cue-el-ember']);
    expect(cueClasses({ buff: true })).toEqual(['cue-buff']);
    expect(cueClasses({ cover: true })).toEqual(['cue-cover']);
  });
});
