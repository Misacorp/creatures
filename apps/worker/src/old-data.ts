/**
 * Old game data is deleted once nobody can use it (decisions.md, 2026-10-25). Misa: "just record the
 * stats and delete the details when players can no longer interact with them." Run from the guild's
 * once-a-game-day cleanup (`GuildCore.maintain`), after the analytics, gear and dungeon passes.
 *
 * What goes, and what the game still reads that keeps the rest:
 *
 * - Trips: claimed ones from before today's game day (a claim retry within the day still finds its
 *   stored result), with their end-of-trip offers; cancelled ones 30 days after they started (the
 *   one-time "a note about your trips" reads them). The totals live in `explorer_progress`,
 *   `familiarity`, `account_stats`, `journal`, `places_visited` and the ledger.
 * - Workshop jobs: claimed ones from before today's game day. Crafting skill is its own table.
 * - Valley Games: the stored fights, entries and placings of days older than the latest shown, the
 *   latest awarded and the earliest unawarded day, and Prize Stall buys of earlier weeks. Medals,
 *   records, badges and the `games_days` rows stay.
 * - Raids: the details of weeks older than last week, once the week's finale is done. Last week and
 *   this one stay whole. `raid_weeks`, `raid_events` (done markers: deleting one would run the event
 *   again), `raid_ladder`, `raid_festival_grants` and the `summary` of every result stay.
 * - Discord posts that were sent or given up on, a week after.
 *
 * Every pass is idempotent, reads through an index and deletes in batches; a failure in one is logged
 * (the error name only) and never stops the others or the alarm. The indexes are made here with
 * `IF NOT EXISTS` (the first run builds them over what is there), so no numbered migration is needed.
 */
import { RULES } from '@creatures/game';
import { lastAwardedDay, lastShownDay, unawardedDays } from './games-store';
import { stallWeek } from './games-stall';
import { addWeeks, weekIdFor } from './raid-schedule';
import { gameDay, zonedTimeToEpoch } from './time';

/** Most rows one statement deletes, and most statements one pass runs; more waits for the next alarm. */
const BATCH = 500;
const MAX_BATCHES = 20;
/** Cancelled trips are kept this long after they started (the slot-wipe notice reads them). */
const CANCELLED_TRIP_KEEP_MS = 30 * 86_400_000;
/** Sent and failed Discord posts are kept this long. */
const POST_KEEP_MS = 7 * 86_400_000;

export interface OldDataStorage {
  sql: SqlStorage;
  transactionSync<T>(fn: () => T): T;
}

/**
 * Runs `step` until it deletes fewer than `BATCH` rows or the batch limit is reached. Returns true when
 * rows may remain.
 */
function batches(step: () => number): boolean {
  for (let i = 0; i < MAX_BATCHES; i++) {
    if (step() < BATCH) return false;
  }
  return true;
}

/** `DELETE FROM table WHERE <where>` at most `BATCH` rows; returns how many went. */
function deleteSome(sql: SqlStorage, table: string, where: string, ...params: unknown[]): number {
  return sql
    .exec(
      `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ?) RETURNING 1`,
      ...params,
      BATCH,
    )
    .toArray().length;
}

/** Runs one pass; a failure is logged by name and counts as nothing left to do. */
function guarded(name: string, pass: () => boolean): boolean {
  try {
    return pass();
  } catch (err) {
    console.error(`old data prune failed: ${name}`, err instanceof Error ? err.name : 'unknown');
    return false;
  }
}

/** Every pass. Returns true when one stopped at its batch limit, so the next alarm continues. */
export function pruneOldData(storage: OldDataStorage, now: number, timezone: string): boolean {
  const sql = storage.sql;
  const day = gameDay(now, timezone, RULES.daily.reset);
  const dayStart = zonedTimeToEpoch(
    day,
    RULES.daily.reset.hour,
    RULES.daily.reset.minute,
    timezone,
  );
  const results = [
    guarded('trips', () => pruneTrips(storage, dayStart)),
    guarded('jobs', () => pruneJobs(sql, dayStart)),
    guarded('games', () => pruneGames(sql, now, timezone)),
    guarded('raids', () => pruneRaids(sql, now, timezone)),
    guarded('posts', () => prunePosts(sql, now)),
  ];
  return results.some(Boolean);
}

/** Claimed trips from before `dayStart` with their offers, and long-cancelled trips. */
export function pruneTrips(storage: OldDataStorage, dayStart: number): boolean {
  const { sql } = storage;
  sql.exec(
    "CREATE INDEX IF NOT EXISTS expeditions_claimed_at ON expeditions(claimed_at) WHERE status = 'claimed'",
  );
  sql.exec(
    "CREATE INDEX IF NOT EXISTS expeditions_cancelled_at ON expeditions(started_at) WHERE status = 'cancelled'",
  );
  const picked = (status: string, column: string): string =>
    `SELECT id FROM expeditions WHERE status = '${status}' AND ${column} < ? ORDER BY ${column} LIMIT ?`;
  const claimed = batches(() =>
    storage.transactionSync(() => {
      // Offers first: they are found through the trips they belong to.
      sql.exec(
        `DELETE FROM expedition_offers WHERE expedition_id IN (${picked('claimed', 'claimed_at')})`,
        dayStart,
        BATCH,
      );
      return sql
        .exec(
          `DELETE FROM expeditions WHERE id IN (${picked('claimed', 'claimed_at')}) RETURNING 1`,
          dayStart,
          BATCH,
        )
        .toArray().length;
    }),
  );
  const cancelled = batches(() =>
    storage.transactionSync(() => {
      const before = dayStart - CANCELLED_TRIP_KEEP_MS;
      sql.exec(
        `DELETE FROM expedition_offers WHERE expedition_id IN (${picked('cancelled', 'started_at')})`,
        before,
        BATCH,
      );
      return sql
        .exec(
          `DELETE FROM expeditions WHERE id IN (${picked('cancelled', 'started_at')}) RETURNING 1`,
          before,
          BATCH,
        )
        .toArray().length;
    }),
  );
  return claimed || cancelled;
}

