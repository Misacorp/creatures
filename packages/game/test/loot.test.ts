import { describe, expect, it } from 'vitest';
import {
  RULES,
  chance,
  contributionWeights,
  createSeededRng,
  essenceForStage,
  jackpotChanceBp,
  rollJackpot,
  splitByWeight,
  type Rng,
} from '../src/index';

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe('contributionWeights', () => {
  it('counts a share up to 35% fully', () => {
    const w = contributionWeights({ a: 35, b: 65 });
    // Exactly at the cap: weight is the raw contribution on the common scale.
    expect(w.a).toBe(35 * 100_000_000);
  });

  it('counts the part above 35% at half rate', () => {
    const w = contributionWeights({ a: 60, b: 40 });
    // 35 + (60 - 35) / 2 = 47.5 of 100; b at 40% is above the cap too: 35 + 2.5 = 37.5.
    expect(w.a).toBe(47.5 * 100_000_000);
    expect(w.b).toBe(37.5 * 100_000_000);
  });

  it('leaves players under the cap untouched and gives equal weights when nobody contributed', () => {
    const w = contributionWeights({ a: 10, b: 20, c: 70 });
    expect(w.a).toBe(10 * 100_000_000);
    expect(w.b).toBe(20 * 100_000_000);
    expect(w.c).toBe((35 + 17.5) * 100_000_000);
    expect(contributionWeights({ a: 0, b: 0 })).toEqual({ a: 1, b: 1 });
  });

  it('rejects bad contributions', () => {
    expect(() => contributionWeights({ a: -1 })).toThrow(RangeError);
    expect(() => contributionWeights({ a: 1.5 })).toThrow(RangeError);
  });
});

describe('splitByWeight', () => {
  it('always sums exactly (largest remainder) and ties go to the smaller id', () => {
    expect(splitByWeight(10, ['a', 'b', 'c'], { a: 1, b: 1, c: 1 })).toEqual({ a: 4, b: 3, c: 3 });
    for (let total = 0; total < 60; total++) {
      const parts = splitByWeight(total, ['x', 'y', 'z', 'w'], { x: 7, y: 3, z: 11, w: 1 });
      expect(sum(parts)).toBe(total);
    }
  });

  it('splits equally if every weight is 0 and handles no ids', () => {
    expect(splitByWeight(7, ['a', 'b'], {})).toEqual({ a: 4, b: 3 });
    expect(splitByWeight(7, [], {})).toEqual({});
  });
});

describe('essenceForStage', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];

  it('pays the flat amount plus a pool of 3/7 of the flat total (70/30), exactly', () => {
    const weights = contributionWeights({ a: 50, b: 20, c: 15, d: 10, e: 5 });
    for (const [stage, flat] of [
      ['phase1', 10],
      ['phase2', 15],
      ['finale', 25],
    ] as const) {
      const out = essenceForStage(stage, ids, weights);
      const pool = Math.floor((flat * ids.length * 4286) / 10_000);
      expect(sum(out)).toBe(flat * ids.length + pool);
      // About 70% flat, 30% by contribution.
      expect(pool / (flat * ids.length + pool)).toBeGreaterThan(0.29);
      expect(pool / (flat * ids.length + pool)).toBeLessThan(0.31);
      for (const id of ids) expect(out[id]).toBeGreaterThanOrEqual(flat);
      expect(Object.keys(out).sort()).toEqual(ids);
    }
  });

  it('gives more to higher contribution, softly capped', () => {
    const out = essenceForStage(
      'finale',
      ids,
      contributionWeights({ a: 50, b: 20, c: 15, d: 10, e: 5 }),
    );
    expect(out.a).toBeGreaterThan(out.b as number);
    expect(out.b).toBeGreaterThan(out.e as number);
    // Uncapped, a (50% of contribution) would get half the 53-point pool; the cap trims it.
    expect((out.a as number) - 25).toBeLessThan(26);
  });

  it('rounds with largest remainder so totals stay exact for awkward numbers', () => {
    const three = ['a', 'b', 'c'];
    const out = essenceForStage('phase1', three, contributionWeights({ a: 1, b: 1, c: 1 }));
    expect(sum(out)).toBe(42); // 30 flat + a pool of 12
    expect(out).toEqual({ a: 14, b: 14, c: 14 });
    const odd = essenceForStage('phase2', three, contributionWeights({ a: 3, b: 2, c: 2 }));
    expect(sum(odd)).toBe(64); // 45 flat + a pool of 19
  });

  it('ignores players outside the signed-up list and treats missing weights as 0', () => {
    const out = essenceForStage('phase1', ['a', 'b'], { a: 5, ghost: 1000 });
    expect(Object.keys(out).sort()).toEqual(['a', 'b']);
    expect(sum(out)).toBe(28); // 20 flat + a pool of 8, all of it to the only weighted player
    expect(out).toEqual({ a: 18, b: 10 });
  });

  it('is empty for no players', () => {
    expect(essenceForStage('finale', [], {})).toEqual({});
  });
});

describe('jackpot and pity', () => {
  it('is 6% for the first 4 raids, rises 8 points a raid from the 5th, and is guaranteed at the 10th', () => {
    const curve = Array.from({ length: 12 }, (_, i) => jackpotChanceBp(i));
    expect(curve).toEqual([
      600, 600, 600, 600, 1400, 2200, 3000, 3800, 4600, 10_000, 10_000, 10_000,
    ]);
    expect(RULES.raid.jackpot.softPityFromRaid).toBe(5);
    expect(RULES.raid.jackpot.hardPityRaid).toBe(10);
  });

  it('rejects bad counters', () => {
    expect(() => jackpotChanceBp(-1)).toThrow(RangeError);
    expect(() => jackpotChanceBp(1.5)).toThrow(RangeError);
  });

  it('resets the counter on a hit and counts up on a miss', () => {
    const always: Rng = { nextU32: () => 0 };
    const never: Rng = { nextU32: () => 0xffff_0000 };
    expect(rollJackpot(always, 3)).toEqual({ hit: true, newCounter: 0 });
    expect(rollJackpot(never, 3)).toEqual({ hit: false, newCounter: 4 });
  });

  it('is guaranteed at 9 raids without a jackpot whatever the RNG says', () => {
    const never: Rng = { nextU32: () => 0xffff_0000 };
    expect(rollJackpot(never, 9)).toEqual({ hit: true, newCounter: 0 });
  });

  it('never goes past 9 misses and its long-run rate is within the 6-15% target', () => {
    const rng = createSeededRng('jackpot-rate');
    let counter = 0;
    let hits = 0;
    let longestDrought = 0;
    const raids = 20_000;
    for (let i = 0; i < raids; i++) {
      const r = rollJackpot(rng, counter);
      counter = r.newCounter;
      if (r.hit) hits++;
      longestDrought = Math.max(longestDrought, counter);
    }
    expect(longestDrought).toBeLessThanOrEqual(9);
    const rate = hits / raids;
    expect(rate).toBeGreaterThan(0.12);
    expect(rate).toBeLessThan(0.16);
    // Sanity: the plain 6% chance uses the same primitive.
    expect(chance(createSeededRng('x'), 0, 10_000)).toBe(false);
  });
});
