import { describe, expect, it } from 'vitest';
import { content, lore } from '@creatures/game';
import {
  BOSS_SIZE,
  CREATURE_SIZE,
  FALLBACK_SILHOUETTE,
  bossSprite,
  creatureSprite,
  creatureSpriteOrFallback,
} from './creature-sprites';
import { shinyPalette } from '../art';
import { expandRows, parseSprite, swapPalette, type SpriteDef } from './sprite-data';

const INK = '#0d0a1a';

/** The solid shape of a sprite, one `#` per coloured pixel. */
function silhouette(def: SpriteDef): string {
  return expandRows(def)
    .map((row) => row.replace(/[^.]/g, '#'))
    .join('/');
}

/** Width and height of the drawn pixels. */
function bounds(def: SpriteDef): { width: number; height: number } {
  const { cells } = parseSprite(def);
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  return {
    width: Math.max(...xs) - Math.min(...xs) + 1,
    height: Math.max(...ys) - Math.min(...ys) + 1,
  };
}

const entries: { id: string; kind: 'species' | 'boss'; def: SpriteDef | undefined }[] = [
  ...content.creatures.map((c) => ({
    id: c.id,
    kind: 'species' as const,
    def: creatureSprite(c.id),
  })),
  ...content.bosses.map((b) => ({ id: b.id, kind: 'boss' as const, def: bossSprite(b.id) })),
];

