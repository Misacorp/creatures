/**
 * The pre-run choice of the daily dungeon as small pure functions: which creature stands in which
 * place of the row, the drop rules for moving them, and the request they make. New creatures are
 * placed through the picker (`roster-picker.ts`), a placed one is moved by dragging it. The server
 * checks everything again (ownership, three different creatures); this module only keeps the screen
 * from building a request that cannot be right. There are no ability choices: unlocked creature
 * abilities fire on their own, at their default round.
 *
 * The team stands in ONE row of three, left to right. The player's choice is the order: `team[i]`
 * of the request is `slots[i]`, the creature at position i, and there is nothing else to pick.
 */
import {
  RULES,
  content,
  dungeonRowOrder,
  rowReactions,
  strongest,
  type Element,
  type Role,
} from '@creatures/game';
import type { DungeonRunRequest } from './dungeon-types';
import type { PickerCreature } from './roster-picker';
import {
  CANCEL_ANNOUNCEMENT,
  dropOutcome,
  type DropOutcome,
  type DropStatus,
  type DropTarget,
} from './slot-outcome';

/** The places of the row, left to right. Used for labels and sentences. */
export const ROW_PLACES = ['left', 'middle', 'right'] as const;
type RowPlace = (typeof ROW_PLACES)[number];
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

/** The slot a creature stands in, or null when it is not in the team. */
export function slotIndexOf(slots: Slots, id: string): number | null {
  const index = slots.indexOf(id);
  return index < 0 ? null : index;
}

function withSlot(slots: Slots, index: number, id: string | null): Slots {
  return slots.map((s, i) => (i === index ? id : s)) as unknown as Slots;
}

