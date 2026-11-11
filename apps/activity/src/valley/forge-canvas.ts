/**
 * Where everything stands in the Forge's canvas (`ForgeCanvas.tsx`), in scene pixels, as plain functions: the forge's art in the upper
 * middle, a cell for each anvil the player owns and one more (the dashed outline of the next) in a row in front of it, and under them a
 * row of three props, each one the way into a collection (the plans, the bag, the floor). The whole group is centred in the room the
 * scene has. Pure: the scene's size goes in, boxes come out.
 */
import type { ValleyAnvilView } from '@creatures/game';
import type { Placement } from '../games/art/pixel';
import { ANVIL_PROP, CHEST_PROP, CRATE_PROP, PLANS_PROP } from './forge-props';
import { TOP_CLEAR, type SceneGeometry } from './SceneFrame';
import { sceneScale } from './scale';
import { artSize, grassTo, skyBackdrop, treesAround, type ArtBox } from './place-scene';
import { glowSprite } from './valley-places';
import { scaffoldUp } from './scaffold';
import { sayText } from '../resource-count';
import { orderName, orderProgress, tinkerLine } from './forge-view';

/** A prop's sprite size, and the room a click on it takes (the sprite and a margin round it). */
export const PROP = 16;
export const PROP_HIT = 24;
/** An anvil's cell: how wide at most, and how tall (the smith, the anvil, the plate under it). */
export const CELL_W = 28;
export const CELL_H = 38;
/** Scene pixels from the top of the clear zone to the art, from the art's bottom to the anvils, and from the anvils to the props. */
const ART_TOP = 8;
const ART_TO_ROW = 18;
const ROW_TO_PROPS = 8;
/** The props row's height: the sprite and the plate under it. */
const PROPS_H = PROP + 12;
/** The props stand this far apart (their left edges). */
const PROP_STEP = 32;
/** The most the group may be pushed down to centre it. */
const MAX_LIFT = 24;

export interface Pt {
  x: number;
  y: number;
}

export interface Cell {
  /** The cell's box (the click target of an anvil, or the dashed outline of the next). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The anvil sprite's top-left, and the smith's (above and behind it). */
  anvil: Pt;
  smith: Pt;
}

export interface YardLayout {
  art: ArtBox;
  cells: Cell[];
  /** The props' sprite top-lefts: the plans, the bag's chest, the floor's crate. */
  plans: Pt;
  chest: Pt;
  crate: Pt;
}

/** The whole group's height in scene pixels (art, the row, the props). */
export const CONTENT_H = ART_TOP + 60 + ART_TO_ROW + CELL_H + ROW_TO_PROPS + PROPS_H;

/**
 * The scene's pixel scale: 3 on a phone and 4 on a wide window as everywhere, one step down while the whole group would not fit the
 * room it has (a window short or narrowed by two drawers), never under 2.
 */
export function forgeScale(width: number, height: number): number {
  let s = sceneScale(width);
  while (s > 2 && (CONTENT_H + Math.ceil(TOP_CLEAR / s)) * s > height) s -= 1;
  return s;
}

/** The layout for `slots` cells (the anvils owned, plus one for the next to buy) in a scene of `g`'s size. */
export function yardLayout(
  g: Pick<SceneGeometry, 'W' | 'H' | 'cx' | 'top'>,
  slots: number,
): YardLayout {
  const size = artSize('forge');
  const free = g.H - g.top - CONTENT_H;
  const lift = Math.max(0, Math.min(MAX_LIFT, Math.floor(free / 2)));
  const artY = g.top + lift + ART_TOP;
  const art: ArtBox = { x: g.cx - Math.floor(size.width / 2), y: artY, ...size };
  const rowY = artY + size.height + ART_TO_ROW;
  const step = Math.min(CELL_W, Math.max(PROP, Math.floor((g.W - 4) / Math.max(1, slots))));
  const x0 = g.cx - Math.floor((step * slots) / 2);
  const cells: Cell[] = Array.from({ length: slots }, (_, i) => {
    const x = x0 + i * step;
    const ax = x + Math.floor((step - PROP) / 2);
    return {
      x,
      y: rowY,
      w: step,
      h: CELL_H,
      anvil: { x: ax, y: rowY + 16 },
      smith: { x: ax, y: rowY + 4 },
    };
  });
  const propsY = rowY + CELL_H + ROW_TO_PROPS;
  const px0 = g.cx - Math.floor((PROP_STEP * 3) / 2) + Math.floor((PROP_STEP - PROP) / 2);
  return {
    art,
    cells,
    plans: { x: px0, y: propsY },
    chest: { x: px0 + PROP_STEP, y: propsY },
    crate: { x: px0 + 2 * PROP_STEP, y: propsY },
  };
}

/**
 * The scene: grass to every edge, the sky, the forge in the middle among a few trees (with the scaffolding up while its project is
 * being built), and the sprites of what stands in the yard: an anvil for each owned cell and the three props.
 */
export function forgeSceneDraw(owned: number, scaffold: number, slots: number) {
  return (g: SceneGeometry): Placement[] => {
    const lay = yardLayout(g, slots);
    const { art } = lay;
    const base = glowSprite('forge');
    return [
      ...grassTo(g),
      ...skyBackdrop(g, art.y - g.top),
      ...treesAround(art.x, art.y, art),
      { sprite: base, x: art.x, y: art.y },
      ...(scaffold === 0 ? [] : [{ sprite: scaffoldUp(base, scaffold), x: art.x, y: art.y }]),
      ...lay.cells.slice(0, owned).map((c) => ({ sprite: ANVIL_PROP, x: c.anvil.x, y: c.anvil.y })),
      { sprite: PLANS_PROP, x: lay.plans.x, y: lay.plans.y },
      { sprite: CHEST_PROP, x: lay.chest.x, y: lay.chest.y },
      { sprite: CRATE_PROP, x: lay.crate.x, y: lay.crate.y },
    ];
  };
}

/** The scene's one-word state of an anvil for its small bubble: the glyph that says what the smith is doing, or null at rest. */
export function anvilGlyph(anvil: ValleyAnvilView): string | null {
  if (anvil.creatureId === null || anvil.paused !== null) return null;
  if (anvil.tinkering !== null) return anvil.tinkering.reason === 'shard' ? 'warning' : 'info';
  return 'anvil';
}

/** The pieces waiting on every floor, in all. */
export function floorTotal(anvils: readonly ValleyAnvilView[]): number {
  return anvils.reduce((sum, a) => sum + a.floor.count, 0);
}

/**
 * The spoken name of an anvil's button in the scene: which anvil, who smiths at it, what is going on (the order in hand, tinkering,
 * paused, a full floor) and what a click does. Plain words (the screen shows the picture; this is for assistive technology).
 */
export function anvilLabel(
  name: string,
  smith: { name: string; level: number } | undefined,
  anvil: ValleyAnvilView,
  marketBuilt: boolean,
): string {
  if (smith === undefined) return `${name}: nobody posted. Choose a smith`;
  const first = anvil.orders[0];
  const doing =
    anvil.paused !== null
      ? 'paused for the raid'
      : anvil.tinkering !== null
        ? `tinkering: ${sayText(tinkerLine(anvil, marketBuilt) ?? [])}`
        : first === undefined
          ? 'no orders'
          : `making ${orderName(first)}, ${orderProgress(first)}`;
  const floor = anvil.floor.full ? ', floor full' : '';
  return `${name}: ${smith.name}, level ${String(smith.level)}, ${doing}${floor}. Open the anvil`;
}
