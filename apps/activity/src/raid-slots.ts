/**
 * What the raid placement shares between its pieces: the intent a placement sends to the server, the
 * slot a creature stands in, and the owner colours. The rules for a move are in `raid-dnd.ts` (a drag)
 * and `roster-picker.ts` (the picker); the server still decides every one (it may refuse, for
 * example when another player took the slot a moment ago).
 */
import type { RowSlotView } from './raid-api';

export type Intent =
  { type: 'place'; creatureId: string; slot: number } | { type: 'unplace'; creatureId: string };

export interface TapContext {
  /** True when edits are closed (finale resolved, or the player is not in the raid). */
  locked: boolean;
  row: readonly RowSlotView[];
}

/** The slot holding one of the player's creatures, or null if it is not placed. */
export function slotOfCreature(row: readonly RowSlotView[], creatureId: string): number | null {
  return row.find((s) => s.creature?.creatureId === creatureId)?.slot ?? null;
}

/** Palette size of the owner colours in the stylesheet (`owner-0` ... `owner-7`). */
export const OWNER_COLOURS = 8;

/** A stable colour index per owner: the owner's place in the roster list. */
export function ownerColour(ownerName: string, rosterNames: readonly string[]): number {
  const index = rosterNames.indexOf(ownerName);
  return (index < 0 ? 0 : index) % OWNER_COLOURS;
}
