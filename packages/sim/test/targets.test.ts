import { describe, expect, it } from 'vitest';
import { TARGETS, checkTarget, evaluateTargets, parseTargets, type Target } from '../src/targets';

const base = { id: 't', description: 'd', metric: 'm', unit: 'number' } as const;
const min: Target = { ...base, comparator: 'min', value: 10 };
const max: Target = { ...base, comparator: 'max', value: 10 };
const range: Target = { ...base, comparator: 'range', value: [5, 10] };

describe('target evaluator', () => {
  it('handles min, with the boundary passing', () => {
    expect(checkTarget(min, 10)).toBe(true);
    expect(checkTarget(min, 10.5)).toBe(true);
    expect(checkTarget(min, 9.99)).toBe(false);
  });

  it('handles max, with the boundary passing', () => {
    expect(checkTarget(max, 10)).toBe(true);
    expect(checkTarget(max, 3)).toBe(true);
    expect(checkTarget(max, 10.01)).toBe(false);
  });

  it('handles range, both ends inclusive', () => {
    expect(checkTarget(range, 5)).toBe(true);
    expect(checkTarget(range, 7)).toBe(true);
    expect(checkTarget(range, 10)).toBe(true);
    expect(checkTarget(range, 4.99)).toBe(false);
    expect(checkTarget(range, 10.01)).toBe(false);
  });

  it('reports pass, fail and not measured with the measured value', () => {
    const targets: Target[] = [
      { ...min, id: 'a', metric: 'a' },
      { ...max, id: 'b', metric: 'b' },
      { ...range, id: 'c', metric: 'c' },
      { ...range, id: 'd', metric: 'd' },
      { ...range, id: 'e', metric: 'e' },
    ];
    const results = evaluateTargets(targets, { a: 12, b: 12, c: 7, d: null });
    expect(results.map((r) => [r.id, r.status, r.measured])).toEqual([
      ['a', 'pass', 12],
      ['b', 'fail', 12],
      ['c', 'pass', 7],
      ['d', 'not_measured', null],
      ['e', 'not_measured', null],
    ]);
  });

  it('treats NaN and infinity as not measured', () => {
    const r = evaluateTargets([min], { m: Number.NaN });
    expect(r[0]?.status).toBe('not_measured');
    expect(evaluateTargets([min], { m: Number.POSITIVE_INFINITY })[0]?.status).toBe('not_measured');
  });
});

describe('targets.json', () => {
  it('is valid, has unique ids and mirrors the 96 documented targets', () => {
    expect(TARGETS.length).toBe(96);
    expect(new Set(TARGETS.map((t) => t.id)).size).toBe(TARGETS.length);
  });

  it('rejects unknown keys, bad shapes and duplicate ids', () => {
    expect(() => parseTargets([{ ...min, extra: 1 }])).toThrow(/Invalid targets/);
    expect(() => parseTargets([{ ...range, value: 5 }])).toThrow(/range/);
    expect(() => parseTargets([{ ...min, value: [1, 2] }])).toThrow(/single number/);
    expect(() => parseTargets([{ ...range, value: [9, 1] }])).toThrow(/range/);
    expect(() => parseTargets([min, min])).toThrow(/duplicate/);
    expect(() => parseTargets([{ ...min, comparator: 'equal' }])).toThrow(/Invalid targets/);
  });

  // "Only uses metrics the analysis produces" is in pipeline.test.ts (one shared run).
});
