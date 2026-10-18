/**
 * Migration 32: the daily dungeon on a map (see `dungeon.ts` and `docs/design/dungeon-paths.md`). A run
 * is now played step by step, so it has a status and a stored state while it is open, and the day's map
 * is stored next to the day's seed. Never edit a released migration. Times are UTC epoch milliseconds
 * and every amount is an integer.
 *
 * Old runs stay as they are: `status` defaults to `done`, they have no `state_json` and no `outcome`,
 * and they keep their summary and their three-room replay (`input_json`, `result_json`).
 */
export function dungeonPathMigration(sql: SqlStorage): void {
  // `active`: the player is still on the map (the pack and everything else live in `state_json`);
  // `done`: it ended and was paid. `outcome` says how a map run ended (null for the old three-room runs).
  sql.exec(
    "ALTER TABLE dungeon_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('active', 'done'))",
  );
  sql.exec('ALTER TABLE dungeon_runs ADD COLUMN state_json TEXT');
  sql.exec(
    "ALTER TABLE dungeon_runs ADD COLUMN outcome TEXT CHECK (outcome IN ('cleared', 'home', 'defeat'))",
  );
  // Finding the runs that were left open is a small partial index: a handful of rows at any time.
  sql.exec("CREATE INDEX dungeon_runs_active ON dungeon_runs(day) WHERE status = 'active'");

  // The day's map as the day's seed drew it (null until someone looks, and for days from before maps).
  sql.exec('ALTER TABLE dungeon_days ADD COLUMN map_json TEXT');

  // One row per act of a run, in order. `(run_id, step)` is the step the client sent with the act and
  // `idempotency_key` makes a retry return what the first call answered (`act_json`: the act and the
  // state it left, never a seed). A fight also keeps its node, the seed drawn when the player stepped
  // in (never sent to anyone) and the input and result a replay needs (`input_json` and `result_json`
  // are emptied after the retention period, like a run's).
  sql.exec(`CREATE TABLE dungeon_steps (
    run_id TEXT NOT NULL,
    step INTEGER NOT NULL CHECK (step >= 0),
    idempotency_key TEXT NOT NULL,
    act_json TEXT NOT NULL,
    node TEXT,
    seed TEXT,
    input_json TEXT,
    result_json TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (run_id, step),
    UNIQUE (run_id, idempotency_key)
  )`);
  sql.exec('CREATE INDEX dungeon_steps_at ON dungeon_steps(created_at)');
}
