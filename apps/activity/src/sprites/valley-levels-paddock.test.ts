import { describe, expect, it } from 'vitest';
import { PADDOCK_ROAM, VALLEY_LEVELS_PADDOCK_CONCEPTS } from './concepts/valley-levels-paddock';

const levels = Object.entries(VALLEY_LEVELS_PADDOCK_CONCEPTS.sprites);
/** Keys that are ground: transparent (grass shows) and the lantern's light lying on it. */
const GROUND = new Set(['.', '1', '2', '3']);

describe('paddock levels', () => {
  it('has levels 1 to 5, all 64x64', () => {
    expect(levels.map(([id]) => id)).toEqual([1, 2, 3, 4, 5].map((n) => `paddock-${n}`));
    expect(VALLEY_LEVELS_PADDOCK_CONCEPTS.levels?.['paddock']).toHaveLength(5);
    for (const [, c] of levels) {
      expect(c.sprite.rows).toHaveLength(64);
      for (const r of c.sprite.rows) expect(r).toHaveLength(64);
    }
  });

  it('keeps the roam rectangle open ground at every level', () => {
    expect(PADDOCK_ROAM.y + PADDOCK_ROAM.height).toBeLessThanOrEqual(64);
    expect(PADDOCK_ROAM.x + PADDOCK_ROAM.width).toBeLessThanOrEqual(64);
    for (const [id, c] of levels) {
      const bad: string[] = [];
      for (let y = PADDOCK_ROAM.y; y < PADDOCK_ROAM.y + PADDOCK_ROAM.height; y++) {
        for (let x = PADDOCK_ROAM.x; x < PADDOCK_ROAM.x + PADDOCK_ROAM.width; x++) {
          const ch = c.sprite.rows[y]![x]!;
          if (!GROUND.has(ch)) bad.push(`${x},${y}=${ch}`);
        }
      }
      expect(bad, id).toEqual([]);
    }
  });

  it('uses at most 16 colours and a day palette that only recolours them', () => {
    for (const [, c] of levels) {
      expect(Object.keys(c.sprite.palette).length).toBeLessThanOrEqual(16);
      for (const k of Object.keys(c.alts!['day']!)) expect(c.sprite.palette).toHaveProperty(k);
    }
  });
});
