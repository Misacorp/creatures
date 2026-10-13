/**
 * Migration 18: the daily dungeon (see `dungeon.ts` and `docs/design/daily-dungeon.md`). Like the
 * other game tables there are no foreign keys: rows are only written by the dungeon code, always
 * inside a transaction. Never edit a released migration. Times are UTC epoch milliseconds, days are
 * guild-local calendar dates ('YYYY-MM-DD'), and every amount is an integer.
 */
export function dungeonMigration(sql: SqlStorage): void {
  // One row per run. A player has at most one run per guild-local day, plus one retry on the first
  // day they ever played (`attempt` 2); the UNIQUE constraints make that a database fact, so even a
  // concurrent double request can only ever store one run. `seed` is the 128 bit random seed drawn at
  // the moment of the request; `input_json` and `result_json` hold everything a replay needs (they
  // are emptied after the retention period, the summary and the rewards stay).
  sql.exec(`CREATE TABLE dungeon_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    attempt INTEGER NOT NULL CHECK (attempt BETWEEN 1 AND 2),
    idempotency_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    depth INTEGER NOT NULL CHECK (depth >= 1),
    seed TEXT NOT NULL,
    cleared INTEGER NOT NULL CHECK (cleared IN (0, 1)),
    rooms_cleared INTEGER NOT NULL CHECK (rooms_cleared >= 0),
    input_json TEXT,
    result_json TEXT,
    summary_json TEXT NOT NULL,
    rewards_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, day, attempt),
    UNIQUE (user_id, idempotency_key)
  )`);
  sql.exec('CREATE INDEX dungeon_runs_recent ON dungeon_runs(user_id, created_at)');
  sql.exec('CREATE INDEX dungeon_runs_at ON dungeon_runs(created_at)');

  // Each player's personal ladder: the depth their next run fights at, the days-in-a-row streak, the
  // last day they ran and the first day they ever ran (the free retry belongs to that day).
  sql.exec(`CREATE TABLE dungeon_progress (
    user_id TEXT PRIMARY KEY,
    depth INTEGER NOT NULL DEFAULT 1 CHECK (depth >= 1),
    streak INTEGER NOT NULL DEFAULT 0 CHECK (streak >= 0),
    last_day TEXT,
    first_day TEXT,
    runs INTEGER NOT NULL DEFAULT 0 CHECK (runs >= 0),
    clears INTEGER NOT NULL DEFAULT 0 CHECK (clears >= 0)
  )`);

  // The seed of each guild-local day's room modifiers, drawn once from live randomness the first time
  // anyone looks. It is kept apart from the seeds of the runs: it only ever decides the modifiers,
  // which are shown before a run, so knowing them tells nobody anything about the foes.
  sql.exec(`CREATE TABLE dungeon_days (
    day TEXT PRIMARY KEY,
    modifier_seed TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
}
