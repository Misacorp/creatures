/**
 * The pre-run choices of the daily dungeon as small pure functions: which creature stands in which
 * place of the row, the tap and drop rules for moving them, the ability settings and the request
 * they make. The server checks everything again (ownership, three different creatures, the
 * abilities); this module only keeps the screen from building a request that cannot be right.
 *
 * The team stands in ONE row of three, left to right. The player's choice is the order: `team[i]`
 * of the request is `slots[i]`, the creature at position i, and there is nothing else to pick.
 */
import {
  RULES,
  content,
  dungeonContent,
  dungeonRowOrder,
  roomModifier,
  type TurnOrder,
} from '@creatures/game';
import type { Creature } from './api';
import type { DungeonModifier, DungeonRunRequest, Element, Zone } from './dungeon-types';
import type { Role } from '@creatures/game';
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

/**
 * The engine's zones are what Shield Wall asks for on the wire. In a row of three each zone is one
 * creature: `front` is the left creature, `middle` the one in the middle and `back` the right one.
 */
export const DUNGEON_ZONES: readonly Zone[] = ['front', 'middle', 'back'];
export const DUNGEON_ZONE_NAMES: Readonly<Record<Zone, string>> = {
  front: 'Left creature',
  middle: 'Middle creature',
  back: 'Right creature',
};
export const DUNGEON_ELEMENTS: readonly Element[] = ['tide', 'ember', 'grove', 'spark'];

/** The creature in each place of the row, left to right; null for an empty place. */
export type Slots = readonly [string | null, string | null, string | null];

export const EMPTY_SLOTS: Slots = [null, null, null];

/** The highest round a player can ask an ability to fire in: the longest room (the room boss). */
export const MAX_FIRE_ROUND: number = Math.max(...dungeonContent.foes.map((f) => f.rounds));

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
      return { slots, selected, hint: 'Tap one of your creatures first, then a place in the row.' };
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

// --- What the order means ---

/** The turn orders a room can make everybody follow, in words. */
const ORDER_WORDS: Readonly<Record<TurnOrder, string>> = {
  left_to_right: 'left to right',
  right_to_left: 'right to left',
  speed: 'fastest first',
};

/**
 * The lines under the row that say what the order of the team means: the foe's attack and the
 * Guard, then a line for every room of the day whose modifier fixes the turn order (the foes of a
 * room are not known until the run, so a modifier is all there is to show beforehand).
 */
export function rowNotes(
  modifiers: readonly Pick<DungeonModifier, 'room' | 'id' | 'name'>[],
): string[] {
  const notes = [
    "The foe's plain attack goes for the left creature first. A Guard covers the creatures beside it, so it likes the middle.",
    'Each foe acts in its own order: left to right, right to left or fastest first. You see which in every room.',
  ];
  for (const m of modifiers) {
    const order = roomModifier(m.id)?.effects.find((e) => e.op === 'turn_order');
    if (order?.op !== 'turn_order') continue;
    const total = modifiers.length;
    const where = m.room === total - 1 ? 'The room boss' : `Room ${String(m.room + 1)}`;
    notes.push(
      `${where} has ${m.name}: everyone acts ${ORDER_WORDS[order.order]}, so the order of your row is the turn order.`,
    );
  }
  return notes;
}

// --- Abilities ---

/** What the player set for the run's abilities. `null` rounds mean "Auto": the ability's default round. */
export interface AbilitySettings {
  basicId: string;
  basicRound: number | null;
  /** For Shield Wall: the engine's zone, which in the row of three is one creature (see `DUNGEON_ZONE_NAMES`). */
  zone: Zone;
  /** For Re-mark. */
  element: Element;
  /** Fire round by creature id, for creature abilities; a missing id means Auto. */
  creatureRounds: Readonly<Record<string, number | null>>;
}

