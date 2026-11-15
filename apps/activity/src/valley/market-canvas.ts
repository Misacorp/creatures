/**
 * The Market's scene as a canvas (`MarketCanvas.tsx`; the rule is "A place is a canvas" in `ux-patterns.md`): the shard stall in its
 * meadow with the broker standing in front of it, and, while the Market's project is being built, the builders' corner
 * (`builders-corner.ts`) clearly apart from it. Before the stall is built the whole place is a building site: the stall's frame rising
 * in scaffolding and the corner beside it. The scene fills the window at the largest whole pixel scale that shows the working area,
 * the new edges of a wide window are dressed with the quiet pieces the Bonfire uses (`edgeDressing`, no plate and no tap). Pure: the
 * scene's size goes in, scale, placements and boxes come out. The ground is the place scene's (`place-scene.ts`).
 *
 * The working area, in art pixels from the stall's top-left: the stall (its art is `STALL_W` wide), the broker's seat in front of its
 * counter (its feet `FRONT_FEET` down, the plate under them), and the corner, which stands
 * - beside the stall at the right on a window wide enough for both (`'beside'`: its feet level with the broker's), else
 * - under the stall (`'below'`, a phone), else
 * - nowhere (`'none'`: no project, the stall uses the whole height).
 */
import { PLATE_ROW_PX } from './place-plates';
import { SCALE_MAX, SCALE_MIN, edgeDressing, type CornerMode } from './bonfire-canvas';
import { CORNER, cornerPlacements, type Pile } from './builders-corner';
import { artSize, grassTo, skyBackdrop, treesAround, type ArtBox } from './place-scene';
import { scaffoldFor } from './scaffold';
import type { SceneGeometry } from './SceneFrame';
import { glowSprite } from './valley-places';
import type { Placement } from './valley-art';

export type { CornerMode };

/** The stall's art size in its own pixels (it is the `market` glow sprite). */
export const STALL_W = artSize('market').width;
export const STALL_H = artSize('market').height;

/** The broker's box (a creature, 16 by 16) from the stall's top-left: in front of the counter, a little below the art's foot. */
export const BROKER_AT = { x: 22, y: 38 };
/** The row the broker's feet stand on, from the stall's top. */
export const FRONT_FEET = BROKER_AT.y + 16;

/** What a tap on the stall opens the exchange from: the awning and the counter with the shards on it (the broker stands in front). */
export const STALL_BOX = { x: 4, y: 8, w: 38, h: 30 };
/** Where its plate hangs, in scene pixels down from the box's top: on the awning. */
export const STALL_PLATE_AT = 4;

/** Scene pixels from the scene's top to the stall's art (as the Bonfire's `ART_Y`). */
const ART_Y = 10;
/** Scene pixels the corner stands from the stall, beside it, and under the broker's plate, below it. */
const GAP_BESIDE = 12;
const GAP_BELOW = 2;
/** Scene pixels the working area keeps from each side edge. */
const EDGE = 6;

/** Scene pixels under the broker's feet that its plate takes at scale `s`. */
const underFront = (s: number): number => Math.ceil(PLATE_ROW_PX / s);

/** The width the stall and the corner side by side need. */
const besideWidth = (): number => STALL_W + GAP_BESIDE + CORNER.w + 2 * EDGE;

/** Where the corner stands in a scene `width` scene pixels wide. */
export function modeFor(width: number, corner: boolean): CornerMode {
  if (!corner) return 'none';
  return width >= besideWidth() ? 'beside' : 'below';
}

/** The width and the height (at scale `s`) the working area needs, in scene pixels. */
function needed(mode: CornerMode, s: number): { w: number; h: number } {
  const stallW = STALL_W + 2 * EDGE;
  const stallH = ART_Y + FRONT_FEET + underFront(s) + 2;
  if (mode === 'beside') return { w: besideWidth(), h: stallH };
  if (mode === 'none') return { w: stallW, h: stallH };
  return {
    w: Math.max(stallW, CORNER.w + 2 * EDGE),
    h: stallH + GAP_BELOW + CORNER.feet + underFront(s) + 2,
  };
}

