import { RULES } from './config';

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
