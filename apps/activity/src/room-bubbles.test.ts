import { createSeededRng, type Rng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  BUBBLE_LINES,
  BUBBLE_MIN_GAP_S,
  bubbleGap,
  bubbleLine,
  bubbleSpeaker,
} from './room-bubbles';

/** An Rng that hands out these values in turn. */
function fixed(values: readonly number[]): Rng {
  let i = 0;
  return {
    nextU32: () => values[i++ % values.length] ?? 0,
  };
}

describe('bubbleGap', () => {
  it('is 8 s when the source gives its lowest value', () => {
    expect(bubbleGap(fixed([0]))).toBe(BUBBLE_MIN_GAP_S * 1000);
  });

  it('always stays inside 8 to 20 s, and uses the whole range', () => {
    const rng = createSeededRng('bubble-gaps');
    const gaps = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const gap = bubbleGap(rng);
      expect(gap % 1000).toBe(0);
      expect(gap).toBeGreaterThanOrEqual(8000);
      expect(gap).toBeLessThanOrEqual(20_000);
      gaps.add(gap);
    }
    expect(gaps.size).toBe(13);
  });
});

describe('bubbleLine and bubbleSpeaker', () => {
  it('picks lines from the list', () => {
    const rng = createSeededRng('lines');
    for (let i = 0; i < 100; i++) expect(BUBBLE_LINES).toContain(bubbleLine(rng));
  });

  it('keeps every line short and plain', () => {
    for (const line of BUBBLE_LINES) {
      expect(line.length).toBeGreaterThan(0);
      expect(line.length).toBeLessThanOrEqual(12);
    }
  });

  it('picks a speaker index in range, and nobody when the room has no creatures', () => {
    const rng = createSeededRng('speaker');
    for (let i = 0; i < 100; i++) {
      const who = bubbleSpeaker(rng, 5);
      expect(who).toBeGreaterThanOrEqual(0);
      expect(who).toBeLessThan(5);
    }
    expect(bubbleSpeaker(rng, 0)).toBeNull();
  });
});
