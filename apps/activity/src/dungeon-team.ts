/**
 * The pre-run choice of the daily dungeon as small pure functions: which creature stands in which
 * place of the row, the tap and drop rules for moving them, and the request they make. The server
 * checks everything again (ownership, three different creatures); this module only keeps the screen
 * from building a request that cannot be right. There are no ability choices: unlocked creature
 * abilities fire on their own, at their default round.
 *
 * The team stands in ONE row of three, left to right. The player's choice is the order: `team[i]`
 * of the request is `slots[i]`, the creature at position i, and there is nothing else to pick.
 */
import { RULES, content, dungeonRowOrder, type Role } from '@creatures/game';
import type { Creature } from './api';
import type { DungeonRunRequest } from './dungeon-types';
import type { DropOutcome, DropTarget } from './raid-dnd';

/** The places of the row, left to right. Used for labels and sentences. */
export const ROW_PLACES = ['left', 'middle', 'right'] as const;
export type RowPlace = (typeof ROW_PLACES)[number];
export const ROW_PLACE_NAMES: Readonly<Record<RowPlace, string>> = {
  left: 'Left',
  middle: 'Middle',
  right: 'Right',
};

/** Where a place of the row is, for a sentence: "placed on the left", "placed in the middle". */
export const WHERE: Readonly<Record<RowPlace, string>> = {
  left: 'on the left',
  middle: 'in the middle',
  right: 'on the right',
};

/** The creature in each place of the row, left to right; null for an empty place. */
export type Slots = readonly [string | null, string | null, string | null];

export const EMPTY_SLOTS: Slots = [null, null, null];

const TEAM_SIZE = RULES.dungeon.teamSize;

// --- Placing creatures ---

export type Selection = string | null;

export type Tap = { kind: 'creature'; id: string } | { kind: 'slot'; index: number };

export interface TapResult {
  slots: Slots;
  selected: Selection;
  /** A short plain explanation when the tap did nothing. */
  hint: string | null;
}

/** The slot a creature stands in, or null when it is in the tray. */
export function slotIndexOf(slots: Slots, id: string): number | null {
  const index = slots.indexOf(id);
  return index < 0 ? null : index;
}

function withSlot(slots: Slots, index: number, id: string | null): Slots {
  return slots.map((s, i) => (i === index ? id : s)) as unknown as Slots;
}

/**
 * Puts `id` into slot `index`. A creature that is already placed swaps with whoever is there (or
 * leaves its old slot empty); one from the tray sends the occupant back to the tray.
 */
export function place(slots: Slots, id: string, index: number): Slots {
  if (index < 0 || index >= TEAM_SIZE) return slots;
  const from = slotIndexOf(slots, id);
  if (from === index) return slots;
  const occupant = slots[index] ?? null;
  let next = withSlot(slots, index, id);
  if (from !== null) next = withSlot(next, from, occupant);
  return next;
}

/** Takes a creature out of the row; the tray keeps it. */
export function unplace(slots: Slots, id: string): Slots {
  const from = slotIndexOf(slots, id);
  return from === null ? slots : withSlot(slots, from, null);
}

/** Every slot is filled with a different creature. */
export function isComplete(slots: Slots): boolean {
  const ids = slots.filter((s): s is string => s !== null);
  return ids.length === TEAM_SIZE && new Set(ids).size === TEAM_SIZE;
}

/** How many creatures stand in a zone. */
export function placedCount(slots: Slots): number {
  return slots.filter((s) => s !== null).length;
}

/** Drops the creatures that are no longer in the collection (it may have changed under the screen). */
export function pruneSlots(slots: Slots, owned: readonly string[]): Slots {
  return slots.map((s) => (s !== null && owned.includes(s) ? s : null)) as unknown as Slots;
}

/**
 * The creatures strongest first: the highest levels, then the most HP, then the id, so the order
 * never depends on how the server listed them.
 */
export function strongestFirst(creatures: readonly Creature[]): Creature[] {
  return [...creatures].sort(
    (a, b) => b.level - a.level || b.stats.hp - a.stats.hp || a.id.localeCompare(b.id),
  );
}

/**
 * The player's strongest three, in the order the game's rule for the row gives
 * (`dungeonRowOrder`, the same as the simulator's players): setters and supports on the left, a
 * Guard in the middle where it covers both neighbours, payoffs on the right.
 */
