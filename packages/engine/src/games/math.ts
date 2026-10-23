/** Integer helpers of the Games: square roots, the field curve, rolls and an integer sine. */
import { int, type Rng } from '@creatures/game';

export const BP = 10_000;

/** floor(sqrt(n)) for a whole number n >= 0 (exact for every safe integer). */
export function isqrt(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`isqrt: need a whole number, got ${n}`);
  if (n < 2) return n;
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

/** a * b / 10000, floored (both in basis points or one a plain number). */
export function mulBp(a: number, b: number): number {
  return Math.floor((a * b) / BP);
}

/** The median of whole numbers (the mean of the two middle ones, floored, for an even count); 0 for none. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  if (s.length % 2 === 1) return s[mid] as number;
  return Math.floor(((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

/**
 * Lowest and highest stat ratio against the field the curve reads (half to four times the median): a
 * creature far below the field still counts as half of it, so the weakest are never hopeless.
 */
const RATIO_MIN = 5_000;
const RATIO_MAX = 40_000;

/**
 * Diminishing returns against the field: `sqrt(stat / median)` in basis points (10000 at the median,
 * 14142 at twice it, 7071 at half), the ratio clamped to half to four times, then weighted by
 * `weightBp` (10000: the whole curve; 0: always 10000).
 */
export function curveBp(stat: number, fieldMedian: number, weightBp: number): number {
  const med = Math.max(1, fieldMedian);
  const ratio = Math.min(
    RATIO_MAX,
    Math.max(RATIO_MIN, Math.floor((Math.max(0, stat) * BP) / med)),
  );
  const root = isqrt(ratio * BP);
  return BP + Math.floor(((root - BP) * weightBp) / BP);
}

/** The curve of each value against the median of all of them. */
export function fieldCurve(values: readonly number[], weightBp: number): number[] {
  const med = median(values);
  return values.map((v) => curveBp(v, med, weightBp));
}

/** sqrt(stat / ref) in basis points with no field (aptitude). */
export function absCurveBp(stat: number, ref: number): number {
  return isqrt(Math.floor((Math.max(0, stat) * BP * BP) / ref));
}

/** True with chance `bp` out of 10000; draws nothing for a chance of 0 or less. */
export function roll(rng: Rng, bp: number): boolean {
  if (bp <= 0) return false;
  if (bp >= BP) return true;
  return int(rng, BP) < bp;
}

/** A multiplier from 10000 - spread to 10000 + spread (basis points). */
export function jitter(rng: Rng, spreadBp: number): number {
  if (spreadBp <= 0) return BP;
  return BP - spreadBp + int(rng, 2 * spreadBp + 1);
}

/** A whole number from lo to hi. */
export function between(rng: Rng, lo: number, hi: number): number {
  return hi <= lo ? lo : lo + int(rng, hi - lo + 1);
}

/** An item of a non-empty list. */
export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pickOne: empty list');
  return items[int(rng, items.length)] as T;
}

/** A shuffled copy (Fisher-Yates). */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/** sin of whole degrees 0 to 90, times 10000 (a fixed table, so positions never depend on the float library). */
const SIN_Q = [
  0, 175, 349, 523, 698, 872, 1045, 1219, 1392, 1564, 1736, 1908, 2079, 2250, 2419, 2588, 2756,
  2924, 3090, 3256, 3420, 3584, 3746, 3907, 4067, 4226, 4384, 4540, 4695, 4848, 5000, 5150, 5299,
  5446, 5592, 5736, 5878, 6018, 6157, 6293, 6428, 6561, 6691, 6820, 6947, 7071, 7193, 7314, 7431,
  7547, 7660, 7771, 7880, 7986, 8090, 8192, 8290, 8387, 8480, 8572, 8660, 8746, 8829, 8910, 8988,
  9063, 9135, 9205, 9272, 9336, 9397, 9455, 9511, 9563, 9613, 9659, 9703, 9744, 9781, 9816, 9848,
  9877, 9903, 9925, 9945, 9962, 9976, 9986, 9994, 9998, 10000,
];

function sinDeg(d: number): number {
  const deg = ((d % 360) + 360) % 360;
  if (deg <= 90) return SIN_Q[deg] as number;
  if (deg <= 180) return SIN_Q[180 - deg] as number;
  if (deg <= 270) return -(SIN_Q[deg - 180] as number);
  return -(SIN_Q[360 - deg] as number);
}

/** Units of a full turn (tenths of a degree). */
export const TURN = 3_600;

/** sin of an angle in tenths of a degree, times 10000, interpolated between whole degrees. */
export function sinU(units: number): number {
  const u = ((units % TURN) + TURN) % TURN;
  const d = Math.floor(u / 10);
  const f = u % 10;
  const a = sinDeg(d);
  const b = sinDeg(d + 1);
  return a + Math.trunc(((b - a) * f) / 10);
}

/** cos of an angle in tenths of a degree, times 10000. */
export function cosU(units: number): number {
  return sinU(units + 900);
}
