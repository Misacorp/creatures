import { zoneSizes } from '@creatures/engine';
import { RULES, content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { RowSlotView } from './raid-api';
import { speciesName } from './game';
import {
  boardAffectRow,
  boardCreatureInfo,
  boardCues,
  boardKeyTarget,
  boardKeys,
  boardRows,
  boardSlot,
  canDropOn,
  isDraggable,
  laneCount,
  laneStates,
  keepSpanInView,
  ownLaneSpan,
  parseTurnOrder,
  placeOf,
  placeText,
  scrollToSpan,
  snapToLane,
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

describe('lanes', () => {
  const rows = boardRows(9);
  // Lane 0 holds my creature in Middle, lane 1 only someone else's, lane 2 is empty.
  const owners: Record<number, 'mine' | 'other'> = { 3: 'mine', 1: 'other', 0: 'other' };

  it('marks a lane yours, taken by others or empty', () => {
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
    const own = {
      ...theirs,
      ownerName: 'Misa',
      mine: true,
      creatureId: 'c1',
    };
    const model = boardSlot(row(own), 33, names);
    expect(model.occupant?.ownId).toBe('c1');
    expect(model.ariaLabel).toBe('Middle, lane 1, Cindle level 4, you');
  });

  it("prints the creature's own name: a nickname, not its species", () => {
    const model = boardSlot(row({ ...theirs, name: 'Pickle Pot' }), 33, names);
    expect(model.occupant?.name).toBe('Pickle Pot');
    expect(model.ariaLabel).toBe('Middle, lane 1, Pickle Pot level 4, Jun');
  });

  it('keeps a hostile owner name as plain text', () => {
    const model = boardSlot(row({ ...theirs, ownerName: '<img onerror=x>' }), 33, names);
    expect(model.occupant?.owner?.initial).toBe('<');
  });

  it('describes an empty tile by its place, and says it takes a pick while the board can change', () => {
    const model = boardSlot(row(null), 33, names);
    expect(model.occupant).toBeNull();
    expect(model.ariaLabel).toBe('Middle, lane 1, empty. Choose a creature.');
    expect(boardSlot(row(null), 33, names, false).ariaLabel).toBe('Middle, lane 1, empty');
  });

  it('lets nobody drag once the board is locked', () => {
    const own = {
      ...theirs,
      ownerName: 'Misa',
      mine: true,
      creatureId: 'c1',
    };
    expect(boardSlot(row(own), 33, names, false).occupant?.ownId).toBeNull();
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

describe('the placement cues', () => {
  const creature = (
    species: string,
    owner: string,
    id?: string,
  ): NonNullable<RowSlotView['creature']> => ({
    ownerName: owner,
    species,
    // The server's name: the nickname, else the species' display name.
    name: speciesName(species),
    level: 4,
    mine: id !== undefined,
    ...(id === undefined ? {} : { creatureId: id }),
  });
  // Six slots, two per row: Front 0-1, Middle 2-3, Back 4-5. Cindle (Ember) and Splashet (Tide) react (Steam).
  const slots = (...who: (NonNullable<RowSlotView['creature']> | null)[]): RowSlotView[] =>
    who.map((c, slot) => ({ slot, zone: 'front', creature: c }));
  const row = slots(
    creature('cindle', 'Misa', 'mine-1'),
    null,
    creature('splashet', 'Jun'),
    creature('sproutle', 'Jun'),
    null,
    creature('zipmouse', 'Ann'),
  );
  const cues = (
    pointer: number | null,
    extra: {
      carried?: string;
      tray?: { creatureId: string; species: string; level: number }[];
    } = {},
  ) =>
    boardCues({
      row,
      length: 6,
      tray: extra.tray ?? [],
      carried: extra.carried ?? null,
      pointer,
      turnOrder: 'left_to_right',
    });

  it('names your creatures by id and the others by slot', () => {
    expect(boardKeys(row, 6)).toEqual(['mine-1', null, 'other:2', 'other:3', null, 'other:5']);
  });

  it('reads a turn order, and anything odd as left to right', () => {
    expect(parseTurnOrder('speed')).toBe('speed');
    expect(parseTurnOrder('serpentine')).toBe('serpentine');
    expect(parseTurnOrder('right_to_left')).toBe('right_to_left');
    expect(parseTurnOrder('sideways')).toBe('left_to_right');
  });

  it('gives each creature its role, element and a speed from its species and level', () => {
    const known = new Map([['a', { species: 'cindle', level: 4 }]]);
    const [first, second] = boardAffectRow(['a', 'b'], known);
    expect(first).toMatchObject({ role: 'payoff', element: 'ember' });
    expect(first?.speed).toBeGreaterThan(0);
    expect(second).toBeNull();
  });

  it('does not throw for a level the species cannot have', () => {
    const known = new Map([['a', { species: 'cindle', level: 999 }]]);
    expect(boardAffectRow(['a'], known)[0]?.speed).toBeGreaterThan(0);
  });

  it('lights up the pair of the creature under the pointer, even with other players in between', () => {
    const r = cues(0);
    expect(r.focus).toBe(0);
    expect(r.cues.slots.get(0)?.reaction?.role).toBe('marker');
    expect(r.cues.slots.get(2)?.reaction?.name).toBe('Steam');
    expect(r.noneRow).toBeNull();
  });

  it('marks the row of a creature that sets off nothing', () => {
    const r = cues(3);
    expect(r.cues.none).toBe(true);
    expect(r.noneRow).toBe('middle');
  });

  it("previews a creature from the tray in the slot it is over, but not on another player's tile", () => {
    const tray = [{ creatureId: 'mine-2', species: 'splashet', level: 4 }];
    const over = cues(1, { carried: 'mine-2', tray });
    expect(over.focus).toBe(1);
    expect(over.cues.slots.get(0)?.reaction?.name).toBe('Steam');
    // Another player's tile takes no drop: nothing is previewed, and the tray creature has no place yet.
    const refused = cues(3, { carried: 'mine-2', tray });
    expect(refused.focus).toBeNull();
    expect(refused.cues.slots.size).toBe(0);
  });

  it('shows the creature of an open popover, and says what it does in one line', () => {
    const r = boardCues({
      row,
      length: 6,
      tray: [],
      carried: null,
      pointer: 3,
      inspected: 0,
      turnOrder: 'left_to_right',
    });
    expect(r.focus).toBe(0);
    expect(r.effect).toBe(
      `Sets up Steam (x${String(content.reactions.find((x) => x.id === 'steam')!.multiplierBp / 10_000)}) for Splashet.`,
    );
  });

  it('says what a Guard covers in the raid: the others of its row', () => {
    const r = cues(3);
    expect(r.effect).toContain('its row');
    expect([...r.cues.slots].filter(([, c]) => c.cover === true).map(([slot]) => slot)).toEqual([
      2,
    ]);
  });

  it('shows nothing when nothing is under the pointer', () => {
    const r = cues(null);
    expect(r.cues.slots.size).toBe(0);
    expect(r.cues.none).toBe(false);
  });
});

describe('whose tiles can be moved', () => {
  const tile = (extra: Partial<NonNullable<RowSlotView['creature']>> = {}) => ({
    ownerName: 'Jun',
    species: 'cindle',
    name: 'Cindle',
    level: 4,
    mine: false,
    ...extra,
  });
  const at = (creature: RowSlotView['creature']): RowSlotView => ({
    slot: 11,
    zone: 'middle',
    creature,
  });
  const names = ['Misa', 'Jun'];

  it('lets a tile be dragged only when it is yours', () => {
    const own = tile({ mine: true, ownerName: 'Misa', creatureId: 'c1' });
    expect(boardSlot(at(own), 33, names).occupant?.ownId).toBe('c1');
    expect(boardSlot(at(own), 33, names, false).occupant?.ownId).toBeNull();
    // Someone else's tile has no id to drag, and even one with an id is not draggable.
    expect(boardSlot(at(tile()), 33, names).occupant?.ownId).toBeNull();
    expect(boardSlot(at(tile({ creatureId: 'c9' })), 33, names).occupant?.ownId).toBeNull();
  });

  it('labels a tile with its owner and nothing about being automatic, away or moved', () => {
    expect(boardSlot(at(tile()), 33, names).ariaLabel).toBe('Middle, lane 1, Cindle level 4, Jun');
    const own = tile({ mine: true, ownerName: 'Misa', creatureId: 'c1' });
    expect(boardSlot(at(own), 33, names).ariaLabel).toBe('Middle, lane 1, Cindle level 4, you');
  });

  it('lets yours trade with yours and an empty slot, and nothing else', () => {
    expect(canDropOn(tile({ mine: true }))).toBe(true);
    expect(canDropOn(tile())).toBe(false);
    expect(isDraggable(tile({ mine: true }))).toBe(true);
    expect(isDraggable(tile())).toBe(false);
  });

  it('lets a carried creature be dropped on your own tiles and empty slots only', () => {
    const row: RowSlotView[] = [
      { slot: 0, zone: 'front', creature: tile({ mine: true, creatureId: 'a' }) },
      { slot: 1, zone: 'front', creature: tile({ mine: true, creatureId: 'b' }) },
      { slot: 2, zone: 'front', creature: tile() },
      { slot: 3, zone: 'middle', creature: tile({ ownerName: 'Kim' }) },
      { slot: 4, zone: 'middle', creature: null },
    ];
    const over = (pointer: number) =>
      boardCues({
        row,
        length: 5,
        tray: [],
        carried: 'a',
        pointer,
        turnOrder: 'left_to_right',
      }).focus;
    expect(over(4)).toBe(4);
    expect(over(1)).toBe(1);
    // Someone else's tile takes no drop: the focus stays on the carried one.
    expect(over(2)).toBe(0);
    expect(over(3)).toBe(0);
  });
});

describe('snapToLane', () => {
  const lanes = [6, 62, 118, 174, 230, 286, 342];
  it('lands on the lane edge nearest the wanted scroll that keeps the span whole', () => {
    // A span at 230..286, a 200 px window, centred would be 148: the edge 118 or 174; 174 is nearer.
    expect(snapToLane(148, lanes, 230, 286, 200, 400)).toBe(174);
  });
  it('stays at the start when nothing is scrolled, and at the end', () => {
    expect(snapToLane(0, lanes, 6, 62, 200, 400)).toBe(0);
    expect(snapToLane(400, lanes, 342, 398, 200, 400)).toBe(400);
  });
  it('keeps the wanted scroll when no lane edge shows the span', () => {
    expect(snapToLane(100, lanes, 6, 300, 200, 400)).toBe(100);
  });
});
