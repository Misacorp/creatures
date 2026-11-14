/**
 * Where everything stands in the Signpost's scene (`SignpostCanvas.tsx`), in scene pixels, as plain functions: the signpost's road in the
 * upper middle (a click on it opens the expedition map), a cell for each scout seat the player owns and one more (the dashed outline of
 * the next seat, with its price) in a row in front of it, and under them two props, each the way into a collection (the crate of finds
 * waiting in the packs, the plans table of the project board). The whole group is centred in the room the scene has. Pure: the scene's
 * size goes in, boxes come out. The same shape as the Forge's yard (`forge-canvas.ts`).
 */
import type { ValleySeatView } from '@creatures/game';
import type { Placement } from '../games/art/pixel';
import { CRATE_PROP, PLANS_PROP } from './forge-props';
import { TOP_CLEAR, type SceneGeometry } from './SceneFrame';
import { sceneScale } from './scale';
import { artSize, grassTo, skyBackdrop, treesAround, type ArtBox } from './place-scene';
import { scaffoldFor } from './scaffold';
import { glowSprite } from './valley-places';

/** A prop's sprite size, and the room a click on it takes (the sprite and a margin round it). */
export const PROP = 16;
export const PROP_HIT = 24;
/** A seat's cell: how wide at most, and how tall (the scout, the plate under it). */
export const CELL_W = 28;
export const CELL_H = 38;
const ART_TOP = 8;
const ART_TO_ROW = 12;
const ROW_TO_PROPS = 8;
const PROPS_H = PROP + 12;
const PROP_STEP = 32;
const MAX_LIFT = 24;

export interface Pt {
  x: number;
  y: number;
}

export interface Cell {
  /** The cell's box (the click target of a seat, or the dashed outline of the next). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where the scout's sprite stands (top-left), over the cell's upper part. */
  stand: Pt;
}

export interface SignpostLayout {
  art: ArtBox;
  cells: Cell[];
  /** The props' sprite top-lefts: the crate (the packs) and the plans table (the project board). */
  crate: Pt;
  plans: Pt;
}

/** The whole group's height in scene pixels (art, the row, the props). */
export function contentHeight(): number {
  return ART_TOP + artSize('road').height + ART_TO_ROW + CELL_H + ROW_TO_PROPS + PROPS_H;
}

/** The scene's pixel scale: 3 on a phone, 4 on a wide window, one step down while the group would not fit the room, never under 2. */
export function signpostScale(width: number, height: number): number {
  let s = sceneScale(width);
  const total = contentHeight();
  while (s > 2 && (total + Math.ceil(TOP_CLEAR / s)) * s > height) s -= 1;
  return s;
}

/** The layout for `slots` cells (the seats owned, plus one for the next to buy) in a scene of `g`'s size. */
export function signpostLayout(
  g: Pick<SceneGeometry, 'W' | 'H' | 'cx' | 'top'>,
  slots: number,
): SignpostLayout {
  const size = artSize('road');
  const free = g.H - g.top - contentHeight();
  const lift = Math.max(0, Math.min(MAX_LIFT, Math.floor(free / 2)));
  const artY = g.top + lift + ART_TOP;
  const art: ArtBox = { x: g.cx - Math.floor(size.width / 2), y: artY, ...size };
  const rowY = artY + size.height + ART_TO_ROW;
  const step = Math.min(CELL_W, Math.max(PROP, Math.floor((g.W - 4) / Math.max(1, slots))));
  const x0 = g.cx - Math.floor((step * slots) / 2);
  const cells: Cell[] = Array.from({ length: slots }, (_, i) => {
    const x = x0 + i * step;
    return {
      x,
      y: rowY,
      w: step,
      h: CELL_H,
      stand: { x: x + Math.floor((step - PROP) / 2), y: rowY + 4 },
    };
  });
  const propsY = rowY + CELL_H + ROW_TO_PROPS;
  const px0 = g.cx - PROP_STEP + Math.floor((PROP_STEP - PROP) / 2);
  return {
    art,
    cells,
    crate: { x: px0, y: propsY },
    plans: { x: px0 + PROP_STEP, y: propsY },
  };
}

/**
 * The scene: grass to every edge, the sky, the road with its signpost among a few trees (with the scaffolding up while the Signpost's
 * project is being built), and the two props.
 */
export function signpostSceneDraw(scaffold: number, slots: number) {
  return (g: SceneGeometry): Placement[] => {
    const lay = signpostLayout(g, slots);
    const { art } = lay;
    const base = glowSprite('road');
    return [
      ...grassTo(g),
      ...skyBackdrop(g, art.y - g.top),
      ...treesAround(art.x, art.y, art),
      { sprite: base, x: art.x, y: art.y },
      ...(scaffold === 0 ? [] : [{ sprite: scaffoldFor('road', scaffold), x: art.x, y: art.y }]),
      { sprite: CRATE_PROP, x: lay.crate.x, y: lay.crate.y },
      { sprite: PLANS_PROP, x: lay.plans.x, y: lay.plans.y },
    ];
  };
}

/** The finds waiting in all the packs: how many seats have a full pack (the crate's bubble). */
export function fullPackCount(seats: readonly ValleySeatView[]): number {
  return seats.filter((s) => s.creatureId !== null && s.store.full).length;
}

/**
 * The spoken name of a seat's button in the scene: which seat, who scouts from it, where, what its pack says and what a click does.
 * Plain words (the picture is the screen's; this is for assistive technology).
 */
export function seatLabel(
  n: number,
  scout: { name: string; level: number } | undefined,
  where: string,
  pack: string,
): string {
  if (scout === undefined) return `Seat ${String(n)}: nobody posted. Choose a scout`;
  return `Seat ${String(n)}: ${scout.name}, level ${String(scout.level)}, scouting ${where}. ${pack}. Open the seat`;
}
