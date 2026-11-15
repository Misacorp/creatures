/**
 * The Paddock's scene as a canvas (`PaddockCanvas.tsx`; the rule is "A place is a canvas" in `ux-patterns.md`): the yard fills the window
 * and the creatures at home roam in it, each one a tap. The gate (the open side at the bottom right of the rails) is where the newcomers
 * wait, one tap for all of them, and, while the Paddock has a project being built, the builders' corner (`builders-corner.ts`) stands
 * clearly apart from the yard. Pure: the scene's size goes in, scale, placements and boxes come out. The ground, the sky and the dressing
 * at the edges are the Bonfire's (`bonfire-canvas.ts`, `place-scene.ts`); only the working area differs.
 *
 * The working area, in art pixels from the paddock art's top-left (`ring`): the meadow the creatures roam (`PADDOCK_ROAM_AREA`, mostly
 * in front of and beside the rails), the gate's newcomers on its right and the front row's plates and the "Creatures" button under it. The
 * corner stands beside it at the bottom right on a window wide enough for both (`'beside'`), else under it (`'below'`, a phone), else
 * nowhere (`'none'`: no project, the yard uses the whole height). The scale is the largest whole number that shows the working area.
 */
import type { Creature, ValleyVisit } from '../api';
import { destinationName } from '../trip-view';
import type { SceneGeometry } from './SceneFrame';
import { ART_Y, SCALE_MAX, SCALE_MIN, edgeDressing } from './bonfire-canvas';
import { buildName } from './commons-view';
import { isAtHome, isHelping, isScouting, isSmithing, isTrading } from './tray-state';
import { CORNER, cornerPlacements, type Pile } from './builders-corner';
import { MORE_CSS } from './bonfire-cast';
import { CREATURE_PX, PADDOCK_ROAM_AREA } from './place-cast';
import { PLATE_ROW_PX } from './place-plates';
import { artSize, grassTo, skyBackdrop, treesAround, type ArtBox } from './place-scene';
import { scaffoldFor } from './scaffold';
import { glowSprite } from './valley-places';
import type { Placement } from './valley-art';

/** Scene pixels the corner stands from the ring, beside it, and under the button, below it. */
const GAP_BESIDE = 10;
const GAP_BELOW = 2;
/** Scene pixels the working area keeps from each side edge. */
const EDGE = 6;
/** The share of a window's spare height that goes above the rails; the rest is meadow. */
const SPARE_ABOVE = 0.15;

/** How many newcomers wait drawn at the gate, at most (the gate's drawer has all of them). */
export const MAX_AT_GATE = 2;

/** The paddock's art: its size in its own pixels. */
const art = (): { width: number; height: number } => artSize('paddock');

/** Where the newcomers wait, from the art's top-left: the open side at the bottom right of the rails, one below the other. */
export function gateSpots(count: number): { x: number; y: number }[] {
  const a = art();
  return Array.from({ length: Math.min(count, MAX_AT_GATE) }, (_, i) => ({
    x: a.width - 2,
    y: a.height - 22 + i * CREATURE_PX,
  }));
}

/** The gate's tap, from the art's top-left: the newcomers' column and the post by it (always two seats high, so it never jumps). */
export function gateTarget(): { x: number; y: number; w: number; h: number } {
  const a = art();
  return { x: a.width - 4, y: a.height - 24, w: CREATURE_PX + 4, h: CREATURE_PX * MAX_AT_GATE + 4 };
}

/** The working area round the art: its sides and the feet of the meadow's front row, in art pixels from the art's top-left. */
interface Ring {
  left: number;
  right: number;
  narrow: number;
  frontFeet: number;
}

function ring(): Ring {
  const left = PADDOCK_ROAM_AREA.x;
  const right = Math.max(
    PADDOCK_ROAM_AREA.x + PADDOCK_ROAM_AREA.width + CREATURE_PX,
    art().width - 2 + CREATURE_PX,
  );
  return {
    left,
    right,
    narrow: right - left,
    frontFeet: PADDOCK_ROAM_AREA.y + PADDOCK_ROAM_AREA.height + CREATURE_PX,
  };
}

/** Scene pixels under the front row's feet that its plates and the "Creatures" button take at scale `s`. */
const underFront = (s: number): number => Math.ceil((PLATE_ROW_PX + MORE_CSS) / s);

