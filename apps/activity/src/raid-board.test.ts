import { zoneSizes } from '@creatures/engine';
import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { RowSlotView } from './raid-api';
import {
  boardCreatureInfo,
  boardKeyTarget,
  boardRows,
  boardSlot,
  laneCount,
  laneStates,
  keepSpanInView,
  ownLaneSpan,
  pipLabel,
  placeOf,
  placeText,
  scrollToSpan,
} from './raid-board';

const MAX_ROW = RULES.raid.maxPartySize * RULES.raid.teamSize;

describe('boardRows', () => {
  it("takes the zone sizes from the engine and lists each row's slots left to right", () => {
    for (let length = 1; length <= MAX_ROW; length++) {
      const sizes = zoneSizes(length);
      const rows = boardRows(length);
      const got = Object.fromEntries(rows.map((r) => [r.zone, r.slots.length]));
      expect(got.front ?? 0, `${String(length)} slots`).toBe(sizes.front);
      expect(got.middle ?? 0).toBe(sizes.middle);
      expect(got.back ?? 0).toBe(sizes.back);
      // Every slot is in exactly one row, front first.
      expect(rows.flatMap((r) => r.slots)).toEqual(Array.from({ length }, (_, i) => i));
    }
  });

  it('is three rows of one slot per player for a full party of 11', () => {
    const rows = boardRows(33);
    expect(rows.map((r) => r.zone)).toEqual(['front', 'middle', 'back']);
    expect(rows.map((r) => r.slots.length)).toEqual([11, 11, 11]);
    expect(laneCount(rows)).toBe(11);
  });

  it('has one row when the row is too short for the outer zones', () => {
    expect(boardRows(2).map((r) => r.zone)).toEqual(['middle']);
  });
});

describe('places in words', () => {
  it('names the row and the lane, counted from 1', () => {
    expect(placeOf(0, 33)).toEqual({ zone: 'front', lane: 1 });
    expect(placeOf(11, 33)).toEqual({ zone: 'middle', lane: 1 });
    expect(placeOf(32, 33)).toEqual({ zone: 'back', lane: 11 });
    expect(placeText(11, 33)).toBe('Middle, lane 1');
    expect(placeText(0, 9)).toBe('Front, lane 1');
  });

  it('is empty for a slot that is not on the board', () => {
    expect(placeOf(33, 33)).toBeNull();
    expect(placeText(-1, 33)).toBe('');
  });

  it('never writes "slot 12"', () => {
    for (let slot = 0; slot < 33; slot++) expect(placeText(slot, 33)).not.toMatch(/slot/i);
  });
});

describe('boardKeyTarget', () => {
  // 33 slots: Front 0-10, Middle 11-21, Back 22-32. Lane k is slot k of each row.
  const rows = boardRows(33);

  it('moves left and right within a row and stops at its ends', () => {
    expect(boardKeyTarget(rows, 5, 'ArrowRight')).toBe(6);
    expect(boardKeyTarget(rows, 5, 'ArrowLeft')).toBe(4);
    expect(boardKeyTarget(rows, 10, 'ArrowRight')).toBeNull();
    expect(boardKeyTarget(rows, 11, 'ArrowLeft')).toBeNull();
    expect(boardKeyTarget(rows, 21, 'ArrowRight')).toBeNull();
  });

  it('moves up and down between rows in the same lane', () => {
    expect(boardKeyTarget(rows, 3, 'ArrowDown')).toBe(14);
    expect(boardKeyTarget(rows, 14, 'ArrowDown')).toBe(25);
    expect(boardKeyTarget(rows, 25, 'ArrowUp')).toBe(14);
    expect(boardKeyTarget(rows, 14, 'ArrowUp')).toBe(3);
  });

  it('does nothing past the front or the back row', () => {
    expect(boardKeyTarget(rows, 3, 'ArrowUp')).toBeNull();
    expect(boardKeyTarget(rows, 25, 'ArrowDown')).toBeNull();
  });

  it('jumps to the ends of the row with Home and End', () => {
    expect(boardKeyTarget(rows, 14, 'Home')).toBe(11);
    expect(boardKeyTarget(rows, 14, 'End')).toBe(21);
  });

  it('does nothing in a lane the next row does not have', () => {
    // 10 slots: Front 0-2, Middle 3-6 (the extra slot), Back 7-9. Lane 4 exists only in Middle.
    const uneven = boardRows(10);
    expect(boardKeyTarget(uneven, 6, 'ArrowUp')).toBeNull();
    expect(boardKeyTarget(uneven, 6, 'ArrowDown')).toBeNull();
    expect(boardKeyTarget(uneven, 5, 'ArrowDown')).toBe(9);
  });

  it('ignores other keys and unknown slots', () => {
    expect(boardKeyTarget(rows, 5, 'a')).toBeNull();
    expect(boardKeyTarget(rows, 99, 'ArrowRight')).toBeNull();
  });

  it('skips a missing row: up and down only meet rows that exist', () => {
    const one = boardRows(2);
    expect(boardKeyTarget(one, 0, 'ArrowUp')).toBeNull();
    expect(boardKeyTarget(one, 0, 'ArrowDown')).toBeNull();
    expect(boardKeyTarget(one, 0, 'ArrowRight')).toBe(1);
  });
});

