import { describe, expect, it } from 'vitest';
import { ECONOMY, baitForDay, leetPointsForDay } from '../src/index';

describe('leetPointsForDay', () => {
  it('pays nothing when nobody leeted', () => {
    expect(leetPointsForDay(0)).toBe(0);
  });

  it('pays a solo leet the same as a double leet', () => {
    expect(leetPointsForDay(1)).toBe(leetPointsForDay(2));
    expect(leetPointsForDay(1)).toBe(5);
  });

  it('follows the table with diminishing returns, capped at 10', () => {
    const expected = [0, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 10, 10, 10];
    expect(expected.map((_, n) => leetPointsForDay(n))).toEqual(expected);
    expect(leetPointsForDay(100)).toBe(10);
    expect(leetPointsForDay(10_000)).toBe(ECONOMY.maxLeetPoints);
  });

  it('never pays anyone less because someone else also leeted', () => {
    for (let n = 1; n <= 1000; n++) {
      expect(leetPointsForDay(n + 1)).toBeGreaterThanOrEqual(leetPointsForDay(n));
    }
  });

  it('adds at most one point per extra leeter after the second', () => {
    for (let n = 2; n <= 40; n++) {
      expect(leetPointsForDay(n + 1) - leetPointsForDay(n)).toBeLessThanOrEqual(1);
    }
  });

  it('rejects invalid counts', () => {
    expect(() => leetPointsForDay(-1)).toThrow();
    expect(() => leetPointsForDay(1.5)).toThrow();
    expect(() => leetPointsForDay(Number.NaN)).toThrow();
  });
});

describe('baitForDay', () => {
  it('converts points to Bait', () => {
    expect(baitForDay(0)).toBe(0);
    expect(baitForDay(1)).toBe(35);
    expect(baitForDay(15)).toBe(70);
  });
});
