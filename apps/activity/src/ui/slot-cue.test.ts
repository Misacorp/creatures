import { content } from '@creatures/game';
import type { AffectMode, AffectRow } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { getSpecies } from '../game';
import { affectSlotOf, cueClasses, cueElementClass, cuesFor, movedKeys, sceneOf } from './slot-cue';

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

  it('moves keys like a drop does', () => {
    expect(movedKeys(['a', 'b', 'c'], 'a', 2)).toEqual(['c', 'b', 'a']);
    expect(movedKeys(['a', null, null], 'a', 1)).toEqual([null, 'a', null]);
    expect(movedKeys([null, null], 'z', 1)).toEqual([null, 'z']);
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
  });
});
