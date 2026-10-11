import { describe, expect, it } from 'vitest';
import { COUNT_STEPS, SHAKE_MS, countRamp, finalFrame, revealFrames } from './reveal-anim';

describe('countRamp', () => {
  it('starts at 0, ends exactly at the target and never goes down', () => {
    for (const target of [0, 1, 7, 10, 99, 120, 2500, 123_457]) {
      const ramp = countRamp(target);
      expect(ramp).toHaveLength(COUNT_STEPS + 1);
      expect(ramp[0]).toBe(0);
      expect(ramp.at(-1)).toBe(target);
      for (let k = 1; k < ramp.length; k++) {
        expect(ramp[k]).toBeGreaterThanOrEqual(ramp[k - 1] ?? 0);
      }
    }
  });

  it('counts up fast first and slows down', () => {
    const ramp = countRamp(1000);
    expect((ramp[1] ?? 0) - (ramp[0] ?? 0)).toBeGreaterThan((ramp[10] ?? 0) - (ramp[9] ?? 0));
  });

  it('uses whole numbers, and treats a bad target as 0', () => {
    expect(countRamp(33).every(Number.isInteger)).toBe(true);
    expect(countRamp(-5).at(-1)).toBe(0);
    expect(countRamp(Number.NaN).at(-1)).toBe(0);
  });
});

describe('revealFrames', () => {
  it('goes shake, open, count and done, in time order', () => {
    const frames = revealFrames(120);
    expect(frames.map((f) => f.phase)).toEqual([
      'shake',
      'open',
      ...Array.from({ length: COUNT_STEPS - 1 }, () => 'count'),
      'done',
    ]);
    for (let k = 1; k < frames.length; k++) {
      expect(frames[k]?.at).toBeGreaterThan(frames[k - 1]?.at ?? 0);
      // No pause is longer than a beat of the stage (600 ms).
      expect((frames[k]?.at ?? 0) - (frames[k - 1]?.at ?? 0)).toBeLessThanOrEqual(SHAKE_MS);
    }
  });

  it('shows 0 until the count starts and the real Essence at the end', () => {
    const frames = revealFrames(120);
    expect(frames[0]?.count).toBe(0);
    expect(frames[1]?.count).toBe(0);
    expect(frames.at(-1)?.count).toBe(120);
  });

  it('has a final frame that is the end state', () => {
    expect(finalFrame(120)).toEqual({
      at: revealFrames(120).at(-1)?.at,
      phase: 'done',
      count: 120,
    });
  });

  it('works for a reveal with no Essence', () => {
    expect(finalFrame(0).count).toBe(0);
    expect(revealFrames(0).every((f) => f.count === 0)).toBe(true);
  });
});
