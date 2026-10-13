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
import { loadLore, pickQuirkFrom } from './lore';
import { loadContent } from './load';

export * from './schema';
export { loadContent, upgradeProblem, STARTER_COUNT } from './load';
export * from './lore';
export * from './glossary-schema';

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
