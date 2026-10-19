// Dodge: Speed gives a chance to take nothing from a hit (docs/design/combat-rules.md section 14).
// Part of the fight engine split from `fight.ts`; the shared state is `FightState` (`fight-state.ts`).
import { BOSS, effectiveSpd } from './fight-effects';
import type { Creature, FightState } from './fight-state';

/**
 * Dice a creature gets each round for the hits it takes (the Nth hit it takes that round, as the taker,
 * uses die N, counting every hit it takes whether or not that hit can be dodged). A creature that takes
 * more than this many hits in a round uses the last die for every later one, as Sidestep does with its
 * 4th. Eight is more than a creature meets in a round today (three plain attacks, a few moves, a splash
 * and an enrage hit).
 */
export const DODGE_TAKEN_DICE = 8;

/** Dodge dice run over [0, DODGE_RANGE): a chance of 1000 fires when its die is under 1000. */
export const DODGE_RANGE = 10_000;

/**
 * A creature's dodge chance in basis points: the Speed part (its Speed with its status effects folded in,
 * times `perSpeedBp`, rounded down) plus its flat `dodgeBp`, capped at `maxBp`. Against an area hit the
 * chance is `areaShareBp` of that (rounded down) plus its flat `areaDodgeBp` in full, capped at `maxBp`
 * again. 0 when the fight has no dodge.
 */
export function creatureDodgeBp(state: FightState, c: Creature, area: boolean): number {
  const d = state.dodge;
  if (d === undefined) return 0;
  const full = Math.min(
    d.maxBp,
    Math.floor(effectiveSpd(state, c) * d.perSpeedBp) + c.mods.dodgeBp,
  );
  if (!area) return full;
  return Math.min(d.maxBp, Math.floor((full * d.areaShareBp) / 10_000) + c.mods.areaDodgeBp);
}

/** The boss's (or foe's) dodge chance in basis points: its Speed (with its effects, Mired) times `perSpeedBp`, capped. */
export function bossDodgeBp(state: FightState): number {
  const d = state.dodge;
  if (d === undefined) return 0;
  return Math.min(d.maxBp, Math.floor(effectiveSpd(state, BOSS) * d.perSpeedBp));
}

/**
 * The die for the next hit `victim` takes this round, and counts the hit (every hit counts, so the
 * numbering never depends on which hits can be dodged).
 */
export function nextTakenDie(state: FightState, victim: Creature): number {
  const seen = state.dodgeSeen[victim.idx] ?? 0;
  state.dodgeSeen[victim.idx] = seen + 1;
  const dice = state.dodgeTakenDice[victim.idx];
  return dice?.[Math.min(seen, DODGE_TAKEN_DICE - 1)] ?? DODGE_RANGE;
}

/**
 * True when the boss dodges a creature's hit: its die for this creature's turn hit (or strike) of the
 * round is under the boss's chance. A missing die (dodge off) never dodges.
 */
export function bossDodges(state: FightState, c: Creature, strike: boolean): boolean {
  const chance = bossDodgeBp(state);
  if (chance <= 0) return false;
  const die = (strike ? state.dodgeStrikeDice : state.dodgeTurnDice)[c.idx] ?? DODGE_RANGE;
  return die < chance;
}