describe('lane pips', () => {
  const rows = boardRows(9);
  // Lane 0 holds my creature in Middle, lane 1 only someone else's, lane 2 is empty.
  const owners: Record<number, 'mine' | 'other'> = { 3: 'mine', 1: 'other', 0: 'other' };

  it('lights yours, fills others and leaves empty lanes hollow', () => {
    const states = laneStates(rows, (slot) => owners[slot] ?? null);
    expect(states).toEqual(['mine', 'taken', 'empty']);
  });

  it('counts a lane as yours when any row of it holds your creature', () => {
    expect(laneStates(rows, (slot) => (slot === 8 ? 'mine' : 'other'))).toEqual([
      'taken',
      'taken',
      'mine',
    ]);
  });

  it('finds your first and last lane, or none', () => {
    expect(ownLaneSpan(['empty', 'mine', 'taken', 'mine', 'empty'])).toEqual({ first: 1, last: 3 });
    expect(ownLaneSpan(['empty', 'taken'])).toBeNull();
  });

  it('says what a pip is, in words', () => {
    expect(pipLabel(3, 'mine')).toBe('Lane 3, yours');
    expect(pipLabel(1, 'taken')).toBe('Lane 1, taken');
    expect(pipLabel(2, 'empty')).toBe('Lane 2, empty');
  });
});

describe('scrollToSpan', () => {
  it('centres a span that fits in the window', () => {
    expect(scrollToSpan(400, 460, 240, 900)).toBe(310);
  });

  it('puts the left edge of a span that is wider than the window at the left', () => {
    expect(scrollToSpan(300, 700, 240, 900)).toBe(300);
  });

  it('never scrolls past either end', () => {
    expect(scrollToSpan(0, 60, 240, 900)).toBe(0);
    expect(scrollToSpan(840, 900, 240, 900)).toBe(660);
  });

  it('does not scroll when everything fits', () => {
    expect(scrollToSpan(100, 160, 300, 280)).toBe(0);
  });
});

describe('keepSpanInView', () => {
  it('leaves the scroll alone when the span is on screen with room to spare', () => {
    // Window 300 to 540; a tile at 380 to 432 with a 50 px margin is well inside.
    expect(keepSpanInView(380, 432, 300, 240, 900, 50)).toBe(300);
  });

  it('moves when the span is too near an edge, or off screen', () => {
    expect(keepSpanInView(310, 362, 300, 240, 900, 50)).toBe(310 + 26 - 120);
    expect(keepSpanInView(520, 572, 300, 240, 900, 50)).toBe(520 + 26 - 120);
    expect(keepSpanInView(40, 92, 300, 240, 900, 50)).toBe(0);
    expect(keepSpanInView(800, 852, 0, 240, 900, 50)).toBe(660);
  });

  it('never scrolls past either end', () => {
    expect(keepSpanInView(0, 52, 400, 240, 900, 50)).toBe(0);
    expect(keepSpanInView(848, 900, 0, 240, 900, 50)).toBe(660);
  });

  it('clamps a scroll position that is past the end before judging', () => {
    expect(keepSpanInView(700, 752, 5000, 240, 900, 10)).toBe(660);
  });
});

describe('the tile of a creature', () => {
  const row = (creature: RowSlotView['creature']): RowSlotView => ({
    slot: 11,
    zone: 'middle',
    creature,
  });
  const names = ['Misa', 'Jun'];
  const theirs = {
    ownerName: 'Jun',
    species: 'cindle',
    name: 'Cindle',
    level: 4,
    mine: false,
  };

  it("carries the owner's initial and colour, the element, and no slot number", () => {
    const model = boardSlot(row(theirs), 33, names);
    expect(model.hideNumber).toBe(true);
    expect(model.ariaLabel).toBe('Middle, lane 1, Cindle level 4, Jun');
    expect(model.occupant).toMatchObject({
      species: 'cindle',
      level: 4,
      ownId: null,
      mine: false,
      element: 'ember',
      owner: { colour: 1, initial: 'J' },
    });
  });

  it('lets only your own creature be picked up, and says "you"', () => {
    const own = { ...theirs, ownerName: 'Misa', mine: true, creatureId: 'c1' };
    const model = boardSlot(row(own), 33, names);
    expect(model.occupant?.ownId).toBe('c1');
    expect(model.ariaLabel).toBe('Middle, lane 1, Cindle level 4, you');
  });

  it('keeps a hostile owner name as plain text', () => {
    const model = boardSlot(row({ ...theirs, ownerName: '<img onerror=x>' }), 33, names);
    expect(model.occupant?.owner?.initial).toBe('<');
  });

  it('describes an empty tile by its place', () => {
    const model = boardSlot(row(null), 33, names);
    expect(model.occupant).toBeNull();
    expect(model.ariaLabel).toBe('Middle, lane 1, empty');
  });

  it("puts the owner's full name in the popover info", () => {
    const info = boardCreatureInfo(theirs);
    expect(info).toMatchObject({ name: 'Cindle', species: 'cindle', level: 4, ownerName: 'Jun' });
    expect(info?.element).toBe('ember');
  });

  it('has no popover for a species the game does not know', () => {
    expect(boardCreatureInfo({ ...theirs, species: 'nope' })).toBeNull();
  });
});
