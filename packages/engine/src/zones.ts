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

/** The slots directly left and right of `index` that exist. */
export function neighbours(index: number, length: number): number[] {
  const out: number[] = [];
  if (index - 1 >= 0) out.push(index - 1);
  if (index + 1 < length) out.push(index + 1);
  return out;
}
