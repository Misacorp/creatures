import { RULES } from './config';

/**
 * Bait income (Misa, 2026-10-15; numbers by the lead): a daily allowance for opening the game, plus
 * a bonus for a leet that grows with how many players leeted that day. A solo leet pays 40 in all
 * (25 + 15), a leet with 10 or more players 57 (25 + 32). The bonus table never decreases and a solo
 * leet pays the same as a double, as the old leet table did.
 */

/** Bait for opening the game on a game day (once a day, from the 13:37 reset). */
export function dailyAllowance(): number {
  return RULES.income.dailyAllowance;
}

/** Bait each leeter earns on top of the allowance on a day `leeters` players leeted. */
export function leetBonusForDay(leeters: number): number {
  if (!Number.isSafeInteger(leeters) || leeters < 0) {
    throw new Error('leeters must be a non-negative integer');
  }
  const table = RULES.income.leetBonusByCount;
  const last = table[table.length - 1] ?? 0;
  return leeters < table.length ? (table[leeters] ?? last) : last;
}
