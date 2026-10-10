import { RULES } from './config';

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be an integer >= 1, got ${level}`);
  }
}

/** Bait needed to go from `level` to `level + 1`: 10 + 5 x level. */
export function trainingCost(level: number): number {
  assertLevel(level);
  return RULES.training.baseCost + RULES.training.perLevel * level;
}

/**
 * Training cost with the catch-up discount: half (rounded up) when the creature's level is more
 * than 5 below the server's median top-creature level. The median may be fractional.
 */
export function discountedTrainingCost(level: number, serverMedianLevel: number): number {
  const cost = trainingCost(level);
  if (level < serverMedianLevel - RULES.training.discountLevelsBelowMedian) {
    return Math.ceil(cost / 2);
  }
  return cost;
}

export interface TrainableCreature {
  level: number;
  /** Level cap of the creature's current species (stage 1 caps lower until it evolves). */
  levelCap: number;
  /** True while the creature is on an expedition. */
  away: boolean;
}

export function canTrain(creature: TrainableCreature): boolean {
  return !creature.away && creature.level < creature.levelCap;
}