export const DEFAULT_ABILITY_SETTINGS: AbilitySettings = {
  basicId: 'rally',
  basicRound: null,
  zone: 'front',
  element: 'tide',
  creatureRounds: {},
};

/** The kinds of choice a basic ability asks for. */
export function basicParams(abilityId: string): { zone: boolean; element: boolean } {
  const def = content.finaleAbilities.find((a) => a.id === abilityId);
  const ops = new Set(def?.effects.map((e) => e.op) ?? []);
  return { zone: ops.has('shield_wall'), element: ops.has('re_mark') };
}

/**
 * True for a basic ability that does nothing in the dungeon: Purge removes a boss's Phase 2
 * adaptation, and the dungeon's foes have none.
 */
export function uselessInDungeon(abilityId: string): boolean {
  const def = content.finaleAbilities.find((a) => a.id === abilityId);
  return def !== undefined && def.effects.every((e) => e.op === 'purge');
}

/** The round an ability fires in on Auto, from the content; null when the content does not have it. */
export function defaultRoundOf(abilityId: string): number | null {
  return content.finaleAbilities.find((a) => a.id === abilityId)?.defaultRound ?? null;
}

/** A creature with an unlocked ability that stands in the team: the ones whose round can be set. */
export interface CreatureAbilityChoice {
  creatureId: string;
  name: string;
  abilityId: string;
  round: number | null;
}

/** The unlocked creature abilities of the placed creatures, left to right. */
export function creatureAbilityChoices(
  slots: Slots,
  creatures: readonly Creature[],
  settings: AbilitySettings,
  nameOf: (creature: Creature) => string,
): CreatureAbilityChoice[] {
  const out: CreatureAbilityChoice[] = [];
  for (const id of slots) {
    const creature = creatures.find((c) => c.id === id);
    if (creature?.ability?.unlocked !== true) continue;
    out.push({
      creatureId: creature.id,
      name: nameOf(creature),
      abilityId: creature.ability.id,
      round: settings.creatureRounds[creature.id] ?? null,
    });
  }
  return out;
}

/** The choices of a fire-round list: Auto, then rounds 1 to the longest room. */
export function roundOptions(): { value: number | null; label: string }[] {
  return [
    { value: null, label: 'Auto' },
    ...Array.from({ length: MAX_FIRE_ROUND }, (_, i) => ({
      value: i + 1,
      label: `Round ${String(i + 1)}`,
    })),
  ];
}

/** Reads a select's value back into a round: "" is Auto; anything outside the list is Auto too. */
export function parseRound(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_FIRE_ROUND ? n : null;
}

// --- The request ---

/**
 * The body of `POST /api/dungeon/run`, or null when the team is not complete. Only rounds the
 * player set are sent for creature abilities (the rest fire on Auto), and a zone or element only
 * for the ability that asks for it. The key is the caller's.
 */
export function buildRunRequest(
  slots: Slots,
  creatures: readonly Creature[],
  settings: AbilitySettings,
  idempotencyKey: string,
): DungeonRunRequest | null {
  if (!isComplete(slots)) return null;
  const [a, b, c] = slots as readonly [string, string, string];
  const params = basicParams(settings.basicId);
  const chosen = creatureAbilityChoices(slots, creatures, settings, (x) => x.id).filter(
    (x) => x.round !== null,
  );
  return {
    team: [a, b, c],
    abilities: {
      basic: {
        abilityId: settings.basicId,
        fireAtRound: settings.basicRound,
        ...(params.zone ? { zone: settings.zone } : {}),
        ...(params.element ? { element: settings.element } : {}),
      },
      creatures: chosen.map((x) => ({ creatureId: x.creatureId, fireAtRound: x.round })),
    },
    idempotencyKey,
  };
}

/** The part of a request that decides what the server does: a different one needs a different key. */
export function requestSignature(request: Omit<DungeonRunRequest, 'idempotencyKey'>): string {
  return JSON.stringify([request.team, request.abilities]);
}
