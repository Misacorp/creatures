import type { Rarity } from '../content/schema';
import { RULES } from './config';

/** Cumulative stat bonus in basis points after `fusionCount` fusions (capped at 5). */
export function fusionBonusBp(fusionCount: number): number {
  if (!Number.isInteger(fusionCount) || fusionCount < 0) {
    throw new RangeError(`fusionCount must be an integer >= 0, got ${fusionCount}`);
  }
  const index = Math.min(fusionCount, RULES.fusion.maxFusions);
  const bp = RULES.fusion.cumulativeBonusBp[index];
  if (bp === undefined) throw new Error('fusion table is shorter than maxFusions');
  return bp;
}

/** What the collection stores about one owned line. */
export interface CollectionEntry {
  fusionCount: number;
  shiny: boolean;
}

/** A catch as far as collection rules are concerned. */
export interface CaughtCreature {
  species: { rarity: Rarity };
  shiny: boolean;
}

export type CollectionOutcome =
  | { kind: 'new' }
  | { kind: 'fused'; newFusionCount: number; becameShiny: boolean }
  | { kind: 'converted'; bait: number; becameShiny: boolean };

/**
 * Decides what a catch does to the player's collection. A new line is added; a duplicate fuses
 * into the existing creature (+stats) until it has 5 fusions, after which it converts to Bait.
 * A shiny duplicate makes the existing creature shiny, also when the duplicate converts.
 */
export function applyCatchToCollection(
  entry: CollectionEntry | undefined,
  caught: CaughtCreature,
): CollectionOutcome {
  if (entry === undefined) return { kind: 'new' };
  const becameShiny = caught.shiny && !entry.shiny;
  if (entry.fusionCount >= RULES.fusion.maxFusions) {
    return {
      kind: 'converted',
      bait: RULES.fusion.convertBait[caught.species.rarity],
      becameShiny,
    };
  }
  return { kind: 'fused', newFusionCount: entry.fusionCount + 1, becameShiny };
}
