import type { Rng } from '../rng';
import creatures from './data/creatures.json';
import elements from './data/elements.json';
import reactions from './data/reactions.json';
import bosses from './data/bosses.json';
import adaptations from './data/adaptations.json';
import finaleAbilities from './data/finale-abilities.json';
import guests from './data/guests.json';
import speciesLore from './data/species-lore.json';
import bossesLore from './data/bosses-lore.json';
import quirks from './data/quirks.json';
import destinationsJson from './data/destinations.json';
import goalsJson from './data/push-on-goals.json';
import journalJson from './data/journal.json';
import specialsJson from './data/weekly-specials.json';
import suppliesJson from './data/supplies.json';
import {
  loadExpeditions,
  type DestinationDef,
  type ExpeditionPack,
  type JournalEntryDef,
  type PushOnGoalDef,
  type SupplyDef,
} from './expedition-schema';
import { loadLore, pickQuirkFrom } from './lore';
import { loadContent } from './load';

export * from './schema';
export { loadContent, upgradeProblem, STARTER_COUNT } from './load';
export * from './lore';
export * from './glossary-schema';
export * from './gear-schema';
export * from './gear';
export * from './dungeon-schema';
export * from './dungeon';
export * from './expedition-schema';

/** The shipped content pack, validated at module load. */
export const content = loadContent({
  version: 1,
  elements,
  creatures,
  reactions,
  bosses,
  adaptations,
  finaleAbilities,
  guests,
});

/**
 * Species and boss lore, visual briefs, traits and quirks, validated against `content` at module
 * load. Player-facing parts (descriptions, traits, quirk text) are shown by the Activity; the
 * visual brief (`appearance`) is for art only.
 */
export const lore = loadLore({ species: speciesLore, bosses: bossesLore, quirks }, content);

const LINE_OF_SPECIES = new Map<string, string>(content.creatures.map((c) => [c.id, c.line]));
const QUIRK_TEXT = new Map<string, string>(
  [...lore.quirks.general, ...Object.values(lore.quirks.againstType).flat()].map((q) => [
    q.id,
    q.text,
  ]),
);

/**
 * Picks the quirk id of a new creature of `speciesId`: about 75% from the general pool and 25% from
 * the species' "against type" quirks. Pure given `rng`; on the server pass the live crypto RNG.
 */
export function pickQuirk(speciesId: string, rng: Rng): string {
  return pickQuirkFrom(lore.quirks, LINE_OF_SPECIES.get(speciesId), rng);
}

/** The text of a stored quirk id, or undefined for an id that is not in the data. */
export function quirkText(id: string): string | undefined {
  return QUIRK_TEXT.get(id);
}

/**
 * The expedition content (destinations, supplies, push-on goals, the journal and the weekly special),
 * validated against `content` at module load.
 */
export const expeditionContent: ExpeditionPack = loadExpeditions(
  {
    destinations: destinationsJson,
    supplies: suppliesJson,
    goals: goalsJson,
    journal: journalJson,
    specials: specialsJson,
  },
  content,
);

const DESTINATIONS = new Map<string, DestinationDef>(
  expeditionContent.destinations.map((d) => [d.id, d]),
);
const SUPPLIES = new Map<string, SupplyDef>(expeditionContent.supplies.map((s) => [s.id, s]));
const GOALS = new Map<string, PushOnGoalDef>(expeditionContent.goals.map((g) => [g.id, g]));
const ENTRIES = new Map<string, JournalEntryDef>(
  expeditionContent.journal.entries.map((e) => [e.id, e]),
);

/** A destination by id, or undefined. */
export function destinationDef(id: string): DestinationDef | undefined {
  return DESTINATIONS.get(id);
}

/** A supply by id (`lure-good`), or undefined. */
export function supplyDef(id: string): SupplyDef | undefined {
  return SUPPLIES.get(id);
}

/** A push-on goal by id, or undefined. */
export function goalDef(id: string): PushOnGoalDef | undefined {
  return GOALS.get(id);
}

/** A journal entry by id, or undefined. */
export function journalEntry(id: string): JournalEntryDef | undefined {
  return ENTRIES.get(id);
}
