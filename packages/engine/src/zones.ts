import type { Zone } from './types';

export const ZONES: readonly Zone[] = ['front', 'middle', 'back'];

/** How many slots of a row are in each zone (contiguous, front first). */
export interface ZoneSizes {
  front: number;
  middle: number;
  back: number;
}

/**
 * Where a fight's creatures stand on the board: the board's full row length and the board slot of
 * each creature of the row (`slots[i]` is the slot of `row[i]`; strictly increasing, each below
 * `length`). Zones, lanes and "beside" all come from these slots, so a gap in the board (an empty
 * slot) stays a gap in the fight.
 */
export interface FightBoard {
  length: number;
  slots: readonly number[];
}

/**
 * The shape of a row: a plain length (a dense row, creature i in slot i, the zones the
 * floor(length / 3) formula) or the board's own positions (`FightBoard`).
 */
export type RowShape = number | FightBoard;

function checkLength(length: number): number {
  if (!Number.isInteger(length) || length < 0) throw new RangeError('row length must be >= 0');
  return length;
}

/** The board's full row length, empty slots included. */
function lengthOf(shape: RowShape): number {
  return checkLength(typeof shape === 'number' ? shape : shape.length);
}

/** How many creatures the shape places. */
function countOf(shape: RowShape): number {
  return typeof shape === 'number' ? checkLength(shape) : shape.slots.length;
}

/** The board slot of row index `index` (a plain length: the index itself). */
function slotAt(shape: RowShape, index: number): number {
  return typeof shape === 'number' ? index : (shape.slots[index] ?? Number.NaN);
}

/**
 * Splits a row of `length` slots into three contiguous zones. Front and back each get
 * floor(length / 3) slots; everything left goes to the middle. Rows of 1 or 2 slots are all middle.
 * Given board positions, splits the board's full length.
 */
export function zoneSizes(shape: RowShape): ZoneSizes {
  const length = lengthOf(shape);
  const side = Math.floor(length / 3);
  return { front: side, middle: length - 2 * side, back: side };
}

/** The number of slots on the board row of this shape (empty ones included). */
export function shapeLength(shape: RowShape): number {
  return lengthOf(shape);
}

/**
 * The shape a fight's row has: the input's `board` when it carries one (checked: one strictly
 * increasing board slot below `length` per creature of the row), otherwise the dense row, so a
 * stored input without it replays as it did.
 */
export function fightRowShape(input: {
  row: readonly unknown[];
  board?: FightBoard | undefined;
}): FightBoard {
  const n = input.row.length;
  if (input.board === undefined) {
    return { length: n, slots: Array.from({ length: n }, (_, i) => i) };
  }
  const { length, slots } = input.board;
  if (!Number.isSafeInteger(length) || length < n) {
    throw new RangeError('board length must be an integer >= the number of creatures');
  }
  if (slots.length !== n) throw new RangeError('board needs one slot per creature of the row');
  let previous = -1;
  for (const slot of slots) {
    if (!Number.isSafeInteger(slot) || slot <= previous || slot >= length) {
      throw new RangeError('board slots must be strictly increasing integers below the length');
    }
    previous = slot;
  }
  return { length, slots: [...slots] };
}

/** The zone of a board slot on a board of `length` slots. */
function zoneOfSlot(slot: number, length: number): Zone {
  const { front, middle } = zoneSizes(length);
  if (slot < front) return 'front';
  if (slot < front + middle) return 'middle';
  return 'back';
}

/** The zone of the creature at row index `index` (for a plain length: of that slot). */
export function zoneOfIndex(index: number, shape: RowShape): Zone {
  return zoneOfSlot(slotAt(shape, index), lengthOf(shape));
}

/** Row indices of the creatures in a zone, left to right. */
export function zoneIndices(zone: Zone, shape: RowShape): number[] {
  const length = lengthOf(shape);
  const out: number[] = [];
  for (let i = 0; i < countOf(shape); i++) {
    if (zoneOfSlot(slotAt(shape, i), length) === zone) out.push(i);
  }
  return out;
}

/** The lane of the creature at row index `index`: its board slot minus its zone's first slot. */
export function laneOfIndex(index: number, shape: RowShape): number {
  const length = lengthOf(shape);
  const slot = slotAt(shape, index);
  const { front, middle } = zoneSizes(length);
  const zone = zoneOfSlot(slot, length);
  return slot - (zone === 'front' ? 0 : zone === 'middle' ? front : front + middle);
}

