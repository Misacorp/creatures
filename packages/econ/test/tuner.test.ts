/** The tuner on a tiny fake model (no valley): the search, the choice, the conflicts, determinism. */
import { describe, expect, it } from 'vitest';
import type { Measures, Target } from '../src/targets';
import {
  DEFAULT_PLAN,
  candidateOf,
  fitsBetter,
  gridOf,
  neighboursOf,
  tune,
  type Axis,
  type Evaluate,
  type Level,
} from '../src/tuner';

const target = (
  id: string,
  measure: Target['measure'],
  bounds: { lo?: number; hi?: number },
): Target => ({
  id,
  line: id,
  measure,
  scale: 1,
  needs: [],
  label: id,
  ...bounds,
});
const axis = (id: string, start = 1, min = 0.25, max = 2, step = 0.25): Axis => ({
  id,
  min,
  max,
  step,
  start,
});

describe('the grid and the neighbours', () => {
  it("snaps to the step, stays in bounds and always holds today's value", () => {
    const a = axis('a', 1, 0.25, 2, 0.25);
    const grid = gridOf(a, 5);
    expect(grid).toContain(1);
    expect(grid[0]).toBe(0.25);
    expect(grid[grid.length - 1]).toBe(2);
    for (const v of grid) expect(Math.abs(v / 0.25 - Math.round(v / 0.25))).toBeLessThan(1e-9);
    expect(new Set(grid).size).toBe(grid.length);
  });

  it("proposes smaller steps each round and never today's own value or a value out of bounds", () => {
    const a = axis('a', 1, 0.5, 4, 0.25);
    const wide = neighboursOf(a, 0.5, 0);
    expect(wide.every((v) => v >= 0.5 && v <= 4)).toBe(true);
    expect(wide).not.toContain(0.5);
    const narrow = neighboursOf(a, 2, 3);
    expect(Math.max(...narrow) - Math.min(...narrow)).toBeLessThan(
      Math.max(...wide) - Math.min(...wide) + 4,
    );
    expect(narrow.every((v) => Math.abs(v - 2) >= 0.25 - 1e-9)).toBe(true);
  });
});

describe('what fits better', () => {
  const axes = [axis('a')];
  const t = [target('T', 'best12', { hi: 10 })];
  const make = (value: number, a = 1) => candidateOf(axes, t, { a }, { best12: value }, 'search');

  it('prefers fewer missed targets, then a smaller miss, then a smaller change from today', () => {
    expect(fitsBetter(make(5), make(20))).toBe(true);
    expect(fitsBetter(make(12), make(20))).toBe(true);
    expect(fitsBetter(make(20), make(12))).toBe(false);
    expect(fitsBetter(make(5, 1.25), make(5, 1.75))).toBe(true);
    expect(fitsBetter(make(5, 1), make(5, 1))).toBe(false);
  });

  it('does not count a target it could not measure', () => {
    const c = candidateOf(axes, t, { a: 1 }, {}, 'search');
    expect(c.failed).toBe(0);
    expect(c.judged[0]?.met).toBeNull();
  });
});

