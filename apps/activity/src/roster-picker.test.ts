import { describe, expect, it } from 'vitest';
import type { RowSlotView } from './raid-api';
import {
  BOARD_FULL_REASON,
  EFFECT_PREFIX,
  MAX_ON_BOARD,
  ON_BOARD_NOTE,
  SHOW_PICKER_EFFECTS,
  ALREADY_JOINING,
  allPlaced,
  awayPickerOptions,
  boardTotalLine,
  effectPreview,
  pickerOptions,
  pickerTitle,
  placedCount,
  placedLine,
  rosterNote,
  type PickerCreature,
} from './roster-picker';

const mine = (id: string, species: string, level = 5): NonNullable<RowSlotView['creature']> => ({
  ownerName: 'Me',
  species,
  name: species,
  level,
  mine: true,
  auto: false,
  movable: false,
  creatureId: id,
});
const theirs = (species: string): NonNullable<RowSlotView['creature']> => ({
  ownerName: 'Jun',
  species,
  name: species,
  level: 5,
  mine: false,
  auto: false,
  movable: false,
});

/** A row of nine slots (three players): Front 0-2, Middle 3-5, Back 6-8, with `at` filled in. */
function rowOf(at: Record<number, NonNullable<RowSlotView['creature']>>): RowSlotView[] {
  const zones = ['front', 'middle', 'back'] as const;
  return Array.from({ length: 9 }, (_, slot) => ({
    slot,
    zone: zones[Math.floor(slot / 3)] as 'front' | 'middle' | 'back',
    creature: at[slot] ?? null,
  }));
}

const creature = (id: string, species: string, level: number): PickerCreature => ({
  id,
  species,
  nickname: null,
  level,
  power: level * 10,
  caughtAt: 1_000,
});

describe('the count and the line under the heading', () => {
  it('counts only your own creatures on the board', () => {
    expect(placedCount(rowOf({}))).toBe(0);
    expect(placedCount(rowOf({ 0: mine('a', 'splashet'), 1: theirs('cindle') }))).toBe(1);
  });

  it('says how many are placed, and when the rest join in a note', () => {
    expect(placedLine(1)).toBe('1 / 3 placed');
    expect(rosterNote(1, { event: 'phase1' }, true)).toBe(
      'The rest join automatically when Phase 1 locks.',
    );
    expect(rosterNote(0, { event: 'phase2' }, true)).toContain('Phase 2 locks');
    expect(rosterNote(2, { event: 'finale' }, true)).toContain('when Finale locks');
    expect(rosterNote(2, null, true)).toContain('when the board locks');
    expect(rosterNote(2, { event: 'weekStart' }, true)).toContain('when the board locks');
  });

  it('drops the note once all three are placed, and says so with a check', () => {
    expect(allPlaced(3)).toBe(true);
    expect(allPlaced(2)).toBe(false);
    expect(placedLine(3)).toBe('3 / 3 placed');
    expect(rosterNote(3, { event: 'phase1' }, true)).toBeNull();
    expect(rosterNote(3, { event: 'phase1' }, false)).toBe('The board is locked.');
  });

  it('says the board is locked once it is, and counts with a slash and spaces', () => {
    expect(rosterNote(2, null, false)).toBe('The board is locked.');
    expect(placedLine(0)).not.toContain(' of ');
  });

  it("counts everyone's creatures on the board out of all the slots", () => {
    const row = rowOf({ 0: mine('a', 'splashet'), 1: theirs('cindle'), 4: theirs('sproutle') });
    expect(boardTotalLine(row, 9)).toBe('3 / 9 team slots filled');
    expect(boardTotalLine(rowOf({}), 9)).toBe('0 / 9 team slots filled');
    expect(boardTotalLine(row, 9)).not.toContain(' of ');
  });

  it('titles the picker with the place', () => {
    expect(pickerTitle('Middle, lane 2')).toBe('Choose a creature for Middle, lane 2');
  });

  it('keeps the effect preview switched on (Misa wants to try it)', () => {
    expect(SHOW_PICKER_EFFECTS).toBe(true);
    expect(EFFECT_PREFIX).toBe('In this slot:');
    expect(MAX_ON_BOARD).toBe(3);
  });
});

describe('the options of the picker', () => {
  const owned = [
    creature('a', 'splashet', 4),
    creature('b', 'cindle', 9),
    creature('c', 'sproutle', 6),
    creature('d', 'ashmole', 6),
  ];
  const base = { length: 9, slot: 4, turnOrder: 'left_to_right', showEffects: false } as const;

  it('lists every creature you own, strongest first, with the tags and no reason', () => {
    const options = pickerOptions({ ...base, creatures: owned, row: rowOf({}) });
    // Equal levels go by name: Ashmole before Sproutle.
    expect(options.map((o) => o.id)).toEqual(['b', 'd', 'c', 'a']);
    expect(options[0]).toMatchObject({
      name: 'Cindle',
      level: 9,
      element: 'ember',
      onBoard: false,
      disabled: null,
      effect: null,
    });
    expect(options.every((o) => o.role !== '')).toBe(true);
  });

  it('marks the ones on the board, which stay pickable (they move here)', () => {
    const row = rowOf({ 0: mine('a', 'splashet', 4), 1: mine('b', 'cindle', 9) });
    const options = pickerOptions({ ...base, creatures: owned, row });
    expect(options.map((o) => [o.id, o.onBoard])).toEqual([
      ['d', false],
      ['c', false],
      ['b', true],
      ['a', true],
    ]);
    expect(options.every((o) => o.disabled === null)).toBe(true);
    expect(ON_BOARD_NOTE).toBe('On the board · moves here');
  });

  it('refuses new creatures at 3 / 3 with the reason, and still lets those on the board move', () => {
    const row = rowOf({
      0: mine('a', 'splashet', 4),
      1: mine('b', 'cindle', 9),
      2: mine('c', 'sproutle', 6),
    });
    const options = pickerOptions({ ...base, creatures: owned, row });
    expect(options.map((o) => [o.id, o.disabled])).toEqual([
      ['b', null],
      ['c', null],
      ['a', null],
      ['d', BOARD_FULL_REASON],
    ]);
    expect(BOARD_FULL_REASON).toBe('3 / 3 placed, remove one first');
  });

  it('uses the nickname as the name, as text', () => {
    const named = [{ ...creature('n', 'splashet', 3), nickname: '<b>Bubbles</b>' }];
    const [option] = pickerOptions({ ...base, creatures: named, row: rowOf({}) });
    expect(option?.name).toBe('<b>Bubbles</b>');
  });
});

