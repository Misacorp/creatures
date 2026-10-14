/**
 * Drag-and-drop rules for the party row. Pure: given what the player dragged (one of their own
 * creatures on the board) and where they let go, say what to do. The server still validates every
 * move. A creature that is not on the board yet is placed through the picker (`roster-picker.ts`),
 * never by a drag.
 */
import { placeText } from './raid-board';
import { slotOfCreature, type Intent, type TapContext } from './raid-slots';
import {
  CANCEL_ANNOUNCEMENT,
  dropOutcome,
  type DropOutcome,
  type DropStatus,
  type DropTarget,
} from './slot-outcome';

/** What a raid drop comes to: what to send (a placement), or nothing. */
export type RaidDropOutcome = DropOutcome<Intent>;

const outcome = dropOutcome<Intent>;

/**
 * What happens when `creatureId` (one of the player's own, called `name`) is dropped on `target`.
 * A null target is a drop off the board: it cancels. Dropping on an empty slot moves it, on one of
 * the player's own creatures swaps, on someone else's refuses. Nothing here takes a creature off
 * the board: that is the "Remove from board" button of its popover.
 */
export function resolveDrop(
  ctx: TapContext,
  creatureId: string,
  name: string,
  target: DropTarget | null,
): RaidDropOutcome {
  if (ctx.locked) return outcome('invalid', null, 'The row is locked.', 'The row is locked.');
  if (target === null || target.kind === 'tray') {
    return outcome('none', null, null, CANCEL_ANNOUNCEMENT);
  }
  const from = slotOfCreature(ctx.row, creatureId);
  if (from === null) {
    const hint = 'Pick a creature for an empty slot instead.';
    return outcome('invalid', null, hint, hint);
  }
  const there = ctx.row.find((s) => s.slot === target.slot);
  if (there === undefined) {
    return outcome('invalid', null, 'That slot does not exist.', 'That slot does not exist.');
  }
  if (target.slot === from) return outcome('none', null, null, `${name} stays where it is.`);
  const occupant = there.creature;
  if (occupant !== null && !occupant.mine) {
    const hint = `That slot belongs to ${occupant.ownerName}.`;
    return outcome('invalid', null, hint, hint);
  }
  const intent: Intent = { type: 'place', creatureId, slot: target.slot };
  const text =
    occupant === null
      ? `Moved ${name} to ${placeText(target.slot, ctx.row.length)}.`
      : `Swapped ${name} with ${occupant.name}.`;
  return outcome('valid', intent, null, text);
}

/** The drop status of every slot for a creature being dragged, keyed by slot number. */
export function slotStatuses(
  ctx: TapContext,
  creatureId: string,
  name: string,
): Map<number, DropStatus> {
  const map = new Map<number, DropStatus>();
  for (const s of ctx.row) {
    map.set(s.slot, resolveDrop(ctx, creatureId, name, { kind: 'slot', slot: s.slot }).status);
  }
  return map;
}