export function strongestThree(creatures: readonly Creature[]): Slots {
  const top = strongestFirst(creatures)
    .slice(0, TEAM_SIZE)
    .map((c) => ({ c, role: roleOf(c) ?? 'support' }));
  const ordered = dungeonRowOrder(top).map((x) => x.c);
  return [ordered[0]?.id ?? null, ordered[1]?.id ?? null, ordered[2]?.id ?? null];
}

function roleOf(creature: Creature): Role | undefined {
  return content.creatures.find((s) => s.id === creature.species)?.role;
}

/** What a tap does. A selected creature goes to the tapped slot; tapping a placed creature picks it up. */
export function reduceTap(slots: Slots, selected: Selection, tap: Tap): TapResult {
  if (tap.kind === 'creature') {
    return { slots, selected: selected === tap.id ? null : tap.id, hint: null };
  }
  const occupant = slots[tap.index];
  if (occupant === undefined) return { slots, selected, hint: 'That place does not exist.' };
  if (selected === null) {
    if (occupant === null) {
      return { slots, selected, hint: 'Tap one of your creatures first, then a slot.' };
    }
    return { slots, selected: occupant, hint: null };
  }
  if (selected === occupant) return { slots, selected: null, hint: null };
  return { slots: place(slots, selected, tap.index), selected: null, hint: null };
}

export interface DropResult {
  slots: Slots;
  outcome: DropOutcome;
}

const outcome = (status: DropOutcome['status'], hint: string | null, announce: string) => ({
  status,
  intent: null,
  hint,
  announce,
});

/**
 * What happens when `id` (called `name`) is dropped on `target`: on a place of the row it moves
 * there (swapping with whoever stands in it), on the tray it leaves the row, and off both it is
 * cancelled.
 * `nameOf` gives the name of any creature, for the sentence a screen reader reads out.
 */
export function resolveDrop(
  slots: Slots,
  id: string,
  target: DropTarget | null,
  nameOf: (id: string) => string,
): DropResult {
  const name = nameOf(id);
  if (target === null) return { slots, outcome: outcome('none', null, 'Cancelled.') };
  if (target.kind === 'tray') {
    if (slotIndexOf(slots, id) === null) {
      return { slots, outcome: outcome('none', null, `${name} is not in the row.`) };
    }
    return {
      slots: unplace(slots, id),
      outcome: outcome('valid', null, `${name} taken out of the row.`),
    };
  }
  const spot = ROW_PLACES[target.slot];
  if (spot === undefined) {
    const hint = 'That place does not exist.';
    return { slots, outcome: outcome('invalid', hint, hint) };
  }
  if (slotIndexOf(slots, id) === target.slot) {
    return { slots, outcome: outcome('none', null, `${name} stays ${WHERE[spot]}.`) };
  }
  const occupantId = slots[target.slot] ?? null;
  const text =
    occupantId === null
      ? `${name} placed ${WHERE[spot]}.`
      : slotIndexOf(slots, id) === null
        ? `${name} placed ${WHERE[spot]}. ${nameOf(occupantId)} went back to the list.`
        : `Swapped ${name} with ${nameOf(occupantId)}.`;
  return { slots: place(slots, id, target.slot), outcome: outcome('valid', null, text) };
}

/** The drop status of every place of the row for a creature being dragged, by slot number. */
export function slotStatuses(
  slots: Slots,
  id: string,
  nameOf: (id: string) => string,
): Map<number, DropOutcome['status']> {
  const map = new Map<number, DropOutcome['status']>();
  ROW_PLACES.forEach((_, index) => {
    map.set(index, resolveDrop(slots, id, { kind: 'slot', slot: index }, nameOf).outcome.status);
  });
  return map;
}

// --- The request ---

/** The body of `POST /api/dungeon/run`, or null when the team is not complete. The key is the caller's. */
export function buildRunRequest(slots: Slots, idempotencyKey: string): DungeonRunRequest | null {
  if (!isComplete(slots)) return null;
  const [a, b, c] = slots as readonly [string, string, string];
  return { team: [a, b, c], idempotencyKey };
}

/** The part of a request that decides what the server does: a different one needs a different key. */
export function requestSignature(request: Omit<DungeonRunRequest, 'idempotencyKey'>): string {
  return JSON.stringify(request.team);
}
