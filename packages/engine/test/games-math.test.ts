import { describe, expect, it } from 'vitest';
import { cosU, curveBp, fieldCurve, isqrt, median, sinU } from '../src/games/math';

describe('Games integer math', () => {
  it('isqrt is the exact floor of the square root', () => {
    expect([0, 1, 3, 4, 15, 16, 17, 99_999_999, 100_000_000].map(isqrt)).toEqual([
      0, 1, 1, 2, 3, 4, 4, 9_999, 10_000,
    ]);
    expect(isqrt(2 ** 52)).toBe(2 ** 26);
    expect(() => isqrt(-1)).toThrow(RangeError);
  });

  it('the field curve has diminishing returns: twice the median is about x1.41, half about x0.71', () => {
    expect(curveBp(200, 200, 10_000)).toBe(10_000);
    expect(curveBp(400, 200, 10_000)).toBe(14_142);
    expect(curveBp(100, 200, 10_000)).toBe(7_071);
    // Clamped at a quarter and four times.
    expect(curveBp(10_000, 200, 10_000)).toBe(20_000);
    expect(curveBp(0, 200, 10_000)).toBe(5_000);
    // Weight 0 ignores the stat; 20000 doubles the curve's swing.
    expect(curveBp(400, 200, 0)).toBe(10_000);
    expect(curveBp(400, 200, 20_000)).toBe(18_284);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2);
    expect(fieldCurve([100, 100, 400], 10_000)).toEqual([10_000, 10_000, 20_000]);
  });

  it('the integer sine and cosine hit the quarter points', () => {
    expect([0, 900, 1_800, 2_700, 3_600].map(sinU)).toEqual([0, 10_000, 0, -10_000, 0]);
    expect([0, 900, 1_800, 2_700].map(cosU)).toEqual([10_000, 0, -10_000, 0]);
    expect(sinU(305)).toBe(Math.trunc((5_000 + 5_150) / 2));
    expect(sinU(-900)).toBe(-10_000);
  });
});