describe('every content sprite', () => {
  it('exists for all species, bosses and guests', () => {
    for (const { id, kind, def } of entries) expect(def, `${kind} ${id}`).toBeDefined();
    for (const guest of content.guests) {
      expect(creatureSprite(guest.species), `guest ${guest.id}`).toBeDefined();
    }
    for (const c of content.creatures) {
      expect(creatureSpriteOrFallback(c.id), c.id).not.toBe(FALLBACK_SILHOUETTE);
    }
  });

  it('has the right size and only palette keys it defines', () => {
    for (const { id, kind, def } of entries) {
      if (def === undefined) continue;
      const size = kind === 'boss' ? BOSS_SIZE : CREATURE_SIZE;
      // parseSprite checks the size, that every row is as wide as the first and that every pixel
      // key is in the palette; the palette must not carry keys that no pixel uses either.
      expect(() => parseSprite(def, size), id).not.toThrow();
      const used = new Set(expandRows(def).join(''));
      for (const key of Object.keys(def.palette))
        expect(used.has(key), `${id} key ${key}`).toBe(true);
    }
  });

  it('has a one-pixel ink outline that is not cut off by the canvas edge', () => {
    // On the canvas edge a boss is ink or empty. A creature's ears, antlers, tail, wing or ray may
    // touch the edge, but only in a feature colour of its own, never in a body colour (`b`, `h`, `s`
    // or `p`), so the body itself is never cut off.
    const bodyKeys = ['b', 'h', 's', 'p'];
    for (const { id, kind, def } of entries) {
      if (def === undefined) continue;
      expect(def.palette.k, id).toBe(INK);
      const rows = expandRows(def);
      const last = rows.length - 1;
      for (const [y, row] of rows.entries()) {
        for (const [x, ch] of [...row].entries()) {
          const onEdge = x === 0 || y === 0 || x === row.length - 1 || y === last;
          if (!onEdge) continue;
          const where = `${id} ${String(x)},${String(y)}`;
          if (kind === 'boss') expect(['.', 'k'], where).toContain(ch);
          else expect(bodyKeys, where).not.toContain(ch);
        }
      }
    }
  });

  it('draws every creature with the same chibi face, in the same place', () => {
    // Eyes: a 2x2 block with the white highlight at the top outer corner, rows 8-9, x 4-5 and 10-11.
    // Blush at x 3 and 12 and a two-pixel mouth at x 7-8, all on row 10.
    for (const c of content.creatures) {
      const def = creatureSprite(c.id);
      if (def === undefined) continue;
      const rows = expandRows(def);
      const at = (y: number, x: number): string => rows[y]?.[x] ?? '?';
      expect([at(8, 4), at(8, 5), at(9, 4), at(9, 5)].join(''), c.id).toBe('ekkk');
      expect([at(8, 10), at(8, 11), at(9, 10), at(9, 11)].join(''), c.id).toBe('kekk');
      expect([at(10, 3), at(10, 12)].join(''), c.id).toBe('qq');
      expect([at(10, 7), at(10, 8)].join(''), c.id).toBe('kk');
      expect(def.palette.e, c.id).toBe('#fbf8ec');
      expect(def.palette.q, c.id).toBe('#ff8fab');
    }
  });

  it('uses a small palette (the brief colours, shades, ink and one highlight)', () => {
    for (const { id, def } of entries) {
      if (def === undefined) continue;
      expect(Object.keys(def.palette).length, id).toBeLessThanOrEqual(11);
    }
  });

  it('fills a sensible part of its canvas', () => {
    for (const { id, kind, def } of entries) {
      if (def === undefined) continue;
      const { width, height } = bounds(def);
      const full = kind === 'boss' ? BOSS_SIZE.width : CREATURE_SIZE.width;
      // Even a tiny creature is at least 7 px wide with its outline; nothing is smaller than 8 tall.
      expect(width, `${id} width`).toBeGreaterThanOrEqual(kind === 'boss' ? 16 : 7);
      expect(height, `${id} height`).toBeGreaterThanOrEqual(kind === 'boss' ? 16 : 8);
      expect(width).toBeLessThanOrEqual(full);
      expect(height).toBeLessThanOrEqual(full);
    }
  });

  it('has a different silhouette for every species and boss', () => {
    const seen = new Map<string, string>();
    for (const { id, def } of entries) {
      if (def === undefined) continue;
      const shape = silhouette(def);
      expect(seen.get(shape), `${id} repeats ${seen.get(shape) ?? ''}`).toBeUndefined();
      seen.set(shape, id);
    }
  });

  it('keeps every creature clearly different from every other (all share a round chibi body)', () => {
    // The creatures share one blob body, so what sets them apart is their top features, ears,
    // wings and tails. Any two silhouettes must differ in at least this many pixels.
    const MIN_DIFFERENT_PIXELS = 12;
    const shapes = content.creatures.map((c) => {
      const def = creatureSprite(c.id);
      if (def === undefined) throw new Error(`no sprite for ${c.id}`);
      return { id: c.id, rows: expandRows(def).map((row) => [...row].map((ch) => ch !== '.')) };
    });
    for (const [i, a] of shapes.entries()) {
      for (const b of shapes.slice(i + 1)) {
        let different = 0;
        for (const [y, row] of a.rows.entries()) {
          for (const [x, filled] of row.entries()) {
            if (filled !== b.rows[y]?.[x]) different += 1;
          }
        }
        expect(different, `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(MIN_DIFFERENT_PIXELS);
      }
    }
  });

  it('draws bosses bigger than any creature', () => {
    const biggest = Math.max(
      ...content.creatures.map((c) => {
        const def = creatureSprite(c.id);
        return def === undefined ? 0 : parseSprite(def).cells.length;
      }),
    );
    for (const boss of content.bosses) {
      const def = bossSprite(boss.id);
      expect(def, boss.id).toBeDefined();
      if (def !== undefined) expect(parseSprite(def).cells.length).toBeGreaterThan(biggest);
    }
  });

  it('keeps a stage 2 form at least as big as its stage 1 form (by bounding box)', () => {
    for (const c of content.creatures) {
      if (c.stage !== 2) continue;
      const from = content.creatures.find((s) => s.evolvesTo?.species === c.id);
      const a = from === undefined ? undefined : creatureSprite(from.id);
      const b = creatureSprite(c.id);
      if (from === undefined || a === undefined || b === undefined) continue;
      const big = bounds(b);
      const small = bounds(a);
      expect(big.width * big.height, `${c.id} vs ${from.id}`).toBeGreaterThanOrEqual(
        small.width * small.height,
      );
    }
  });

  it('has an entry in the lore for each sprite (the brief it is drawn from)', () => {
    for (const { id, kind } of entries) {
      const brief = kind === 'boss' ? lore.bosses[id] : lore.species[id];
      expect(brief, `${kind} ${id}`).toBeDefined();
    }
  });

  it('has a shiny palette swap for every species that changes the look but not the outline', () => {
    for (const c of content.creatures) {
      const def = creatureSprite(c.id);
      const shiny = shinyPalette(c.id);
      expect(shiny, c.id).toBeDefined();
      if (def === undefined || shiny === undefined) continue;
      expect(Object.keys(shiny).length, c.id).toBeGreaterThan(0);
      for (const [key, colour] of Object.entries(shiny)) {
        expect(Object.hasOwn(def.palette, key), `${c.id} key ${key}`).toBe(true);
        expect(['k', 'e'], `${c.id} key ${key}`).not.toContain(key);
        expect(colour, c.id).toMatch(/^#[0-9a-f]{6}$/);
        expect(colour, `${c.id} ${key}`).not.toBe(def.palette[key]);
      }
      const swapped = swapPalette(def, shiny);
      expect(() => parseSprite(swapped, CREATURE_SIZE), c.id).not.toThrow();
      expect(swapped.palette.k).toBe(INK);
      expect(silhouette(swapped)).toBe(silhouette(def));
    }
  });
});
