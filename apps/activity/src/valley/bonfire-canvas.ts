/**
 * The Bonfire's scene as a canvas (`BonfireCanvas.tsx`; the rule is "A place is a canvas" in `ux-patterns.md`): the fire in its meadow
 * with the creatures resting round it, and, while the hearth has a project being built, the builders' corner (`builders-corner.ts`)
 * clearly apart from it. The scene fills the window at the largest whole pixel scale that shows the working area (the fire's ring and
 * the corner), the new edges of a wide window are dressed with quiet pieces (the valley map's trees, pines, bushes, rocks and flowers)
 * with no plate and no tap. Pure: the scene's size goes in, scale, placements and boxes come out. The ground is the place scene's
 * (`place-scene.ts`: grass to every edge, the valley's sky above it).
 *
 * The working area, in art pixels from the fire's top-left (`ring`): the seats round the fire (a creature is 16 wide; the front seat's
 * plate and the "+N more" button under it are kept room for), and the corner, which stands
 * - beside the ring at the bottom right on a window wide enough for both (`mode: 'beside'`: the corner's feet level with the front
 *   seat's), else
 * - under the ring (`'below'`, a phone), else
 * - nowhere (`'none'`: no project, the fire's area uses the whole height).
 */
import type { SpriteDef } from '../sprites/sprite-data';
import { WORLD_MAP_SPRITE_DATA } from '../sprites/data/world-map-sprites';
import type { SceneGeometry } from './SceneFrame';
import { FIRE_BOX, GRAND_BOX, GROUND_MARGIN, MORE_CSS } from './bonfire-cast';
import { CORNER, cornerPlacements, type Pile } from './builders-corner';
import { CREATURE_PX } from './place-cast';
import { PLATE_ROW_PX, crowded, plateGap, standBounds } from './place-plates';
import { SKY_BELOW_ART_TOP, grassTo, skyBackdrop, treesAround, type ArtBox } from './place-scene';
import { scaffoldFor } from './scaffold';
import { glowSprite, type MapName } from './valley-places';
import type { Placement, Rect } from './valley-art';

/** Scene pixels each side of the working area that stay free of dressing, so nothing quiet crowds a seat or the corner. */
export const CLUSTER_PAD = 14;

/** Scene pixels from the clear zone's top to the fire's art (the seats behind the fire stand 2 above it). */
export const ART_Y = 10;
/** Scene pixels the corner stands from the ring, beside it, and under the "+N more" button, below it. */
const GAP_BESIDE = 10;
const GAP_BELOW = 2;
/** Scene pixels the working area keeps from each side edge. */
const EDGE = 6;

/** The pixel scales the scene may take (whole numbers): at least the phone's, at most the one at which a creature is 128 CSS px. */
export const SCALE_MIN = 3;
export const SCALE_MAX = 8;

/**
 * The seats' ring round the fire, in art pixels from its top-left: the creatures' sides and the front seat's feet. `narrow` is the
 * width a window must at least show (the grand hearth's front three seats; the seats at its sides come with a wider window).
 */
interface Ring {
  left: number;
  right: number;
  narrow: number;
  frontFeet: number;
  box: { width: number; height: number };
}

const RING: Ring = { left: -4, right: 60, narrow: 64, frontFeet: 80, box: FIRE_BOX };
/** The grand hearth's inner seats (the two behind it and at the lamps come with a wider window). */
const RING_GRAND: Ring = { left: -26, right: 90, narrow: 68, frontFeet: 74, box: GRAND_BOX };

const ringOf = (grand: boolean): Ring => (grand ? RING_GRAND : RING);

/** Scene pixels under the front seat's feet that its plate and the "+N more" button take at scale `s`. */
const underFront = (s: number): number => Math.ceil((PLATE_ROW_PX + MORE_CSS) / s);

export type CornerMode = 'none' | 'beside' | 'below';

/** The width the ring and the corner side by side need. */
function besideWidth(grand: boolean): number {
  const ring = ringOf(grand);
  return ring.right + GAP_BESIDE + CORNER.w - ring.left + 2 * EDGE;
}

/** Where the corner stands in a scene `width` scene pixels wide. */
export function modeFor(width: number, grand: boolean, corner: boolean): CornerMode {
  if (!corner) return 'none';
  return width >= besideWidth(grand) ? 'beside' : 'below';
}

/** The width and the height (at scale `s`) the working area needs, in scene pixels. */
function needed(mode: CornerMode, grand: boolean, s: number): { w: number; h: number } {
  const ring = ringOf(grand);
  const ringW = ring.narrow + 2 * EDGE;
  const ringH = ART_Y + ring.frontFeet + underFront(s) + 2;
  if (mode === 'beside') return { w: besideWidth(grand), h: ringH };
  if (mode === 'none') return { w: ringW, h: ringH };
  return {
    w: Math.max(ringW, CORNER.w + 2 * EDGE),
    h: ringH + GAP_BELOW + CORNER.feet + Math.ceil(PLATE_ROW_PX / s) + 2,
  };
}

