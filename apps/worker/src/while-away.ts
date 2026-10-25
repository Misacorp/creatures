/**
 * While you were away: what the server paid a player on its own while they were gone (decisions.md,
 * 2026-10-26). The Home notice board shows it once when they come back.
 *
 * Recorded at payout, never found by scanning history. Each automatic payout (the daily leet Bait, the
 * raid's Essence, gear, jackpot and Festival gifts, the Valley Games' medals and experience) calls
 * `recordAway` in the transaction that pays it. That is one UPSERT into `away_rewards`, one row per player
 * and source kind, holding the summed amounts. A payout only records for a player whose `last_seen_at` is
 * older than `AWAY_AFTER_MS` at that moment, so a player who is around gets nothing recorded. The gate is
 * part of the same statement (`INSERT ... SELECT ... FROM players WHERE last_seen_at < ?`), one lookup by
 * primary key. Opening the game updates `last_seen_at`, but a payout reads it at the moment it happens, so
 * the value is always the one from before the player's next visit.
 *
 * Rewards the player claims themselves (finished trips and Workshop jobs) are not paid while away: the
 * summary counts them at read time (`tripsWaiting`, `jobsWaiting`, through the user's trip and job
 * indexes), and only for a player who has something recorded.
 *
 * To add a source: add its kind to `AWAY_KINDS` (a new migration widens the CHECK), call `recordAway` next
 * to its payout, and add a line for it in the client's `away-notice.ts`.
 */

/** A player counts as away when they were last seen more than this long before a payout. */
export const AWAY_AFTER_MS = 24 * 60 * 60 * 1000;
/** Recorded rows older than this are dropped in the daily cleanup (an abandoned player's rows). */
export const AWAY_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

export const AWAY_KINDS = ['leet', 'raid', 'games'] as const;
export type AwayKind = (typeof AWAY_KINDS)[number];

/** What one payout adds. Every field is an integer count; absent is zero. */
export interface AwayGain {
  bait?: number;
  essence?: number;
  /** Gear pieces and blueprints. */
  items?: number;
  /** Creatures (a new one or a card waiting for a choice). */
  creatures?: number;
  medals?: number;
  /** Creature experience. */
  xp?: number;
}

/** Migration 46: the table and its cleanup index. */
export function whileAwayMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE away_rewards (
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('leet', 'raid', 'games')),
    bait INTEGER NOT NULL DEFAULT 0,
    essence INTEGER NOT NULL DEFAULT 0,
    items INTEGER NOT NULL DEFAULT 0,
    creatures INTEGER NOT NULL DEFAULT 0,
    medals INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    first_at INTEGER NOT NULL,
    last_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, kind)
  )`);
  sql.exec('CREATE INDEX away_rewards_last ON away_rewards(last_at)');
}

const COLUMNS = ['bait', 'essence', 'items', 'creatures', 'medals', 'xp'] as const;

/**
 * Adds a payout to the player's row of `kind`, if the player is away at `now`. Call it inside the payout's
 * transaction. Nothing happens for an empty gain, a present player or a user that is not a player.
 */
export function recordAway(
  sql: SqlStorage,
  userId: string,
  kind: AwayKind,
  gain: AwayGain,
  now: number,
): void {
  const amounts = COLUMNS.map((c) => Math.max(0, Math.floor(gain[c] ?? 0)));
  if (amounts.every((n) => n === 0)) return;
  sql.exec(
    `INSERT INTO away_rewards (user_id, kind, bait, essence, items, creatures, medals, xp, first_at, last_at)
     SELECT user_id, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM players WHERE user_id = ? AND last_seen_at < ?
     ON CONFLICT(user_id, kind) DO UPDATE SET
       bait = bait + excluded.bait, essence = essence + excluded.essence, items = items + excluded.items,
       creatures = creatures + excluded.creatures, medals = medals + excluded.medals,
       xp = xp + excluded.xp, last_at = excluded.last_at`,
    kind,
    ...amounts,
    now,
    now,
    userId,
    now - AWAY_AFTER_MS,
  );
}

/** The items a grant gave: gear pieces and blueprints (scrap and other parts do not count). */
export function awayItems(view: {
  gear: readonly unknown[];
  blueprints: readonly unknown[];
}): number {
  return view.gear.length + view.blueprints.length;
}

export interface AwaySource extends Required<AwayGain> {
  kind: AwayKind;
}

/** What the notice shows: the sums by source, the span and what waits to be claimed. */
export interface AwaySummary {
  sources: AwaySource[];
  /** First and last payout recorded (epoch ms). `until` is what `dismissAway` takes. */
  since: number;
  until: number;
  /** Trips that are home (or at their push-on choice) and Workshop jobs that are done, waiting to be claimed. */
  tripsWaiting: number;
  jobsWaiting: number;
}

type AwayRow = {
  kind: AwayKind;
  bait: number;
  essence: number;
  items: number;
  creatures: number;
  medals: number;
  xp: number;
  first_at: number;
  last_at: number;
};

/**
 * The player's recorded rewards, or null when there are none (one read by primary key prefix; the two
 * waiting counts are read only when there is something to show).
 */
export function awaySummary(sql: SqlStorage, userId: string, now: number): AwaySummary | null {
  const rows = sql
    .exec<AwayRow>(
      `SELECT kind, bait, essence, items, creatures, medals, xp, first_at, last_at
       FROM away_rewards WHERE user_id = ? ORDER BY kind`,
      userId,
    )
    .toArray();
  if (rows.length === 0) return null;
  const count = (query: string): number =>
    sql.exec<{ n: number }>(query, userId, now).toArray()[0]?.n ?? 0;
  return {
    sources: rows.map((r) => ({
      kind: r.kind,
      bait: r.bait,
      essence: r.essence,
      items: r.items,
      creatures: r.creatures,
      medals: r.medals,
      xp: r.xp,
    })),
    since: Math.min(...rows.map((r) => r.first_at)),
    until: Math.max(...rows.map((r) => r.last_at)),
    tripsWaiting: count(
      `SELECT COUNT(*) AS n FROM expeditions
       WHERE user_id = ? AND status = 'active' AND COALESCE(push_ends_at, ends_at) <= ?`,
    ),
    jobsWaiting: count(
      'SELECT COUNT(*) AS n FROM workshop_jobs WHERE user_id = ? AND claimed_at IS NULL AND ends_at <= ?',
    ),
  };
}

/**
 * Clears what the player has been shown: rows whose last payout is not after `until` (a payout that landed
 * after the card was drawn stays for the next one). Repeats change nothing.
 */
export function dismissAway(sql: SqlStorage, userId: string, until: number): void {
  sql.exec('DELETE FROM away_rewards WHERE user_id = ? AND last_at <= ?', userId, until);
}

/** Drops rows whose last payout is older than `AWAY_KEEP_MS` (the daily cleanup). */
export function pruneAway(sql: SqlStorage, now: number): void {
  sql.exec('DELETE FROM away_rewards WHERE last_at < ?', now - AWAY_KEEP_MS);
}
