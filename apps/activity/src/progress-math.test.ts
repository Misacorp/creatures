import { describe, expect, it } from 'vitest';
import { percent } from './progress-math';

describe('percent', () => {
  it('is 0 to 100 in steps of a tenth, rounded down', () => {
    expect(percent(0, 10)).toBe(0);
    expect(percent(5, 10)).toBe(50);
    expect(percent(10, 10)).toBe(100);
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(2, 3)).toBe(66.6);
    expect(percent(1, 1000)).toBe(0.1);
    expect(percent(1, 10_000)).toBe(0);
  });

  it('clamps to the range', () => {
    expect(percent(-5, 10)).toBe(0);
    expect(percent(25, 10)).toBe(100);
  });

  it('treats a max that is not positive as 0%', () => {
    expect(percent(5, 0)).toBe(0);
    expect(percent(5, -3)).toBe(0);
    expect(percent(5, Number.NaN)).toBe(0);
  });

  it('survives floating point error on exact tenths', () => {
    expect(percent(0.3, 1)).toBe(30);
    expect(percent(33.3, 100)).toBe(33.3);
    expect(percent(57.7, 100)).toBe(57.7);
    expect(percent(0.007, 0.01)).toBe(70);
  });
});
