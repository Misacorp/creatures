import { describe, expect, it } from 'vitest';
import { cursorStart, resolveDrop, slotLabel, slotStatuses } from './raid-dnd';
import { CANCEL_ANNOUNCEMENT } from './slot-outcome';
import type { RowSlotView } from './raid-api';
import type { TapContext } from './raid-slots';

// Slot 0: mine (a), 1: empty, 2: Jun's, 3: mine (b), 4: empty. Creature c is in my team, unplaced.
const mine = (id: string, name: string): NonNullable<RowSlotView['creature']> => ({
  ownerName: 'Me',
  species: 'splashet',
  name,
  level: 3,
  mine: true,
  creatureId: id,
});
const row: RowSlotView[] = [
  { slot: 0, zone: 'front', creature: mine('a', 'Alpha') },
  { slot: 1, zone: 'front', creature: null },
  {
    slot: 2,
    zone: 'middle',
    creature: { ownerName: 'Jun', species: 'cindle', name: 'Jay', level: 4, mine: false },
  },
  { slot: 3, zone: 'middle', creature: mine('b', 'Beta') },
  { slot: 4, zone: 'back', creature: null },
];
const ctx: TapContext = { locked: false, row, teamIds: ['a', 'b', 'c'] };
const slot = (n: number) => ({ kind: 'slot', slot: n }) as const;

describe('resolveDrop onto slots', () => {
  it('moves a creature to an empty slot', () => {
    expect(resolveDrop(ctx, 'a', 'Alpha', slot(4))).toEqual({
      status: 'valid',
      intent: { type: 'place', creatureId: 'a', slot: 4 },
      hint: null,
      announce: 'Placed Alpha in slot 5.',
    });
  });

  it('places an unplaced team creature', () => {
    const result = resolveDrop(ctx, 'c', 'Cee', slot(1));
    expect(result.intent).toEqual({ type: 'place', creatureId: 'c', slot: 1 });
    expect(result.status).toBe('valid');
  });

  it('swaps with one of my own creatures', () => {
    const result = resolveDrop(ctx, 'a', 'Alpha', slot(3));
    expect(result.status).toBe('valid');
    expect(result.intent).toEqual({ type: 'place', creatureId: 'a', slot: 3 });
    expect(result.announce).toBe('Swapped Alpha with Beta.');
  });

  it("refuses another player's slot with the usual text", () => {
    const result = resolveDrop(ctx, 'a', 'Alpha', slot(2));
    expect(result.status).toBe('invalid');
    expect(result.intent).toBeNull();
    expect(result.hint).toBe('That slot belongs to Jun.');
    expect(result.announce).toBe('That slot belongs to Jun.');
  });

  it('does nothing when dropped back on its own slot', () => {
    const result = resolveDrop(ctx, 'a', 'Alpha', slot(0));
    expect(result.status).toBe('none');
    expect(result.intent).toBeNull();
    expect(result.hint).toBeNull();
  });

  it('refuses slots that do not exist', () => {
    const result = resolveDrop(ctx, 'a', 'Alpha', slot(99));
    expect(result.status).toBe('invalid');
    expect(result.intent).toBeNull();
  });
});

describe('resolveDrop elsewhere', () => {
  it('cancels when dropped off the row', () => {
    expect(resolveDrop(ctx, 'a', 'Alpha', null)).toEqual({
      status: 'none',
      intent: null,
      hint: null,
      announce: CANCEL_ANNOUNCEMENT,
    });
  });

  it('unplaces a placed creature dropped on the team tray', () => {
    const result = resolveDrop(ctx, 'a', 'Alpha', { kind: 'tray' });
    expect(result.status).toBe('valid');
    expect(result.intent).toEqual({ type: 'unplace', creatureId: 'a' });
  });

  it('does nothing for an unplaced creature dropped on the tray', () => {
    const result = resolveDrop(ctx, 'c', 'Cee', { kind: 'tray' });
    expect(result.status).toBe('none');
    expect(result.intent).toBeNull();
  });

  it('refuses creatures that are not in the team', () => {
    expect(resolveDrop(ctx, 'zzz', 'Zed', slot(1)).status).toBe('invalid');
    expect(resolveDrop(ctx, 'zzz', 'Zed', { kind: 'tray' }).intent).toBeNull();
  });

  it('refuses everything while the row is locked', () => {
    const locked = { ...ctx, locked: true };
    for (const target of [slot(1), slot(3), { kind: 'tray' } as const]) {
      const result = resolveDrop(locked, 'a', 'Alpha', target);
      expect(result.status).toBe('invalid');
      expect(result.intent).toBeNull();
      expect(result.hint).toContain('locked');
    }
  });
});

describe('slotStatuses', () => {
  it('marks every slot valid, invalid or none for a dragged creature', () => {
    const map = slotStatuses(ctx, 'a', 'Alpha');
    expect([...map.entries()]).toEqual([
      [0, 'none'],
      [1, 'valid'],
      [2, 'invalid'],
      [3, 'valid'],
      [4, 'valid'],
    ]);
  });
});

describe('keyboard helpers', () => {
  it('starts the cursor on the creature own slot, else the first free slot', () => {
    expect(cursorStart(row, 'b')).toBe(3);
    expect(cursorStart(row, 'c')).toBe(1);
    expect(cursorStart(row, null)).toBe(1);
  });

  it('starts at the first slot when the row is full, and at zero when empty', () => {
    const full = row.map((s) => (s.creature === null ? { ...s, creature: mine('x', 'X') } : s));
    expect(cursorStart(full, 'c')).toBe(0);
    expect(cursorStart([], null)).toBe(0);
  });

  it('writes the spoken slot label', () => {
    const label = (id: string): string => id.toUpperCase();
    expect(slotLabel(row[1] as RowSlotView, label)).toBe('Slot 2, Front, empty');
    expect(slotLabel(row[3] as RowSlotView, label)).toBe('Slot 4, Middle, SPLASHET level 3, you');
    expect(slotLabel(row[2] as RowSlotView, label)).toBe('Slot 3, Middle, CINDLE level 4, Jun');
  });
});
