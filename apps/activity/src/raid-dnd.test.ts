import { describe, expect, it } from 'vitest';
import { resolveDrop, slotStatuses } from './raid-dnd';
import { CANCEL_ANNOUNCEMENT } from './slot-outcome';
import type { RowSlotView } from './raid-api';
import type { TapContext } from './raid-slots';

// A row of 5 (front 1, middle 3, back 1). Slot 0: mine (a), 1: empty, 2: Jun's, 3: mine (b), 4: empty.
// Creature c is one of mine that is not on the board.
const mine = (id: string, name: string): NonNullable<RowSlotView['creature']> => ({
  ownerName: 'Me',
  species: 'splashet',
  name,
  level: 3,
  mine: true,
  auto: false,
  movable: false,
  creatureId: id,
});
const row: RowSlotView[] = [
  { slot: 0, zone: 'front', creature: mine('a', 'Alpha') },
  { slot: 1, zone: 'middle', creature: null },
  {
    slot: 2,
    zone: 'middle',
    creature: {
      ownerName: 'Jun',
      species: 'cindle',
      name: 'Jay',
      level: 4,
      mine: false,
      auto: false,
      movable: false,
    },
  },
  { slot: 3, zone: 'middle', creature: mine('b', 'Beta') },
  { slot: 4, zone: 'back', creature: null },
];
const ctx: TapContext = { locked: false, row };
const slot = (n: number) => ({ kind: 'slot', slot: n }) as const;

describe('resolveDrop onto slots', () => {
  it('moves a creature to an empty slot', () => {
    expect(resolveDrop(ctx, 'a', 'Alpha', slot(4))).toEqual({
      status: 'valid',
      intent: { type: 'place', creatureId: 'a', slot: 4 },
      hint: null,
      announce: 'Moved Alpha to Back, lane 1.',
    });
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
  it('cancels when dropped off the board', () => {
    expect(resolveDrop(ctx, 'a', 'Alpha', null)).toEqual({
      status: 'none',
      intent: null,
      hint: null,
      announce: CANCEL_ANNOUNCEMENT,
    });
  });

  it('never takes a creature off the board by a drop: that is the Remove button', () => {
    expect(resolveDrop(ctx, 'a', 'Alpha', null).intent).toBeNull();
  });

  it('refuses a creature that is not on the board: it goes through the picker', () => {
    const result = resolveDrop(ctx, 'c', 'Cee', slot(1));
    expect(result.status).toBe('invalid');
    expect(result.intent).toBeNull();
    expect(result.hint).toContain('Pick a creature');
  });

  it('refuses everything while the row is locked', () => {
    const locked = { ...ctx, locked: true };
    for (const target of [slot(1), slot(3)]) {
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

describe('resolveDrop with an away teammate’s creatures', () => {
  const jun = (
    id: string | undefined,
    movable: boolean,
    name: string,
  ): NonNullable<RowSlotView['creature']> => ({
    ownerName: 'Jun',
    species: 'cindle',
    name,
    level: 4,
    mine: false,
    auto: true,
    movable,
    ...(id === undefined ? {} : { creatureId: id }),
  });
  const awayRow: RowSlotView[] = [
    { slot: 0, zone: 'front', creature: jun('j1', true, 'J1') },
    { slot: 1, zone: 'middle', creature: null },
    { slot: 2, zone: 'middle', creature: jun('j2', true, 'J2') },
    { slot: 3, zone: 'middle', creature: jun(undefined, false, 'Own') },
    { slot: 4, zone: 'back', creature: mine('a', 'Alpha') },
  ];
  const awayCtx: TapContext = { locked: false, row: awayRow };

  it('moves a movable creature to an empty slot and swaps it with another of the same teammate’s', () => {
    expect(resolveDrop(awayCtx, 'j1', 'J1', slot(1))).toMatchObject({
      status: 'valid',
      intent: { type: 'place', creatureId: 'j1', slot: 1 },
    });
    expect(resolveDrop(awayCtx, 'j1', 'J1', slot(2))).toMatchObject({
      status: 'valid',
      intent: { type: 'place', creatureId: 'j1', slot: 2 },
      announce: 'Swapped J1 with J2.',
    });
  });

  it('refuses a creature the teammate placed themselves, and your own tile', () => {
    expect(resolveDrop(awayCtx, 'j1', 'J1', slot(3))).toMatchObject({
      status: 'invalid',
      intent: null,
    });
    expect(resolveDrop(awayCtx, 'j1', 'J1', slot(4))).toMatchObject({
      status: 'invalid',
      intent: null,
    });
    // And yours cannot be dropped on an away teammate's tile.
    expect(resolveDrop(awayCtx, 'a', 'Alpha', slot(0))).toMatchObject({
      status: 'invalid',
      intent: null,
      hint: 'That slot belongs to Jun.',
    });
  });

  it('marks every slot for the carried creature', () => {
    const statuses = slotStatuses(awayCtx, 'j1', 'J1');
    expect([...statuses]).toEqual([
      [0, 'none'],
      [1, 'valid'],
      [2, 'valid'],
      [3, 'invalid'],
      [4, 'invalid'],
    ]);
  });
});
