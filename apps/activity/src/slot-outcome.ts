/**
 * The vocabulary the raid Placement (`raid-dnd.ts`, `raid-slots.ts`) and the dungeon team
 * (`dungeon-team.ts`) share: where a drop lands, what came of it, and the sentence read out to a
 * screen reader when a drag is cancelled. The rules themselves stay in their own modules; this only
 * keeps the two screens from describing the same things twice.
 */

/** Where a dragged creature is let go: on a slot (anywhere else is a cancel, which is a null target). */
export type DropTarget = { kind: 'slot'; slot: number };

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

export const CANCEL_ANNOUNCEMENT = 'Cancelled.';
