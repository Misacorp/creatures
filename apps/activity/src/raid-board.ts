/**
 * The raid board as a grid: three rows (Front, Middle, Back), and a lane is the same position in every
 * row, so column k holds slot k of each row. Pure: the zone sizes come from the engine
 * (`packages/engine/src/zones.ts`), never worked out again here; this file turns them into rows,
 * lanes, plain words for a place ("Middle, lane 1"), the keyboard map and the scroll positions. `ui/RaidBoard.tsx` draws it, `Placement.tsx` wires it to the game.
 */
import {
  ZONES,
  zoneIndices,
  type AffectSlot,
  type RowShape,
  type TurnOrder,
  type Zone,
} from '@creatures/engine';
import { effectiveStats } from '@creatures/game';
import type { CreatureInfo } from './creature-info';
import { getSpecies, speciesName } from './game';
import type { RowSlotView } from './raid-api';
import { initialOf } from './raid-roster';
import { ownerColour } from './raid-slots';
import type { SlotModel } from './ui/SlotButton';
import { affectSlotOf, cuesFor, effectLine, sceneOf, type RowCues } from './ui/slot-cue';

/** The names of the three rows, front (closest to the boss) first. */
export const ROW_NAMES: Readonly<Record<Zone, string>> = {
  front: 'Front',
  middle: 'Middle',
  back: 'Back',
};

/** One row of the board: its zone and the slot numbers in it, left to right. */
export interface BoardRow {
  zone: Zone;
  slots: readonly number[];
}

/** The rows of a party row of `length` slots, front to back. A zone with no slots has no row. */
export function boardRows(length: RowShape): BoardRow[] {
  return ZONES.map((zone) => ({ zone, slots: zoneIndices(zone, length) })).filter(
    (row) => row.slots.length > 0,
  );
}

/** How many lanes (columns) the board has: the length of its longest row. */
export function laneCount(rows: readonly BoardRow[]): number {
  return Math.max(0, ...rows.map((row) => row.slots.length));
}

/** The row and the lane (from 1) of a slot, or null for a slot number that is not on the board. */
export function placeOf(slot: number, length: RowShape): { zone: Zone; lane: number } | null {
  for (const row of boardRows(length)) {
    const column = row.slots.indexOf(slot);
    if (column >= 0) return { zone: row.zone, lane: column + 1 };
  }
  return null;
}

/** A place in plain words: "Middle, lane 1". Empty for a slot that is not on the board. */
export function placeText(slot: number, length: RowShape): string {
  const place = placeOf(slot, length);
  return place === null ? '' : `${ROW_NAMES[place.zone]}, lane ${String(place.lane)}`;
}

/**
 * The slot the keyboard moves to from `current`, or null when the key does nothing. Left and right
 * move within the row and stop at its ends; Home and End jump to the ends of the row; up and down
 * move to the row above (towards the front) or below in the same lane, and do nothing when that row
 * has no such lane.
 */
export function boardKeyTarget(
  rows: readonly BoardRow[],
  current: number,
  key: string,
): number | null {
  const at = rows.findIndex((row) => row.slots.includes(current));
  const row = rows[at];
  if (row === undefined) return null;
  const column = row.slots.indexOf(current);
  const go = (slot: number | undefined): number | null =>
    slot === undefined || slot === current ? null : slot;
  switch (key) {
    case 'ArrowLeft':
      return go(row.slots[column - 1]);
    case 'ArrowRight':
      return go(row.slots[column + 1]);
    case 'Home':
      return go(row.slots[0]);
    case 'End':
      return go(row.slots[row.slots.length - 1]);
    case 'ArrowUp':
      return go(rows[at - 1]?.slots[column]);
    case 'ArrowDown':
      return go(rows[at + 1]?.slots[column]);
    default:
      return null;
  }
}

/** What stands in a lane: your creature, only others', or nothing. */
export type LaneState = 'mine' | 'taken' | 'empty';

/** The state of every lane, from the first: yours wins over others', others' over empty. */
export function laneStates(
  rows: readonly BoardRow[],
  whose: (slot: number) => 'mine' | 'other' | null,
): LaneState[] {
  return Array.from({ length: laneCount(rows) }, (_, column) => {
    const owners = rows.map((row) => {
      const slot = row.slots[column];
      return slot === undefined ? null : whose(slot);
    });
    if (owners.includes('mine')) return 'mine';
    return owners.includes('other') ? 'taken' : 'empty';
  });
}

/**
 * How far to scroll the board sideways to show the span from `left` to `right` (in scroll-content
 * pixels): centred when it fits in the window, else its left edge is at the window's left. Never
 * scrolls past either end.
 */
export function scrollToSpan(
  left: number,
  right: number,
  viewport: number,
  scrollWidth: number,
): number {
  const wanted = right - left <= viewport ? (left + right) / 2 - viewport / 2 : left;
  return Math.round(Math.max(0, Math.min(Math.max(0, scrollWidth - viewport), wanted)));
}

/** The first and last lane (from 0) with a creature of yours, or null when you have none on the board. */
export function ownLaneSpan(states: readonly LaneState[]): { first: number; last: number } | null {
  const first = states.indexOf('mine');
  if (first < 0) return null;
  return { first, last: states.lastIndexOf('mine') };
}

/** What the creature popover shows for a creature on the board, with its owner's full name. */
export function boardCreatureInfo(c: NonNullable<RowSlotView['creature']>): CreatureInfo | null {
  const species = getSpecies(c.species);
  if (species === undefined) return null;
  return {
    name: c.name,
    species: c.species,
    level: c.level,
    element: species.element,
    role: species.role,
    ownerName: c.ownerName,
  };
}

