import { creaturePower } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { Creature } from './api';
import type { RowSlotView } from './raid-api';
import {
  BOARD_FULL_REASON,
  IN_TEAM_NOTE,
  RECOMMENDED_COUNT,
  RECOMMENDED_TAG,
  dungeonPickerOptions,
  pickerOptions,
  recommendedIds,
  toPickerCreature,
  type PickerCreature,
} from './roster-picker';

const creature = (
  id: string,
  species: string,
  level: number,
  power: number,
  caughtAt = 1_000,
): PickerCreature => ({ id, species, nickname: null, level, power, caughtAt });

/** A row of nine slots (three players): Front 0-2, Middle 3-5, Back 6-8, with `at` filled in. */
function rowOf(at: Record<number, string>): RowSlotView[] {
  const zones = ['front', 'middle', 'back'] as const;
  return Array.from({ length: 9 }, (_, slot) => {
    const id = at[slot];
    return {
      slot,
      zone: zones[Math.floor(slot / 3)] as 'front' | 'middle' | 'back',
      creature:
        id === undefined
          ? null
          : {
              ownerName: 'Me',
              species: 'splashet',
              name: 'Splashet',
              level: 5,
              mine: true,
              auto: false,
              movable: false,
              creatureId: id,
            },
    };
  });
}

describe('the Recommended tag', () => {
  it('says only "Recommended", with no reason, for as many creatures as a team holds', () => {
    expect(RECOMMENDED_TAG).toBe('Recommended');
    expect(RECOMMENDED_COUNT).toBe(3);
  });

  it('is on the three strongest by power, however they are listed', () => {
    const list = [
      creature('a', 'splashet', 4, 50),
      creature('b', 'cindle', 9, 10),
      creature('c', 'sproutle', 6, 80),
      creature('d', 'ashmole', 6, 70),
      creature('e', 'zipmouse', 2, 60),
    ];
    expect([...recommendedIds(list)].sort()).toEqual(['c', 'd', 'e']);
    expect([...recommendedIds([...list].reverse())].sort()).toEqual(['c', 'd', 'e']);
  });

  it('breaks a tie as the server does: the older creature, then the smaller id', () => {
    const list = [
      creature('z', 'splashet', 4, 50, 300),
      creature('y', 'cindle', 4, 50, 100),
      creature('x', 'sproutle', 4, 50, 100),
      creature('w', 'ashmole', 4, 50, 200),
    ];
    expect([...recommendedIds(list)].sort()).toEqual(['w', 'x', 'y']);
  });

  it('tags everyone when there are three or fewer', () => {
    expect(recommendedIds([creature('a', 'splashet', 1, 1)]).size).toBe(1);
    expect(recommendedIds([]).size).toBe(0);
  });

  it('marks the same three in the raid picker for every slot, and keeps the picker order', () => {
    const owned = [
      creature('a', 'splashet', 4, 90),
      creature('b', 'cindle', 9, 10),
      creature('c', 'sproutle', 6, 80),
      creature('d', 'ashmole', 6, 70),
    ];
    const base = { length: 9, turnOrder: 'left_to_right', showEffects: false } as const;
    const first = pickerOptions({ ...base, creatures: owned, row: rowOf({}), slot: 1 });
    const other = pickerOptions({ ...base, creatures: owned, row: rowOf({}), slot: 7 });
    // The order is the picker's own (level, then name), not by strength.
    expect(first.map((o) => o.id)).toEqual(['b', 'd', 'c', 'a']);
    expect(first.filter((o) => o.recommended).map((o) => o.id)).toEqual(['d', 'c', 'a']);
    expect(other.filter((o) => o.recommended).map((o) => o.id)).toEqual(['d', 'c', 'a']);
  });

  it('is still shown on a creature that cannot be picked', () => {
    const owned = [
      creature('a', 'splashet', 4, 90),
      creature('b', 'cindle', 9, 80),
      creature('c', 'sproutle', 6, 70),
      creature('d', 'ashmole', 6, 60),
    ];
    const options = pickerOptions({
      creatures: owned,
      row: rowOf({ 0: 'a', 1: 'c', 2: 'd' }),
      length: 9,
      slot: 4,
      turnOrder: 'left_to_right',
      showEffects: false,
    });
    expect(options.find((o) => o.id === 'b')).toMatchObject({
      recommended: true,
      disabled: BOARD_FULL_REASON,
    });
    expect(options.find((o) => o.id === 'd')?.recommended).toBe(false);
  });

  it("ranks the collection's creatures by power with their gear, as the server does", () => {
    const owned = {
      id: 'g',
      species: 'splashet',
      nickname: null,
      level: 5,
      caughtAt: 77,
      stats: { hp: 100, atk: 10, spd: 10 },
      statsWithGear: { hp: 120, atk: 25, spd: 10 },
      dodgeBp: 0,
    } as unknown as Creature;
    // 25 attack + 120 / 10 HP = 37 (Speed 10 is 1% dodge: 121 effective HP, still 12); the bare stats would give 20.
    expect(toPickerCreature(owned)).toEqual({
      id: 'g',
      species: 'splashet',
      nickname: null,
      level: 5,
      power: 37,
      caughtAt: 77,
    });
  });
});

