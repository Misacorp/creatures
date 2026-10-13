import { describe, expect, it } from 'vitest';
import type { RosterEntry } from './raid-api';
import { AVATAR_LIMIT, avatarStrip, initialOf, rosterCountText, rosterNote } from './raid-roster';

const entry = (displayName: string, you = false, party = 1): RosterEntry => ({
  displayName,
  you,
  party,
});

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

describe('avatarStrip', () => {
  it('puts you first, then the roster in order, with the same colour as the party row', () => {
    const { shown, extra } = avatarStrip([entry('Ann'), entry('Bob', true), entry('Cy')]);
    expect(shown.map((a) => a.name)).toEqual(['Bob', 'Ann', 'Cy']);
    expect(shown.find((a) => a.name === 'Cy')?.colour).toBe(2);
    expect(extra).toBe(0);
  });

  it('shows at most the limit and counts the rest', () => {
    const roster = Array.from({ length: 12 }, (_, i) => entry(`P${String(i)}`));
    const { shown, extra } = avatarStrip(roster);
    expect(shown).toHaveLength(AVATAR_LIMIT);
    expect(extra).toBe(12 - AVATAR_LIMIT);
  });

  it('is empty for an empty roster', () => {
    expect(avatarStrip([])).toEqual({ shown: [], extra: 0 });
  });
});

describe('rosterCountText', () => {
  it('says how many are in', () => {
    expect(rosterCountText(0)).toBe('Nobody in yet');
    expect(rosterCountText(1)).toBe('1 player this week');
    expect(rosterCountText(5)).toBe('5 players this week');
  });
});

describe('rosterNote', () => {
  it('marks you, and the party only when there are several', () => {
    const one = [{ party: 1, size: 3 }];
    const two = [...one, { party: 2, size: 3 }];
    expect(rosterNote({ you: true, party: 1 }, one)).toBe('you');
    expect(rosterNote({ you: false, party: 2 }, one)).toBe('');
    expect(rosterNote({ you: true, party: 2 }, two)).toBe('you, party 2');
    expect(rosterNote({ you: false, party: 1 }, two)).toBe('party 1');
  });
});
