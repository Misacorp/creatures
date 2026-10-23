import type { CreatureSpecies } from './schema';

/**
 * The Valley Games' size of a species: small when it is stage 1 of a line that still evolves (it has
 * growing to do). An evolved creature is big, and so is a single-stage line (full grown at stage 1).
 * The one definition: the engine's entrants and the client's picker both read it.
 */
export function gamesIsSmall(species: Pick<CreatureSpecies, 'stage' | 'evolvesTo'>): boolean {
  return species.stage === 1 && species.evolvesTo !== undefined;
}
