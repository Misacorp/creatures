/**
 * The Valley Games' event badge (a creature won that event): one generic medallion with two ribbon
 * tails, drawn by code in the art kit's ramps, tinted per event scene, with a tiny glyph of the event
 * in its middle. Kept generic on purpose (a badge is `{ eventId, wins }`): a new event gets a badge from
 * its scene or its kind without new art, and anything unknown gets the gold one with a star.
 */
import type { SpriteDef } from '../../sprites/sprite-data';
import { rampPalette } from './data/games-tiles';
import { PixelGrid } from './pixel';
import { RAMPS, type RampName } from './tint';

const INK = '#0d0a1a';
const WHITE = '#ffffff';

/** The badge's size in pixels. */
export const BADGE_SIZE = { width: 13, height: 16 } as const;

/** Glyphs, 5x5, `#` is ink. */
const GLYPHS = {
  flame: ['..#..', '.##..', '.###.', '#####', '.###.'],
  snow: ['#.#.#', '.###.', '##.##', '.###.', '#.#.#'],
  pepper: ['...#.', '..#..', '.###.', '####.', '.##..'],
  melon: ['.###.', '##.##', '#####', '#####', '.###.'],
  fin: ['...#.', '..##.', '.###.', '#####', '.....'],
  push: ['..#..', '...#.', '#####', '...#.', '..#..'],
  log: ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
  pumpkin: ['..#..', '.###.', '#####', '#####', '.###.'],
  bucket: ['#...#', '#####', '#.#.#', '#####', '.###.'],
  crate: ['#####', '##.##', '#.#.#', '##.##', '#####'],
  kite: ['..#..', '.###.', '#####', '.###.', '..#.#'],
  star: ['..#..', '#####', '.###.', '.#.#.', '#...#'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type BadgeGlyph = keyof typeof GLYPHS;

/** Each shipped scene's colour and glyph. */
const BY_SCENE: Readonly<Record<string, { ramp: RampName; glyph: BadgeGlyph }>> = {
  sauna: { ramp: 'ember', glyph: 'flame' },
  'frost-bath': { ramp: 'ice', glyph: 'snow' },
  'pepper-table': { ramp: 'red', glyph: 'pepper' },
  'melon-hill': { ramp: 'green', glyph: 'melon' },
  'shark-lake': { ramp: 'water', glyph: 'fin' },
  'ice-floe': { ramp: 'arctic', glyph: 'push' },
  'log-trail': { ramp: 'wood', glyph: 'log' },
  'pumpkin-hill': { ramp: 'orange', glyph: 'pumpkin' },
  'barrel-pond': { ramp: 'teal', glyph: 'bucket' },
  'crate-yard': { ramp: 'yellow', glyph: 'crate' },
  'kite-hill': { ramp: 'pink', glyph: 'kite' },
};

/** A scene the list above does not know yet: the kind's glyph, in gold. */
const BY_KIND: Readonly<Record<string, BadgeGlyph>> = {
  endure: 'flame',
  chase: 'melon',
  feast: 'pepper',
  swim: 'fin',
  shove: 'push',
  haul: 'log',
  fill: 'bucket',
  stack: 'crate',
  kite: 'kite',
};

/** The colour and glyph of an event's badge, from its scene, else its kind, else gold with a star. */
export function badgeLook(
  scene: string | undefined,
  kind: string | undefined,
): { ramp: RampName; glyph: BadgeGlyph } {
  const known = scene === undefined ? undefined : BY_SCENE[scene];
  if (known !== undefined) return known;
  return { ramp: 'gold', glyph: (kind === undefined ? undefined : BY_KIND[kind]) ?? 'star' };
}

/** The ribbon's colour: one for every badge, so the medallion's colour tells the events apart. */
const RIBBON: RampName = 'blue';

function drawBadge(glyph: BadgeGlyph): PixelGrid {
  const g = new PixelGrid(BADGE_SIZE.width, BADGE_SIZE.height);
  // Two ribbon tails under the medallion, each with a notch at its foot.
  for (const left of [2, 7]) {
    g.rect(left, 9, 4, 6, 'f');
    g.rect(left + 3, 9, 1, 6, 'g');
    g.set(left + 1, 15, 'f');
    g.set(left + 2, 15, 'g');
    for (let y = 9; y < 16; y++) {
      g.set(left - 1, y, 'k');
      g.set(left + 4, y, 'k');
    }
    g.set(left, 15, 'k');
    g.set(left + 3, 15, 'k');
  }
  // The medallion: an ink rim, a shaded ring lit from the top left, a light disc for the glyph.
  const cx = 6;
  const cy = 6;
  for (let y = 0; y < 13; y++) {
    for (let x = 0; x < 13; x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 > 42) continue;
      if (d2 > 30) g.set(x, y, 'k');
      else if (d2 > 14) {
        const lit = x + y < cx + cy - 2;
        const shade = x + y > cx + cy + 2;
        g.set(x, y, lit ? 'a' : shade ? 'd' : 'c');
      } else g.set(x, y, 'b');
    }
  }
  g.set(4, 3, 'w');
  g.stamp(
    GLYPHS[glyph].map((r) => r.replaceAll('#', 'k')),
    cx - 2,
    cy - 2,
  );
  return g;
}

const memo = new Map<string, SpriteDef>();

/** The badge sprite of an event (memoised: the same look gives back the same object). */
export function badgeSprite(scene: string | undefined, kind: string | undefined): SpriteDef {
  const look = badgeLook(scene, kind);
  const key = `${look.ramp}:${look.glyph}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const sprite = drawBadge(look.glyph).toSprite(
    rampPalette(RAMPS[look.ramp], RAMPS[RIBBON], { k: INK, w: WHITE }),
  );
  memo.set(key, sprite);
  return sprite;
}
