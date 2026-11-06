import { describe, expect, it } from 'vitest';
import { SCAFFOLD_STEPS, scaffoldSteps, scaffoldUp } from './scaffold';
import { glowSprite } from './valley-places';

const drawn = (rows: readonly string[]): number =>
  rows.reduce((n, row) => n + [...row].filter((c) => c !== '.').length, 0);

const topRow = (rows: readonly string[]): number =>
  rows.findIndex((row) => [...row].some((c) => c !== '.'));

describe('scaffolding that rises as a project fills (V-COM-6)', () => {
  it('steps: none at nothing, at least one once something is given, never the last step', () => {
    expect(scaffoldSteps(0)).toBe(0);
    expect(scaffoldSteps(-1)).toBe(0);
    expect(scaffoldSteps(Number.NaN)).toBe(0);
    expect(scaffoldSteps(0.001)).toBe(1);
    expect(scaffoldSteps(0.5)).toBe(6);
    expect(scaffoldSteps(1)).toBe(SCAFFOLD_STEPS - 1);
  });

  it('draws nothing at no steps, and more poles higher with each step', () => {
    for (const name of ['forge', 'road', 'paddock', 'bonfire', 'bonfire-grand'] as const) {
      const art = glowSprite(name);
      expect(drawn(scaffoldUp(art, 0).rows)).toBe(0);
      let last = Number.POSITIVE_INFINITY;
      for (const steps of [1, 4, 8, 11]) {
        const sprite = scaffoldUp(art, steps);
        expect(sprite.rows.length).toBe(art.rows.length);
        expect(sprite.rows[0]?.length).toBe(art.rows[0]?.length);
        expect(drawn(sprite.rows)).toBeGreaterThan(0);
        const top = topRow(sprite.rows);
        expect(top).toBeLessThanOrEqual(last);
        last = top;
      }
    }
  });

  it('is the same sprite for the same art and step (cached)', () => {
    const art = glowSprite('forge');
    expect(scaffoldUp(art, 5)).toBe(scaffoldUp(art, 5));
  });

  it('only uses colours of its own palette', () => {
    const sprite = scaffoldUp(glowSprite('forge'), 6);
    const keys = new Set(sprite.rows.join('').replaceAll('.', ''));
    for (const key of keys) expect(sprite.palette).toHaveProperty(key);
  });
});
