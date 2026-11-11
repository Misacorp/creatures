/**
 * Where everything stands in the Forge's two views, in scene pixels, as plain functions (`ForgeCanvas.tsx`).
 *
 * - Outside: the forge's art in the middle of its yard (a few trees round it, the scaffolding up while its project is built), the
 *   whole building the way in, and a notice board beside it for the project. Nothing else stands there: the anvils, the plans, the
 *   bag and the floor are inside (`forge-interior.ts`).
 * - The shared bits: the prop sizes, an anvil's cell and its smith's spoken state.
 *
 * Pure: the scene's size goes in, boxes come out.
 */
import type { ValleyAnvilView } from '@creatures/game';
import type { Placement } from '../games/art/pixel';
import { BOARD_PROP } from './forge-props';
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
export const CELL_H = 34;

/** Scene pixels from the top of the clear zone to the art. */
const ART_TOP = 12;
/** Scene pixels the yard takes under the art. */
const BELOW_ART = 24;
/** The most the building may be pushed down to centre it. */
const MAX_LIFT = 90;

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

export interface OutsideLayout {
  art: ArtBox;
  /** The notice board (the project): a prop's top-left. */
  board: Pt;
}

/** The height of the outside group in scene pixels (the art as tall as the forge's, with its yard). */
const OUTSIDE_H = ART_TOP + 60 + BELOW_ART;

/** The outside scene's pixel scale: 3 on a phone and 4 on a wide window as everywhere, one step down while the group would not fit, never under 2. */
export function forgeScale(width: number, height: number): number {
  let s = sceneScale(width);
  while (s > 2 && (OUTSIDE_H + Math.ceil(TOP_CLEAR / s)) * s > height) s -= 1;
  return s;
}

/** The outside layout in a scene of `g`'s size: the building in the middle, the board at its right foot. */
export function outsideLayout(g: Pick<SceneGeometry, 'W' | 'H' | 'cx' | 'top'>): OutsideLayout {
  const size = artSize('forge');
  const free = g.H - g.top - OUTSIDE_H;
  const lift = Math.max(0, Math.min(MAX_LIFT, Math.floor(free / 2)));
  const artY = g.top + lift + ART_TOP;
  const art: ArtBox = { x: g.cx - Math.floor(size.width / 2), y: artY, ...size };
  return {
    art,
    board: { x: art.x + art.width + 2, y: art.y + art.height - PROP },
  };
}

/**
 * The outside scene: grass to every edge, the sky, the forge in the middle among a few trees (with the scaffolding up while its
 * project is being built), and the notice board.
 */
export function outsideSceneDraw(scaffold: number) {
  return (g: SceneGeometry): Placement[] => {
    const lay = outsideLayout(g);
    const { art } = lay;
    const base = glowSprite('forge');
    return [
      ...grassTo(g),
      ...skyBackdrop(g, art.y - g.top),
      ...treesAround(art.x, art.y, art),
      { sprite: base, x: art.x, y: art.y },
      ...(scaffold === 0 ? [] : [{ sprite: scaffoldUp(base, scaffold), x: art.x, y: art.y }]),
      { sprite: BOARD_PROP, x: lay.board.x, y: lay.board.y },
    ];
  };
}

/** The scene's one-word state of an anvil for its small bubble: the glyph that says what the smith is doing, or null at rest. */
export function anvilGlyph(anvil: ValleyAnvilView): string | null {
  if (anvil.creatureId === null || anvil.paused !== null) return null;
  if (anvil.tinkering !== null) return anvil.tinkering.reason === 'shard' ? 'warning' : 'info';
  return 'anvil';
}

/** Whether the smith at an anvil is hammering a piece now (the interior's idle animation). */
export function anvilWorking(anvil: ValleyAnvilView): boolean {
  return anvilGlyph(anvil) === 'anvil';
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
