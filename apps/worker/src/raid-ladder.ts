/**
 * The Boss Rank ladder on the server (rules in `packages/game/src/rules/progression.ts`, design in
 * `docs/design/progression.md`). Synchronous SQL on the guild's database; every writer here runs
 * inside the transaction of its caller.
 *
 * What is stored:
 * - per guild (`raid_ladder`): the server's `rank` (NULL only until its first week opens, which starts it at Rank 1 by `placementRank`) and
 *   the best rank cleared in a normal week;
 * - per raid week (columns of `raid_weeks`): the week's plan (`rank`, `effective_rank`, `festival`,
 *   `season_index`, `festival_species`), fixed when the week is created, and the ladder's done marker
 *   (`ladder_at`, `ladder_won`, `rank_after`).
 *
 * A week that existed before migration 12 has `season_index IS NULL` (a legacy week). It keeps the
 * pool it had, fights at rank 1 with no Festival rules and never moves the ladder.
 */
import {
  festivalCreatureFor,
  nextRank,
  placementRank,
  raidWeekPlan,
  seasonOf,
} from '@creatures/game';
import { RAID_DIFFICULTY_VERSION } from './raid-difficulty';
import { weekIndex } from './raid-schedule';

export interface Ladder {
  /** The server's rank; null only until its first week has opened (it then starts at Rank 1). */
  rank: number | null;
  /** The highest rank cleared in a normal week; null until one has been cleared. */
  bestRank: number | null;
}

export function readLadder(sql: SqlStorage): Ladder {
  const row = sql
    .exec<{
      rank: number | null;
      best_rank: number | null;
    }>('SELECT rank, best_rank FROM raid_ladder WHERE id = 1')
    .toArray()[0];
  return { rank: row?.rank ?? null, bestRank: row?.best_rank ?? null };
}

/** What a (non-legacy) week stores about the ladder. */
export interface WeekProgression {
  seasonIndex: number;
  festival: boolean;
  /** The Festival creature's species id; null in a normal week. */
  festivalSpecies: string | null;
  /** The server's rank for the week; null while the server has no rank yet (nobody was in). */
  rank: number | null;
  /** The rank the boss fights at; null while `rank` is. */
  effectiveRank: number | null;
  /** Set once the ladder has moved after the week's finale. */
  ladder: { won: boolean; rankAfter: number } | null;
}

type ProgressionRow = {
  season_index: number | null;
  festival: number | null;
  festival_species: string | null;
  rank: number | null;
  effective_rank: number | null;
  ladder_at: number | null;
  ladder_won: number | null;
  rank_after: number | null;
};

/** The week's stored plan, or null for a legacy week (created before the ladder existed). */
export function readWeekProgression(sql: SqlStorage, weekId: string): WeekProgression | null {
  const row = sql
    .exec<ProgressionRow>(
      `SELECT season_index, festival, festival_species, rank, effective_rank, ladder_at, ladder_won, rank_after
       FROM raid_weeks WHERE week_id = ?`,
      weekId,
    )
    .toArray()[0];
  if (row === undefined || row.season_index === null) return null;
  return {
    seasonIndex: row.season_index,
    festival: row.festival === 1,
    festivalSpecies: row.festival_species,
    rank: row.rank,
    effectiveRank: row.effective_rank,
    ladder:
      row.ladder_at === null || row.rank_after === null
        ? null
        : { won: row.ladder_won === 1, rankAfter: row.rank_after },
  };
}

/**
 * The rank and Festival flag payouts follow for a week. A legacy week, or one whose rank is not
 * placed, pays the base amounts (rank 1, no Festival), as before the ladder existed.
 */
export function payoutWeek(sql: SqlStorage, weekId: string): { rank: number; festival: boolean } {
  const progression = readWeekProgression(sql, weekId);
  if (progression === null || progression.rank === null) return { rank: 1, festival: false };
  return { rank: progression.rank, festival: progression.festival };
}

/** The rank the boss of a week is scaled to: its effective rank, or 1 for a legacy week. */
export function fightRank(sql: SqlStorage, weekId: string): number {
  return readWeekProgression(sql, weekId)?.effectiveRank ?? 1;
}

