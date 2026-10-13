/**
 * Migration 19: expeditions v2 (see `expeditions.ts` and `docs/design/expeditions-v2.md`). Like the other
 * game tables there are no foreign keys: rows are only written by the expedition code, always inside a
 * transaction. Never edit a released migration. Times are UTC epoch milliseconds, every amount is an
 * integer, and no amount can be negative.
 *
 * It also does two things to what is already there:
 *
 * - `expeditions` and `workshop_jobs` are rebuilt (SQLite cannot widen a CHECK): a trip can now be
 *   `cancelled` and carry a destination, supplies and a push-on choice, and a job can be a `supply`
 *   craft. Every row is kept; a trip from before has no destination and counts as Old Crossroads.
 * - The slot wipe (Misa's decision): everybody starts again with one slot. A player's oldest running
 *   trip (by start time, then by row order) keeps running; any others are cancelled with no reward, their
 *   creatures are freed, and the Bait they paid for the trip is given back (a refund, not a reward).
 */
export function expeditionsMigration(sql: SqlStorage): void {
  // Explorer rank, per creature: total XP and trips finished (the rank is computed).
  sql.exec(`CREATE TABLE explorer_progress (
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    trips INTEGER NOT NULL DEFAULT 0 CHECK (trips >= 0),
    PRIMARY KEY (user_id, creature_id)
  )`);

  // Familiarity, per creature and destination: finished trips, the species it caught there, a shiny.
  sql.exec(`CREATE TABLE familiarity (
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    destination_id TEXT NOT NULL,
    trips INTEGER NOT NULL DEFAULT 0 CHECK (trips >= 0),
    found_json TEXT NOT NULL DEFAULT '[]',
    shiny INTEGER NOT NULL DEFAULT 0 CHECK (shiny IN (0, 1)),
    PRIMARY KEY (user_id, creature_id, destination_id)
  )`);

  // The Journal: pages found, once each.
  sql.exec(`CREATE TABLE journal (
    user_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    found_at INTEGER NOT NULL,
    expedition_id TEXT,
    PRIMARY KEY (user_id, entry_id)
  )`);

  // Account stats (counters only) and the places a player has finished a trip at.
  sql.exec(`CREATE TABLE account_stats (
    user_id TEXT NOT NULL,
    stat TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
    PRIMARY KEY (user_id, stat)
  )`);
  sql.exec(`CREATE TABLE places_visited (
    user_id TEXT NOT NULL,
    destination_id TEXT NOT NULL,
    first_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, destination_id)
  )`);

  // Supplies a player holds (bought but unused, crafted or found), by supply id.
  sql.exec(`CREATE TABLE supplies (
    user_id TEXT NOT NULL,
    supply_id TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
    PRIMARY KEY (user_id, supply_id)
  )`);

  // The pending end-of-trip choice of a finished trip: the goals offered (an empty list means the roll
  // came up empty), rolled once so reloading cannot re-roll it. The chosen goal lives on the trip.
  sql.exec(`CREATE TABLE expedition_offers (
    expedition_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    goals_json TEXT NOT NULL,
    offered_at INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX expedition_offers_user ON expedition_offers(user_id)');

  // --- expeditions: rebuilt with the new columns and the wider status ---
  sql.exec(`CREATE TABLE expeditions_v2 (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    duration TEXT NOT NULL,
    supplies TEXT NOT NULL,
    rolls INTEGER NOT NULL,
    cost INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'claimed', 'cancelled')),
    claimed_at INTEGER,
    result TEXT,
    destination_id TEXT NOT NULL DEFAULT 'old-crossroads',
    supplies_json TEXT,
    special_id TEXT,
    push_goal TEXT,
    push_started_at INTEGER,
    push_ends_at INTEGER,
    push_odds_bp INTEGER,
    cancel_reason TEXT
  )`);
  sql.exec(`INSERT INTO expeditions_v2
      (id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at, status, claimed_at, result)
    SELECT id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at, status, claimed_at, result
    FROM expeditions ORDER BY rowid`);
  sql.exec('DROP TABLE expeditions');
  sql.exec('ALTER TABLE expeditions_v2 RENAME TO expeditions');
  sql.exec('CREATE INDEX expeditions_user_status ON expeditions(user_id, status)');

  // --- workshop_jobs: rebuilt so a job can be a supply craft ---
  sql.exec(`CREATE TABLE workshop_jobs_v2 (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('craft', 'improve', 'enchant', 'supply')),
    gear_id TEXT,
    input_json TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    claimed_at INTEGER,
    result_json TEXT
  )`);
  sql.exec(`INSERT INTO workshop_jobs_v2
      (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at, result_json)
    SELECT id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at, result_json
    FROM workshop_jobs ORDER BY rowid`);
  sql.exec('DROP TABLE workshop_jobs');
  sql.exec('ALTER TABLE workshop_jobs_v2 RENAME TO workshop_jobs');
  sql.exec(
    'CREATE UNIQUE INDEX workshop_jobs_creature_open ON workshop_jobs(creature_id) WHERE claimed_at IS NULL',
  );
  sql.exec(
    'CREATE UNIQUE INDEX workshop_jobs_gear_open ON workshop_jobs(gear_id) WHERE claimed_at IS NULL AND gear_id IS NOT NULL',
  );
  sql.exec('CREATE INDEX workshop_jobs_user ON workshop_jobs(user_id, claimed_at)');

  // --- The slot wipe ---
  // Everybody starts with one slot. Of each player's running trips, the oldest (by start time, then row
  // order) keeps running; the rest are cancelled. The row order breaks ties, so the result is the same
  // however often it is replayed.
  sql.exec(`UPDATE expeditions SET status = 'cancelled', cancel_reason = 'slot_wipe'
    WHERE status = 'active' AND id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY started_at, rowid) AS n
        FROM expeditions WHERE status = 'active'
      ) WHERE n > 1
    )`);
  sql.exec(`UPDATE creatures SET away_expedition_id = NULL
    WHERE away_expedition_id IN (SELECT id FROM expeditions WHERE cancel_reason = 'slot_wipe')`);
  // What a cancelled trip cost is given back (once per trip, by its key).
  const now = Date.now();
  sql.exec(
    `INSERT OR IGNORE INTO ledger (user_id, currency, amount, source, idempotency_key, meta, created_at)
     SELECT user_id, 'bait', cost, 'refund', 'expedition-wipe:' || id, NULL, ?
     FROM expeditions WHERE cancel_reason = 'slot_wipe' AND cost > 0 ORDER BY rowid`,
    now,
  );
  sql.exec(`INSERT INTO balances (user_id, currency, amount)
    SELECT user_id, 'bait', SUM(cost) FROM expeditions
    WHERE cancel_reason = 'slot_wipe' AND cost > 0 GROUP BY user_id
    ON CONFLICT(user_id, currency) DO UPDATE SET amount = amount + excluded.amount`);
}
