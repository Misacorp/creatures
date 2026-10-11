/**
 * Drag-and-drop and keyboard placement rules for the party row. Pure functions: given what the
 * player dragged and where they let go, say what to do. They reuse the tap rules in `raid-slots.ts`,
 * so a drag, a tap and a key press can never disagree. The server still validates every move.
 */
import type { RowSlotView } from './raid-api';
import { reduceTap, slotOfCreature, type Intent, type TapContext } from './raid-slots';

export type DropTarget = { kind: 'slot'; slot: number } | { kind: 'tray' };

/** `valid` can be dropped here, `invalid` is refused, `none` does nothing (for example itself). */
export type DropStatus = 'valid' | 'invalid' | 'none';

export interface DropOutcome {
  status: DropStatus;
  /** What to send to the server, if anything. */
  intent: Intent | null;
  /** A short plain explanation shown under the row. */
  hint: string | null;
  /** The sentence for the screen reader live region. */
  announce: string;
}

export const ZONE_LABELS = { front: 'Front', middle: 'Middle', back: 'Back' } as const;

/** The spoken label of a slot, for buttons and announcements. */
export function slotLabel(s: RowSlotView, speciesLabel: (id: string) => string): string {
  const where = `Slot ${String(s.slot + 1)}, ${ZONE_LABELS[s.zone]}`;
  if (s.creature === null) return `${where}, empty`;
  const owner = s.creature.mine ? 'you' : s.creature.ownerName;
  return `${where}, ${speciesLabel(s.creature.species)} level ${String(s.creature.level)}, ${owner}`;
}

const outcome = (
  status: DropStatus,
  intent: Intent | null,
  hint: string | null,
  announce: string,
): DropOutcome => ({ status, intent, hint, announce });

/**
 * What happens when `creatureId` (one of the player's own, called `name`) is dropped on `target`.
 * A null target is a drop off the row: it cancels. Dropping on an empty slot moves, on one of the
 * player's own creatures swaps, on someone else's refuses, and on the team tray unplaces.
 */
export function resolveDrop(
  ctx: TapContext,
  creatureId: string,
  name: string,
  target: DropTarget | null,
): DropOutcome {
  if (ctx.locked) return outcome('invalid', null, 'The row is locked.', 'The row is locked.');
  if (target === null) return outcome('none', null, null, 'Cancelled.');
  if (!ctx.teamIds.includes(creatureId)) {
    const hint = 'That creature is not in your team.';
    return outcome('invalid', null, hint, hint);
  }

  if (target.kind === 'tray') {
    if (slotOfCreature(ctx.row, creatureId) === null) {
      return outcome('none', null, null, `${name} is not in the row.`);
    }
    return outcome('valid', { type: 'unplace', creatureId }, null, `${name} taken out of the row.`);
  }

  const tap = reduceTap(ctx, creatureId, { kind: 'slot', slot: target.slot });
  if (tap.intent !== null) {
    const occupant = ctx.row.find((s) => s.slot === target.slot)?.creature;
    const text =
      occupant === null || occupant === undefined
        ? `Placed ${name} in slot ${String(target.slot + 1)}.`
        : `Swapped ${name} with ${occupant.name}.`;
    return outcome('valid', tap.intent, null, text);
  }
  if (tap.hint !== null) return outcome('invalid', null, tap.hint, tap.hint);
  return outcome('none', null, null, `${name} stays where it is.`);
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

/** Where the keyboard cursor starts for a selected creature: its own slot, else the first free one. */
export function cursorStart(row: readonly RowSlotView[], selected: string | null): number {
  const sorted = [...row].sort((a, b) => a.slot - b.slot);
  if (selected !== null) {
    const own = slotOfCreature(row, selected);
    if (own !== null) return own;
  }
  return (sorted.find((s) => s.creature === null) ?? sorted[0])?.slot ?? 0;
}

export function pickUpAnnouncement(name: string): string {
  return `${name} picked up. Use the arrow keys to choose a slot, Enter to drop it, Escape to cancel.`;
}

export const CANCEL_ANNOUNCEMENT = 'Cancelled.';
