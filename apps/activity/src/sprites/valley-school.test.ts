import { describe, expect, it } from 'vitest';
import { expandRows } from './sprite-data';
import { VALLEY_GLOW_CONCEPTS } from './concepts/valley-glow';
import { VALLEY_SCHOOL_CONCEPTS } from './concepts/valley-school';

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

  it('keeps the four seats clear and the cap off the face', () => {
    const cap = VALLEY_SCHOOL_CONCEPTS.sprites['teacher-cap'];
    for (const worn of Object.values(cap?.variants ?? {})) {
      const rows = expandRows(worn);
      expect(rows).toHaveLength(16);
    }
  });
});
