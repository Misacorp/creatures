import { describe, expect, it } from 'vitest';
import { initialOf } from './raid-roster';

describe('initialOf', () => {
  it('is the first character, upper-cased', () => {
    expect(initialOf('misa')).toBe('M');
    expect(initialOf('  zed')).toBe('Z');
  });

  it('takes a whole code point, not half of a surrogate pair', () => {
    expect(initialOf('\u{1F409} Dragon')).toBe('\u{1F409}');
  });

  it('keeps markup as plain text and has a fallback for an empty name', () => {
    expect(initialOf('<b>x</b>')).toBe('<');
    expect(initialOf('')).toBe('?');
    expect(initialOf('   ')).toBe('?');
  });
});
