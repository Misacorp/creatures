import type { Zone } from './types';

export const ZONES: readonly Zone[] = ['front', 'middle', 'back'];

/**
 * Splits a row of `length` slots into three contiguous zones. Front and back each get
 * floor(length / 3) slots; everything left goes to the middle. Rows of 1 or 2 slots are all middle.
 */
export function zoneSizes(length: number): { front: number; middle: number; back: number } {
  if (!Number.isInteger(length) || length < 0) throw new RangeError('row length must be >= 0');
  const side = Math.floor(length / 3);
  return { front: side, middle: length - 2 * side, back: side };
}

export function zoneOfIndex(index: number, length: number): Zone {
  const { front, middle } = zoneSizes(length);
  if (index < front) return 'front';
  if (index < front + middle) return 'middle';
  return 'back';
}

/** Indices of the slots in a zone, left to right. */
export function zoneIndices(zone: Zone, length: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i++) if (zoneOfIndex(i, length) === zone) out.push(i);
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
export function zoneNeighbours(index: number, length: number): number[] {
  const zone = zoneOfIndex(index, length);
  return neighbours(index, length).filter((i) => zoneOfIndex(i, length) === zone);
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
 * How a row of `length` slots is cut into the rows the position lines read (`placeRow` of @creatures/game):
 * `zones` (the raid) makes each zone one row, so a creature's neighbours stop at its zone's edge, as on the
 * board; `line` (the dungeon and the simulator's reference fights, `FightInput.guardReach: 'adjacent'`) is one
 * row of every slot. In both, each slot has the zone `zoneOfIndex` gives it (a row of three: one slot each).
 */
export function rowLayout(
  length: number,
  mode: 'zones' | 'line',
): { rows: number[][]; zones: Zone[] } {
  const zones = Array.from({ length }, (_, i) => zoneOfIndex(i, length));
  const rows =
    mode === 'line'
      ? [Array.from({ length }, (_, i) => i)]
      : ZONES.map((z) => zoneIndices(z, length)).filter((r) => r.length > 0);
  return { rows, zones };
}