/**
 * The scene's one pixel scale: the largest whole number from `SCALE_MIN` to `SCALE_MAX` at which the working area fits both ways, so
 * it fills the window's height (or its width, on a narrow one), like the Bonfire's and the Forge's. It depends on the window and on
 * whether there is a corner, never on who stands there, so the scene keeps its size while you are in it.
 */
export function marketScale(width: number, height: number, corner: boolean): number {
  for (let s = SCALE_MAX; s > SCALE_MIN; s -= 1) {
    const w = Math.ceil(width / s);
    const h = Math.ceil(height / s);
    const need = needed(modeFor(w, corner), s);
    if (w >= need.w && h >= need.h) return s;
  }
  return SCALE_MIN;
}

export interface MarketLayout {
  mode: CornerMode;
  /** The stall's art box in scene pixels. */
  box: ArtBox;
  /** The corner's top-left in scene pixels (null with no corner). */
  corner: { x: number; y: number } | null;
  /** The working area's left and right edges in scene pixels, corner included. */
  extent: { left: number; right: number };
}

/**
 * Where everything stands in a scene of `g`'s size: the working area is centred sideways. Under the stall the corner stands at the
 * bottom of the screen and the stall centred in the room above it; otherwise the spare height goes a little above the working area
 * and the rest below, so the stall is not pushed down the screen.
 */
export function marketLayout(
  g: Pick<SceneGeometry, 'W' | 'H' | 'cx' | 's'>,
  corner: boolean,
): MarketLayout {
  const mode = modeFor(g.W, corner);
  const need = needed(mode, g.s);
  const underStall = FRONT_FEET + underFront(g.s);
  const cornerY = g.H - (CORNER.feet + underFront(g.s) + 2) - 2;
  const y =
    mode === 'below'
      ? ART_Y + Math.floor(Math.max(0, cornerY - GAP_BELOW - ART_Y - underStall) / 2)
      : ART_Y + Math.floor(Math.max(0, g.H - need.h) * 0.4);
  const groupW = STALL_W + GAP_BESIDE + CORNER.w;
  const x = mode === 'beside' ? g.cx - Math.floor(groupW / 2) : g.cx - Math.floor(STALL_W / 2);
  const box: ArtBox = { x, y, width: STALL_W, height: STALL_H };
  let at: { x: number; y: number } | null = null;
  if (mode === 'beside') {
    at = { x: x + STALL_W + GAP_BESIDE, y: y + FRONT_FEET - CORNER.feet };
  } else if (mode === 'below') {
    at = { x: g.cx - Math.floor(CORNER.w / 2), y: Math.max(cornerY, y + underStall + GAP_BELOW) };
  }
  return {
    mode,
    box,
    corner: at,
    extent: {
      left: Math.min(x, at?.x ?? Number.POSITIVE_INFINITY),
      right: Math.max(x + STALL_W, at === null ? Number.NEGATIVE_INFINITY : at.x + CORNER.w),
    },
  };
}

/**
 * The scene: grass and sky to every edge, the edges dressed, the trees round the stall (the ones on the corner's side only when
 * the corner is not there), the stall with the scaffolding rising on it as the project fills (`steps`, V-COM-6; 0 for none), and the
 * builders' corner (its pile of materials as `corner` says) while there is one.
 */
export function marketSceneDraw(steps: number, corner: Pile | null) {
  return (g: SceneGeometry): Placement[] => {
    const lay = marketLayout(g, corner !== null);
    const { box } = lay;
    // With the corner beside the stall the trees on its side would stand behind the corner's table: they are left out.
    const trees = treesAround(box.x, box.y, box).filter(
      (p) => lay.mode !== 'beside' || p.x < box.x + box.width,
    );
    return [
      ...grassTo(g),
      ...skyBackdrop(g, box.y - g.top),
      ...edgeDressing(g, box, lay.extent),
      ...trees,
      ...(lay.corner === null
        ? []
        : cornerPlacements(
            lay.corner.x,
            lay.corner.y,
            corner ?? { material: 'timber', size: 's' },
          )),
      { sprite: glowSprite('market'), x: box.x, y: box.y },
      ...(steps === 0 ? [] : [{ sprite: scaffoldFor('market', steps), x: box.x, y: box.y }]),
    ];
  };
}
