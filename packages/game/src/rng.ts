/**
 * Random number helpers. Everything is built on a single primitive, `Rng.nextU32()`, so the same
 * game code runs with a live crypto source on the server and a seeded source in tests, the balance
 * simulator and replays of already-resolved fights.
 *
 * All probabilities are integer odds (numerator / denominator, or integer weights); no floats.
 */

export interface Rng {
  /** Returns a uniformly distributed unsigned 32-bit integer (0 to 2^32 - 1). */
  nextU32(): number;
}

const TWO_32 = 0x1_0000_0000;

/**
 * Uniform integer in [0, n) using rejection sampling (no modulo bias).
 * Throws RangeError unless n is an integer with 1 <= n <= 2^32.
 */
export function int(rng: Rng, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > TWO_32) {
    throw new RangeError(`int: n must be an integer in [1, 2^32], got ${n}`);
  }
  // Largest multiple of n that fits in the 2^32 possible outputs; anything at or above it is
  // rejected because it would make the low residues slightly more likely.
  const limit = TWO_32 - (TWO_32 % n);
  for (;;) {
    const x = rng.nextU32();
    if (x < limit) return x % n;
  }
}

/** True with probability numerator / denominator. Requires integers, 0 <= numerator <= denominator. */
export function chance(rng: Rng, numerator: number, denominator: number): boolean {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new RangeError('chance: numerator and denominator must be integers');
  }
  if (denominator < 1 || numerator < 0 || numerator > denominator) {
    throw new RangeError(
      `chance: need 0 <= numerator <= denominator, got ${numerator}/${denominator}`,
    );
  }
  return int(rng, denominator) < numerator;
}

/**
 * Picks one item with probability proportional to its integer weight. Items with weight 0 are never
 * picked. Throws if a weight is not a non-negative integer or if the total weight is 0.
 */
export function pickWeighted<T extends { readonly weight: number }>(
  rng: Rng,
  items: readonly T[],
): T {
  let total = 0;
  for (const item of items) {
    if (!Number.isInteger(item.weight) || item.weight < 0) {
      throw new RangeError(
        `pickWeighted: weights must be non-negative integers, got ${item.weight}`,
      );
    }
    total += item.weight;
  }
  if (total < 1) throw new RangeError('pickWeighted: total weight must be at least 1');
  let roll = int(rng, total);
  for (const item of items) {
    if (roll < item.weight) return item;
    roll -= item.weight;
  }
  throw new Error('pickWeighted: unreachable');
}

/** cyrb128 string hash: four 32-bit words from a string. Not cryptographic. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/**
 * Deterministic PRNG (sfc32, seeded through cyrb128). The same seed always gives the same sequence.
 *
 * NOT FOR LIVE RANDOMNESS. A player who knows the seed can predict every draw. Use it only in
 * tests, the balance simulator and replays of fights that were already resolved. Live draws use
 * `createCryptoRng`.
 */
export function createSeededRng(seed: string): Rng {
  let [a, b, c, d] = cyrb128(seed);
  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  // Discard the first outputs so similar seeds diverge.
  for (let i = 0; i < 15; i++) next();
  return { nextU32: next };
}

const CRYPTO_BUFFER_SIZE = 64;

/**
 * Live RNG backed by an injected `crypto.getRandomValues`. Pass `crypto.getRandomValues.bind(crypto)`.
 * Values are fetched in batches of 64 and handed out one at a time; they are only drawn when
 * needed, never derived from a seed.
 */
export function createCryptoRng(getRandomValues: (array: Uint32Array) => Uint32Array): Rng {
  const buffer = new Uint32Array(CRYPTO_BUFFER_SIZE);
  let index = CRYPTO_BUFFER_SIZE;
  return {
    nextU32(): number {
      if (index >= CRYPTO_BUFFER_SIZE) {
        getRandomValues(buffer);
        index = 0;
      }
      const value = buffer[index++];
      if (value === undefined) throw new Error('crypto rng buffer underrun');
      return value;
    },
  };
}