export type CornerMode = 'none' | 'beside' | 'below';

function besideWidth(): number {
  const r = ring();
  return r.right + GAP_BESIDE + CORNER.w - r.left + 2 * EDGE;
}

/** Where the corner stands in a scene `width` scene pixels wide. */
export function modeFor(width: number, corner: boolean): CornerMode {
  if (!corner) return 'none';
  return width >= besideWidth() ? 'beside' : 'below';
}

function needed(mode: CornerMode, s: number): { w: number; h: number } {
  const r = ring();
  const ringW = r.narrow + 2 * EDGE;
  const ringH = ART_Y + r.frontFeet + underFront(s) + 2;
  if (mode === 'beside') return { w: besideWidth(), h: ringH };
  if (mode === 'none') return { w: ringW, h: ringH };
  return {
    w: Math.max(ringW, CORNER.w + 2 * EDGE),
    h: ringH + GAP_BELOW + CORNER.feet + Math.ceil(PLATE_ROW_PX / s) + 2,
  };
}

/**
 * The scene's one pixel scale (as the Bonfire's): the largest whole number from `SCALE_MIN` to `SCALE_MAX` at which the working area fits
 * both ways. It depends on the window and on whether there is a corner, never on who is at home, so the scene keeps its size.
 */
export function paddockScale(width: number, height: number, corner: boolean): number {
  for (let s = SCALE_MAX; s > SCALE_MIN; s -= 1) {
    const w = Math.ceil(width / s);
    const h = Math.ceil(height / s);
    const need = needed(modeFor(w, corner), s);
    if (w >= need.w && h >= need.h) return s;
  }
  return SCALE_MIN;
}

export interface PaddockLayout {
  mode: CornerMode;
  /** The paddock art's box in scene pixels. */
  box: ArtBox;
  /** The corner's top-left in scene pixels (null with no corner). */
  corner: { x: number; y: number } | null;
  /** The working area's left and right edges in scene pixels, corner included. */
  extent: { left: number; right: number };
}

/** Where everything stands in a scene of `g`'s size: the working area is centred sideways; the corner at the bottom of a phone's screen. */
export function paddockLayout(
  g: Pick<SceneGeometry, 'W' | 'H' | 'cx' | 's'>,
  corner: boolean,
): PaddockLayout {
  const r = ring();
  const a = art();
  const mode = modeFor(g.W, corner);
  const need = needed(mode, g.s);
  const underRing = r.frontFeet + underFront(g.s);
  const cornerY = g.H - (CORNER.feet + Math.ceil(PLATE_ROW_PX / g.s) + 2) - 2;
  // The yard stands high: the room a taller window has goes to the meadow under it (`meadowFor`), not above the rails.
  const y =
    mode === 'below'
      ? ART_Y + Math.floor(Math.max(0, cornerY - GAP_BELOW - ART_Y - underRing) * SPARE_ABOVE)
      : ART_Y + Math.floor(Math.max(0, g.H - need.h) * SPARE_ABOVE);
  const groupW = r.right + GAP_BESIDE + CORNER.w - r.left;
  // The art's middle is not the working area's: the meadow reaches further left of the rails than the gate does right of them.
  const x =
    mode === 'beside'
      ? g.cx - Math.floor(groupW / 2) - r.left
      : g.cx - Math.floor((r.left + r.right) / 2);
  const box: ArtBox = { x, y, ...a };
  let at: { x: number; y: number } | null = null;
  if (mode === 'beside') {
    at = { x: x + r.right + GAP_BESIDE, y: y + r.frontFeet - CORNER.feet };
  } else if (mode === 'below') {
    at = { x: g.cx - Math.floor(CORNER.w / 2), y: Math.max(cornerY, y + underRing + GAP_BELOW) };
  }
  return {
    mode,
    box,
    corner: at,
    extent: {
      left: Math.min(x + r.left, at?.x ?? Number.POSITIVE_INFINITY),
      right: Math.max(x + r.right, at === null ? Number.NEGATIVE_INFINITY : at.x + CORNER.w),
    },
  };
}

/** The paddock's own meadow in scene pixels (from the art's top-left): in front of and beside the rails, as the old scene had it. */
export function meadowAt(box: { x: number; y: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: box.x + PADDOCK_ROAM_AREA.x,
    y: box.y + PADDOCK_ROAM_AREA.y,
    width: PADDOCK_ROAM_AREA.width,
    height: PADDOCK_ROAM_AREA.height,
  };
}

