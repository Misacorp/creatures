import { describe, expect, it } from 'vitest';
import { RULES, sanitizeCreatureNote } from '../src/index';

describe('sanitizeCreatureNote', () => {
  it('keeps plain text with line breaks, and trims the ends and each line', () => {
    expect(sanitizeCreatureNote('  Level to 20,  \r\nthen Ember gear.\t\n')).toEqual({
      ok: true,
      value: 'Level to 20,\nthen Ember gear.',
    });
    expect(sanitizeCreatureNote('a\n\n\n\nb')).toEqual({ ok: true, value: 'a\n\nb' });
  });

  it('means "no note" when nothing is left', () => {
    expect(sanitizeCreatureNote('')).toEqual({ ok: true, value: null });
    expect(sanitizeCreatureNote(' \n\t ')).toEqual({ ok: true, value: null });
  });

  it('counts code points, up to 256', () => {
    const max = RULES.creatureNote.maxCodePoints;
    expect(max).toBe(256);
    expect(sanitizeCreatureNote('🐸'.repeat(max))).toEqual({ ok: true, value: '🐸'.repeat(max) });
    expect(sanitizeCreatureNote('a'.repeat(max + 1))).toEqual({ ok: false, reason: 'too_long' });
    expect(sanitizeCreatureNote('a'.repeat(RULES.creatureNote.maxRawLength + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });

  it('refuses control, format, bidi, zero-width and separator characters', () => {
    for (const bad of ['a\u0000b', 'a\u0007b', 'a​b', 'a‮b', 'a b', 'a b']) {
      expect(sanitizeCreatureNote(bad), JSON.stringify(bad)).toEqual({
        ok: false,
        reason: 'forbidden_characters',
      });
    }
  });

  it('NFKC-normalises the text', () => {
    expect(sanitizeCreatureNote('ｆｕｌｌ')).toEqual({ ok: true, value: 'full' });
  });
});
