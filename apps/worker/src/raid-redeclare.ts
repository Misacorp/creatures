/**
 * Re-declaring an open raid week when the raid's difficulty rules change (see `raid-difficulty.ts`).
 *
 * The rule: if a week is still open, no stage of it has resolved and nothing is live, and the
 * difficulty version stored with it is older than `RAID_DIFFICULTY_VERSION`, its numbers are declared
 * again with the current rules, exactly as week opening does (`declareWeekRank` is the one function
 * both call), and the new version is stored. The boss, the week id, the sign-ups, the roster and the
 * board, the abilities, the Auto fire choices and every other player choice are kept. A week with a
 * resolved stage, and every past week, is never touched.
 *
 * What a week's numbers are: the boss is chosen from the week id; the Boss Rank is the server's
 * placement for the server's first week (`placementRank` from the creatures the members bring) and
 * the ladder's rank after that; the rank the boss fights at follows from it (`raidWeekPlan`). The HP
 * pool (max and current) and the boss Attack are scaled from that rank and the party's head count when
 * Phase 1 resolves (`buildPhaseInput`), not before, so they always follow the rules of the moment.
 *
 * Synchronous SQL; call it inside a transaction (the check and the writes must not interleave with
 * another request).
 */
import { RAID_DIFFICULTY_VERSION } from './raid-difficulty';
import { declareWeekRank, placementFor, readLadder } from './raid-ladder';

/** What re-declaring changed. */
export interface Redeclared {
  weekId: string;
  bossId: string;
  versionBefore: number;
  versionAfter: number;
  rankBefore: number | null;
  rankAfter: number | null;
  effectiveRankBefore: number | null;
  effectiveRankAfter: number | null;
  /** The server was placed again (its first week, ladder not moved yet) rather than keeping its rank. */
  placedAgain: boolean;
}

/** True if any stage of the week has resolved or started: a result, a live fight, a stored pool. */
function stageStarted(sql: SqlStorage, weekId: string): boolean {
  const q = (query: string): boolean => sql.exec(query, weekId).toArray().length > 0;
  return (
    q('SELECT 1 FROM raid_results WHERE week_id = ? LIMIT 1') ||
    // A practice fight (staging) is only a preview: it does not fix anything.
    q('SELECT 1 FROM raid_live WHERE week_id = ? AND practice = 0 LIMIT 1') ||
    q('SELECT 1 FROM raid_parties WHERE week_id = ? AND hp_max IS NOT NULL LIMIT 1') ||
    q(
      "SELECT 1 FROM raid_events WHERE week_id = ? AND event <> 'weekStart' AND outcome = 'ran' LIMIT 1",
    )
  );
}

/**
 * Re-declares the week if it qualifies (see the file comment); returns what changed, or null when
 * there was nothing to do. Idempotent: the stored version is the guard, so a second call returns null.
 * A week that has no Boss Rank yet (nobody was in) only gets the current version: when its rank is
 * fixed it uses the current rules anyway. A legacy week (before the ladder) is left alone.
 */
export function redeclareWeek(sql: SqlStorage, weekId: string): Redeclared | null {
  const week = sql
    .exec<{
      boss_id: string;
      status: string;
      season_index: number | null;
      rank: number | null;
      effective_rank: number | null;
      difficulty_version: number;
    }>(
      `SELECT boss_id, status, season_index, rank, effective_rank, difficulty_version
       FROM raid_weeks WHERE week_id = ?`,
      weekId,
    )
    .toArray()[0];
  if (week === undefined || week.status !== 'open' || week.season_index === null) return null;
  if (week.difficulty_version >= RAID_DIFFICULTY_VERSION) return null;
  if (stageStarted(sql, weekId)) return null;

  const base = {
    weekId,
    bossId: week.boss_id,
    versionBefore: week.difficulty_version,
    versionAfter: RAID_DIFFICULTY_VERSION,
    rankBefore: week.rank,
    effectiveRankBefore: week.effective_rank,
  };
  if (week.rank === null) {
    sql.exec(
      'UPDATE raid_weeks SET difficulty_version = ? WHERE week_id = ?',
      RAID_DIFFICULTY_VERSION,
      weekId,
    );
    return { ...base, rankAfter: null, effectiveRankAfter: null, placedAgain: false };
  }

  // The server's first week: the ladder has not moved yet and no earlier week has a rank, so the
  // server's rank is the placement made for this roster. Place it again with the current rules.
  // Otherwise the ladder's rank stands (it is the result of past weeks, which are never touched).
  const ladder = readLadder(sql);
  const placedHere =
    sql.exec('SELECT 1 FROM raid_weeks WHERE ladder_at IS NOT NULL LIMIT 1').toArray().length ===
      0 &&
    sql
      .exec('SELECT 1 FROM raid_weeks WHERE week_id < ? AND rank IS NOT NULL LIMIT 1', weekId)
      .toArray().length === 0;
  const placement = placedHere ? placementFor(sql, weekId) : null;
  const rank = placement ?? ladder.rank ?? week.rank;
  if (placement !== null) sql.exec('UPDATE raid_ladder SET rank = ? WHERE id = 1', placement);
  const declared = declareWeekRank(sql, weekId, rank);
  return {
    ...base,
    rankAfter: declared.rank,
    effectiveRankAfter: declared.effectiveRank,
    placedAgain: placement !== null,
  };
}

/** The open weeks that carry an older difficulty version than the current one (a cheap query). */
export function staleOpenWeeks(sql: SqlStorage): string[] {
  return sql
    .exec<{
      week_id: string;
    }>(
      "SELECT week_id FROM raid_weeks WHERE status = 'open' AND difficulty_version < ? ORDER BY week_id",
      RAID_DIFFICULTY_VERSION,
    )
    .toArray()
    .map((r) => r.week_id);
}
