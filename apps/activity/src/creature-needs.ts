/**
 * What a creature needs from the player, as the Creatures tab shows it: the one gold button on a card and
 * the "Needs you" filter. Pure; every fact is the server's (ribbon `ready`, evolution `available`, the
 * waiting duplicates and what a Talent Book slotting costs), nothing is computed here beyond "is it ready".
 */
import type { Creature, GameState } from './api';
import { ribbonCostText, ribbonName } from './experience';
import { creatureName, speciesName } from './game';
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
      // Just the verb: the evolve screen names the form (or the two to choose from).
      label: 'Evolve',
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

/**
 * The Essence a creature at its evolution level is short of, for the page's greyed Evolve button: the
 * price (the server's) and what the player has. Null when it can evolve, is below the level, has no
 * evolution, or the player has the price (then the server's `available` decides).
 */
export function evolveShortfall(
  creature: Creature,
  essence: number,
): { cost: number; have: number } | null {
  const evolution = creature.evolution;
  if (evolution === undefined || evolution.available) return null;
  if (creature.level < evolution.level || essence >= evolution.essence) return null;
  return { cost: evolution.essence, have: essence };
}

/**
 * The creatures that need the player for something they can act on now, for the Home board's Creatures
 * notice: those with a ribbon to earn, an evolution that is not blocked (a creature away or on a job cannot
 * evolve yet), or a talent slot to fill. A waiting duplicate is left out here: the catches have their own
 * line (the pending catches' count), so the same thing is never said twice.
 */
export function noticeNeeds(
  creatures: readonly Creature[],
  state: NeedsState,
): { creature: Creature; needs: Need[] }[] {
  const rows: { creature: Creature; needs: Need[] }[] = [];
  for (const creature of creatures) {
    const needs = creatureNeeds(creature, state).filter(
      (n) => n.kind !== 'duplicate' && n.blocked === undefined,
    );
    if (needs.length > 0) rows.push({ creature, needs });
  }
  return rows;
}

/**
 * What the Creatures notice says about the creatures themselves, or null when none needs the player: one
 * creature with one need is named ("Splashet can evolve", "Mistnewt can earn its Bronze Ribbon", "Pip has a
 * talent slot to fill"); one creature with several is "Pip needs you"; several creatures are counted ("3
 * creatures need you"). Names are text (a nickname is the player's own).
 */
export function creaturesNeedLine(
  creatures: readonly Creature[],
  state: NeedsState,
): string | null {
  const rows = noticeNeeds(creatures, state);
  const [first] = rows;
  if (first === undefined) return null;
  if (rows.length > 1) return `${String(rows.length)} creatures need you`;
  const name = creatureName(first.creature);
  const [only] = first.needs;
  if (first.needs.length > 1 || only === undefined) return `${name} needs you`;
  if (only.kind === 'evolve') return `${name} can evolve`;
  if (only.kind === 'ribbon' && first.creature.ribbon !== null) {
    return `${name} can earn its ${ribbonName(first.creature.ribbon.id)}`;
  }
  return `${name} has a talent slot to fill`;
}

/** The ids of the creatures that need the player (for the "Needs you" filter and its count). */
export function needyIds(creatures: readonly Creature[], state: NeedsState): Set<string> {
  return new Set(creatures.filter((c) => creatureNeeds(c, state).length > 0).map((c) => c.id));
}
