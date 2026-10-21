/**
 * The send flow as plain functions: who can go to the chosen place (with the reason when one cannot),
 * which trip length stays valid when the explorer changes, and why the Send button may be disabled. The
 * server decides every send; this only explains a "no" before the tap.
 */
import { EXPEDITION_LENGTHS, lengthOpen } from '@creatures/game';
import type { Creature } from './api';
import type { CreatureInfo } from './creature-info';
import type { DestinationCard } from './destination-view';
import type { DestinationsView, ExpeditionLength, Slots, SupplyPick } from './expedition-types';
import { creatureName, getSpecies } from './game';
import { busyReason } from './gear-view';
import { explorerXp, kitBlocker, lengthOptions, type ExplorerXp } from './trip-view';

export interface ExplorerOption {
  creature: Creature;
  name: string;
  rank: number;
  /** What the XP bar shows: the XP into the rank, its span and the rank caps. */
  xp: ExplorerXp;
  /** Stars this creature has at the chosen place (0 to 3): familiarity is a trait of the creature. */
  stars: number;
  /** Finished trips this creature has made to the chosen place. */
  trips: number;
  /** Why it cannot go to the chosen place now; null when it can. */
  blocked: string | null;
}

/** The stars of a creature at a place, from the destinations view. */
export function starsAt(
  view: Pick<DestinationsView, 'familiarity'> | null,
  creatureId: string,
  destination: string,
): number {
  return (
    view?.familiarity.find((f) => f.creatureId === creatureId && f.destination === destination)
      ?.stars ?? 0
  );
}

/** The finished trips of a creature to a place, from the destinations view. */
export function tripsAt(
  view: Pick<DestinationsView, 'familiarity'> | null,
  creatureId: string,
  destination: string,
): number {
  return (
    view?.familiarity.find((f) => f.creatureId === creatureId && f.destination === destination)
      ?.trips ?? 0
  );
}

/** "No trips here yet", "1 trip here", "4 trips here": the trips of a creature to the chosen place. */
export function tripsHereText(trips: number): string {
  if (trips <= 0) return 'No trips here yet';
  return `${String(trips)} ${trips === 1 ? 'trip' : 'trips'} here`;
}

/**
 * The creatures that could be sent, free ones first (the higher rank first), then the busy ones with
 * why. A creature below the place's rank is listed but blocked.
 */
export function explorerOptions(
  creatures: readonly Creature[],
  place: Pick<DestinationCard, 'id' | 'minRank'> | undefined,
  view: Pick<DestinationsView, 'familiarity'> | null,
): ExplorerOption[] {
  const options = creatures.map<ExplorerOption>((creature) => {
    const rank = creature.explorer.rank;
    const busy = busyReason(creature);
    const tooLow = place !== undefined && rank < place.minRank;
    return {
      creature,
      name: creatureName(creature),
      rank,
      xp: explorerXp(creature.explorer),
      stars: place === undefined ? 0 : starsAt(view, creature.id, place.id),
      trips: place === undefined ? 0 : tripsAt(view, creature.id, place.id),
      blocked:
        busy ?? (tooLow ? `Needs explorer rank ${String(place.minRank)} for this place` : null),
    };
  });
  const rankOrder = (a: ExplorerOption, b: ExplorerOption): number =>
    b.rank - a.rank ||
    b.creature.explorer.xp - a.creature.explorer.xp ||
    a.name.localeCompare(b.name);
  return [
    ...options.filter((o) => o.blocked === null).sort(rankOrder),
    ...options.filter((o) => o.blocked !== null).sort(rankOrder),
  ];
}

/** The explorer to start on: the one picked if it still exists, else the first that can go, else the first. */
export function defaultExplorer(
  options: readonly ExplorerOption[],
  picked: string | null,
): ExplorerOption | undefined {
  return (
    options.find((o) => o.creature.id === picked) ??
    options.find((o) => o.blocked === null) ??
    options[0]
  );
}

/** The trip length to keep when the explorer changes: the same one if it is still open, else the longest open one. */
export function clampLength(length: ExpeditionLength, rank: number): ExpeditionLength {
  if (lengthOpen(length, rank)) return length;
  const open = lengthOptions(rank);
  return open.at(-1)?.id ?? EXPEDITION_LENGTHS[0];
}

/** The steps of the phone wizard: who goes, pack up (length, supplies, treat), ready (the summary). */
export type SendStep = 'who' | 'pack' | 'ready';

/** What a trip is as chosen so far: the plain data the blockers read. */
export interface SendChoice {
  slots: Slots;
  explorer: ExplorerOption | undefined;
  place: DestinationCard | undefined;
  length: ExpeditionLength;
  picks: readonly SupplyPick[];
  stock: Readonly<Record<string, number>>;
}

/** Why the Who step cannot go on: no free slot, no place, nobody, or this creature cannot go. */
function whoBlocker({ slots, explorer, place }: SendChoice): string | null {
  if (slots.used >= slots.total) {
    return `All ${String(slots.total)} expedition ${slots.total === 1 ? 'slot is' : 'slots are'} in use. Claim a trip first.`;
  }
  if (place === undefined) return 'Pick a place first.';
  if (explorer === undefined) return 'No creature to send.';
  if (explorer.blocked !== null) return `${explorer.name}: ${explorer.blocked}.`;
  return null;
}

/** Why the Pack step cannot go on: a length too long for the explorer or a supply that is not in stock. */
function packBlocker({ explorer, length, picks, stock }: SendChoice): string | null {
  if (explorer !== undefined && !lengthOpen(length, explorer.rank)) {
    return 'That trip is too long for this explorer.';
  }
  return kitBlocker(picks, stock);
}

/**
 * Why Next is disabled on a step (null when it is not): Who and Pack each check their own part, Ready
 * checks everything a send needs (`sendBlocker`).
 */
export function stepBlocker(step: SendStep, form: SendChoice): string | null {
  if (step === 'who') return whoBlocker(form);
  if (step === 'pack') return packBlocker(form);
  return sendBlocker(form);
}

/** Why a trip cannot be sent as chosen; null when it can. A place the clock shuts counts ("Opens tonight at 20:00"). */
export function sendBlocker(args: SendChoice): string | null {
  const who = whoBlocker(args);
  if (who !== null) return who;
  const rule = args.place?.timeRule ?? null;
  if (rule !== null) return rule.text;
  return packBlocker(args);
}

/** What the small-creature popover shows for an explorer; null for a species the content does not know. */
export function explorerInfo(creature: Creature): CreatureInfo | null {
  const species = getSpecies(creature.species);
  if (species === undefined) return null;
  return {
    name: creatureName(creature),
    species: creature.species,
    level: creature.level,
    element: species.element,
    role: species.role,
  };
}