/** How many lanes the board has: the width of its widest row. */
export function laneCount(shape: RowShape): number {
  const s = zoneSizes(shape);
  return Math.max(s.front, s.middle, s.back);
}

/**
 * The slots directly left and right of `index` that exist, in one unbroken line. Only the dungeon
 * (a row of three with no zones) uses this; the raid uses `zoneNeighbours`.
 */
export function neighbours(index: number, length: number): number[] {
  const out: number[] = [];
  if (index - 1 >= 0) out.push(index - 1);
  if (index + 1 < length) out.push(index + 1);
  return out;
}

/**
 * The raid's "beside": the row indices of the creatures whose board slot is exactly one left or
 * right of `index`'s and in the same zone. Adjacency stops at zone edges, so the last Front slot is
 * not beside the first Middle slot, which is how the board draws it (one row per zone), and an empty
 * board slot between two creatures breaks it.
 */
export function zoneNeighbours(index: number, shape: RowShape): number[] {
  const length = lengthOf(shape);
  const slot = slotAt(shape, index);
  const zone = zoneOfSlot(slot, length);
  const out: number[] = [];
  for (let i = 0; i < countOf(shape); i++) {
    const other = slotAt(shape, i);
    if (Math.abs(other - slot) === 1 && zoneOfSlot(other, length) === zone) out.push(i);
  }
  return out;
}

/**
 * The row indices of the creatures two places away from `index` in its zone's row (a gear set's longer
 * reach): board slot minus two or plus two, in the same zone, with a creature standing in the slot
 * between (an empty board slot breaks the reach, as it breaks `zoneNeighbours`). For a plain length
 * this is index +/- 2 in the same zone.
 */
export function zoneTwoAway(index: number, shape: RowShape): number[] {
  const length = lengthOf(shape);
  const slot = slotAt(shape, index);
  const zone = zoneOfSlot(slot, length);
  const count = countOf(shape);
  const standing = (at: number): number | undefined => {
    for (let i = 0; i < count; i++) if (slotAt(shape, i) === at) return i;
    return undefined;
  };
  const out: number[] = [];
  for (const step of [-1, 1]) {
    if (standing(slot + step) === undefined) continue;
    const far = standing(slot + 2 * step);
    if (far !== undefined && zoneOfSlot(slot + 2 * step, length) === zone) out.push(far);
  }
  return out;
}

/**
 * Where a zone attack lands: the aimed zone if anyone is standing in it, otherwise the nearest zone
 * with someone standing (one step first; on a tie Front comes before Back), or undefined when the
 * whole row is down. The fight and the client's forecast both use it, so the warning names the zone
 * that is really hit.
 */
export function nearestLivingZone(
  aimed: Zone,
  hasLiving: (zone: Zone) => boolean,
): Zone | undefined {
  const from = ZONES.indexOf(aimed);
  let best: Zone | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [i, z] of ZONES.entries()) {
    const distance = Math.abs(i - from);
    if (distance < bestDistance && hasLiving(z)) {
      best = z;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * How a row is cut into the rows the position lines read (`placeRow` of @creatures/game): `zones` (the
 * raid) makes each zone one row, so a creature's neighbours stop at its zone's edge, as on the board;
 * `line` (the dungeon and the simulator's reference fights, `FightInput.guardReach: 'adjacent'`) is one
 * row of every slot. In both, each slot has the zone `zoneOfIndex` gives it (a row of three: one slot each).
 * Given the board's own positions (`FightBoard`), `zones` also lists who is beside each creature
 * (`zoneNeighbours`: an empty board slot breaks it), so the fold sees what the fight will.
 */
export function rowLayout(
  shape: RowShape,
  mode: 'zones' | 'line',
): { rows: number[][]; zones: Zone[]; beside?: number[][] } {
  const count = countOf(shape);
  const zones = Array.from({ length: count }, (_, i) => zoneOfIndex(i, shape));
  const rows =
    mode === 'line'
      ? [Array.from({ length: count }, (_, i) => i)]
      : ZONES.map((z) => zoneIndices(z, shape)).filter((r) => r.length > 0);
  if (mode === 'zones' && typeof shape !== 'number') {
    return {
      rows,
      zones,
      beside: Array.from({ length: count }, (_, i) => zoneNeighbours(i, shape)),
    };
  }
  return { rows, zones };
}
