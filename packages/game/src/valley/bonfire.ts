import { catchUpMultiplier } from './formulas';
import type { ValleyRules } from './rules';

/**
 * The bonfire's pure rules (V-BON-2, V-BON-9, `docs/design/valley/systems/bonfire.md`): the catch-up target, the server's middle,
 * and who a small moment is about. The lab and the server share them; nothing here reads a clock or draws a number.
 */

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

/** The mean of the three best of `levels` (fewer when the player has fewer; 0 with none). */
export function topThreeMean(levels: readonly number[]): number {
  const best = [...levels].sort((a, b) => b - a).slice(0, 3);
  return best.length === 0 ? 0 : best.reduce((a, b) => a + b, 0) / best.length;
}

/** V-BON-2: the server's middle, the median of the active players' top-three means (0 with none). */
export const serverMiddleOf = (topThreeMeans: readonly number[]): number => median(topThreeMeans);

/**
 * V-BON-2: the level a player's creatures catch up toward, the higher of the player's 3rd-best level (the lowest they have when they
 * hold fewer than three) and the server's middle. Never below 1.
 */
export function catchUpTarget(levels: readonly number[], middle: number): number {
  const sorted = [...levels].sort((a, b) => b - a);
  const third = sorted[2] ?? sorted[sorted.length - 1] ?? 1;
  return Math.max(1, third, middle);
}

/** V-BON-2: a creature's multiplier in basis points, fixed at a visit (10000: none). */
export function catchUpBpOf(rules: Pick<ValleyRules, 'bonfire'>, level: number, target: number): number {
  return Math.round(catchUpMultiplier(rules, target - level) * 10_000);
}

/** Game days a creature that has not featured counts as having waited at most (the weight stops growing there). */
export const MOMENT_WAIT_CAP = 10;

/**
 * V-BON-9: the weight of a resting creature for a small moment: one more for each game day since it last featured, up to
 * `MOMENT_WAIT_CAP`; a creature that never has (`lastDay` null) weighs the most. So the creatures that have not featured lately come first
 * and a creature that just did still has a small chance.
 */
export function momentWeight(day: number, lastDay: number | null): number {
  if (lastDay === null) return MOMENT_WAIT_CAP + 1;
  return 1 + Math.min(MOMENT_WAIT_CAP, Math.max(0, day - lastDay));
}

/** Picks an index by weight from a roll in [0, 1) (-1 with no weights). */
export function pickByWeight(weights: readonly number[], roll: number): number {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (!(total > 0)) return -1;
  let point = Math.min(Math.max(roll, 0), 1 - 1e-12) * total;
  for (const [i, w] of weights.entries()) {
    point -= Math.max(0, w);
    if (point < 0) return i;
  }
  return weights.length - 1;
}
