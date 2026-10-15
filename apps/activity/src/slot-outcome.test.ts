import { describe, expect, it } from 'vitest';
import { reduceTap as dungeonTap, resolveDrop as dungeonDrop, type Slots } from './dungeon-team';
import type { RowSlotView } from './raid-api';
import { resolveDrop as raidDrop } from './raid-dnd';
import type { TapContext } from './raid-slots';
import {
  CANCEL_ANNOUNCEMENT,
  dropOutcome,
  notInRowAnnouncement,
  pickUpAnnouncement,
  takenOutAnnouncement,
  type Tap,
} from './slot-outcome';

describe('the sentences both screens read out', () => {
  it('explains the keys when a creature is picked up', () => {
    expect(pickUpAnnouncement('Alpha')).toContain('Alpha picked up');
    expect(pickUpAnnouncement('Alpha')).toContain('Escape');
  });

  it('names the creature that left the row or was not in it', () => {
    expect(takenOutAnnouncement('Alpha')).toBe('Alpha taken out of the row.');
    expect(notInRowAnnouncement('Alpha')).toBe('Alpha is not in the row.');
  });

  it('builds an outcome with its four parts', () => {
    expect(dropOutcome('valid', { type: 'x' }, null, 'Done.')).toEqual({
      status: 'valid',
      intent: { type: 'x' },
      hint: null,
      announce: 'Done.',
    });
  });
});

describe('the raid and the dungeon rules say the same things', () => {
  const mine = (id: string, name: string): NonNullable<RowSlotView['creature']> => ({
    ownerName: 'Me',
    species: 'splashet',
    name,
    level: 3,
    mine: true,
    creatureId: id,
  });
  const row: RowSlotView[] = [
    { slot: 0, zone: 'front', creature: mine('a', 'Ann') },
    { slot: 1, zone: 'front', creature: mine('b', 'Bo') },
    { slot: 2, zone: 'front', creature: null },
  ];
  const ctx: TapContext = { locked: false, row };
  const slots: Slots = ['a', 'b', null];
  const names: Record<string, string> = { a: 'Ann', b: 'Bo', c: 'Cy' };
  const nameOf = (id: string): string => names[id] ?? id;

  it('cancels with the shared sentence', () => {
    expect(raidDrop(ctx, 'a', 'Ann', null).announce).toBe(CANCEL_ANNOUNCEMENT);
    expect(dungeonDrop(slots, 'a', null, nameOf).outcome.announce).toBe(CANCEL_ANNOUNCEMENT);
  });

  it('takes a placed creature out on the dungeon tray with the shared sentences', () => {
    expect(dungeonDrop(slots, 'a', { kind: 'tray' }, nameOf).outcome.announce).toBe(
      takenOutAnnouncement('Ann'),
    );
    expect(dungeonDrop(slots, 'c', { kind: 'tray' }, nameOf).outcome.announce).toBe(
      notInRowAnnouncement('Cy'),
    );
  });

  it('swaps two placed creatures, places on a free slot and leaves a creature on its own slot', () => {
    const swap = { kind: 'slot', slot: 1 } as const;
    expect(raidDrop(ctx, 'a', 'Ann', swap).status).toBe('valid');
    expect(dungeonDrop(slots, 'a', swap, nameOf).outcome.status).toBe('valid');
    expect(dungeonDrop(slots, 'a', swap, nameOf).slots).toEqual(['b', 'a', null]);
    const free = { kind: 'slot', slot: 2 } as const;
    expect(raidDrop(ctx, 'a', 'Ann', free).intent).toEqual({
      type: 'place',
      creatureId: 'a',
      slot: 2,
    });
    expect(dungeonDrop(slots, 'a', free, nameOf).slots).toEqual([null, 'b', 'a']);
    const own = { kind: 'slot', slot: 0 } as const;
    expect(raidDrop(ctx, 'a', 'Ann', own).status).toBe('none');
    expect(dungeonDrop(slots, 'a', own, nameOf).outcome.status).toBe('none');
  });

  it('reads one Tap shape: a creature by id, a slot by number', () => {
    const creature: Tap = { kind: 'creature', id: 'a' };
    const slot: Tap = { kind: 'slot', slot: 2 };
    expect(dungeonTap(slots, null, creature).selected).toBe('a');
    expect(dungeonTap(slots, 'a', slot).slots).toEqual([null, 'b', 'a']);
  });
});