/**
 * The scene's one pixel scale (Misa, 2026-11-15: on a laptop the fire "was small in a big field"; "scale it like the Forge"): the
 * largest whole number from `SCALE_MIN` to `SCALE_MAX` at which the working area fits both ways, so it fills the window's height
 * (or its width, on a narrow one). It depends on the window and on whether there is a corner, never on who is at the fire, so the
 * scene keeps its size while you are in it.
 */
export function bonfireScale(
  width: number,
  height: number,
  grand: boolean,
  corner: boolean,
): number {
  for (let s = SCALE_MAX; s > SCALE_MIN; s -= 1) {
    const w = Math.ceil(width / s);
    const h = Math.ceil(height / s);
    const need = needed(modeFor(w, grand, corner), grand, s);
    if (w >= need.w && h >= need.h) return s;
  }
  return SCALE_MIN;
}

export interface BonfireLayout {
  mode: CornerMode;
  /** The fire's art box in scene pixels. */
  box: ArtBox;
  /** The corner's top-left in scene pixels (null with no corner). */
  corner: { x: number; y: number } | null;
  /** The working area's left and right edges in scene pixels, corner included. */
  extent: { left: number; right: number };
}

/**
 * Where everything stands in a scene of `g`'s size: the working area is centred sideways. Under the ring the corner stands at the
 * bottom of the screen and the fire centred in the room above it; otherwise the spare height (a whole scale's remainder) goes a little
 * above the working area and the rest below, so the fire is not pushed down the screen.
 */
export function bonfireLayout(
  g: Pick<SceneGeometry, 'W' | 'H' | 'cx' | 's'>,
  grand: boolean,
  corner: boolean,
): BonfireLayout {
  const ring = ringOf(grand);
  const mode = modeFor(g.W, grand, corner);
  const need = needed(mode, grand, g.s);
  const underRing = ring.frontFeet + underFront(g.s);
  // Under the ring the corner sits at the bottom of the screen and the fire in the room above it; else the spare height goes a
  // little above the working area and the rest below it.
  const cornerY = g.H - (CORNER.feet + Math.ceil(PLATE_ROW_PX / g.s) + 2) - 2;
  const y =
    mode === 'below'
      ? ART_Y + Math.floor(Math.max(0, cornerY - GAP_BELOW - ART_Y - underRing) / 2)
      : ART_Y + Math.floor(Math.max(0, g.H - need.h) * 0.4);
  const groupW = ring.right + GAP_BESIDE + CORNER.w - ring.left;
  const x =
    mode === 'beside'
      ? g.cx - Math.floor(groupW / 2) - ring.left
      : g.cx - Math.floor(ring.box.width / 2);
  const box: ArtBox = { x, y, ...ring.box };
  let at: { x: number; y: number } | null = null;
  if (mode === 'beside') {
    at = { x: x + ring.right + GAP_BESIDE, y: y + ring.frontFeet - CORNER.feet };
  } else if (mode === 'below') {
    at = { x: g.cx - Math.floor(CORNER.w / 2), y: Math.max(cornerY, y + underRing + GAP_BELOW) };
  }
  return {
    mode,
    box,
    corner: at,
    extent: {
      left: Math.min(x + ring.left, at?.x ?? Number.POSITIVE_INFINITY),
      right: Math.max(x + ring.right, at === null ? Number.NEGATIVE_INFINITY : at.x + CORNER.w),
    },
  };
}

/**
 * The trees round the fire (`treesAround`), stood just outside the seats' ring rather than the art's own box: the grand hearth's
 * outer seats reach 26 pixels past its art, so its trees stand further out (a seat never stands over a tree).
 */
function treesRound(box: ArtBox, grand: boolean): Placement[] {
  const ring = ringOf(grand);
  return treesAround(box.x + ring.left + 4, box.y, {
    width: ring.right - ring.left - 4,
    height: box.height,
  });
}

type Dressing = 'smallPine' | 'smallTree' | 'bush' | 'flowers' | 'rock';

/**
 * Rows of dressing, back to front: where each stands (`from`: scene pixels under the grass line, or under the art's bottom edge), how far
 * apart its pieces are, where the first stands past the working area, and what comes in turn. Trees stand on the grass line or just in
 * front of it, never on the hills; low pieces fill the meadow down to the bottom edge.
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
 * The quiet pieces at the edges of a scene `g.W` wide, past the working area's `extent` (and `CLUSTER_PAD` more) each side, back to
 * front (drawn in this order). The right side starts one piece along so the two sides do not mirror. Nothing here is clickable.
 */
