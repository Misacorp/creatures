import { describe, expect, it } from 'vitest';
import { expandRows } from './sprite-data';
import { VALLEY_GLOW_CONCEPTS } from './concepts/valley-glow';
import { VALLEY_LEVELS_SCHOOL_CONCEPTS } from './concepts/valley-levels-school';

const level1 = VALLEY_GLOW_CONCEPTS.sprites['school'];
if (level1 === undefined) throw new Error('no school');
const base = expandRows(level1.sprite);
const IDS = ['school-2', 'school-3', 'school-4', 'school-5'];

function rowsOf(id: string): string[] {
  const concept = VALLEY_LEVELS_SCHOOL_CONCEPTS.sprites[id];
  if (concept === undefined) throw new Error(`no ${id}`);
  return expandRows(concept.sprite);
}

describe('valley-levels-school', () => {
  it('lists five levels, all drawn at 60x50', () => {
    expect(VALLEY_LEVELS_SCHOOL_CONCEPTS.levels?.['school']).toHaveLength(5);
    for (const id of IDS) {
      const rows = rowsOf(id);
      expect(rows, id).toHaveLength(50);
      expect(new Set(rows.map((r) => r.length)), id).toEqual(new Set([60]));
    }
  });

  for (const id of IDS) {
    it(`${id} keeps the bell cupola and the door of level 1`, () => {
      const rows = rowsOf(id);
      for (let y = 7; y <= 12; y += 1) {
        expect(rows[y]?.slice(27, 33), `cupola row ${y}`).toBe(base[y]?.slice(27, 33));
      }
      // The door (x 26-33, rows 27-38) and the step below it stay where the yard expects them.
      for (let y = 27; y <= 40; y += 1) {
        expect(rows[y]?.slice(26, 34), `door row ${y}`).toBe(base[y]?.slice(26, 34));
      }
    });
  }
});
