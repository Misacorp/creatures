import { describe, expect, it } from 'vitest';
import { sanitizeDisplayName } from '../src/names';

const codePoints = (s: string): number => Array.from(s).length;

describe('sanitizeDisplayName', () => {
  it('keeps ordinary names', () => {
    expect(sanitizeDisplayName('Misa')).toBe('Misa');
    expect(sanitizeDisplayName('Mikael Äö')).toBe('Mikael Äö');
  });

  it('applies NFKC normalisation', () => {
    expect(sanitizeDisplayName('ＭＩＳＡ')).toBe('MISA');
    expect(sanitizeDisplayName('ﬁsh')).toBe('fish');
    expect(sanitizeDisplayName('é')).toBe('é');
  });

  it('removes bidi overrides and isolates', () => {
    expect(sanitizeDisplayName('abc‮def')).toBe('abcdef');
    expect(sanitizeDisplayName('‮a‬⁦b⁩')).toBe('ab');
  });

  it('removes zero-width characters, including joiners', () => {
    expect(sanitizeDisplayName('a​b‌c‍d﻿e')).toBe('abcde');
  });

  it('removes control characters and unassigned code points', () => {
    expect(sanitizeDisplayName('a\u0000b\u0007c\u007Fd')).toBe('abcd');
    expect(sanitizeDisplayName('x͸y')).toBe('xy'); // U+0378 is unassigned
  });

  it('removes lone surrogates', () => {
    expect(sanitizeDisplayName('a\uD800b')).toBe('ab');
  });

  it('collapses whitespace, including newlines and tabs, and trims', () => {
    expect(sanitizeDisplayName('  a \t\n  b  c  ')).toBe('a b c');
    expect(sanitizeDisplayName('a\nb')).toBe('a b');
    expect(sanitizeDisplayName('a ​ b')).toBe('a b');
  });

  it('falls back to Player for empty or invisible input', () => {
    expect(sanitizeDisplayName('')).toBe('Player');
    expect(sanitizeDisplayName('   ')).toBe('Player');
    expect(sanitizeDisplayName('​‮\u0000')).toBe('Player');
  });

  it('falls back to Player for combining-only strings', () => {
    expect(sanitizeDisplayName('́́́')).toBe('Player');
    expect(sanitizeDisplayName(' ̀ ́ ')).toBe('Player');
  });

  it('keeps combining marks that follow a base character', () => {
    expect(sanitizeDisplayName('ạ̈')).toBe('ạ̈');
  });

  it('truncates to 32 code points', () => {
    const result = sanitizeDisplayName('a'.repeat(100));
    expect(result).toBe('a'.repeat(32));
  });

  it('truncates by code point, never splitting a surrogate pair', () => {
    const result = sanitizeDisplayName('\u{1F600}'.repeat(40));
    expect(codePoints(result)).toBe(32);
    expect(result).toBe('\u{1F600}'.repeat(32));
    expect(result.length).toBe(64);

    const mixed = sanitizeDisplayName('a'.repeat(31) + '\u{1F600}\u{1F600}');
    expect(codePoints(mixed)).toBe(32);
    expect(mixed.endsWith('\u{1F600}')).toBe(true);
    expect(mixed).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('trims a trailing space exposed by truncation', () => {
    expect(sanitizeDisplayName('a'.repeat(31) + ' bbb')).toBe('a'.repeat(31));
  });

  it('is idempotent', () => {
    const once = sanitizeDisplayName('  ‮Ｍｉｓａ​  \u{1F600}  ');
    expect(sanitizeDisplayName(once)).toBe(once);
  });
});