/** The season columns a new week is created with. */
export function seasonColumns(weekId: string): {
  seasonIndex: number;
  festival: 0 | 1;
  festivalSpecies: string | null;
} {
  const index = weekIndex(weekId);
  const season = seasonOf(index);
  return {
    seasonIndex: season.seasonIndex,
    festival: season.festival ? 1 : 0,
    festivalSpecies: festivalCreatureFor(index)?.id ?? null,
  };
}

/**
 * Gives a new-style week its rank, once. If the server has a rank, the week takes it (`raidWeekPlan`
 * eases a Festival). If it does not, the server starts at Rank 1 (`placeServer`) and the week takes
 * that, so the Monday post always shows a rank, even before anyone has joined. A legacy week and a
 * week that already has its rank are left alone. Returns the week's rank, or null for a legacy week.
 */
export function ensureWeekRank(sql: SqlStorage, weekId: string): number | null {
  const progression = readWeekProgression(sql, weekId);
  if (progression === null) return null;
  if (progression.rank !== null) return progression.rank;
  const rank = readLadder(sql).rank ?? placeServer(sql);
  return declareWeekRank(sql, weekId, rank).rank;
}

/**
 * Starts a server that has no rank at Rank 1 (`placementRank`, which ignores the creatures) and
 * stores it on the ladder, once: a ladder that already has a rank keeps it. Returns the rank.
 */
export function placeServer(sql: SqlStorage): number {
  const rank = placementRank([]);
  sql.exec('UPDATE raid_ladder SET rank = ? WHERE id = 1 AND rank IS NULL', rank);
  return readLadder(sql).rank ?? rank;
}

/**
 * Fixes a week's Boss Rank numbers from the server's rank: the rank itself and the rank the boss
 * fights at (`raidWeekPlan` eases a Festival), stamped with the difficulty rules they follow
 * (`RAID_DIFFICULTY_VERSION`). The one place these columns are written for a normal week; week
 * opening and re-declaration both end here, so they can never diverge. The boss's HP pool and Attack
 * are not stored here: they are scaled from these ranks and the head count when Phase 1 resolves.
 */
export function declareWeekRank(
  sql: SqlStorage,
  weekId: string,
  rank: number,
): { rank: number; effectiveRank: number } {
  const plan = raidWeekPlan(weekIndex(weekId), rank);
  sql.exec(
    'UPDATE raid_weeks SET rank = ?, effective_rank = ?, difficulty_version = ? WHERE week_id = ?',
    plan.rank,
    plan.effectiveRank,
    RAID_DIFFICULTY_VERSION,
    weekId,
  );
  return { rank: plan.rank, effectiveRank: plan.effectiveRank };
}

/**
 * A week that was open before the ladder existed and has no stored pool yet (the deploy landed
 * between the week's creation and its Phase 1) becomes a normal ranked week at its Phase 1: the
 * server's rank is used, or, if it has none, the server starts at Rank 1 now, and the week stores its plan
 * (`raidWeekPlan`: rank, effective rank, season, Festival) so the boss is scaled from it. A week whose
 * pool is already stored keeps it and stays a legacy week. Returns true if the week was converted.
 */
export function convertLegacyWeek(sql: SqlStorage, weekId: string): boolean {
  const week = sql
    .exec<{ season_index: number | null }>(
      'SELECT season_index FROM raid_weeks WHERE week_id = ?',
      weekId,
    )
    .toArray()[0];
  if (week === undefined || week.season_index !== null) return false;
  const stored = sql
    .exec('SELECT 1 FROM raid_parties WHERE week_id = ? AND hp_max IS NOT NULL LIMIT 1', weekId)
    .toArray();
  if (stored.length > 0) return false;
  // A legacy week where nobody joined stays as it is (there is no fight to scale).
  if (!hasMembers(sql, weekId)) return false;
  const rank = readLadder(sql).rank ?? placeServer(sql);
  const plan = raidWeekPlan(weekIndex(weekId), rank);
  const season = seasonColumns(weekId);
  sql.exec(
    `UPDATE raid_weeks SET season_index = ?, festival = ?, festival_species = ?, rank = ?, effective_rank = ?,
       difficulty_version = ?
     WHERE week_id = ?`,
    season.seasonIndex,
    season.festival,
    season.festivalSpecies,
    plan.rank,
    plan.effectiveRank,
    RAID_DIFFICULTY_VERSION,
    weekId,
  );
  return true;
}

