/**
 * The Market's plot (prototype): before it is built, the Market's own `valley-glow` sprite is being built where
 * it will stand (V-COM-6). What is paid for is drawn in full, from the ground up (12 steps, a step is a twelfth of
 * the sprite's height); above it stands plain wooden scaffolding (poles and boards, `scaffoldToCome`), so the
 * unbuilt part reads as building work and not as a see-through ghost of the sprite (Misa, 2026-11-04). Built, the whole sprite stands there.
 */
import { PixelGrid } from '../../games/art/pixel';
import type { SpriteDef } from '../../sprites/sprite-data';
import { dimmed, glowSprite, type Time } from './valley-places';
import { glowSceneDraw, glowLayout } from './glow-scene-art';
import type { SceneGeometry } from './SceneFrame';
import type { Placement } from './valley-art';

const INK = '#0d0a1a';
const PALETTE = { k: INK, w: '#d2a866', p: '#a67c4e', q: '#7a5636' };

/** One plank for the row in the give sheet (8 x 4 pixels): laid is solid wood, to come a hollow ink outline. */
export const PLANK_UP: SpriteDef = {
  rows: ['kkkkkkkk', 'kppppppk', 'kqqqqqqk', 'kkkkkkkk'],
  palette: PALETTE,
};
export const PLANK_TO_COME: SpriteDef = {
  rows: ['kkkkkkkk', 'k......k', 'k......k', 'kkkkkkkk'],
  palette: PALETTE,
};

/** The steps the stall goes up in (the same as `STAGES` in `market-sample.ts`). */
const STEPS = 12;

const filled = (row: string, x: number): boolean => row[x] !== undefined && row[x] !== '.';

/** The sprite's rows from the ground up to step `laid` (the rest blank), at full colour. */
export function builtPart(sprite: SpriteDef, laid: number): SpriteDef {
  const height = sprite.rows.length;
  const rows = Math.min(height, Math.ceil((height * laid) / STEPS));
  const blank = '.'.repeat(sprite.rows[0]?.length ?? 0);
  return {
    ...sprite,
    rows: sprite.rows.map((row, y) => (y >= height - rows ? row : blank)),
  };
}

/** The wood of the scaffolding: dark poles and boards in two browns, nothing of the finished sprite's colours. */
const SCAFFOLD = { k: INK, p: '#a67c4e', q: '#7a5636' };

/** The first row of the sprite that is built at step `laid` (rows from here down are the built part). */
export function builtTop(sprite: SpriteDef, laid: number): number {
  const height = sprite.rows.length;
  const rows = Math.min(height, Math.ceil((height * laid) / STEPS));
  return height - rows;
}

/**
 * Scaffolding for the rows still to come, the same size as the sprite: three upright poles from the top of the
 * finished shape down to the built part, a board across them every 12 rows and one cross brace. Plain wood, so it
 * reads as building work, not as a ghost of the finished stall. Nothing at or below the built part.
 */
export function scaffoldToCome(sprite: SpriteDef, laid: number): SpriteDef {
  const height = sprite.rows.length;
  const width = sprite.rows[0]?.length ?? 0;
  const grid = new PixelGrid(width, height);
  const bottom = builtTop(sprite, laid);
  let top = height;
  let left = width;
  let right = -1;
  for (const [y, row] of sprite.rows.entries()) {
    for (const [x, ch] of [...row].entries()) {
      if (ch === '.') continue;
      top = Math.min(top, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  // A step from the top is just the roof going on: no scaffolding left to show.
  if (right < 0 || bottom - top < 4) return grid.toSprite(SCAFFOLD);
  const span = right - left;
  const poles = [left + 1, left + Math.floor(span / 2), right - 2];
  for (const x of poles) {
    grid.rect(x, top, 2, bottom - top, 'q');
    grid.rect(x, top, 1, bottom - top, 'p');
  }
  for (let y = bottom - 3; y >= top + 1; y -= 12) {
    grid.rect(left, y, span + 1, 2, 'p');
    grid.rect(left, y + 1, span + 1, 1, 'q');
  }
  // One diagonal brace across the lowest bay, from the first pole to the middle one.
  const first = poles[0] ?? left;
  const mid = poles[1] ?? left;
  const rise = Math.min(bottom - top - 5, 11);
  for (let i = 0; i <= mid - first; i++) {
    grid.set(first + i, bottom - 3 - Math.round((i * rise) / Math.max(1, mid - first)), 'q');
  }
  return grid.toSprite(SCAFFOLD);
}

/** The scene: the grass and sky of the other new places, the Market going up at the art's place, or built. */
export function marketDraw(spec: { time: Time; built: boolean; stage: number }) {
  const { time, built, stage } = spec;
  const base = glowSceneDraw({ name: 'market', time });
  const market = glowSprite('market', time);
  return (g: SceneGeometry): Placement[] => {
    const all = base(g);
    if (built) return all;
    const art = glowLayout(g, 'market').art;
    const out = all.filter((p) => p.sprite !== market);
    const scaffold = scaffoldToCome(market, stage);
    out.push({ sprite: time === 'night' ? dimmed(scaffold) : scaffold, x: art.x, y: art.y });
    if (stage > 0) out.push({ sprite: builtPart(market, stage), x: art.x, y: art.y });
    return out;
  };
}
