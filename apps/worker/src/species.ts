import { content, type CreatureSpecies } from '@creatures/game';

const SPECIES = new Map<string, CreatureSpecies>(content.creatures.map((c) => [c.id, c]));

/** A species by id. Throws for an id that is not in the content (stored data is trusted to be valid). */
export function speciesOf(id: string): CreatureSpecies {
  const species = SPECIES.get(id);
  if (species === undefined) throw new Error('stored creature has an unknown species');
  return species;
}
