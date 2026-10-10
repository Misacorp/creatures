import {
  DURATION_IDS,
  RARITIES,
  RULES,
  SUPPLIES_IDS,
  discountedTrainingCost,
  expeditionCost,
  expeditionRolls,
  type DurationId,
  type SuppliesId,
} from '@creatures/game';
import { CATCHABLE, byPowerDesc, creaturePower, speciesOf, type OwnedCreature } from './data';

/**
 * The spending policy every simulated player follows (archetypes differ only in how often they
 * leet and check in, never in how they spend).
 *
 * At each check-in, in this order:
 * 1. Claim finished expeditions (catches go through the game's `rollCatches` and fusion rules).
 * 2. Evolve every creature that is at its evolution level when the player has the Essence.
 * 3. Plan expeditions. There are up to 3 slots, one per distinct creature. The budget is
 *    `expeditionShareBp` of the current Bait (all of it when nothing can be trained). Slots are
 *    filled one by one; each slot gets an equal share of what is left of the budget and buys the
 *    option with the highest value that fits. Value = rolls x expected rarity score of a roll
 *    (common 1, rare 4, epic 10), so more Bait buys longer trips and better supplies. A slot that
 *    cannot afford the cheapest option stays idle. A player whose collection is complete (every
 *    catchable species owned with 5 fusions) stops sending expeditions: they would only convert.
 * 4. Train with the Bait that is left after the planned expeditions: repeatedly pick the weakest
 *    (lowest level) of the player's 3 strongest trainable creatures and train it while the
 *    (catch-up discounted) cost is affordable. Creatures at their level cap are not trainable, so
 *    the 3 strongest trainable creatures are used.
 * 5. Send the planned expeditions. Explorers are the creatures whose element has the most
 *    catchable species the player does not own yet (ties by id), which uses explorer affinity.
 *
 * Expeditions are claimed at the next check-in; with a check-in at least every 12 hours the
 * longest trip always finishes in time, so creatures are never away when a check-in trains them.
 */
export const POLICY = {
  /** Share of the Bait at check-in time that expeditions may use (basis points). */
  expeditionShareBp: 5_000,
  /** Value of one catch by rarity, for ranking expedition options. */
  rarityScore: { common: 1, rare: 4, epic: 10 },
  expeditionSlots: 3,
} as const;

export interface ExpeditionOption {
  duration: DurationId;
  supplies: SuppliesId;
  cost: number;
  value: number;
}

/** Value of an option in basis-point-scores: rolls x sum(odds x rarity score). Integer maths. */
export function expeditionValue(duration: DurationId, supplies: SuppliesId): number {
  const odds = RULES.expedition.supplies[supplies].oddsBp;
  let perRoll = 0;
  for (const r of RARITIES) perRoll += odds[r] * POLICY.rarityScore[r];
  return expeditionRolls(duration) * perRoll;
}

export const EXPEDITION_OPTIONS: readonly ExpeditionOption[] = DURATION_IDS.flatMap((duration) =>
  SUPPLIES_IDS.map((supplies) => ({
    duration,
    supplies,
    cost: expeditionCost(duration, supplies),
    value: expeditionValue(duration, supplies),
  })),
);

/** The highest-value option that costs at most `maxCost` (ties: cheaper first); null if none. */
export function bestExpedition(maxCost: number): ExpeditionOption | null {
  let best: ExpeditionOption | null = null;
  for (const o of EXPEDITION_OPTIONS) {
    if (o.cost > maxCost) continue;
    if (best === null || o.value > best.value || (o.value === best.value && o.cost < best.cost)) {
      best = o;
    }
  }
  return best;
}

/** Plans up to `slots` expeditions within the budget (see the policy above). */
export function planExpeditions(
  balance: number,
  slots: number,
  hasTrainable: boolean,
): ExpeditionOption[] {
  let budget = hasTrainable ? Math.floor((balance * POLICY.expeditionShareBp) / 10_000) : balance;
  const plan: ExpeditionOption[] = [];
  for (let k = 0; k < slots; k++) {
    const share = Math.floor(budget / (slots - k));
    const option = bestExpedition(share);
    if (option === null) break;
    plan.push(option);
    budget -= option.cost;
  }
  return plan;
}

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

/** The weakest of the 3 strongest trainable creatures, or null if nothing can be trained. */
export function chooseTrainee(creatures: readonly OwnedCreature[]): OwnedCreature | null {
  const top = byPowerDesc(creatures.filter(isTrainable)).slice(0, 3);
  let best: OwnedCreature | null = null;
  for (const c of top) {
    if (
      best === null ||
      c.level < best.level ||
      (c.level === best.level && creaturePower(c) > creaturePower(best))
    ) {
      best = c;
    }
  }
  return best;
}

export function trainCost(creature: OwnedCreature, serverMedianLevel: number): number {
  return discountedTrainingCost(creature.level, serverMedianLevel);
}
