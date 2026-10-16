import { RULES, rankFactorBp } from '@creatures/game';

/**
 * The old per-level rule: boss HP +12% per average creature level above 1. The game no longer
 * places servers with it (every server starts at rank 1, `placementRank`); the raid sweep keeps it
 * to pick the rank a roster of a given level is fought at, so the sweep's bosses stay "as hard as
 * the creatures' levels say" while the curve is changed.
 */
export const SWEEP_HP_PER_LEVEL_BP = 1_200;

/**
 * The rank whose HP factor on the curve is closest to the old per-level rule for the average level
 * of `levels` (ties go to the lower rank). An empty roster gives rank 1. Used by the raid sweep
 * and the setup study, not by the game.
 */
export function sweepRank(levels: readonly number[]): number {
  if (levels.length === 0) return 1;
  let total = 0;
  for (const level of levels) total += Math.max(1, Math.floor(level));
  const avg = Math.max(1, Math.floor(total / levels.length));
  const target = 10_000 + SWEEP_HP_PER_LEVEL_BP * (avg - 1);
  let best = 1;
  let bestDiff = Math.abs(rankFactorBp(1) - target);
  for (let r = 2; r <= RULES.raid.scaling.maxRank; r++) {
    const diff = Math.abs(rankFactorBp(r) - target);
    if (diff >= bestDiff) break; // the factor only grows, so the difference has passed its minimum
    best = r;
    bestDiff = diff;
  }
  return best;
}
