/**
 * Migration 41: opt-in Discord DMs (see `dm-notify.ts` and `docs/design/dm-notifications.md`). Never
 * edit a released migration.
 *
 * `dm_prefs` is one row per player: for each kind of DM the game time it was turned on (NULL: off), the
 * cached DM channel and when Discord last refused a DM. `dm_outbox` is the queue of DMs to send and
 * `dm_sent` one row per event already told about, so nothing is pinged twice. The three partial indexes
 * keep the "what is due" scans and the alarm's "when is the next one" lookups to the few open rows.
 */
export function dmNotifyMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE dm_prefs (
    user_id TEXT PRIMARY KEY,
    trip_on_at INTEGER,
    job_on_at INTEGER,
    finale_on_at INTEGER,
    stall_on_at INTEGER,
    dm_channel_id TEXT,
    blocked_at INTEGER
  )`);
  sql.exec(`CREATE TABLE dm_outbox (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    next_attempt_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX dm_outbox_due ON dm_outbox(status, next_attempt_at)');
  sql.exec(`CREATE TABLE dm_sent (
    key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    at INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX dm_sent_at ON dm_sent(at)');
  // Trips that wait for the player (no push-on yet), and trips pushing on, by the time they are ready.
  sql.exec(
    "CREATE INDEX expeditions_active_end ON expeditions(ends_at) WHERE status = 'active' AND push_goal IS NULL",
  );
  sql.exec(
    "CREATE INDEX expeditions_active_push ON expeditions(push_ends_at) WHERE status = 'active' AND push_goal IS NOT NULL",
  );
  sql.exec(
    'CREATE INDEX workshop_jobs_open_end ON workshop_jobs(ends_at) WHERE claimed_at IS NULL',
  );
}
