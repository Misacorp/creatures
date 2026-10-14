/**
 * The vocabulary the raid Placement (`raid-dnd.ts`, `raid-slots.ts`) and the dungeon team
 * (`dungeon-team.ts`) share: what a tap is, where a drop lands, what came of it, and the sentences
 * read out to a screen reader. The rules themselves stay in their own modules; this only keeps the two
 * screens from describing the same things twice.
 */

/** The selected creature id (the one picked up by a tap or a key), or null. */
export type Selection = string | null;

/** A tap on one of the player's creatures (tray or slot) by id, or on a slot by its number. */
export type Tap = { kind: 'creature'; id: string } | { kind: 'slot'; slot: number };

export type DropTarget = { kind: 'slot'; slot: number } | { kind: 'tray' };

/** `valid` can be dropped here, `invalid` is refused, `none` does nothing (for example itself). */
export type DropStatus = 'valid' | 'invalid' | 'none';

/** What came of a drop. `I` is what the screen must send to the server, when it sends anything. */
export interface DropOutcome<I = never> {
  status: DropStatus;
  /** What to send to the server, if anything. */
  intent: I | null;
  /** A short plain explanation shown under the row. */
  hint: string | null;
  /** The sentence for the screen reader live region. */
  announce: string;
}

export function dropOutcome<I = never>(
  status: DropStatus,
  intent: I | null,
  hint: string | null,
  announce: string,
): DropOutcome<I> {
  return { status, intent, hint, announce };
}

export function pickUpAnnouncement(name: string): string {
  return `${name} picked up. Use the arrow keys to choose a slot, Enter to drop it, Escape to cancel.`;
}

export const CANCEL_ANNOUNCEMENT = 'Cancelled.';

/** A drop on the tray of a creature that is in the row. */
export function takenOutAnnouncement(name: string): string {
  return `${name} taken out of the row.`;
}

/** A drop on the tray of a creature that is not in the row. */
export function notInRowAnnouncement(name: string): string {
  return `${name} is not in the row.`;
}
