import { describe, expect, it } from 'vitest';
import {
  isArrayOf,
  isBool,
  isCount,
  isInt,
  isNullableInt,
  isNullableStr,
  isPositiveInt,
  isRecord,
  isStr,
} from './parse-core';

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord([{ a: 1 }])).toBe(false);
    expect(isRecord('a')).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord(3)).toBe(false);
  });
});

describe('strings and booleans', () => {
  it('checks the type exactly', () => {
    expect(isStr('')).toBe(true);
    expect(isStr(1)).toBe(false);
    expect(isStr(null)).toBe(false);
    expect(isBool(false)).toBe(true);
    expect(isBool(0)).toBe(false);
    expect(isBool('true')).toBe(false);
  });

  it('allows null for the nullable string', () => {
    expect(isNullableStr(null)).toBe(true);
    expect(isNullableStr('a')).toBe(true);
    expect(isNullableStr(undefined)).toBe(false);
    expect(isNullableStr(1)).toBe(false);
  });
});

describe('whole numbers', () => {
  it('rejects fractions, NaN, Infinity and numbers in strings', () => {
    expect(isInt(0)).toBe(true);
    expect(isInt(-4)).toBe(true);
    expect(isInt(1.5)).toBe(false);
    expect(isInt(Number.NaN)).toBe(false);
    expect(isInt(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isInt('3')).toBe(false);
    expect(isInt(null)).toBe(false);
  });

  it('keeps counts at zero or more and positive numbers above zero', () => {
    expect(isCount(0)).toBe(true);
    expect(isCount(7)).toBe(true);
    expect(isCount(-1)).toBe(false);
    expect(isCount(0.5)).toBe(false);
    expect(isPositiveInt(1)).toBe(true);
    expect(isPositiveInt(0)).toBe(false);
    expect(isPositiveInt(-3)).toBe(false);
    expect(isPositiveInt(2.5)).toBe(false);
  });

  it('allows null for the nullable number', () => {
    expect(isNullableInt(null)).toBe(true);
    expect(isNullableInt(12)).toBe(true);
    expect(isNullableInt(undefined)).toBe(false);
    expect(isNullableInt(1.2)).toBe(false);
  });
});

describe('isArrayOf', () => {
  it('needs an array whose items all pass the guard', () => {
    expect(isArrayOf([1, 2, 3], isInt)).toBe(true);
    expect(isArrayOf([], isInt)).toBe(true);
    expect(isArrayOf([1, 'a'], isInt)).toBe(false);
    expect(isArrayOf({ 0: 1 }, isInt)).toBe(false);
    expect(isArrayOf(null, isInt)).toBe(false);
  });
});
