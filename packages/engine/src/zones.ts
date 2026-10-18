import type { Zone } from './types';

export const ZONES: readonly Zone[] = ['front', 'middle', 'back'];

/** How many slots of a row are in each zone (contiguous, front first). */
export interface ZoneSizes {
  front: number;
  middle: number;
  back: number;
}

/**
 * The shape of a row: a plain length (the zones are the floor(length / 3) formula) or explicit zone
 * sizes (a raid fight carries the board's own row sizes, so the fight's rows are the board's rows).
 */
export type RowShape = number | ZoneSizes;

function isCount(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

/** Throws a RangeError unless `sizes` are three integers >= 0. */
export function checkZoneSizes(sizes: ZoneSizes): ZoneSizes {
  if (!isCount(sizes.front) || !isCount(sizes.middle) || !isCount(sizes.back)) {
    throw new RangeError('zone sizes must be integers >= 0');
  }
  return sizes;
}

/**
 * Splits a row of `length` slots into three contiguous zones. Front and back each get
 * floor(length / 3) slots; everything left goes to the middle. Rows of 1 or 2 slots are all middle.
 * Given explicit sizes, returns them.
 */
export function zoneSizes(shape: RowShape): ZoneSizes {
  if (typeof shape !== 'number') return shape;
  if (!Number.isInteger(shape) || shape < 0) throw new RangeError('row length must be >= 0');
  const side = Math.floor(shape / 3);
  return { front: side, middle: shape - 2 * side, back: side };
}

/** The number of slots in a row of this shape. */
export function shapeLength(shape: RowShape): number {
  if (typeof shape === 'number') return shape;
  return shape.front + shape.middle + shape.back;
}

/**
 * The shape a fight's row has: the input's `zones` when it carries them (checked: integers that add
 * up to the row), otherwise the length formula, so a stored input without them replays as it did.
 */
export function fightRowShape(input: {
  row: readonly unknown[];
  zones?: ZoneSizes | undefined;
}): ZoneSizes {
  const n = input.row.length;
  if (input.zones === undefined) return zoneSizes(n);
  const z = checkZoneSizes(input.zones);
  if (z.front + z.middle + z.back !== n) {
    throw new RangeError('zones must add up to the length of the row');
  }
  return { front: z.front, middle: z.middle, back: z.back };
}

export function zoneOfIndex(index: number, shape: RowShape): Zone {
  const { front, middle } = zoneSizes(shape);
  if (index < front) return 'front';
  if (index < front + middle) return 'middle';
  return 'back';
}

/** Indices of the slots in a zone, left to right. */
export function zoneIndices(zone: Zone, shape: RowShape): number[] {
  const sizes = zoneSizes(shape);
  const length = shapeLength(sizes);
  const out: number[] = [];
  for (let i = 0; i < length; i++) if (zoneOfIndex(i, sizes) === zone) out.push(i);
  return out;
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
 * The raid's "beside": the slots directly left and right of `index` that exist and are in the
 * same zone. Adjacency stops at zone edges, so the last Front slot is not beside the first Middle
 * slot, which is how the board draws it (one row per zone).
 */
export function zoneNeighbours(index: number, shape: RowShape): number[] {
  const sizes = zoneSizes(shape);
  const zone = zoneOfIndex(index, sizes);
  return neighbours(index, shapeLength(sizes)).filter((i) => zoneOfIndex(i, sizes) === zone);
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