/**
 * The meadow the creatures roam in a scene of `g`'s size: the paddock's own, as wide as the working area and with the room a taller window has under it, down to the
 * "Creatures" button (which stands under its front row) or, with the corner under it, down to the corner.
 */
export function meadowFor(
  g: Pick<SceneGeometry, 'H' | 's'>,
  lay: Pick<PaddockLayout, 'mode' | 'box' | 'corner'>,
): { x: number; y: number; width: number; height: number } {
  const base = meadowAt(lay.box);
  const limit =
    (lay.mode === 'below' && lay.corner !== null ? lay.corner.y - GAP_BELOW : g.H - 2) -
    underFront(g.s);
  // The whole working area's width, from the meadow's left edge to a sprite short of the gate (the roaming stops there anyway).
  const r = ring();
  return {
    x: base.x,
    y: base.y,
    width: Math.max(base.width, r.right - r.left - CREATURE_PX),
    height: Math.max(base.height, limit - CREATURE_PX - base.y),
  };
}

/** The "Creatures" button's middle: under the meadow's front row and its plates, in scene pixels. */
export function creaturesSpot(
  meadow: { x: number; y: number; width: number; height: number },
  s: number,
): { x: number; y: number } {
  return {
    x: meadow.x + Math.floor(meadow.width / 2),
    y: meadow.y + meadow.height + CREATURE_PX + Math.ceil(PLATE_ROW_PX / s) + 2,
  };
}

/**
 * The scene: grass and sky to every edge, the edges dressed, the trees round the yard, the paddock's art with the scaffolding rising
 * round it as its project fills (`steps`, V-COM-6; 0 for none) and the builders' corner (its pile as `corner` says) while there is one.
 */
export function paddockSceneDraw(steps: number, corner: Pile | null) {
  return (g: SceneGeometry): Placement[] => {
    const lay = paddockLayout(g, corner !== null);
    const { box } = lay;
    return [
      ...grassTo(g),
      ...skyBackdrop(g, box.y - g.top),
      ...edgeDressing(g, box, lay.extent),
      ...treesAround(box.x, box.y, box),
      ...(lay.corner === null
        ? []
        : cornerPlacements(
            lay.corner.x,
            lay.corner.y,
            corner ?? { material: 'timber', size: 's' },
          )),
      { sprite: glowSprite('paddock'), x: box.x, y: box.y },
      ...(steps === 0 ? [] : [{ sprite: scaffoldFor('paddock', steps), x: box.x, y: box.y }]),
    ];
  };
}

/**
 * The player's creatures that roam the yard: at home, not at a seat (a scout's, an anvil, the broker's, a communal one) and not at the
 * School's bench (`studying`), the same ones the valley map shows wandering, the Paddock's helper (`helperId`, at the corner) left out.
 */
export function roamersOf(
  creatures: readonly Creature[],
  visit: ValleyVisit,
  helperId: string | null,
  studying: ReadonlySet<string> = new Set(),
): Creature[] {
  return creatures.filter(
    (c) =>
      isAtHome(c) &&
      c.id !== helperId &&
      !studying.has(c.id) &&
      !isScouting(c, visit) &&
      !isSmithing(c, visit) &&
      !isHelping(c, visit) &&
      !isTrading(c, visit),
  );
}

/** Where a creature is, in a few words, for its drawer ("At home in the Paddock", "Scouting at the Cave"). */
export function whereLine(c: Creature, visit: ValleyVisit, studying: ReadonlySet<string>): string {
  const posted = visit.commons?.communal.find((s) => s.creatureId === c.id);
  if (posted !== undefined) return `Helping build ${buildName(posted.place)}`;
  if (isScouting(c, visit)) {
    const seat = visit.seats.find((s) => s.creatureId === c.id);
    return seat === undefined ? 'Scouting' : `Scouting at ${destinationName(seat.destination)}`;
  }
  if (isSmithing(c, visit)) return 'Smithing at the Forge';
  if (isTrading(c, visit)) return 'Trading at the Market';
  if (isHelping(c, visit)) return 'Helping build a place';
  if (studying.has(c.id)) return 'At the School';
  if (!isAtHome(c)) return 'Away';
  return 'At home in the Paddock';
}