/** Claimed Workshop jobs from before `dayStart`. */
export function pruneJobs(sql: SqlStorage, dayStart: number): boolean {
  sql.exec(
    'CREATE INDEX IF NOT EXISTS workshop_jobs_claimed_at ON workshop_jobs(claimed_at) WHERE claimed_at IS NOT NULL',
  );
  return batches(() =>
    deleteSome(sql, 'workshop_jobs', 'claimed_at IS NOT NULL AND claimed_at < ?', dayStart),
  );
}

/**
 * The Valley Games' stored shows, entries and placings of days before the oldest day still read: the
 * latest shown (replayed), the latest awarded (the player's "last results") and the earliest locked day
 * not awarded yet (the award reads its results). Nothing goes before a show and an award exist. Stall
 * buys of weeks before this one go (only this week's counts against the weekly limit).
 */
export function pruneGames(sql: SqlStorage, now: number, timezone: string): boolean {
  sql.exec('CREATE INDEX IF NOT EXISTS games_stall_buys_week ON games_stall_buys(week)');
  let more = batches(() =>
    deleteSome(sql, 'games_stall_buys', 'week < ?', stallWeek(now, timezone).week),
  );
  const shown = lastShownDay(sql, now);
  const awarded = lastAwardedDay(sql);
  if (shown === null || awarded === null) return more;
  const days = [shown.day, awarded.day, ...unawardedDays(sql).map((d) => d.day)];
  const cutoff = days.reduce((a, b) => (b < a ? b : a));
  // Each table's primary key starts with the day.
  for (const table of ['games_results', 'games_entries', 'games_placings']) {
    if (batches(() => deleteSome(sql, table, 'day < ?', cutoff))) more = true;
  }
  return more;
}

/** Eligible: the week's finale is done and no real live finale of it is waiting to resolve. */
const SETTLED_WEEK = `week_id IN (SELECT week_id FROM raid_weeks WHERE status = 'finale')
  AND week_id NOT IN (SELECT l.week_id FROM raid_live l WHERE l.practice = 0 AND l.week_id < ?
    AND NOT EXISTS (SELECT 1 FROM raid_results r
      WHERE r.week_id = l.week_id AND r.party = l.party AND r.phase = 'finale'))`;

/**
 * The details of raid weeks older than last week. Whole: this week and last (the reveal and the replay
 * links reach last week). For older, settled weeks the roster, teams, placements, abilities, auto fire
 * and live fights go, and each result keeps its `summary` but loses its seed, input and events.
 */
export function pruneRaids(sql: SqlStorage, now: number, timezone: string): boolean {
  const cutoff = addWeeks(weekIdFor(now, timezone), -1);
  sql.exec(
    "CREATE INDEX IF NOT EXISTS raid_results_heavy ON raid_results(week_id) WHERE input <> ''",
  );
  sql.exec('CREATE INDEX IF NOT EXISTS raid_reveal_seen_week ON raid_reveal_seen(week_id)');
  let more = false;
  const settled = `week_id < ? AND ${SETTLED_WEEK}`;
  // The blank first: it reads the live rows the delete below removes.
  if (
    batches(
      () =>
        sql
          .exec(
            `UPDATE raid_results SET seed = '', input = '', result = '' WHERE rowid IN
               (SELECT rowid FROM raid_results WHERE input <> '' AND ${settled} LIMIT ?) RETURNING 1`,
            cutoff,
            cutoff,
            BATCH,
          )
          .toArray().length,
    )
  ) {
    more = true;
  }
  for (const table of [
    'raid_parties',
    'raid_party_members',
    'raid_opt_outs',
    'raid_teams',
    'raid_placements',
    'raid_abilities',
    'raid_autofire',
  ]) {
    if (batches(() => deleteSome(sql, table, settled, cutoff, cutoff))) more = true;
  }
  // Seen marks of reveals nobody is offered any more (`latestReveal` looks back to last week only).
  if (batches(() => deleteSome(sql, 'raid_reveal_seen', 'week_id < ?', cutoff))) more = true;
  // Practice fights never write a result; a real one goes once its finale result exists.
  const live = `week_id < ? AND (practice = 1 OR EXISTS (SELECT 1 FROM raid_results r
       WHERE r.week_id = raid_live.week_id AND r.party = raid_live.party AND r.phase = 'finale'))`;
  if (batches(() => deleteSome(sql, 'raid_live', live, cutoff))) more = true;
  return more;
}

/** Posts that were sent or given up on more than a week ago. */
export function prunePosts(sql: SqlStorage, now: number): boolean {
  const before = now - POST_KEEP_MS;
  // `discord_posts_due` is (status, next_attempt_at): an index range per status.
  return batches(
    () =>
      sql
        .exec(
          `DELETE FROM discord_posts WHERE id IN (SELECT id FROM discord_posts
             WHERE status IN ('sent', 'failed') AND next_attempt_at < ? AND created_at < ? LIMIT ?)
           RETURNING 1`,
          before,
          before,
          BATCH,
        )
        .toArray().length,
  );
}
