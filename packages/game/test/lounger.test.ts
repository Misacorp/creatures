import { describe, expect, it } from 'vitest';
import {
  RULES,
  createSeededRng,
  glossaryEntry,
  isRested,
  loungeExperience,
  pickLounger,
  type Rng,
} from '../src/index';

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

describe('loungeExperience', () => {
  const { msPerXp, dailyCap } = RULES.experience.lounge;
  const fresh = { paid: 0, carryMs: 0 };
  it('pays one per whole step and carries the rest', () => {
    const first = loungeExperience(fresh, 2 * msPerXp + 500);
    expect(first).toEqual({ xp: 2, tally: { paid: 2, carryMs: 500 } });
    const second = loungeExperience(first.tally, msPerXp - 500);
    expect(second).toEqual({ xp: 1, tally: { paid: 3, carryMs: 0 } });
  });

  it('stops at the daily cap: the creature is rested and the carry is dropped', () => {
    const capped = loungeExperience({ paid: dailyCap - 1, carryMs: 10 }, 5 * msPerXp);
    expect(capped).toEqual({ xp: 1, tally: { paid: dailyCap, carryMs: 0 } });
    expect(isRested(capped.tally.paid)).toBe(true);
    expect(isRested(dailyCap - 1)).toBe(false);
    expect(loungeExperience(capped.tally, 5 * msPerXp).xp).toBe(0);
  });

  it('is 1 XP per 2 minutes, 2 hours of company a creature, half a day of back-to-back short trips', () => {
    expect(msPerXp).toBe(120_000);
    expect(dailyCap * msPerXp).toBe(2 * 3_600_000);
    expect(dailyCap * 2).toBe(6 * RULES.experience.trip.short);
  });

  it('rejects a negative or fractional time', () => {
    expect(() => loungeExperience(fresh, -1)).toThrow(RangeError);
    expect(() => loungeExperience(fresh, 0.5)).toThrow(RangeError);
  });
});

describe('the Lounging glossary entry', () => {
  it('says the numbers of the rules', () => {
    const text = (glossaryEntry('lounging')?.lines ?? []).join(' ');
    const { msPerXp, dailyCap } = RULES.experience.lounge;
    expect(text).toContain(`1 XP every ${String(msPerXp / 60_000)} minutes`);
    expect(text).toContain(`up to ${String(dailyCap)} XP a day`);
  });
});
