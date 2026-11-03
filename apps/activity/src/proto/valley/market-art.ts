/**
 * The Market's plot (prototype): before it is built, the stall goes up plank by plank as the server's gifts
 * come in, the same pattern as the hearth's stones (V-COM-6): planks laid are solid wood, planks still to come
 * are hollow ink outlines (a shape, not only a colour). Built, the `valley-glow` market stands there instead.
 */
import { PixelGrid, gridPlacements } from '../../games/art/pixel';
import { dimmed, glowSprite, type Time } from './valley-places';
import { glowSceneDraw, glowLayout } from './glow-scene-art';
import type { SceneGeometry } from './SceneFrame';
import type { SpriteDef } from '../../sprites/sprite-data';
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

const PLOT_W = 60;
const PLOT_H = 48;
const COLUMNS = 3;
const ROWS = 4;

/** Where plank `i` goes (bottom row first, left to right): its top-left in the plot's pixels. */
export function plankSpot(i: number): { x: number; y: number } {
  const row = Math.floor(i / COLUMNS);
  return { x: 2 + (i % COLUMNS) * 19, y: PLOT_H - 10 - row * 10 };
}

/** The plot with `laid` planks solid and the rest hollow, 60 x 48 pixels like the place's sprite. */
export function planks(laid: number): PixelGrid {
  const g = new PixelGrid(PLOT_W, PLOT_H);
  for (let i = 0; i < COLUMNS * ROWS; i++) {
    const { x, y } = plankSpot(i);
    g.rect(x, y, 18, 9, 'k');
    if (i < laid) {
      g.rect(x + 1, y + 1, 16, 7, 'w');
      g.rect(x + 1, y + 1, 16, 1, 'p');
      g.rect(x + 1, y + 7, 16, 1, 'q');
    } else {
      g.rect(x + 1, y + 1, 16, 7, '.');
    }
  }
  return g;
}

/** The scene: the grass and sky of the other new places, the planks laid so far, or the built Market. */
export function marketDraw(spec: { time: Time; built: boolean; stage: number }) {
  const { time, built, stage } = spec;
  const base = glowSceneDraw({ name: 'market', time });
  const market = glowSprite('market', time);
  return (g: SceneGeometry): Placement[] => {
    const all = base(g);
    if (built) return all;
    const art = glowLayout(g, 'market').art;
    const frame = gridPlacements(planks(stage), PALETTE, art.x, art.y);
    const shaded =
      time === 'night' ? frame.map((p) => ({ ...p, sprite: dimmed(p.sprite) })) : frame;
    // The built Market's own sprite is left out until it is paid for.
    return [...all.filter((p) => p.sprite !== market), ...shaded];
  };
}
