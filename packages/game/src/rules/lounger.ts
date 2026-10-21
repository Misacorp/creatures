import { RULES } from './config';
import { int, type Rng } from '../rng';

/**
 * Picks the creature that lounges in the living room: one of the player's idle creatures, uniformly
 * at random, or null when there is none (every creature is busy, or the player has none). The
 * caller decides which creatures are idle; the pick draws from the injected RNG exactly once when
 * there is a choice, and not at all when there is none or only one.
 */
export function pickLounger(idleIds: readonly string[], rng: Rng): string | null {
  const first = idleIds[0];
  if (first === undefined) return null;
  if (idleIds.length === 1) return first;
  return idleIds[int(rng, idleIds.length)] ?? null;
}

// --- Lounging with company ---

/** One creature's lounging tally for the current game day, and its player's time not yet paid. */
export interface LoungeTally {
  /** Experience the creature got from lounging today, at most the daily cap. */
  paid: number;
  /** The player's company time short of one more experience (less than `msPerXp`). */
  carryMs: number;
}

/** True when a creature has had all of today's lounging experience. */
export function isRested(paidToday: number): boolean {
  return paidToday >= RULES.experience.lounge.dailyCap;
}

/**
 * Pays `ms` more company time to a creature that has had `tally.paid` today: one experience per whole
 * `msPerXp` (with the carry), up to the daily cap. At the cap the carry is dropped. Pure.
 */
export function loungeExperience(
  tally: LoungeTally,
  ms: number,
): { xp: number; tally: LoungeTally } {
  if (!Number.isInteger(ms) || ms < 0) {
    throw new RangeError(`ms must be a whole number >= 0, got ${String(ms)}`);
  }
  const { msPerXp, dailyCap } = RULES.experience.lounge;
  const total = tally.carryMs + ms;
  const xp = Math.min(Math.max(0, dailyCap - tally.paid), Math.floor(total / msPerXp));
  const paid = tally.paid + xp;
  return { xp, tally: { paid, carryMs: paid >= dailyCap ? 0 : total - xp * msPerXp } };
}
