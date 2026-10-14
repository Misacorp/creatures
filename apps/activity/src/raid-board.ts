/**
 * The raid board as a grid: three rows (Front, Middle, Back), and a lane is the same position in every
 * row, so column k holds slot k of each row. Pure: the zone sizes come from the engine
 * (`packages/engine/src/zones.ts`), never worked out again here; this file turns them into rows,
 * lanes, plain words for a place ("Middle, lane 1"), the keyboard map, the overview pips and the
 * scroll positions. `ui/RaidBoard.tsx` draws it, `Placement.tsx` wires it to the game.
 */
import { ZONES, zoneIndices, type Zone } from '@creatures/engine';
import type { CreatureInfo } from './creature-info';
import { getSpecies, speciesName } from './game';
import type { RowSlotView } from './raid-api';
import { initialOf } from './raid-roster';
import { ownerColour } from './raid-slots';
import type { SlotModel } from './ui/SlotRow';

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
export function boardRows(length: number): BoardRow[] {
  return ZONES.map((zone) => ({ zone, slots: zoneIndices(zone, length) })).filter(
    (row) => row.slots.length > 0,
  );
}

/** How many lanes (columns) the board has: the length of its longest row. */
export function laneCount(rows: readonly BoardRow[]): number {
  return Math.max(0, ...rows.map((row) => row.slots.length));
}

/** The row and the lane (from 1) of a slot, or null for a slot number that is not on the board. */
export function placeOf(slot: number, length: number): { zone: Zone; lane: number } | null {
  for (const row of boardRows(length)) {
    const column = row.slots.indexOf(slot);
    if (column >= 0) return { zone: row.zone, lane: column + 1 };
  }
  return null;
}

/** A place in plain words: "Middle, lane 1". Empty for a slot that is not on the board. */
export function placeText(slot: number, length: number): string {
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

/** What stands in a lane, for the overview pips: your creature, only others', or nothing. */
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

/** The spoken label of a pip: "Lane 3, yours". */
export function pipLabel(lane: number, state: LaneState): string {
  const what = state === 'mine' ? 'yours' : state === 'taken' ? 'taken' : 'empty';
  return `Lane ${String(lane)}, ${what}`;
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
): SlotModel {
  const c = s.creature;
  const where = placeText(s.slot, length);
  const base = { index: s.slot, hideNumber: true } as const;
  if (c === null) return { ...base, ariaLabel: `${where}, empty`, occupant: null };
  const owner = c.mine ? 'you' : c.ownerName;
  return {
    ...base,
    ariaLabel: `${where}, ${speciesName(c.species)} level ${String(c.level)}, ${owner}`,
    occupant: {
      species: c.species,
      name: speciesName(c.species),
      level: c.level,
      ownId: c.mine && c.creatureId !== undefined ? c.creatureId : null,
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