/**
 * Puts `id` into slot `index`. A creature that is already placed swaps with whoever is there (or
 * leaves its old slot empty); a new one takes the slot over (the picker only offers empty slots).
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

/** Takes a creature out of the row. */
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
 * The player's strongest three, in the order the game's rule for the row gives
 * (`dungeonRowOrder`, the same as the simulator's players). "Strongest" is the server's measure
 * (`strongest` of `@creatures/game`: power with gear, then the older creature, then the smaller id),
 * the same three the picker tags Recommended. Every dungeon fight goes left to right
 * (`RULES.dungeon.turnOrder`) and a mark stays on the foe until it is replaced or cashed in, so the
 * order is the one that sets off the most reactions; among those, setters and supports stand on the
 * left and act first, a Guard in the middle covers both neighbours, and payoffs on the right cash
 * the marks in last. This is the team the screen starts with; the player changes it from there.
 */
export function strongestThree(creatures: readonly PickerCreature[]): Slots {
  const top = strongest(creatures, TEAM_SIZE).map((c) => ({
    c,
    role: roleOf(c.species) ?? 'support',
    element: elementOf(c.species) ?? 'tide',
  }));
  const ordered = dungeonRowOrder(top).map((x) => x.c);
  return [ordered[0]?.id ?? null, ordered[1]?.id ?? null, ordered[2]?.id ?? null];
}

function roleOf(species: string): Role | undefined {
  return content.creatures.find((s) => s.id === species)?.role;
}

function elementOf(species: string): Element | undefined {
  return content.creatures.find((s) => s.id === species)?.element;
}

/** What the setup says when the row cannot set off any reaction. */
export const NO_REACTION_HINT = 'In this order nobody can set off a reaction.';

/**
 * The sentence about reactions for a full team in its order (slot 1 first). It is no longer drawn
 * under the slot row (the tiles show it, see `ui/slot-cue.ts`); it is the screen reader's
 * announcement of what the order sets off. It says which
 * creature marks the foe and which one sets the reaction off, for example "Cindle marks Scorched →
 * Splashet sets off Steam." (one sentence for each different pair, in the order they first happen),
 * or `NO_REACTION_HINT` when the order never sets one off. It reads the same `rowReactions` the
 * row's best order is picked with, so the text and the team the screen starts with always agree. Null when
 * the team is not complete or a species is unknown. The names are the player's own (render as text).
 */
export function orderHint(team: readonly { name: string; species: string }[]): string | null {
  if (team.length !== TEAM_SIZE) return null;
  const row: { role: Role; element: Element }[] = [];
  for (const member of team) {
    const role = roleOf(member.species);
    const element = elementOf(member.species);
    if (role === undefined || element === undefined) return null;
    row.push({ role, element });
  }
  const sentences: string[] = [];
  const seen = new Set<string>();
  for (const r of rowReactions(row)) {
    const key = `${String(r.marker)}:${String(r.payoff)}:${r.reaction}`;
    const def = content.reactions.find((d) => d.id === r.reaction);
    const marker = team[r.marker];
    const payoff = team[r.payoff];
    if (seen.has(key) || def === undefined || marker === undefined || payoff === undefined)
      continue;
    seen.add(key);
    sentences.push(`${marker.name} marks ${def.markName} → ${payoff.name} sets off ${def.name}.`);
  }
  return sentences.length === 0 ? NO_REACTION_HINT : sentences.join(' ');
}

interface DropResult {
  slots: Slots;
  outcome: DropOutcome;
}

const outcome = (status: DropStatus, hint: string | null, announce: string): DropOutcome =>
  dropOutcome<never>(status, null, hint, announce);

/**
 * What happens when the creature `id` of the team is dropped on `target`: on a place of the row it
 * moves there (swapping with whoever stands in it), and off the row (a null target) it is cancelled.
 * `nameOf` gives the name of any creature, for the sentence a screen reader reads out.
 */
export function resolveDrop(
  slots: Slots,
  id: string,
  target: DropTarget | null,
  nameOf: (id: string) => string,
): DropResult {
  const name = nameOf(id);
  if (target === null) return { slots, outcome: outcome('none', null, CANCEL_ANNOUNCEMENT) };
  const spot = ROW_PLACES[target.slot];
  if (spot === undefined) {
    const hint = 'That place does not exist.';
    return { slots, outcome: outcome('invalid', hint, hint) };
  }
  const from = slotIndexOf(slots, id);
  if (from === null) {
    // A creature that is not in the team is placed with the picker, never by a drag.
    const hint = 'Pick a creature for an empty slot instead.';
    return { slots, outcome: outcome('invalid', hint, hint) };
  }
  if (from === target.slot) {
    return { slots, outcome: outcome('none', null, `${name} stays ${WHERE[spot]}.`) };
  }
  const occupantId = slots[target.slot] ?? null;
  const text =
    occupantId === null
      ? `Moved ${name} to the ${spot} slot.`
      : `Swapped ${name} with ${nameOf(occupantId)}.`;
  return { slots: place(slots, id, target.slot), outcome: outcome('valid', null, text) };
}

/** The drop status of every place of the row for a creature being dragged, by slot number. */
export function slotStatuses(
  slots: Slots,
  id: string,
  nameOf: (id: string) => string,
): Map<number, DropStatus> {
  const map = new Map<number, DropStatus>();
  ROW_PLACES.forEach((_, index) => {
    map.set(index, resolveDrop(slots, id, { kind: 'slot', slot: index }, nameOf).outcome.status);
  });
  return map;
}

// --- The request ---

/** The three creatures of a complete team in slot order, or null. This is what decides the run. */
export function completeTeam(slots: Slots): DungeonRunRequest['team'] | null {
  if (!isComplete(slots)) return null;
  const [a, b, c] = slots as readonly [string, string, string];
  return [a, b, c];
}

/** The body of `POST /api/dungeon/run`, or null when the team is not complete. The key is the caller's. */
export function buildRunRequest(slots: Slots, idempotencyKey: string): DungeonRunRequest | null {
  const team = completeTeam(slots);
  return team === null ? null : { team, idempotencyKey };
}
