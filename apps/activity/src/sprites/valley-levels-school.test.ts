import { describe, expect, it } from 'vitest';
import { expandRows } from './sprite-data';
import {
  SCHOOL_BELL_BOXES,
  SCHOOL_BELL_KEYS,
  SCHOOL_DOOR,
  SCHOOL_SIZE,
  VALLEY_LEVELS_SCHOOL_CONCEPTS,
} from './concepts/valley-levels-school';

const LEVELS = [1, 2, 3, 4, 5] as const;

function rowsOf(level: number): string[] {
  const concept = VALLEY_LEVELS_SCHOOL_CONCEPTS.sprites[`school-${String(level)}`];
  if (concept === undefined) throw new Error(`no school-${String(level)}`);
  return expandRows(concept.sprite);
}

describe('valley-levels-school', () => {
  it('lists the five levels in order', () => {
    expect(VALLEY_LEVELS_SCHOOL_CONCEPTS.levels?.['school']).toEqual(
      LEVELS.map((l) => `valley-levels-school/school-${String(l)}`),
    );
  });

  for (const level of LEVELS) {
    describe(`level ${String(level)}`, () => {
      const rows = rowsOf(level);

      it('is 64x64', () => {
        expect(rows).toHaveLength(SCHOOL_SIZE);
        expect(new Set(rows.map((r) => r.length))).toEqual(new Set([SCHOOL_SIZE]));
      });

      it('has the door at x 31-32 on the same rows, ending on the base row', () => {
        for (let y = SCHOOL_DOOR.top; y <= SCHOOL_DOOR.bottom; y += 1)
          for (const x of [SCHOOL_DOOR.x0, SCHOOL_DOOR.x1])
            expect(rows[y]?.[x], `${String(x)},${String(y)}`).toBe('d');
        // the door is no taller than the shared rows
        expect(rows[SCHOOL_DOOR.top - 1]?.[SCHOOL_DOOR.x0]).not.toBe('d');
        expect(rows[SCHOOL_DOOR.bottom + 1]?.[SCHOOL_DOOR.x0]).not.toBe('d');
      });

      it('holds bell pixels in its bell box', () => {
        const [bx, by] = SCHOOL_BELL_BOXES[level];
        let bell = 0;
        for (let y = by; y < by + 6; y += 1)
          for (let x = bx; x < bx + 6; x += 1)
            if (SCHOOL_BELL_KEYS.includes(rows[y]?.[x] ?? '.')) bell += 1;
        expect(bell).toBeGreaterThanOrEqual(10);
      });
    });
  }

  it('moves the bell from a post to a tower on the door axis', () => {
    expect(SCHOOL_BELL_BOXES[1][0]).toBeGreaterThan(44);
    expect(SCHOOL_BELL_BOXES[2][0]).toBeGreaterThan(44);
    for (const level of [3, 4, 5] as const) expect(SCHOOL_BELL_BOXES[level][0]).toBe(29);
  });
});
