import { playersOf, type Results } from './scenarios';
import type { PlayerRun } from './sim';
import type { WeekRecord } from './types';
import { levelOf, round } from './stats';
import { formName } from './forms';
import { median } from './util';

/**
 * The roster profile: the seam between combat v2 and the valley, in the shape of `RosterProfile` in `packages/lab/src/roster.ts`
 * on branch `combat-v2-track` (copied here as types so this package does not depend on that branch). Plain data: for each kind
 * of player and each week from 1 to 24, the levels of the player's 1st, 3rd, 10th and 20th creature, how many creatures they own,
 * which forms they hold (the ones at least half of the players of that kind are right now: an evolved creature is its second form and no longer its stage 1) (a level is 0 where the median player owns fewer creatures than the rank asks for: `size` says so), the open talent slots of their best creature, whether talents are picked (learned at the School: every open slot of the best creature, for at least half of the players), and a gear level.
 */
export const ROSTER_WEEKS = 24;

/**
 * Which servers are pooled: `daily` and `weekly` are the medians of every daily (or weekly) player of the mixed servers of 5, 8 and 15,
 * all seeds together; `newPlayer` is the player who joins in week 6 of the 30-week mixed server of 8, by weeks since joining.
 */

export interface RosterWeek {
  readonly week: number;
  readonly first: number;
  readonly third: number;
  readonly tenth: number;
  readonly twentieth: number;
  readonly size: number;
  readonly forms: 'all' | readonly string[];
  readonly talentSlots: number;
  readonly talentsPicked: boolean;
  readonly gear: number;
}

export interface RosterProfile {
  readonly daily: readonly RosterWeek[];
  readonly weekly: readonly RosterWeek[];
  /** A new player's roster by weeks since joining (index 0: the week they join). */
  readonly newPlayer: readonly RosterWeek[];
}

/** The forms most players of a kind hold at the end of a week (at least half of them), by name. */
function formsAt(records: readonly WeekRecord[]): string[] {
  const counts = new Map<number, number>();
  for (const w of records) for (const h of new Set(w.held)) counts.set(h, (counts.get(h) ?? 0) + 1);
  return [...counts]
    .filter(([, n]) => n * 2 >= records.length)
    .map(([h]) => h)
    .sort((a, b) => a - b)
    .map(formName);
}

/** The median player of a kind, week by week (index 0 is each player's first week). */
function weeksFor(players: readonly PlayerRun[]): RosterWeek[] {
  return Array.from({ length: ROSTER_WEEKS }, (_, i) => {
    const records = players.flatMap((p) => (p.weeks[i] ? [p.weeks[i]] : []));
    const size = Math.round(median(records.map((w) => w.size)));
    // The level of the k-th best creature; 0 when the median player owns fewer than k creatures (never the level of a lower one).
    const level = (k: number): number =>
      size < k ? 0 : round(Math.min(30, median(records.map((w) => levelOf(w, k)))), 1);
    const first = level(1);
    return {
      week: i + 1,
      first,
      third: level(3),
      tenth: level(10),
      twentieth: level(20),
      size,
      forms: formsAt(records),
      // The open slots of the best creature (level 1, 20 and 25; the third on rare and epic lines) and whether at least half of the players'
      // best creatures have learned every one of them at the School.
      talentSlots: Math.round(median(records.map((w) => w.bestSlots))),
      talentsPicked:
        records.filter((w) => w.bestSlots > 0 && w.bestLearned >= w.bestSlots).length * 2 >=
        Math.max(1, records.length),
      gear: Math.round(median(records.map((w) => w.avgGear))),
    };
  });
}

export function rosterProfile(results: Results): RosterProfile {
  const pooled = (profile: string): PlayerRun[] =>
    ['mixed5', 'mixed8', 'mixed15'].flatMap((id) => playersOf(results[id], profile));
  return {
    daily: weeksFor(pooled('daily')),
    weekly: weeksFor(pooled('weekly')),
    // The 30-week server's week-6 joiner has 25 weeks since joining.
    newPlayer: weeksFor(playersOf(results['mixed8-long'], 'new')),
  };
}
