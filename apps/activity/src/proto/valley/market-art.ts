/**
 * The Market's plot and scaffolding (prototype): before it is built, the plot of bare earth where the stalls
 * will stand, and a wooden frame that rises one stage at a time as the server's gifts come in (V-COM-6). Built,
 * the `valley-glow` market stands there instead. Drawn over the same grass scene as the other new places.
 */
import { PixelGrid, gridPlacements } from '../../games/art/pixel';
import { dimmed, glowSprite, type Time } from './valley-places';
import { glowSceneDraw, glowSceneSpots } from './glow-scene-art';
import type { SceneGeometry } from './SceneFrame';
import type { Placement } from './valley-art';

const INK = '#0d0a1a';
const PALETTE = {
  k: INK,
  e: '#7a5c3c',
  f: '#5a4230',
  p: '#a67c4e',
  q: '#6f4e2e',
  w: '#d2a866',
  t: '#45c4a8',
  s: '#9a9aae',
  c: '#e8d8b0',
};

const PLOT_W = 60;
const PLOT_H = 48;

/** The plot and its frame at `stage` (0 to 4), 60 x 48 pixels like the place's sprite. */
export function scaffold(stage: number): PixelGrid {
  const g = new PixelGrid(PLOT_W, PLOT_H);
  // The plot: bare earth with a rim of stones.
  g.rect(2, 38, 56, 9, 'k');
  g.rect(3, 39, 54, 7, 'e');
  g.rect(3, 44, 54, 2, 'f');
  for (const x of [6, 18, 33, 47]) g.rect(x, 40, 3, 2, 's');
  if (stage >= 1) {
    // Stacked boards and the first corner posts.
    g.rect(40, 34, 12, 4, 'k');
    g.rect(41, 35, 10, 2, 'w');
    for (const x of [6, 52]) {
      g.rect(x - 1, 22, 4, 17, 'k');
      g.rect(x, 23, 2, 15, 'p');
    }
  }
  if (stage >= 2) {
    // The posts grow and a cross plank joins them.
    for (const x of [6, 52]) {
      g.rect(x - 1, 10, 4, 12, 'k');
      g.rect(x, 11, 2, 11, 'p');
    }
    g.rect(5, 24, 50, 4, 'k');
    g.rect(6, 25, 48, 2, 'w');
  }
  if (stage >= 3) {
    // A middle post, a second plank and the first awning.
    g.rect(28, 12, 4, 27, 'k');
    g.rect(29, 13, 2, 25, 'q');
    g.rect(5, 12, 50, 4, 'k');
    g.rect(6, 13, 48, 2, 'w');
    g.rect(8, 16, 18, 6, 'k');
    g.rect(9, 17, 16, 4, 't');
  }
  if (stage >= 4) {
    // The second awning, a roof beam and the crystal waiting on its post.
    g.rect(34, 16, 18, 6, 'k');
    g.rect(35, 17, 16, 4, 'c');
    g.rect(3, 6, 54, 4, 'k');
    g.rect(4, 7, 52, 2, 'p');
    g.rect(27, 0, 6, 6, 'k');
    g.rect(28, 1, 4, 4, 't');
  }
  return g;
}

/** The scene: the grass and the poster of the other new places, the plot and its frame, or the built Market. */
export function marketDraw(spec: { time: Time; built: boolean; stage: number }) {
  const { time, built, stage } = spec;
  const base = glowSceneDraw({ name: 'market', time });
  const market = glowSprite('market', time);
  return (g: SceneGeometry): Placement[] => {
    const all = base(g);
    if (built) return all;
    const at = glowSceneSpots(g);
    const frame = gridPlacements(scaffold(stage), PALETTE, at.place.x, at.place.y);
    const shaded =
      time === 'night' ? frame.map((p) => ({ ...p, sprite: dimmed(p.sprite) })) : frame;
    // The built Market's own sprite is left out until it is paid for.
    return [...all.filter((p) => p.sprite !== market), ...shaded];
  };
}
