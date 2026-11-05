import type { Rng } from '@creatures/game';

const TWO_32 = 0x1_0000_0000;

/** A uniform number in [0, 1) from the seeded RNG. */
export const uniform = (rng: Rng): number => rng.nextU32() / TWO_32;

/** A Poisson draw by inversion (small means only: the lab's rare finds have a mean below about 10 per visit). */
export function poisson(rng: Rng, mean: number): number {
  if (mean <= 0) return 0;
  // Split big means so exp(-mean) never underflows.
  let total = 0;
  let left = mean;
  while (left > 0) {
    const part = Math.min(left, 8);
    left -= part;
    const limit = Math.exp(-part);
    let product = uniform(rng);
    let k = 0;
    while (product > limit) {
      k += 1;
      product *= uniform(rng);
    }
    total += k;
  }
  return total;
}

/** The index drawn with probability proportional to its weight (weights are non-negative; all zero picks the last). */
export function weighted(rng: Rng, weights: readonly number[]): number {
  let sum = 0;
  for (const w of weights) sum += w;
  let point = uniform(rng) * sum;
  for (let i = 0; i < weights.length; i++) {
    point -= weights[i] ?? 0;
    if (point < 0) return i;
  }
  return weights.length - 1;
}

export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);
export const mean = (values: readonly number[]): number =>
  values.length ? sum(values) / values.length : 0;

/** The `q`-quantile (0..1) by linear interpolation; 0 for an empty list. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (at - lo);
}
export const median = (values: readonly number[]): number => quantile(values, 0.5);

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
