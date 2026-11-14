import { describe, expect, it } from 'vitest';
import {
  FLAT_PLACES,
  SCAFFOLD_STEPS,
  groundWorkUp,
  scaffoldFor,
  scaffoldSteps,
  scaffoldUp,
} from './scaffold';
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
    for (const name of ['forge', 'market', 'school'] as const) {
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

describe('the ground-level look of a flat place (Misa, 2026-11-11)', () => {
  const flat = ['bonfire', 'bonfire-grand', 'paddock', 'road'] as const;

  it('the hearth, the Paddock and the Signpost road lie flat; the buildings keep the tall scaffold', () => {
    expect([...FLAT_PLACES].sort()).toEqual([...flat].sort());
    for (const name of ['forge', 'market', 'school', 'house', 'cave'] as const) {
      expect(FLAT_PLACES.has(name)).toBe(false);
      expect(scaffoldFor(name, 6)).toBe(scaffoldUp(glowSprite(name), 6));
    }
    for (const name of flat) expect(scaffoldFor(name, 6)).toBe(groundWorkUp(glowSprite(name), 6));
  });

  it('nothing at no steps, more with every step, and never tall: it stays in the art’s lowest rows', () => {
    for (const name of flat) {
      const art = glowSprite(name);
      expect(drawn(groundWorkUp(art, 0).rows)).toBe(0);
      let last = 0;
      let artBottom = 0;
      art.rows.forEach((row, y) => {
        if ([...row].some((c) => c !== '.')) artBottom = y;
      });
      for (let steps = 1; steps < SCAFFOLD_STEPS; steps++) {
        const sprite = groundWorkUp(art, steps);
        expect(sprite.rows.length).toBe(art.rows.length);
        expect(sprite.rows[0]?.length).toBe(art.rows[0]?.length);
        const count = drawn(sprite.rows);
        expect(count, `${name} step ${String(steps)}`).toBeGreaterThan(last);
        last = count;
        // Ground level: nothing rises more than 30 rows above the art's foot (a pole scaffold would reach the top).
        expect(topRow(sprite.rows)).toBeGreaterThanOrEqual(artBottom - 30);
        const keys = new Set(sprite.rows.join('').replaceAll('.', ''));
        for (const key of keys) expect(sprite.palette).toHaveProperty(key);
      }
    }
  });

  it('is the same sprite for the same art and step (cached)', () => {
    const art = glowSprite('paddock');
    expect(groundWorkUp(art, 4)).toBe(groundWorkUp(art, 4));
  });
});
