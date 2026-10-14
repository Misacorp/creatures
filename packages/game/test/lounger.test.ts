import { describe, expect, it } from 'vitest';
import { createSeededRng, pickLounger, type Rng } from '../src/index';

/** Fake RNG that replays scripted values and counts the draws. */
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

describe('pickLounger', () => {
  it('returns null for nobody, without drawing', () => {
    const rng = scripted([]);
    expect(pickLounger([], rng)).toBeNull();
    expect(rng.calls).toBe(0);
  });

  it('returns the only candidate without drawing', () => {
    const rng = scripted([]);
    expect(pickLounger(['a'], rng)).toBe('a');
    expect(rng.calls).toBe(0);
  });

  it('maps a draw to an index: low draws pick early ids, high draws late ones', () => {
    expect(pickLounger(['a', 'b', 'c'], scripted([0]))).toBe('a');
    expect(pickLounger(['a', 'b', 'c'], scripted([1]))).toBe('b');
    expect(pickLounger(['a', 'b', 'c'], scripted([2]))).toBe('c');
    expect(pickLounger(['a', 'b', 'c'], scripted([3]))).toBe('a');
  });

  it('draws once per pick', () => {
    const rng = scripted([5]);
    pickLounger(['a', 'b', 'c', 'd'], rng);
    expect(rng.calls).toBe(1);
  });

  it('is deterministic for a seed and reaches every candidate', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const run = (seed: string): (string | null)[] => {
      const rng = createSeededRng(seed);
      return Array.from({ length: 200 }, () => pickLounger(ids, rng));
    };
    expect(run('lounger-seed')).toEqual(run('lounger-seed'));
    expect(new Set(run('lounger-seed'))).toEqual(new Set(ids));
  });

  it('only ever returns a member of the list and does not change it', () => {
    const ids = ['x', 'y'];
    const rng = createSeededRng('members');
    for (let i = 0; i < 50; i++) expect(ids).toContain(pickLounger(ids, rng));
    expect(ids).toEqual(['x', 'y']);
  });
});
