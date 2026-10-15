import { describe, expect, it } from 'vitest';
import { compactCount, compactPair } from './number-format';

describe('compactCount', () => {
  it('leaves small numbers as they are (the dungeon)', () => {
    for (const n of [0, 7, 337, 1_999, 9_999]) expect(compactCount(n)).toBe(String(n));
  });

  it('shortens thousands, millions and billions to one decimal at most', () => {
    expect(compactCount(10_000)).toBe('10K');
    expect(compactCount(12_345)).toBe('12.3K');
    expect(compactCount(999_999)).toBe('999.9K');
    expect(compactCount(1_000_000)).toBe('1M');
    expect(compactCount(50_000_000)).toBe('50M');
    expect(compactCount(2_500_000_000)).toBe('2.5B');
  });

  it('cuts instead of rounding, so a hurt boss never reads as full', () => {
    expect(compactCount(49_997_944)).toBe('49.9M');
    expect(compactCount(999_999)).not.toBe('1M');
  });

  it('keeps the bar text short enough for a phone (the longest raid pool)', () => {
    const text = `${compactCount(49_997_944)} / ${compactCount(50_000_000)}`;
    expect(text).toBe('49.9M / 50M');
    expect(text.length).toBeLessThanOrEqual(14);
  });

  it('is safe with odd input', () => {
    expect(compactCount(-5)).toBe('0');
    expect(compactCount(Number.NaN)).toBe('0');
    expect(compactCount(12.9)).toBe('12');
  });
});

describe('compactPair', () => {
  it('writes both halves in the unit the maximum needs', () => {
    expect(compactPair(7_000, 10_000)).toBe('7K / 10K');
    expect(compactPair(42_023, 50_233)).toBe('42K / 50.2K');
    expect(compactPair(400_000, 50_000_000)).toBe('0.4M / 50M');
    expect(compactPair(49_997_944, 50_000_000)).toBe('49.9M / 50M');
  });

  it('stays plain below 10,000 (the dungeon)', () => {
    expect(compactPair(254, 337)).toBe('254 / 337');
    expect(compactPair(0, 9_999)).toBe('0 / 9999');
  });
});
