/**
 * Placement interaction for the party row, as a small pure state machine. The player taps one of
 * their own creatures to select it, then taps a slot (or another of their own creatures) to say
 * where it goes. The functions return what to do; the screen sends the intent to the server, which
 * decides (it may still refuse, for example when another player took the slot a moment ago).
 */
import { neighbours } from '@creatures/engine';
import type { RowSlotView } from './raid-api';
import type { Selection, Tap } from './slot-outcome';

export type Intent =
  { type: 'place'; creatureId: string; slot: number } | { type: 'unplace'; creatureId: string };

export interface TapContext {
  /** True when edits are closed (finale resolved, or the player is not in the raid). */
  locked: boolean;
  row: readonly RowSlotView[];
  /** Ids of the creatures in the player's team. */
  teamIds: readonly string[];
}

export interface TapResult {
  selected: Selection;
  intent: Intent | null;
  /** A short plain explanation when the tap did nothing. */
  hint: string | null;
}

const none = (selected: Selection, hint: string | null = null): TapResult => ({
  selected,
  intent: null,
  hint,
});

/** The slot holding one of the player's creatures, or null if it is not placed. */
export function slotOfCreature(row: readonly RowSlotView[], creatureId: string): number | null {
  return row.find((s) => s.creature?.creatureId === creatureId)?.slot ?? null;
}

export function reduceTap(ctx: TapContext, selected: Selection, tap: Tap): TapResult {
  if (ctx.locked) return none(null, 'The row is locked.');

  if (tap.kind === 'creature') {
    if (!ctx.teamIds.includes(tap.id)) return none(selected, 'That creature is not in your team.');
    return none(selected === tap.id ? null : tap.id);
  }

  const target = ctx.row.find((s) => s.slot === tap.slot);
  if (target === undefined) return none(selected, 'That slot does not exist.');
  const occupant = target.creature;

  if (occupant === null) {
    if (selected === null) return none(null, 'Tap one of your creatures first, then a slot.');
    return {
      selected: null,
      intent: { type: 'place', creatureId: selected, slot: tap.slot },
      hint: null,
    };
  }
  if (!occupant.mine || occupant.creatureId === undefined) {
    return none(selected, `That slot belongs to ${occupant.ownerName}.`);
  }
  // One of my own creatures.
  if (selected === null) return none(occupant.creatureId);
  if (selected === occupant.creatureId) return none(null);
  // Another of mine is selected: it takes this slot, and the server swaps them if both are placed.
  return {
    selected: null,
    intent: { type: 'place', creatureId: selected, slot: tap.slot },
    hint: null,
  };
}

/** The "Unplace" button: only for a selected creature that is currently in a slot. */
export function unplaceIntent(row: readonly RowSlotView[], selected: Selection): TapResult {
  if (selected === null || slotOfCreature(row, selected) === null) {
    return none(selected, 'Select one of your placed creatures first.');
  }
  return { selected: null, intent: { type: 'unplace', creatureId: selected }, hint: null };
}

export function canUnplace(row: readonly RowSlotView[], selected: Selection): boolean {
  return selected !== null && slotOfCreature(row, selected) !== null;
}

/** Slots next to the selected creature's slot, to highlight who it will work with. */
export function adjacentSlots(
  row: readonly RowSlotView[],
  selected: Selection,
  length: number,
): number[] {
  if (selected === null) return [];
  const slot = slotOfCreature(row, selected);
  return slot === null ? [] : neighbours(slot, length);
}

/** Palette size of the owner colours in the stylesheet (`owner-0` ... `owner-7`). */
export const OWNER_COLOURS = 8;

/** A stable colour index per owner: the owner's place in the roster list. */
export function ownerColour(ownerName: string, rosterNames: readonly string[]): number {
  const index = rosterNames.indexOf(ownerName);
  return (index < 0 ? 0 : index) % OWNER_COLOURS;
}

/** Adds or removes a creature from a team pick, keeping at most `max` (extra picks are refused). */
export function togglePick(picked: readonly string[], id: string, max: number): string[] {
  if (picked.includes(id)) return picked.filter((p) => p !== id);
  if (picked.length >= max) return [...picked];
  return [...picked, id];
}
