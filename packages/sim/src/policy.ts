import { RULES, discountedTrainingCost, int, type Rng } from '@creatures/game';
import { CATCHABLE, byPowerDesc, creaturePower, speciesOf, type OwnedCreature } from './data';

/**
 * The spending policy of a simulated player. Today's archetypes all follow it as it is written here
 * (they differ only in how often they leet and check in); a player profile (`profiles.ts`) turns its
 * parts into dials: the share of the spare Bait that supplies may use, whom to train (`TrainingPlan`),
 * whether to push evolutions, and how often to send trips and work the gear.
 *
 * At each check-in, in this order:
 * 1. Claim finished expeditions and take an end-of-trip goal that costs no waiting (see `trips.ts`).
 * 2. Evolve every creature that is at its evolution level when the player has the Essence.
 * 3. Send trips into the free expedition slots (`trips.ts`) with a supplies budget: the Bait held above
 *    `supplyReserve` (all of it when nothing can be trained). Expeditions themselves are free; the budget
 *    only buys supplies, and a supply is bought only when it is worth enough (`TRIP_POLICY.buyWorthBp`).
 * 4. Train with the Bait that is left: repeatedly pick a creature with `chooseTrainee` and train it
 *    while the (catch-up discounted) cost is affordable. A creature still working towards its
 *    evolution level is trained until it gets there; otherwise the weakest of the 3 strongest
 *    trainable creatures goes first. Creatures at their level cap are not trainable.
 */
export const POLICY = {
  /**
   * Bait a player keeps for training before anything goes to supplies, at check-in time. Chosen so
   * that the Bait spent on supplies rises with income the way the Bait spent on trips did in v1 (a
   * small share at low income, a large one at high income): the raid sweep places the boss by the
   * creatures' levels, so the levels at weeks 4 and 8 must stay where they were.
   */
  supplyReserve: 43,
} as const;

/** True when every catchable species is owned and fully fused: more expeditions only convert to Bait. */
export function collectionComplete(creatures: readonly OwnedCreature[]): boolean {
  return CATCHABLE.every((s) => {
    const owned = creatures.find((c) => c.line === s.line);
    return owned !== undefined && owned.fusionCount >= RULES.fusion.maxFusions;
  });
}

export function isTrainable(c: OwnedCreature): boolean {
  return c.level < speciesOf(c.speciesId).levelCap;
}

/** True while the creature still has to reach the level at which it evolves. */
export function isPreEvolution(c: OwnedCreature): boolean {
  const evo = speciesOf(c.speciesId).evolvesTo;
  return evo !== undefined && c.level < evo.level;
}

/** How a player picks the creature to train next (a profile's training dials). */
export interface TrainingPlan {
  /** The creatures that share the Bait: the strongest 3 or 6, or any trainable creature (`spread`). */
  focus: 3 | 6 | 'spread';
  /** Rush a creature that is working towards its evolution before levelling the rest. */
  evolutionPush: boolean;
}

/** Today's policy: the top 3, with the evolution push. */
export const LEGACY_TRAINING: TrainingPlan = { focus: 3, evolutionPush: true };

/**
 * The creature to train next, or null if nothing can be trained. Of the player's `focus` strongest
 * trainable creatures (3 by default), the one furthest along (highest level) among those that still
 * have to reach their evolution level goes first when the plan pushes evolutions: players push one
 * creature to its evolution before starting on the next, so a creature caught today does not take
 * over the training from the one that is almost there. When none of them is working towards an
 * evolution (or the plan does not push), the weakest (lowest level) goes first, so the team levels up
 * evenly. Ties go to the stronger creature. With focus `spread` any trainable creature may be picked:
 * one drawn from `rng` (the player trains whatever they fancy); without an `rng` the weakest goes.
 */
export function chooseTrainee(
  creatures: readonly OwnedCreature[],
  plan: TrainingPlan = LEGACY_TRAINING,
  rng?: Rng,
): OwnedCreature | null {
  const trainable = byPowerDesc(creatures.filter(isTrainable));
  if (plan.focus === 'spread' && rng !== undefined) {
    return trainable.length === 0 ? null : (trainable[int(rng, trainable.length)] ?? null);
  }
  const top = plan.focus === 'spread' ? trainable : trainable.slice(0, plan.focus);
  const evolvers = plan.evolutionPush ? top.filter(isPreEvolution) : [];
  const pool = evolvers.length > 0 ? evolvers : top;
  const towardsEvolution = evolvers.length > 0;
  let best: OwnedCreature | null = null;
  for (const c of pool) {
    const better =
      best === null ||
      (towardsEvolution ? c.level > best.level : c.level < best.level) ||
      (c.level === best.level && creaturePower(c) > creaturePower(best));
    if (better) best = c;
  }
  return best;
}

export function trainCost(creature: OwnedCreature, serverMedianLevel: number): number {
  return discountedTrainingCost(creature.level, serverMedianLevel);
}
