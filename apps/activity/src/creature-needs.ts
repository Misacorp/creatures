/**
 * What a creature needs from the player, as the Creatures tab shows it: the one gold button on a card and
 * the "Needs you" filter. Pure; every fact is the server's (ribbon `ready`, evolution `available`, the
 * waiting duplicates and what a Talent Book slotting costs), nothing is computed here beyond "is it ready".
 */
import type { Creature, GameState } from './api';
import { ribbonCostText, ribbonName } from './experience';
import { speciesName } from './game';
import { busyReason } from './gear-view';
import { bookActions } from './talent-view';

export type NeedKind = 'ribbon' | 'evolve' | 'duplicate' | 'talent';

export interface Need {
  kind: NeedKind;
  /** The button's words ("Earn Bronze Ribbon"). */
  label: string;
  /** The small line under the label (the cost, or where to answer). */
  detail: string;
  /** Why the button cannot be used now (the creature is away or on a job); the card shows it disabled. */
  blocked?: string;
}

/** The part of the game state the needs depend on. */
export type NeedsState = Pick<GameState, 'balances' | 'pending' | 'bookSlotBait'>;

/** Needs in the order the card puts them: the first one is the card's gold button. */
export function creatureNeeds(creature: Creature, state: NeedsState): Need[] {
  const needs: Need[] = [];
  if (creature.ribbon?.ready === true) {
    needs.push({
      kind: 'ribbon',
      label: `Earn ${ribbonName(creature.ribbon.id)}`,
      detail: ribbonCostText(creature.ribbon),
    });
  }
  if (creature.evolution?.available === true) {
    // The server refuses to evolve a creature that is away or on a job: say so instead of asking.
    const blocked = busyReason(creature);
    needs.push({
      ...(blocked === null ? {} : { blocked }),
      kind: 'evolve',
      label:
        creature.evolution.alt === undefined
          ? `Evolve into ${speciesName(creature.evolution.toSpecies)}`
          : 'Choose an evolution',
      detail: blocked ?? `${String(creature.evolution.essence)} Essence`,
    });
  }
  const waiting = state.pending.filter(
    (card) => card.offered.teach.includes(creature.id) || card.offered.fuse.includes(creature.id),
  );
  const first = waiting[0];
  if (first !== undefined) {
    needs.push({
      kind: 'duplicate',
      label: waiting.length === 1 ? 'Answer a waiting catch' : 'Answer waiting catches',
      detail:
        waiting.length === 1 ? speciesName(first.species) : `${String(waiting.length)} waiting`,
    });
  }
  const emptySlot = creature.talents.slots.find((s) => s.open && s.talent === null);
  if (
    emptySlot !== undefined &&
    state.balances.bait >= state.bookSlotBait &&
    bookActions(creature).some((a) => a.slot === emptySlot.slot)
  ) {
    needs.push({
      kind: 'talent',
      label: `Fill talent slot ${String(emptySlot.slot)}`,
      detail: `${String(state.bookSlotBait)} Bait`,
    });
  }
  return needs;
}

/** The ids of the creatures that need the player (for the "Needs you" filter and its count). */
export function needyIds(creatures: readonly Creature[], state: NeedsState): Set<string> {
  return new Set(creatures.filter((c) => creatureNeeds(c, state).length > 0).map((c) => c.id));
}