describe('the effect preview', () => {
  const owned = [
    creature('splash', 'splashet', 5),
    creature('guard', 'sproutle', 5),
    creature('support', 'ashmole', 5),
    creature('plain', 'zipmouse', 5),
  ];
  const args = { creatures: owned, length: 9, turnOrder: 'left_to_right', showEffects: true };

  it('is switched off by the flag', () => {
    const options = pickerOptions({
      ...args,
      showEffects: false,
      row: rowOf({ 3: theirs('cindle') }),
      slot: 4,
    });
    expect(options.every((o) => o.effect === null)).toBe(true);
  });

  it('names the reaction and the partner for the slot, not for the creature alone', () => {
    // Cindle (Ember) marks, Splashet (Tide) sets off Steam: next to Cindle there is a partner.
    const beside = pickerOptions({ ...args, row: rowOf({ 3: theirs('cindle') }), slot: 4 });
    expect(beside.find((o) => o.id === 'splash')?.effect).toBe('Steam with Cindle');
    // Alone in a row with nobody to react with, it does nothing.
    const alone = pickerOptions({ ...args, row: rowOf({}), slot: 4 });
    expect(alone.find((o) => o.id === 'splash')?.effect).toBeNull();
  });

  it('says what a Guard covers and what a Support buffs', () => {
    const row = rowOf({ 3: theirs('cindle'), 5: theirs('zipmouse') });
    const options = pickerOptions({ ...args, row, slot: 4 });
    expect(options.find((o) => o.id === 'guard')?.effect).toContain('Covers its row');
    expect(options.find((o) => o.id === 'support')?.effect).toContain('Buffs 2 neighbours');
    expect(options.find((o) => o.id === 'plain')?.effect).toBeNull();
  });

  it('counts a creature that is on the board as moved: its old slot is free', () => {
    // Splashet stands at 0, next to nobody; moved to slot 4 beside Cindle it reacts.
    const row = rowOf({ 0: mine('splash', 'splashet', 5), 3: theirs('cindle') });
    const options = pickerOptions({ ...args, row, slot: 4 });
    expect(options.find((o) => o.id === 'splash')?.effect).toBe('Steam with Cindle');
  });

  it('effectPreview is null for an empty slot and joins several parts with a dot', () => {
    const known = new Map([['x', { species: 'sproutle', level: 5 }]]);
    expect(
      effectPreview({
        keys: Array(9).fill(null),
        known,
        slot: 1,
        mode: { row: 'raid', turnOrder: 'speed' },
      }),
    ).toBeNull();
    expect(
      effectPreview({
        keys: ['x', ...Array<null>(8).fill(null)],
        known,
        slot: 0,
        mode: { row: 'raid', turnOrder: 'left_to_right' },
      }),
    ).toBe('Covers its row');
  });
});

describe('auto tiles and the swap picker', () => {
  it('does not count a creature that joins by itself as placed, or as on the board', () => {
    const auto = { ...mine('a', 'splashet'), auto: true };
    const row = rowOf({ 0: auto, 1: mine('b', 'cindle') });
    expect(placedCount(row)).toBe(1);
    // It still counts among the filled team slots.
    expect(boardTotalLine(row, 9)).toBe('2 / 9 team slots filled');
    const creatures: PickerCreature[] = [
      { id: 'a', species: 'splashet', nickname: null, level: 5, power: 10, caughtAt: 1 },
      { id: 'b', species: 'cindle', nickname: null, level: 5, power: 11, caughtAt: 2 },
    ];
    const options = pickerOptions({
      creatures,
      row,
      length: 9,
      slot: 5,
      turnOrder: 'left_to_right',
      showEffects: false,
    });
    expect(options.find((o) => o.id === 'a')?.onBoard).toBe(false);
    expect(options.find((o) => o.id === 'b')?.onBoard).toBe(true);
  });

  it('lists an away teammate’s creatures: the ones not in the fight first, the joining ones disabled', () => {
    const options = awayPickerOptions([
      { creatureId: 'j1', species: 'cindle', name: 'Ash', level: 9, joining: true },
      { creatureId: 'j2', species: 'splashet', name: 'Bub', level: 3, joining: false },
      { creatureId: 'j3', species: 'sproutle', name: 'Cob', level: 7, joining: false },
    ]);
    expect(options.map((o) => o.id)).toEqual(['j3', 'j2', 'j1']);
    expect(options.map((o) => o.disabled)).toEqual([null, null, ALREADY_JOINING]);
    expect(options.every((o) => o.effect === null && !o.recommended && !o.onBoard)).toBe(true);
    expect(options[0]).toMatchObject({ name: 'Cob', element: expect.any(String) as string });
  });
});
