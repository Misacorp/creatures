import creatures from './data/creatures.json';
import elements from './data/elements.json';
import reactions from './data/reactions.json';
import bosses from './data/bosses.json';
import adaptations from './data/adaptations.json';
import finaleAbilities from './data/finale-abilities.json';
import guests from './data/guests.json';
import { loadContent } from './load';

export * from './schema';
export { loadContent, upgradeProblem, STARTER_COUNT } from './load';

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
