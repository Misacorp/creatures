/**
 * The Bonfire's scene as a canvas (`BonfireCanvas.tsx`; the rule is "A place is a canvas" in `ux-patterns.md`): the fire in its meadow
 * fills the window, the clickable cluster (the fire, the seats round it) stays centred, and the new edges of a wide window are dressed
 * with quiet pieces (the valley map's trees, pines, bushes, rocks and flowers) with no plate and no tap. Pure: the scene's size goes in,
 * placements and boxes come out. The ground is the place scene's (`place-scene.ts`: grass to every edge, the valley's sky above it).
 */
import type { SpriteDef } from '../sprites/sprite-data';
import { WORLD_MAP_SPRITE_DATA } from '../sprites/data/world-map-sprites';
import type { SceneGeometry } from './SceneFrame';
import {
  SKY_BELOW_ART_TOP,
  grassTo,
  placeArtBox,
  skyBackdrop,
  treesAround,
  type ArtBox,
} from './place-scene';
import { scaffoldFor } from './scaffold';
import { glowSprite, type MapName } from './valley-places';
import type { Placement } from './valley-art';

/** Scene pixels each side of the art's middle that the cluster takes (the seats, the visitors' seats, the trees round them): no dressing there. */
export const CLUSTER_HALF = 110;

type Dressing = 'smallPine' | 'smallTree' | 'bush' | 'flowers' | 'rock';

/**
 * Rows of dressing, back to front: where each stands (`from`: scene pixels under the grass line, or under the art's bottom edge), how far
 * apart its pieces are, where the first stands past the cluster, and what comes in turn. Trees stand on the grass line or just in front
 * of it, never on the hills; low pieces fill the meadow down to the bottom edge.
 */
const ROWS: readonly {
  at: 'grass' | 'art';
  from: number;
  step: number;
  phase: number;
  kinds: readonly Dressing[];
}[] = [
  { at: 'grass', from: 6, step: 34, phase: 0, kinds: ['smallPine', 'smallTree', 'smallPine'] },
  { at: 'grass', from: 26, step: 44, phase: 15, kinds: ['smallTree', 'smallPine'] },
  { at: 'art', from: 8, step: 30, phase: 9, kinds: ['bush', 'flowers', 'rock', 'flowers'] },
  { at: 'art', from: 42, step: 38, phase: 22, kinds: ['flowers', 'rock', 'bush'] },
  { at: 'art', from: 76, step: 50, phase: 4, kinds: ['smallTree', 'bush', 'flowers'] },
];

/** One sprite's width in its own pixels. */
function widthOf(sprite: SpriteDef): number {
  return sprite.rows[0]?.length ?? 0;
}

/**
 * The quiet pieces at the edges of a scene `g.W` wide, past the cluster's `CLUSTER_HALF` each side of the art's middle, back to front
 * (drawn in this order). The right side starts one piece along so the two sides do not mirror. Nothing here is clickable.
 */
export function edgeDressing(g: SceneGeometry, box: ArtBox): Placement[] {
  const wm = WORLD_MAP_SPRITE_DATA;
  const middle = box.x + box.width / 2;
  const grass = box.y + SKY_BELOW_ART_TOP;
  const out: (Placement & { base: number })[] = [];
  for (const row of ROWS) {
    const base = row.at === 'grass' ? grass + row.from : box.y + box.height + row.from;
    // A piece's feet are on `base`; one that would stand below the scene is left out.
    if (!(base < g.H)) continue;
    for (const side of [-1, 1] as const) {
      for (let k = 0; ; k += 1) {
        const kind = row.kinds[(k + (side === 1 ? 1 : 0)) % row.kinds.length] ?? 'bush';
        const sprite = wm[kind];
        const reach = CLUSTER_HALF + row.phase + k * row.step;
        const x =
          side === -1 ? Math.round(middle - reach - widthOf(sprite)) : Math.round(middle + reach);
        // Written so a scene with no size (NaN) ends the row instead of looping.
        if (!(x + widthOf(sprite) > 0 && x < g.W)) break;
        out.push({ sprite, x, y: base - sprite.rows.length, base });
      }
    }
  }
  return out.sort((a, b) => a.base - b.base).map(({ sprite, x, y }) => ({ sprite, x, y }));
}

/**
 * The scene: grass and sky to every edge, the edges dressed, the trees round the place, the fire (`art`: the fire or the grand hearth at
 * the place's level) in the middle, and the scaffolding rising round it as its project fills (`steps`, V-COM-6; 0 for none).
 */
export function bonfireSceneDraw(art: MapName, steps: number) {
  return (g: SceneGeometry): Placement[] => {
    const box = placeArtBox(g, art);
    return [
      ...grassTo(g),
      ...skyBackdrop(g),
      ...edgeDressing(g, box),
      ...treesAround(box.x, box.y, box),
      { sprite: glowSprite(art), x: box.x, y: box.y },
      ...(steps === 0 ? [] : [{ sprite: scaffoldFor(art, steps), x: box.x, y: box.y }]),
    ];
  };
}

/**
 * The fire's own target in art pixels from its top-left: the flames and the stones, which the seats round it leave free. A tap on
 * it opens the hearth's project board.
 */
export function fireTarget(grand: boolean): { x: number; y: number; w: number; h: number } {
  return grand ? { x: 18, y: 14, w: 28, h: 26 } : { x: 14, y: 14, w: 28, h: 26 };
}
