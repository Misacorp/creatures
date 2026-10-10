import { describe, expect, it } from 'vitest';
import { ECONOMY, baitForDay, leetPointsForDay } from '../src/economy';

describe('leetPointsForDay', () => {
  it('gives nothing for an empty day and the solo bonus for one player', () => {
    expect(leetPointsForDay(0)).toBe(0);
    expect(leetPointsForDay(1)).toBe(ECONOMY.soloLeetPoints);
    expect(leetPointsForDay(1)).toBe(2);
  });

  it('gives n points for n >= 2, capped', () => {
    expect(leetPointsForDay(2)).toBe(2);
    expect(leetPointsForDay(3)).toBe(3);
    expect(leetPointsForDay(7)).toBe(7);
    expect(leetPointsForDay(8)).toBe(8);
    expect(leetPointsForDay(9)).toBe(8);
    expect(leetPointsForDay(500)).toBe(8);
  });

  it('rejects invalid counts', () => {
    expect(() => leetPointsForDay(-1)).toThrow();
    expect(() => leetPointsForDay(1.5)).toThrow();
    expect(() => leetPointsForDay(Number.NaN)).toThrow();
  });
});

describe('baitForDay', () => {
  it('converts points at the configured rate with integers', () => {
    expect(baitForDay(0)).toBe(0);
    expect(baitForDay(1)).toBe(20);
    expect(baitForDay(2)).toBe(20);
    expect(baitForDay(3)).toBe(30);
    expect(baitForDay(8)).toBe(80);
    expect(baitForDay(100)).toBe(80);
    for (let n = 0; n <= 20; n++) expect(Number.isInteger(baitForDay(n))).toBe(true);
  });
});
