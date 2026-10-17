import { RULES } from '@creatures/game';
import { CATCHABLE, speciesOf, type OwnedCreature } from './data';

/*
 * The spending policy of a simulated player. Today's archetypes all follow it as it is written here
 * (they differ only in how often they leet and check in); a player profile (`profiles.ts`) turns its
 * parts into dials: whom to train (`trainFocus`, see `training.ts`), which activities get a treat,
 * whether to push evolutions, and how often to send trips and work the gear.
 *
 * At each check-in, in this order:
 * 1. Claim finished expeditions and take an end-of-trip goal that costs no waiting (see `trips.ts`).
 * 2. Claim finished Workshop jobs (see `gear.ts`).
 * 3. Evolve every creature that is at its evolution level when the player has the Essence.
 * 4. Buy the ribbon of every creature that waits at level 10 or 20 when the materials are in the purse.
 * 5. Put talents from the Talent Book into open slots (Bait), manage the gear, and send trips into the
 *    free expedition slots (`trips.ts`). Levels come from what creatures do: the trip, the dungeon, the
 *    raid stage and the Workshop job each pay experience (`training.ts`). Expeditions are free and
 *    supplies cannot be bought: a trip carries the supplies in stock that help (found on trips, dropped
 *    by the dungeon, crafted in the workshop, or an explorer rank gift). A treat packed as an activity
 *    starts costs Bait and doubles one creature's experience for it.
 */

/** True when every catchable species is owned and fully fused (the collection is done). */
export function collectionComplete(creatures: readonly OwnedCreature[]): boolean {
  return CATCHABLE.every((s) => {
    const owned = creatures.find((c) => c.line === s.line);
    return owned !== undefined && owned.fusionCount >= RULES.fusion.maxFusions;
  });
}

/** True while the creature still has to reach the level at which it evolves. */
export function isPreEvolution(c: OwnedCreature): boolean {
  const evo = speciesOf(c.speciesId).evolvesTo;
  return evo !== undefined && c.level < evo.level;
}
