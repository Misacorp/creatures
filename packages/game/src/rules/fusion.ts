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

/** `new`: the line was not owned. `duplicate`: it was; the catch waits as a choice (Teach, Fuse, Release or Keep). */
export type CollectionOutcome = { kind: 'new' } | { kind: 'duplicate'; becameShiny: boolean };

/**
 * Decides what a catch does to the player's collection. A new line is added. A duplicate no longer
 * fuses by itself (and never turns into Bait): it arrives as a pending card with its rolled talent and
 * the player chooses (docs/design/gear-and-creatures-v2.md section 8.2). A shiny duplicate makes the
 * creature the player owns shiny at once.
 */
export function applyCatchToCollection(
  entry: CollectionEntry | undefined,
  caught: CaughtCreature,
): CollectionOutcome {
  if (entry === undefined) return { kind: 'new' };
  return { kind: 'duplicate', becameShiny: caught.shiny && !entry.shiny };
}

/** The fusion count after one more fusion, or null when the creature has all of them already. */
export function fuseOnce(fusionCount: number): number | null {
  if (!Number.isInteger(fusionCount) || fusionCount < 0) {
    throw new RangeError(`fusionCount must be an integer >= 0, got ${fusionCount}`);
  }
  return fusionCount >= RULES.fusion.maxFusions ? null : fusionCount + 1;
}
