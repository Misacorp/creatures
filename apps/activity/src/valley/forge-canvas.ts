/**
 * The Forge's shared bits, in scene pixels, as plain functions (`ForgeCanvas.tsx`): the prop sizes, an anvil's cell and its smith's
 * spoken state. The place is its interior alone (`forge-interior.ts`; Misa, 2026-11-15: a click on the Forge goes straight in).
 *
 * Pure: the scene's size goes in, boxes come out.
 */
import type { ValleyAnvilView } from '@creatures/game';
import { sayText } from '../resource-count';
import { orderName, orderProgress, tinkerLine } from './forge-view';

/** A prop's sprite size, and the room a click on it takes (the sprite and a margin round it). */
export const PROP = 16;
export const PROP_HIT = 24;
/** An anvil's cell: how wide at most, and how tall (the smith, the anvil, the plate under it). */
export const CELL_W = 28;
export const CELL_H = 34;

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