describe('flat dodge in the ranking', () => {
  it('counts the creature’s flat dodge like the server’s power does', () => {
    const base = {
      id: 'g',
      species: 'splashet',
      nickname: null,
      level: 5,
      caughtAt: 77,
      stats: { hp: 100, atk: 10, spd: 10 },
      statsWithGear: { hp: 120, atk: 25, spd: 10 },
    };
    // Speed 10 = 100 points plus 2900 flat = 30% dodge: floor(120 / 0.7) = 171 effective HP, 25 + 17.
    const dodgy = { ...base, dodgeBp: 2_900 } as unknown as Creature;
    expect(toPickerCreature(dodgy).power).toBe(42);
    expect(toPickerCreature(dodgy).power).toBe(creaturePower(base.statsWithGear, 2_900));
  });
});

describe('the dungeon picker options', () => {
  const owned = [
    creature('splash', 'splashet', 5, 40),
    creature('cind', 'cindle', 5, 30),
    creature('guard', 'sproutle', 5, 20),
    creature('support', 'ashmole', 5, 10),
  ];

  it('says "in this slot" for the dungeon order, and a Guard protects its neighbours', () => {
    // Cindle (Ember) marks and acts first on the left; Splashet (Tide) sets off Steam in slot 1.
    const options = dungeonPickerOptions({
      creatures: owned,
      slots: ['cind', null, null],
      slot: 1,
      showEffects: true,
    });
    expect(options.find((o) => o.id === 'splash')?.effect).toBe('Steam with Cindle');
    expect(options.find((o) => o.id === 'guard')?.effect).toBe('Protects 1 neighbour');
    expect(options.find((o) => o.id === 'support')?.effect).toBe('Buffs 1 neighbour');
  });

  it('goes left to right: a payoff on the left of its marker sets off nothing', () => {
    const options = dungeonPickerOptions({
      creatures: owned,
      slots: [null, 'cind', null],
      slot: 0,
      showEffects: true,
    });
    expect(options.find((o) => o.id === 'splash')?.effect).toBeNull();
  });

  it('counts a creature already in the team as moved, and has no effect lines when off', () => {
    const options = dungeonPickerOptions({
      creatures: owned,
      slots: ['splash', 'cind', null],
      slot: 2,
      showEffects: false,
    });
    expect(options.every((o) => o.effect === null)).toBe(true);
    expect(options.filter((o) => o.onBoard).map((o) => o.id)).toEqual(['cind', 'splash']);
    expect(IN_TEAM_NOTE).toBe('In the team · moves here');
  });

  it('disables new creatures at 3 / 3 with the reason, and keeps those in the team pickable', () => {
    const options = dungeonPickerOptions({
      creatures: owned,
      slots: ['splash', 'cind', 'guard'],
      slot: 0,
      showEffects: false,
    });
    expect(options.map((o) => [o.id, o.disabled])).toEqual([
      ['cind', null],
      ['splash', null],
      ['guard', null],
      ['support', BOARD_FULL_REASON],
    ]);
  });

  it('tags the three strongest', () => {
    const options = dungeonPickerOptions({
      creatures: owned,
      slots: [null, null, null],
      slot: 0,
      showEffects: false,
    });
    expect(
      options
        .filter((o) => o.recommended)
        .map((o) => o.id)
        .sort(),
    ).toEqual(['cind', 'guard', 'splash']);
  });
});
