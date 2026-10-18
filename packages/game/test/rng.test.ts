import { describe, expect, it } from 'vitest';
import {
  chance,
  createCryptoRng,
  createSeededRng,
  int,
  pickWeighted,
  type Rng,
} from '../src/index';

// The package has no DOM or Node types; the test runtime (Node) provides Web Crypto.
declare const crypto: { getRandomValues: (array: Uint32Array) => Uint32Array };

/** Fake RNG that replays scripted values, then throws. */
function scripted(values: number[]): Rng & { calls: number } {
  let calls = 0;
  return {
    nextU32() {
      const v = values[calls++];
      if (v === undefined) throw new Error('script exhausted');
      return v;
    },
    get calls() {
      return calls;
    },
  };
}

describe('createSeededRng', () => {
  it('is deterministic per seed', () => {
    const a = createSeededRng('seed-1');
    const b = createSeededRng('seed-1');
    const seqA = Array.from({ length: 50 }, () => a.nextU32());
    const seqB = Array.from({ length: 50 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds', () => {
    const a = createSeededRng('seed-1');
    const b = createSeededRng('seed-2');
    const seqA = Array.from({ length: 10 }, () => a.nextU32());
    const seqB = Array.from({ length: 10 }, () => b.nextU32());
    expect(seqA).not.toEqual(seqB);
  });

  it('returns unsigned 32-bit integers', () => {
    const rng = createSeededRng('range');
    // Collect the offenders and assert once: `expect` per draw is what made these loops slow.
    const bad: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const x = rng.nextU32();
      if (!Number.isInteger(x) || x < 0 || x >= 2 ** 32) bad.push(x);
    }
    expect(bad).toEqual([]);
  });
});

describe('createCryptoRng', () => {
  it('refills a 64-value buffer from the injected source only when needed', () => {
    let fills = 0;
    let counter = 0;
    const rng = createCryptoRng((array) => {
      fills++;
      for (let i = 0; i < array.length; i++) array[i] = counter++;
      return array;
    });
    expect(fills).toBe(0);
    const values = Array.from({ length: 130 }, () => rng.nextU32());
    expect(values).toEqual(Array.from({ length: 130 }, (_, i) => i));
    expect(fills).toBe(3);
  });

  it('works with the real crypto.getRandomValues', () => {
    const rng = createCryptoRng(crypto.getRandomValues.bind(crypto));
    const x = rng.nextU32();
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(2 ** 32);
  });
});

describe('int', () => {
  it('rejects invalid arguments', () => {
    const rng = createSeededRng('x');
    for (const n of [0, -1, 1.5, NaN, Infinity, 2 ** 32 + 1]) {
      expect(() => int(rng, n)).toThrow(RangeError);
    }
  });

  it('returns 0 for n = 1 and accepts n = 2^32', () => {
    expect(int(scripted([123]), 1)).toBe(0);
    expect(int(scripted([4_000_000_000]), 2 ** 32)).toBe(4_000_000_000);
  });

  it.each([3, 7, 500])('is roughly uniform for n = %i over 100k draws', (n) => {
    const rng = createSeededRng(`uniform-${n}`);
    const draws = 100_000;
    const counts = new Array<number>(n).fill(0);
    // Collect the draws outside [0, n) and assert once: `expect` per draw made this test slow.
    const outOfRange: number[] = [];
    for (let i = 0; i < draws; i++) {
      const x = int(rng, n);
      if (x < 0 || x >= n) outOfRange.push(x);
      else counts[x] = (counts[x] ?? 0) + 1;
    }
    expect(outOfRange).toEqual([]);
    const expected = draws / n;
    const chiSquare = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    const df = n - 1;
    // Mean of chi-square is df and its sd is sqrt(2 df); five sd is a very generous bound.
    expect(chiSquare).toBeLessThan(df + 5 * Math.sqrt(2 * df));
  });

  it('rejects values in the biased tail instead of using modulo', () => {
    // 2^32 mod 3 = 1, so only 0xFFFFFFFF is in the rejection zone.
    const rng = scripted([0xffffffff, 4]);
    expect(int(rng, 3)).toBe(1);
    expect(rng.calls).toBe(2);
  });

  it('rejects repeatedly and accepts the last value below the limit', () => {
    // n = 2^31 + 1: limit = 2^32 - (2^32 mod n) = 2^31 + 1, so everything from there up is rejected.
    const n = 2 ** 31 + 1;
    const rng = scripted([0xffffffff, 0x90000000, n, n - 1]);
    expect(int(rng, n)).toBe(n - 1);
    expect(rng.calls).toBe(4);
  });
});

describe('chance', () => {
  it('validates arguments', () => {
    const rng = createSeededRng('x');
    expect(() => chance(rng, 1, 0)).toThrow(RangeError);
    expect(() => chance(rng, -1, 5)).toThrow(RangeError);
    expect(() => chance(rng, 6, 5)).toThrow(RangeError);
    expect(() => chance(rng, 0.5, 5)).toThrow(RangeError);
    expect(() => chance(rng, 1, 2.5)).toThrow(RangeError);
  });

  it('handles 0 and certain odds', () => {
    const rng = createSeededRng('edge');
    for (let i = 0; i < 100; i++) {
      expect(chance(rng, 0, 7)).toBe(false);
      expect(chance(rng, 7, 7)).toBe(true);
    }
  });

  it('is exact at the boundary: only the draw 0 succeeds for 1 in 500', () => {
    expect(chance(scripted([0]), 1, 500)).toBe(true);
    expect(chance(scripted([1]), 1, 500)).toBe(false);
    expect(chance(scripted([500]), 1, 500)).toBe(true); // 500 % 500 = 0
    expect(chance(scripted([499]), 1, 500)).toBe(false);
  });
});

describe('pickWeighted', () => {
  it('never picks zero-weight items', () => {
    const rng = createSeededRng('zero');
    const items = [
      { id: 'a', weight: 0 },
      { id: 'b', weight: 3 },
      { id: 'c', weight: 0 },
      { id: 'd', weight: 1 },
    ];
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const picked = pickWeighted(rng, items).id;
      counts[picked] = (counts[picked] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual(['b', 'd']);
    const ratio = (counts['b'] ?? 0) / (counts['d'] ?? 1);
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(3.5);
  });

  it('maps draws to items by cumulative weight', () => {
    const items = [
      { id: 'a', weight: 2 },
      { id: 'b', weight: 0 },
      { id: 'c', weight: 3 },
    ];
    expect(pickWeighted(scripted([0]), items).id).toBe('a');
    expect(pickWeighted(scripted([1]), items).id).toBe('a');
    expect(pickWeighted(scripted([2]), items).id).toBe('c');
    expect(pickWeighted(scripted([4]), items).id).toBe('c');
  });

  it('validates weights', () => {
    const rng = createSeededRng('x');
    expect(() => pickWeighted(rng, [])).toThrow(RangeError);
    expect(() => pickWeighted(rng, [{ weight: 0 }, { weight: 0 }])).toThrow(RangeError);
    expect(() => pickWeighted(rng, [{ weight: -1 }, { weight: 3 }])).toThrow(RangeError);
    expect(() => pickWeighted(rng, [{ weight: 1.5 }])).toThrow(RangeError);
  });
});
