/**
 * The Market's plot (prototype): before it is built, the Market's own `valley-glow` sprite is being built where
 * it will stand (V-COM-6). What is paid for is drawn in full, from the ground up (12 steps, a step is a twelfth of
 * the sprite's height); the rest is only a faint ink outline of the same sprite (hollow, a shape and not a
 * colour), the same pattern as the hearth's stones to come. Built, the whole sprite stands there.
 */
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

/** The silhouette's edge of the rows still to come, one ink pixel thick: hollow, nothing inside. */
export function outlineToCome(sprite: SpriteDef, laid: number): SpriteDef {
  const height = sprite.rows.length;
  const rows = Math.min(height, Math.ceil((height * laid) / STEPS));
  const edge = (x: number, y: number): boolean => {
    const row = sprite.rows[y] ?? '';
    if (!filled(row, x)) return false;
    return [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ].some(([nx = 0, ny = 0]) => !filled(sprite.rows[ny] ?? '', nx));
  };
  return {
    palette: { k: INK },
    rows: sprite.rows.map((row, y) =>
      y >= height - rows
        ? '.'.repeat(row.length)
        : [...row].map((_, x) => (edge(x, y) ? 'k' : '.')).join(''),
    ),
  };
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
    const outline = outlineToCome(market, stage);
    out.push({ sprite: time === 'night' ? dimmed(outline) : outline, x: art.x, y: art.y });
    if (stage > 0) out.push({ sprite: builtPart(market, stage), x: art.x, y: art.y });
    return out;
  };
}