/** One slot of the party row as the board draws it. `length` is the row's length. */
export function boardSlot(
  s: RowSlotView,
  length: number,
  rosterNames: readonly string[],
  /** The board can still change: your own creatures can be dragged and an empty slot takes a pick. */
  editable = true,
): SlotModel {
  const c = s.creature;
  const where = placeText(s.slot, length);
  const base = { index: s.slot, hideNumber: true } as const;
  if (c === null) {
    const label = editable ? `${where}, empty. Choose a creature.` : `${where}, empty`;
    return { ...base, ariaLabel: label, occupant: null };
  }
  const owner = c.mine ? 'you' : c.ownerName;
  return {
    ...base,
    ariaLabel: `${where}, ${speciesName(c.species)} level ${String(c.level)}, ${owner}`,
    occupant: {
      species: c.species,
      name: speciesName(c.species),
      level: c.level,
      ownId: editable && c.mine && c.creatureId !== undefined ? c.creatureId : null,
      mine: c.mine,
      element: getSpecies(c.species)?.element ?? 'unknown',
      owner: { colour: ownerColour(c.ownerName, rosterNames), initial: initialOf(c.ownerName) },
    },
  };
}

/**
 * Where to scroll the board sideways so the span from `left` to `right` (in scroll-content pixels)
 * is on screen with `margin` to spare at both ends. A span that is already there leaves the scroll
 * where it is (so the fight stage does not shuffle for every creature); otherwise it is placed as
 * `scrollToSpan` does. The result is never past either end.
 */
export function keepSpanInView(
  left: number,
  right: number,
  scrollLeft: number,
  viewport: number,
  scrollWidth: number,
  margin: number,
): number {
  const current = Math.max(0, Math.min(Math.max(0, scrollWidth - viewport), scrollLeft));
  if (left - margin >= current && right + margin <= current + viewport) return Math.round(current);
  return scrollToSpan(left, right, viewport, scrollWidth);
}

/**
 * The creature in each slot of the board as a key (null: empty), for the placement cues: your own
 * are named by their id, the others' by their slot (their ids are not in the view).
 */
export function boardKeys(row: readonly RowSlotView[], length: number): (string | null)[] {
  const keys: (string | null)[] = Array.from({ length }, () => null);
  for (const s of row) {
    if (s.creature === null || s.slot < 0 || s.slot >= length) continue;
    keys[s.slot] = s.creature.creatureId ?? `other:${String(s.slot)}`;
  }
  return keys;
}

/** What a boss's `turnOrder` text says, as the engine's value (anything else counts as left to right). */
export function parseTurnOrder(text: string): TurnOrder {
  return text === 'right_to_left' || text === 'speed' ? text : 'left_to_right';
}

/**
 * The board as the engine's `affects` wants it: role, element and speed for each key (a creature of
 * the board, or one of yours that is still in the tray). The speed is worked out from the species and
 * level alone: the view carries no gear or fusions, so for a boss that acts by speed the order, and
 * with it the reactions shown, is a close guess.
 */
export function boardAffectRow(
  keys: readonly (string | null)[],
  known: ReadonlyMap<string, { species: string; level: number }>,
): (AffectSlot | null)[] {
  return keys.map((key) => {
    const who = key === null ? undefined : known.get(key);
    const species = who === undefined ? undefined : getSpecies(who.species);
    return who === undefined || species === undefined
      ? null
      : affectSlotOf(
          species,
          effectiveStats(species, Math.max(1, Math.min(who.level, species.levelCap)), 0).spd,
        );
  });
}

/**
 * The cues of the board: which creature is in focus, and what lights up. `carried` is the creature
 * being dragged or picked up (one of yours, on the board or in the tray), `pointer` the slot dragged
 * over or under the mouse or keyboard focus, `inspected` the slot whose popover is open. A carried
 * creature is shown where it would stand, if it may go there (an empty slot or one of yours).
 * `noneRow` is the row that gets the "no reaction" mark, `effect` the one line about what the
 * creature in focus does for the row.
 */
export function boardCues(args: {
  row: readonly RowSlotView[];
  length: number;
  tray: readonly { creatureId: string; species: string; level: number }[];
  carried: string | null;
  pointer: number | null;
  inspected?: number | null;
  turnOrder: string;
}): { cues: RowCues; focus: number | null; noneRow: Zone | null; effect: string | null } {
  const { row, length } = args;
  const bySlot = new Map(row.map((s) => [s.slot, s]));
  const known = new Map<string, { species: string; level: number }>();
  for (const s of row) {
    if (s.creature !== null)
      known.set(s.creature.creatureId ?? `other:${String(s.slot)}`, s.creature);
  }
  for (const c of args.tray) known.set(c.creatureId, c);
  const scene = sceneOf({
    keys: boardKeys(row, length),
    carried: args.carried,
    pointer: args.pointer,
    inspected: args.inspected ?? null,
    canDrop: (slot) => {
      const there = bySlot.get(slot)?.creature ?? null;
      return there === null || there.mine;
    },
  });
  const affectRow = boardAffectRow(scene.keys, known);
  const mode = { row: 'raid', turnOrder: parseTurnOrder(args.turnOrder) } as const;
  const cues = cuesFor({ row: affectRow, mode, focus: scene.focus, scope: 'focus' });
  const noneRow =
    cues.none && scene.focus !== null ? (placeOf(scene.focus, length)?.zone ?? null) : null;
  const effect =
    scene.focus === null
      ? null
      : effectLine({
          row: affectRow,
          mode,
          focus: scene.focus,
          nameOf: (slot) => {
            const key = scene.keys[slot];
            const who = key === null || key === undefined ? undefined : known.get(key);
            return who === undefined ? 'a creature' : speciesName(who.species);
          },
        });
  return { cues, focus: scene.focus, noneRow, effect };
}
