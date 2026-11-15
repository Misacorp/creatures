import { describe, expect, it } from 'vitest';
import { DM_LIMIT, SAMPLE_SETTLER, creatureLine, dmLayoutA, dmLayoutB } from './reset-dm';

describe('the goodbye DM layouts', () => {
  it('layout A is the plan draft and ends with the creature line', () => {
    const text = dmLayoutA(SAMPLE_SETTLER);
    expect(text).toContain('**You were one of the first settlers.**');
    expect(text).toContain(
      'First Mossling and Lanternfin on the server · Cleared depth 18 · 31 blueprints',
    );
    expect(text).toContain(
      '42 creatures, 612 levels in all · Highest: Pebbles the Mossling, level 31',
    );
    expect(text.split('\n').pop()).toMatch(/^Your creatures: Pebbles, Ember, Fizz, /);
  });

  it('layout B puts the headline feats on one line', () => {
    const text = dmLayoutB(SAMPLE_SETTLER);
    expect(text).toContain('42 creatures · 612 levels · Cleared depth 18 · 31 blueprints');
    expect(text.split('\n').length).toBeLessThan(dmLayoutA(SAMPLE_SETTLER).split('\n').length + 2);
  });

  it('both stay within 2,000 characters, also with a very long roster', () => {
    const long = {
      ...SAMPLE_SETTLER,
      names: Array.from({ length: 500 }, (_, i) => `Creature number ${String(i)}`),
    };
    for (const s of [SAMPLE_SETTLER, long]) {
      expect(dmLayoutA(s).length).toBeLessThanOrEqual(DM_LIMIT);
      expect(dmLayoutB(s).length).toBeLessThanOrEqual(DM_LIMIT);
    }
    expect(dmLayoutA(long)).toMatch(/and \d+ more$/);
  });

  it('cuts the creature list to the room it has', () => {
    expect(creatureLine(SAMPLE_SETTLER, 40).length).toBeLessThanOrEqual(40);
    expect(creatureLine(SAMPLE_SETTLER, 1)).toBe('Your creatures: 42 in all');
  });
});
