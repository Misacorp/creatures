/**
 * What a tap or a drop on the raid canvas comes to, pure (docs/design/combat/raid-screen.md, sections 1, 2 and 6.8 to 6.11). Which thing
 * opens in which drawer is decided here and tested; `RaidCanvas.tsx` only opens what this says. The server still validates every move.
 */
import type { RowSlotView } from '../raid-api';
import { resolveDrop, type RaidDropOutcome } from '../raid-dnd';
import { slotOfCreature, type Intent } from '../raid-slots';
import { dropOutcome, type DropTarget } from '../slot-outcome';
import type { RaidCanvasConfig } from './config';

/** What the right drawer holds: the one thing tapped. */
export type RightPanel =
  | { kind: 'mine'; creatureId: string }
  | { kind: 'theirs'; slot: number }
  | { kind: 'seat'; slot: number }
  | { kind: 'move'; moveId: string }
  | { kind: 'swap'; id: string }
  | { kind: 'order' };

/** What the left drawer holds: a collection or an overview, from the plates on the scene's frame. */
export type LeftPanel = 'weekend' | 'boss' | 'players' | 'log';

export type TapResult =
  /** The right drawer opens (a full page on a phone). */
  | { kind: 'open'; panel: RightPanel }
  /** A popover first, the creature's reach lit on the board; its Open button opens `panel`. */
  | { kind: 'popover'; panel: RightPanel; lit: number }
  /** Another player's free seat: a popover that says whose it is (no drawer). */
  | { kind: 'seat-note'; owner: string }
  /** An empty seat while the board is locked. */
  | { kind: 'locked' };

export interface TapInput {
  slot: number;
  occupant: { mine: boolean; creatureId?: string | undefined } | null;
  /** The open swap request this creature is in (yours or asked of you), if any. */
  swapId: string | null;
  canEdit: boolean;
  /** The other player whose lane this empty seat is in (`foreignLaneOwner`), or null. */
  laneOwner: string | null;
  config: Pick<RaidCanvasConfig, 'creatureTap'>;
}

export function tapOutcome(i: TapInput): TapResult {
  if (i.occupant === null) {
    if (!i.canEdit) return { kind: 'locked' };
    if (i.laneOwner !== null) return { kind: 'seat-note', owner: i.laneOwner };
    return { kind: 'open', panel: { kind: 'seat', slot: i.slot } };
  }
  // A creature in an open swap request opens the request (yours included: its Knack and gear wait for the answer).
  if (i.swapId !== null) return { kind: 'open', panel: { kind: 'swap', id: i.swapId } };
  const panel: RightPanel =
    i.occupant.mine && i.occupant.creatureId !== undefined
      ? { kind: 'mine', creatureId: i.occupant.creatureId }
      : { kind: 'theirs', slot: i.slot };
  return i.config.creatureTap === 'popover-first'
    ? { kind: 'popover', panel, lit: i.slot }
    : { kind: 'open', panel };
}

/** The player whose lane (column) an empty seat is in, when it holds creatures of one other player and none of yours; else null. */
export function foreignLaneOwner(
  row: readonly RowSlotView[],
  grid: { rows: number; cols: number },
  slot: number,
): string | null {
  const col = Math.floor(slot / grid.rows);
  const inLane = row.filter((s) => Math.floor(s.slot / grid.rows) === col && s.creature !== null);
  if (inLane.length === 0 || inLane.some((s) => s.creature?.mine === true)) return null;
  const owners = new Set(inLane.map((s) => s.creature?.ownerName ?? ''));
  return owners.size === 1 ? ([...owners][0] ?? null) : null;
}

const outcome = dropOutcome<Intent>;

/** The drop target that is the tray (a drop there takes the creature off the board): a slot number no board has. */
export const TRAY_SLOT = -1;
export const TRAY_TARGET: DropTarget = { kind: 'slot', slot: TRAY_SLOT };

export interface DropContext {
  locked: boolean;
  row: readonly RowSlotView[];
  place: (slot: number) => string;
  /** How many creatures a player brings. */
  seats: number;
  /** Creatures knocked out this weekend (they cannot be placed). */
  out: ReadonlySet<string>;
}

/**
 * A hand carrying a creature lets go. From the board: a move or a swap (`resolveDrop`), or, on the tray, off the board. From the tray:
 * onto an empty seat, while there is a seat left and the creature is not out this weekend.
 */
export function resolveCanvasDrop(
  ctx: DropContext,
  creatureId: string,
  name: string,
  target: DropTarget | null,
): RaidDropOutcome {
  if (ctx.locked) return outcome('invalid', null, 'The board is locked.', 'The board is locked.');
  if (target === null) return outcome('none', null, null, 'Cancelled.');
  const from = slotOfCreature(ctx.row, creatureId);
  if (target.slot === TRAY_SLOT) {
    if (from === null) return outcome('none', null, null, `${name} stays off the board.`);
    const intent: Intent = { type: 'unplace', creatureId };
    return outcome('valid', intent, null, `${name} removed from the board.`);
  }
  if (from !== null) {
    return resolveDrop({ locked: false, row: ctx.row, place: ctx.place }, creatureId, name, target);
  }
  if (ctx.out.has(creatureId)) {
    const hint = `${name} is out this weekend.`;
    return outcome('invalid', null, hint, hint);
  }
  const there = ctx.row.find((s) => s.slot === target.slot);
  if (there === undefined) {
    return outcome('invalid', null, 'That seat does not exist.', 'That seat does not exist.');
  }
  if (there.creature !== null) {
    const hint = 'That seat is taken. Drop on an empty one.';
    return outcome('invalid', null, hint, hint);
  }
  const placed = ctx.row.filter((s) => s.creature?.mine === true).length;
  if (placed >= ctx.seats) {
    const hint = `All ${String(ctx.seats)} seats are used. Take one off the board first.`;
    return outcome('invalid', null, hint, hint);
  }
  const intent: Intent = { type: 'place', creatureId, slot: target.slot };
  return outcome('valid', intent, null, `Placed ${name} in ${ctx.place(target.slot)}.`);
}

/**
 * The seat the now line's "Place up to 3 creatures" opens: the first free seat in the lane you already stand in (so a team stays
 * together), else the first free seat in a lane no other player holds.
 */
export function firstFreeSeat(
  row: readonly RowSlotView[],
  grid: { rows: number; cols: number },
): number | null {
  const empty = row.filter((s) => s.creature === null).map((s) => s.slot);
  const lanes = new Set(
    row.flatMap((s) => (s.creature?.mine === true ? [Math.floor(s.slot / grid.rows)] : [])),
  );
  const inMine = empty.find((slot) => lanes.has(Math.floor(slot / grid.rows)));
  if (inMine !== undefined) return inMine;
  return empty.find((slot) => foreignLaneOwner(row, grid, slot) === null) ?? null;
}
