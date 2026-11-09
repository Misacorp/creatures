import { describe, expect, it } from 'vitest';
import { VALLEY_GLOW_CAMP_CONCEPTS } from './concepts/valley-glow-camp';
import { VALLEY_LEVELS_PADDOCK_CONCEPTS } from './concepts/valley-levels-paddock';

/** `PADDOCK_ROAM_OFFSET` in `valley/valley-art.ts`: the sprite's rectangle where creatures roam. */
const ROAM = { x: 8, y: 9, width: 33, height: 17 };

const level1 = VALLEY_GLOW_CAMP_CONCEPTS.sprites['paddock']!.sprite;
/** Level 1 with its three pebbles turned into ground flowers, as the level sprites draw them. */
const base1 = level1.rows.map((r) => r.replaceAll('p', 'j'));
const levels = Object.entries(VALLEY_LEVELS_PADDOCK_CONCEPTS.sprites);

function roam(rows: readonly string[]): string[] {
  return rows.slice(ROAM.y, ROAM.y + ROAM.height).map((r) => r.slice(ROAM.x, ROAM.x + ROAM.width));
}

describe('paddock levels', () => {
  it('has levels 2 to 5, all 64x51 like level 1', () => {
    expect(levels.map(([id]) => id)).toEqual(['paddock-2', 'paddock-3', 'paddock-4', 'paddock-5']);
    for (const [, c] of levels) {
      expect(c.sprite.rows).toHaveLength(level1.rows.length);
      for (const r of c.sprite.rows) expect(r).toHaveLength(64);
    }
  });

  it('keeps the roam rectangle exactly as level 1 draws it (nothing added in it)', () => {
    // Level 1's rectangle holds open grass (`.`) plus the back rail, the hay pile and the trough's left end;
    // every level has the same pixels there, so no level adds a non-grass pixel.
    const base = roam(base1);
    for (const [id, c] of levels) expect(roam(c.sprite.rows), id).toEqual(base);
  });

  it('keeps every pixel of the level below, adding only', () => {
    let below: readonly string[] = base1;
    for (const [id, c] of levels) {
      const rows = c.sprite.rows;
      const lost: string[] = [];
      below.forEach((r, y) => {
        [...r].forEach((ch, x) => {
          if (ch !== '.' && rows[y]![x] === '.') lost.push(`${x},${y}`);
        });
      });
      expect(lost, `${id} loses pixels`).toEqual([]);
      below = rows;
    }
  });

  it('uses at most 16 colours and a day palette that only recolours them', () => {
    for (const [, c] of levels) {
      expect(Object.keys(c.sprite.palette).length).toBeLessThanOrEqual(16);
      for (const k of Object.keys(c.alts!['day']!)) expect(c.sprite.palette).toHaveProperty(k);
    }
  });
});
