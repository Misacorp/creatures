import { chance, createSeededRng, evolutionsOf, type Evolution } from '@creatures/game';
import { pickTeam, speciesOf, type OwnedCreature } from './data';
import type { BranchStyle } from './profiles';

/*
 * The spending policy of a simulated player. Today's archetypes all follow it as it is written here
 * (they differ only in how often they leet and check in); a player profile (`profiles.ts`) turns its
 * parts into dials: whom to train (`trainFocus`, see `training.ts`), which activities get a treat,
 * whether to push evolutions, and how often to send trips and work the gear.
 *
 * At each check-in, in this order:
 * 1. Claim finished expeditions and take an end-of-trip goal that costs no waiting (see `trips.ts`).
 * 2. Claim finished Workshop jobs (see `gear.ts`).
 * 3. Evolve every creature that is at its evolution level when the player has the Essence. A line that
 *    grows two ways takes the form the player's `branch` style picks: the original form (`firstForm`) or
 *    the role-aware pick (`pickBranch`); `mixed`, the default, gives each player one or the other (see
 *    `usesRoleBranch`).
 * 4. Buy the ribbon of every creature that waits at level 10 or 20 when the materials are in the purse.
 * 5. Put talents from the Talent Book into open slots (Bait), manage the gear, and send trips into the
 *    free expedition slots (`trips.ts`). Levels come from what creatures do: the trip, the dungeon, the
 *    raid stage and the Workshop job each pay experience (`training.ts`). Expeditions are free and
 *    supplies cannot be bought: a trip carries the supplies in stock that help (found on trips, dropped
 *    by the dungeon, crafted in the workshop, or an explorer rank gift). A treat packed as an activity
 *    starts costs Bait and doubles one creature's experience for it.
 */

/** Chooses the form a ready creature grows into (undefined: it cannot evolve). */
export type BranchPick = (
  creatures: readonly OwnedCreature[],
  creature: OwnedCreature,
) => Evolution | undefined;

/** The first (original) form, whatever the team. */
export const firstForm: BranchPick = (_creatures, creature) =>
  evolutionsOf(speciesOf(creature.speciesId))[0];

/**
 * The form a creature grows into. A line with one form has only that one. A line that grows two ways
 * (every evolving line: Sproutle is Thornbuck, a Guard, or Sunfawn, a Support; Zipmouse is Voltaro, a Setter,
 * or Ohmouse, a Guard; Stormray is Tempestray, a Payoff, or Halcyray, a Support; and so on)
 * takes the form whose role the rest of the team does not have yet, else the first form (the original
 * evolution). The rest of the team is the three strongest creatures without this one. It is deliberately
 * the simple choice an engaged player makes without a spreadsheet: "my team has no healer, so the healer".
 * Keep is not simulated (one creature per line, see the note in `docs/design/decisions.md`, 2026-10-19), so every
 * player grows each line one way.
 */
export function pickBranch(
  creatures: readonly OwnedCreature[],
  creature: OwnedCreature,
): Evolution | undefined {
  const branches = evolutionsOf(speciesOf(creature.speciesId));
  if (branches.length < 2) return branches[0];
  const roles = new Set(
    pickTeam(creatures)
      .filter((c) => c.id !== creature.id)
      .map((c) => speciesOf(c.speciesId).role),
  );
  return branches.find((b) => !roles.has(speciesOf(b.species).role)) ?? branches[0];
}

/**
 * Whether a player picks the second form by role (`pickBranch`) rather than taking the first form: always
 * for `role`, never for `first`, and for `mixed` a fair coin drawn from the run's seed and the player's id
 * (so about half the players of a server do, and the same seed gives the same players).
 */
export function usesRoleBranch(style: BranchStyle, seed: string, playerId: string): boolean {
  if (style === 'first') return false;
  if (style === 'role') return true;
  return chance(createSeededRng(`${seed}:branch:${playerId}`), 1, 2);
}