export function edgeDressing(
  g: Pick<SceneGeometry, 'W' | 'H'>,
  box: ArtBox,
  extent: { left: number; right: number },
): Placement[] {
  const wm = WORLD_MAP_SPRITE_DATA;
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
        const reach = CLUSTER_PAD + row.phase + k * row.step;
        const x =
          side === -1
            ? Math.round(extent.left - reach - widthOf(sprite))
            : Math.round(extent.right + reach);
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
 * the place's level) with the scaffolding rising round it as its project fills (`steps`, V-COM-6; 0 for none), and the builders' corner
 * (its pile of materials as `corner` says) while there is one.
 */
export function bonfireSceneDraw(art: MapName, steps: number, corner: Pile | null) {
  const grand = art === 'bonfire-grand';
  return (g: SceneGeometry): Placement[] => {
    const lay = bonfireLayout(g, grand, corner !== null);
    const { box } = lay;
    return [
      ...grassTo(g),
      ...skyBackdrop(g, box.y - g.top),
      ...edgeDressing(g, box, lay.extent),
      ...treesRound(box, grand),
      ...(lay.corner === null
        ? []
        : cornerPlacements(
            lay.corner.x,
            lay.corner.y,
            corner ?? { material: 'timber', size: 's' },
          )),
      { sprite: glowSprite(art), x: box.x, y: box.y },
      ...(steps === 0 ? [] : [{ sprite: scaffoldFor(art, steps), x: box.x, y: box.y }]),
    ];
  };
}

/**
 * The fire's own target in art pixels from its top-left: the flames and the stones, which the seats round it leave free. A tap on
 * it opens the hearth's project board (only while there is no builders' corner: the table is the way in then).
 */
export function fireTarget(grand: boolean): { x: number; y: number; w: number; h: number } {
  return grand ? { x: 18, y: 14, w: 28, h: 26 } : { x: 14, y: 14, w: 28, h: 26 };
}

/**
 * Where a hand may put a resting creature down (Misa, 2026-11-16): anywhere on the ground, never in the sky. The area of a creature's
 * top-left in scene pixels: inside the scene with its plate (`standBounds`), and no higher than `GROUND_MARGIN` of its feet under the
 * grass line, so dropping one in the sky clamps it to the meadow.
 */
export function groundArea(g: Pick<SceneGeometry, 'W' | 'H' | 's' | 'top'>, box: ArtBox): Rect {
  const bounds = standBounds(g);
  const top = Math.max(bounds.y, box.y + SKY_BELOW_ART_TOP + GROUND_MARGIN - CREATURE_PX);
  const bottom = bounds.y + bounds.height;
  return { x: bounds.x, y: top, width: bounds.width, height: Math.max(1, bottom - top) };
}

/**
 * What a creature may not stand over: every tree, pine, bush, rock and flower of the scene's dressing, the fire's flames and stones,
 * and the builders' corner (with its helper spot). Boxes in scene pixels.
 */
export function groundBlocks(
  g: Pick<SceneGeometry, 'W' | 'H'>,
  lay: BonfireLayout,
  grand: boolean,
): Rect[] {
  const { box } = lay;
  const pieces = [...treesRound(box, grand), ...edgeDressing(g, box, lay.extent)];
  const out: Rect[] = pieces.map((p) => ({
    x: p.x,
    y: p.y,
    width: widthOf(p.sprite),
    height: p.sprite.rows.length,
  }));
  const fire = fireTarget(grand);
  out.push({ x: box.x + fire.x, y: box.y + fire.y, width: fire.w, height: fire.h });
  if (lay.corner !== null) {
    out.push({ x: lay.corner.x, y: lay.corner.y, width: CORNER.w, height: CORNER.h });
  }
  return out;
}

/** Whether a creature with its top-left at `at` would overlap a box. */
function over(at: { x: number; y: number }, r: Rect): boolean {
  return (
    at.x > r.x - CREATURE_PX &&
    at.x < r.x + r.width &&
    at.y > r.y - CREATURE_PX &&
    at.y < r.y + r.height
  );
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}

/**
 * Where a creature put down at `want` (a top-left in scene pixels) stands: clamped to the ground `area`, and if that is over the
 * dressing, the fire or the corner (`blocks`) or too close to another creature (`others`, a plate's gap), at the nearest free
 * spot of the ground. Searches outwards in whole pixels, so the same drop always gives the same spot; with no free spot at all it
 * stays where it was clamped.
 */
export function settleOnGround(
  want: { x: number; y: number },
  area: Rect,
  blocks: readonly Rect[],
  others: readonly { x: number; y: number }[],
  s: number,
): { x: number; y: number } {
  const gap = plateGap(s);
  const clamp = (v: number, from: number, size: number): number =>
    Math.min(from + Math.max(1, size) - 1, Math.max(from, Math.round(v)));
  const start = { x: clamp(want.x, area.x, area.width), y: clamp(want.y, area.y, area.height) };
  const free = (at: { x: number; y: number }): boolean =>
    !blocks.some((r) => over(at, r)) && !others.some((o) => crowded(o, at, gap));
  if (free(start)) return start;
  const reach = Math.max(area.width, area.height);
  for (let r = 1; r <= reach; r += 1) {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let dx = -r; dx <= r; dx += 1) {
      // The ring's left and right columns take every row, the columns between only its top and bottom rows.
      const rows = Math.abs(dx) === r ? range(-r, r) : [-r, r];
      for (const dy of rows) {
        const at = { x: start.x + dx, y: start.y + dy };
        if (at.x < area.x || at.x >= area.x + area.width) continue;
        if (at.y < area.y || at.y >= area.y + area.height) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD && free(at)) {
          best = at;
          bestD = d;
        }
      }
    }
    if (best !== null) return best;
  }
  return start;
}
