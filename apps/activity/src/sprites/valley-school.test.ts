import { describe, expect, it } from 'vitest';
import { expandRows } from './sprite-data';
import { VALLEY_GLOW_CONCEPTS } from './concepts/valley-glow';
import { VALLEY_SCHOOL_CONCEPTS } from './concepts/valley-school';
import { BUNDLED_CREATURE_SPRITES } from './creature-sprites';

describe('valley-school concepts', () => {
  it('draws the resting bell with the School cupola pixels exactly', () => {
    const school = VALLEY_GLOW_CONCEPTS.sprites['school'];
    const bell = VALLEY_SCHOOL_CONCEPTS.sprites['school-bell'];
    expect(school).toBeDefined();
    expect(bell).toBeDefined();
    if (school === undefined || bell === undefined) return;
    const rows = expandRows(school.sprite);
    const patch = expandRows(bell.sprite);
    for (const [y, row] of patch.entries()) {
      expect(rows[7 + y]?.slice(27, 33)).toBe(row);
    }
    for (const [key, colour] of Object.entries(bell.sprite.palette)) {
      expect(school.sprite.palette[key]).toBe(colour);
    }
  });

  it('puts the cap on each creature without touching its face rows', () => {
    const cap = VALLEY_SCHOOL_CONCEPTS.sprites['teacher-cap'];
    const variants = Object.entries(cap?.variants ?? {});
    expect(variants.length).toBeGreaterThan(0);
    for (const [name, worn] of variants) {
      const base = BUNDLED_CREATURE_SPRITES[name.replace(/^on-/, '')];
      if (base === undefined) throw new Error(`no creature for ${name}`);
      const rows = expandRows(worn);
      const plain = expandRows(base);
      expect(rows, name).toHaveLength(16);
      // The chibi face (eyes x 4-5 and 10-11 on rows 8-9, blush on row 10) stays exactly as drawn, colours
      // too; the tassel may hang beside it, outside x 3 to 12.
      const face = (r: readonly string[]): string[] =>
        [8, 9, 10].map((y) => r[y]?.slice(3, 13) ?? '');
      expect(face(rows), name).toEqual(face(plain));
      for (const key of new Set(face(plain).join(''))) {
        if (key !== '.') expect(worn.palette[key], `${name} key ${key}`).toBe(base.palette[key]);
      }
    }
  });
});
