import { baitForDay, dailyAllowance, leetBonusForDay } from '@creatures/game';

/**
 * The Bait income models the sims can play (docs/design/player-journey-sim.md, "Income models").
 *
 * - `current`: what the Worker pays today. A leet pays `baitForDay(n)` Bait to each of the n players
 *   who leeted that day; nothing is paid without a leet.
 * - `allowance`: the planned rework (`packages/game/src/rules/income.ts`). Every player who opens the
 *   game that day gets `dailyAllowance()`, and every leeter gets `leetBonusForDay(n)` on top.
 *
 * Both read their numbers from the shipped rules, so the sims follow the rules when they change.
 */
export const INCOME_MODELS = ['current', 'allowance'] as const;
export type IncomeModelId = (typeof INCOME_MODELS)[number];

/** What one day pays, given who played it. */
export interface DayIncome {
  /** Bait for each player who opened the game (the allowance; 0 in the `current` model). */
  perLogin: number;
  /** Bait for each player who leeted (the leet pay, or the leet bonus). */
  perLeet: number;
}

/** Income of a day on which `leeters` players leeted. */
export function dayIncome(model: IncomeModelId, leeters: number): DayIncome {
  if (model === 'allowance') {
    return { perLogin: dailyAllowance(), perLeet: leeters === 0 ? 0 : leetBonusForDay(leeters) };
  }
  return { perLogin: 0, perLeet: baitForDay(leeters) };
}

/** Bait one player earns on a day, from the day's income and whether they logged in and leeted. */
export function playerIncome(income: DayIncome, loggedIn: boolean, leeted: boolean): number {
  return (loggedIn ? income.perLogin : 0) + (leeted ? income.perLeet : 0);
}

export function parseIncomeModel(text: string): IncomeModelId {
  const found = INCOME_MODELS.find((m) => m === text);
  if (found === undefined) throw new Error(`--income must be one of ${INCOME_MODELS.join(', ')}`);
  return found;
}