function hasMembers(sql: SqlStorage, weekId: string): boolean {
  return (
    sql.exec('SELECT 1 FROM raid_party_members WHERE week_id = ? LIMIT 1', weekId).toArray()
      .length > 0
  );
}

export interface LadderUpdate {
  won: boolean;
  rankBefore: number;
  rankAfter: number;
  /** Parties that played their finale, and how many of them won. */
  parties: number;
  partiesWon: number;
}

/**
 * Moves the ladder after a week's finale, once. It runs when the finale has resolved for every party
 * that has a fight, that is one with a placed creature (the last party's settle calls it, in the same transaction). The server counts
 * as having won when at least half of the parties that played won. Then `nextRank` gives the rank
 * for the next week, and a win in a normal week records the rank as the best cleared. `ladder_at` is
 * the done marker, so calling it again changes nothing.
 *
 * Does nothing (null) for a legacy week, a week whose rank was never placed, a week where no finale
 * was played, a finale still waiting for some party, and a week the ladder has already moved for.
 */
export function updateLadder(sql: SqlStorage, weekId: string, now: number): LadderUpdate | null {
  const week = readWeekProgression(sql, weekId);
  if (week === null || week.rank === null || week.ladder !== null) return null;
  const waiting = sql
    .exec(
      `SELECT 1 FROM raid_parties p
       WHERE p.week_id = ?
         AND EXISTS (SELECT 1 FROM raid_placements pl JOIN creatures c ON c.id = pl.creature_id AND c.user_id = pl.user_id
                     WHERE pl.week_id = p.week_id AND pl.party = p.party)
         AND NOT EXISTS (SELECT 1 FROM raid_results r
                         WHERE r.week_id = p.week_id AND r.party = p.party AND r.phase = 'finale')
       LIMIT 1`,
      weekId,
    )
    .toArray();
  if (waiting.length > 0) return null;
  const finales = sql
    .exec<{
      summary: string;
    }>("SELECT summary FROM raid_results WHERE week_id = ? AND phase = 'finale'", weekId)
    .toArray();
  if (finales.length === 0) return null;
  const partiesWon = finales.filter(
    (f) => (JSON.parse(f.summary) as { cleared?: unknown }).cleared === true,
  ).length;
  const parties = finales.length;
  // At least half of the parties: integer maths, a tie counts as a win.
  const won = partiesWon * 2 >= parties;
  const rankAfter = nextRank(week.rank, weekIndex(weekId), won);
  sql.exec(
    'UPDATE raid_weeks SET ladder_at = ?, ladder_won = ?, rank_after = ? WHERE week_id = ? AND ladder_at IS NULL',
    now,
    won ? 1 : 0,
    rankAfter,
    weekId,
  );
  sql.exec('UPDATE raid_ladder SET rank = ? WHERE id = 1', rankAfter);
  if (won && !week.festival) {
    sql.exec(
      'UPDATE raid_ladder SET best_rank = MAX(COALESCE(best_rank, 0), ?) WHERE id = 1',
      week.rank,
    );
  }
  return { won, rankBefore: week.rank, rankAfter, parties, partiesWon };
}

/** What a finale did to the server's rank, as shown in the reveal and the live loot. */
export interface RankChangeView {
  /** The server's rank for the week (what the boss card showed). */
  before: number;
  /** The server's rank for the next week. */
  after: number;
  /** The week was a Festival (the rank eases afterwards, and a win does not raise it). */
  festival: boolean;
  /** At least half of the server's parties won their finale. */
  serverWon: boolean;
}

/**
 * The ladder's move after a week's finale, or null until it has happened (a multi-party server's
 * first parties see null until the last party has resolved) and for legacy weeks.
 */
export function rankChangeOf(sql: SqlStorage, weekId: string): RankChangeView | null {
  const week = readWeekProgression(sql, weekId);
  if (week === null || week.rank === null || week.ladder === null) return null;
  return {
    before: week.rank,
    after: week.ladder.rankAfter,
    festival: week.festival,
    serverWon: week.ladder.won,
  };
}