describe('tune', () => {
  it('moves one dial the least that meets a target', () => {
    // best12 = 20 + 10a: today (a = 1) is 30 and misses "at most 29.99"; the nearest passing step is 0.75.
    const evaluate: Evaluate = (v) => ({ best12: 20 + 10 * (v.a ?? 1) });
    const result = tune([axis('a')], [target('T-6b', 'best12', { hi: 29.99 })], evaluate);
    expect(result.start.failed).toBe(1);
    expect(result.best.failed).toBe(0);
    expect(result.best.values.a).toBe(0.75);
    expect(result.improved).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.unreachable).toEqual([]);
  });

  it("leaves today's values alone when they already meet every target", () => {
    const evaluate: Evaluate = (v) => ({ best12: 10 * (v.a ?? 1) });
    const result = tune([axis('a')], [target('T', 'best12', { hi: 29.99 })], evaluate);
    expect(result.improved).toBe(false);
    expect(result.best.values.a).toBe(1);
    expect(result.best.failed).toBe(0);
  });

  it('finds two targets that cannot be met together within the bounds', () => {
    // spread4 = 10a must be at most 5 (a <= 0.5); weekendShare = a must be at least 0.8: each is met somewhere, never both.
    const evaluate: Evaluate = (v) => ({ spread4: 10 * (v.a ?? 1), weekendShare: v.a ?? 1 });
    const targets = [
      target('T-1a', 'spread4', { hi: 5 }),
      target('T-2b', 'weekendShare', { lo: 0.8 }),
    ];
    const result = tune([axis('a')], targets, evaluate);
    expect(result.conflicts).toEqual([{ a: 'T-1a', b: 'T-2b' }]);
    expect(result.unreachable).toEqual([]);
    expect(result.best.failed).toBe(1);
  });

  it('names a target no dial value can meet', () => {
    const evaluate: Evaluate = (v) => ({ spread4: 100 + (v.a ?? 1), best12: 20 * (v.a ?? 1) });
    const targets = [target('T-1a', 'spread4', { hi: 5 }), target('T-6b', 'best12', { hi: 29.99 })];
    const result = tune([axis('a')], targets, evaluate);
    expect(result.unreachable).toEqual(['T-1a']);
    expect(result.best.judged.find((j) => j.target.id === 'T-6b')?.met).toBe(true);
  });

  it('works with two dials by a grid then descent, and keeps both in bounds', () => {
    // Both must be low enough: best12 = 20 + 5a + 5b <= 29.99 needs a + b <= 2: today (1, 1) is 30.
    const evaluate: Evaluate = (v) => ({ best12: 20 + 5 * (v.a ?? 1) + 5 * (v.b ?? 1) });
    const axes = [axis('a'), axis('b')];
    const result = tune(axes, [target('T-6b', 'best12', { hi: 29.99 })], evaluate);
    expect(result.best.failed).toBe(0);
    const { a, b } = result.best.values as { a: number; b: number };
    expect(a + b).toBeLessThan(2);
    for (const v of [a, b]) {
      expect(v).toBeGreaterThanOrEqual(0.25);
      expect(v).toBeLessThanOrEqual(2);
    }
    // The smallest change: only a quarter step away from today in total.
    expect(Math.abs(a - 1) + Math.abs(b - 1)).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('keeps refining after a round that moves nothing: a narrow target is found by the smaller steps', () => {
    // Only a = 1.25 meets the target; the first rounds' big steps jump over it.
    const evaluate: Evaluate = (v) => ({ best12: 20 + 20 * Math.abs((v.a ?? 1) - 1.25) });
    const result = tune(
      [axis('a', 1, 0, 3, 0.25)],
      [target('T-6b', 'best12', { hi: 20.1 })],
      evaluate,
    );
    expect(result.best.values.a).toBe(1.25);
    expect(result.best.failed).toBe(0);
  });

  it('is deterministic: the same inputs give the same proposal and the same measurements in the same order', () => {
    const calls: string[] = [];
    const run = (): string => {
      calls.length = 0;
      const evaluate: Evaluate = (v, level) => {
        calls.push(`${level}:${JSON.stringify(v)}`);
        return { best12: 20 + 10 * (v.a ?? 1), spread4: 10 * (v.a ?? 1) };
      };
      const result = tune(
        [axis('a')],
        [target('T-6b', 'best12', { hi: 29.99 }), target('T-1a', 'spread4', { hi: 5 })],
        evaluate,
      );
      return JSON.stringify(result) + calls.join('|');
    };
    expect(run()).toBe(run());
  });

  it("measures the finalists and today's values at the final level and chooses on those", () => {
    const levels: Level[] = [];
    // The cheap level is fooled: it says a = 0.5 is fine; the final level knows a = 0.5 is bad and a = 0.75 is good.
    const evaluate: Evaluate = (v, level) => {
      levels.push(level);
      const a = v.a ?? 1;
      const measure = level === 'search' ? 20 + 10 * a : a === 0.5 ? 40 : 20 + 10 * a;
      return { best12: measure };
    };
    const result = tune([axis('a')], [target('T-6b', 'best12', { hi: 29.99 })], evaluate, {
      ...DEFAULT_PLAN,
      finalists: 6,
    });
    expect(levels).toContain('final');
    expect(result.best.level).toBe('final');
    expect(result.best.values.a).not.toBe(0.5);
    expect(result.best.failed).toBe(0);
    expect(result.finals).toBeGreaterThan(1);
  });

  it('measures each point once on the cheap level', () => {
    const seen = new Map<string, number>();
    const evaluate: Evaluate = (v, level) => {
      if (level === 'search') seen.set(JSON.stringify(v), (seen.get(JSON.stringify(v)) ?? 0) + 1);
      return { best12: 20 + 10 * (v.a ?? 1) };
    };
    tune([axis('a')], [target('T', 'best12', { hi: 29.99 })], evaluate);
    for (const n of seen.values()) expect(n).toBe(1);
  });
});

describe('measures it cannot take', () => {
  it('are skipped by the search, not failed', () => {
    const evaluate: Evaluate = (): Measures => ({});
    const result = tune([axis('a')], [target('T', 'best12', { hi: 1 })], evaluate);
    expect(result.best.failed).toBe(0);
    expect(result.improved).toBe(false);
  });
});
