import { describe, expect, it } from 'vitest';
import type { RowSlotView } from './raid-api';
import {
  adjacentSlots,
  canUnplace,
  ownerColour,
  OWNER_COLOURS,
  reduceTap,
  slotOfCreature,
  togglePick,
  unplaceIntent,
  type TapContext,
} from './raid-slots';

// Slot 0: mine (a), 1: empty, 2: someone else's, 3: mine (b), 4: empty
const row: RowSlotView[] = [
  {
    slot: 0,
    zone: 'front',
    creature: {
      ownerName: 'Me',
      species: 'splashet',
      name: 'A',
      level: 3,
      mine: true,
      creatureId: 'a',
    },
  },
  { slot: 1, zone: 'front', creature: null },
  {
    slot: 2,
    zone: 'middle',
    creature: { ownerName: 'Jun', species: 'splashet', name: 'J', level: 3, mine: false },
  },
  {
    slot: 3,
    zone: 'middle',
    creature: {
      ownerName: 'Me',
      species: 'splashet',
      name: 'B',
      level: 3,
      mine: true,
      creatureId: 'b',
    },
  },
  { slot: 4, zone: 'back', creature: null },
];
const ctx: TapContext = { locked: false, row, teamIds: ['a', 'b', 'c'] };

describe('reduceTap: choosing a creature', () => {
  it('selects, switches and deselects', () => {
    expect(reduceTap(ctx, null, { kind: 'creature', id: 'a' }).selected).toBe('a');
    expect(reduceTap(ctx, 'a', { kind: 'creature', id: 'b' }).selected).toBe('b');
    expect(reduceTap(ctx, 'a', { kind: 'creature', id: 'a' }).selected).toBeNull();
  });

  it('ignores creatures that are not in the team', () => {
    const result = reduceTap(ctx, 'a', { kind: 'creature', id: 'zzz' });
    expect(result.selected).toBe('a');
    expect(result.intent).toBeNull();
    expect(result.hint).not.toBeNull();
  });
});

describe('reduceTap: tapping slots', () => {
  it('moves the selected creature to an empty slot', () => {
    expect(reduceTap(ctx, 'a', { kind: 'slot', slot: 4 })).toEqual({
      selected: null,
      intent: { type: 'place', creatureId: 'a', slot: 4 },
      hint: null,
    });
  });

  it('places an unplaced team creature the same way', () => {
    expect(reduceTap(ctx, 'c', { kind: 'slot', slot: 1 }).intent).toEqual({
      type: 'place',
      creatureId: 'c',
      slot: 1,
    });
  });

  it('asks for a selection before an empty slot does anything', () => {
    const result = reduceTap(ctx, null, { kind: 'slot', slot: 1 });
    expect(result.intent).toBeNull();
    expect(result.hint).toContain('first');
  });

  it('selects my own creature when nothing is selected', () => {
    expect(reduceTap(ctx, null, { kind: 'slot', slot: 3 })).toEqual({
      selected: 'b',
      intent: null,
      hint: null,
    });
  });

  it('swaps with another of my creatures', () => {
    expect(reduceTap(ctx, 'a', { kind: 'slot', slot: 3 })).toEqual({
      selected: null,
      intent: { type: 'place', creatureId: 'a', slot: 3 },
      hint: null,
    });
  });

  it('deselects when my selected creature is tapped again', () => {
    const result = reduceTap(ctx, 'b', { kind: 'slot', slot: 3 });
    expect(result.selected).toBeNull();
    expect(result.intent).toBeNull();
  });

  it("refuses another player's slot and keeps the selection", () => {
    const result = reduceTap(ctx, 'a', { kind: 'slot', slot: 2 });
    expect(result.selected).toBe('a');
    expect(result.intent).toBeNull();
    expect(result.hint).toContain('Jun');
  });

  it('ignores slots that do not exist', () => {
    const result = reduceTap(ctx, 'a', { kind: 'slot', slot: 99 });
    expect(result.intent).toBeNull();
    expect(result.selected).toBe('a');
  });
});

describe('reduceTap: locked', () => {
  it('does nothing and clears the selection', () => {
    const locked = { ...ctx, locked: true };
    for (const tap of [
      { kind: 'slot', slot: 4 },
      { kind: 'creature', id: 'a' },
    ] as const) {
      const result = reduceTap(locked, 'a', tap);
      expect(result.intent).toBeNull();
      expect(result.selected).toBeNull();
      expect(result.hint).toContain('locked');
    }
  });
});

describe('unplace', () => {
  it('unplaces a selected, placed creature', () => {
    expect(canUnplace(row, 'a')).toBe(true);
    expect(unplaceIntent(row, 'a')).toEqual({
      selected: null,
      intent: { type: 'unplace', creatureId: 'a' },
      hint: null,
    });
  });

  it('does nothing for no selection or an unplaced creature', () => {
    expect(canUnplace(row, null)).toBe(false);
    expect(canUnplace(row, 'c')).toBe(false);
    expect(unplaceIntent(row, 'c').intent).toBeNull();
    expect(unplaceIntent(row, null).intent).toBeNull();
  });
});

describe('adjacency and colours', () => {
  it('finds my creature slot and its neighbours', () => {
    expect(slotOfCreature(row, 'b')).toBe(3);
    expect(slotOfCreature(row, 'c')).toBeNull();
    // Row of 5 is Front [0], Middle [1-3], Back [4]: slot 3 is beside 2 but not the Back slot 4.
    expect(adjacentSlots(row, 'b', 5)).toEqual([2]);
    expect(adjacentSlots(row, 'a', 5)).toEqual([]);
    expect(adjacentSlots(row, 'c', 5)).toEqual([]);
    expect(adjacentSlots(row, null, 5)).toEqual([]);
  });

  it('gives each owner a stable colour inside the palette', () => {
    const names = ['Me', 'Jun', 'Mika'];
    expect(ownerColour('Me', names)).toBe(0);
    expect(ownerColour('Mika', names)).toBe(2);
    expect(ownerColour('Nobody', names)).toBe(0);
    const many = Array.from({ length: 12 }, (_, i) => `p${String(i)}`);
    expect(ownerColour('p11', many)).toBe(11 % OWNER_COLOURS);
  });
});

describe('togglePick', () => {
  it('adds up to the limit and removes on a second tap', () => {
    let picked: string[] = [];
    picked = togglePick(picked, 'a', 3);
    picked = togglePick(picked, 'b', 3);
    picked = togglePick(picked, 'c', 3);
    expect(picked).toEqual(['a', 'b', 'c']);
    expect(togglePick(picked, 'd', 3)).toEqual(['a', 'b', 'c']);
    expect(togglePick(picked, 'b', 3)).toEqual(['a', 'c']);
  });
});
