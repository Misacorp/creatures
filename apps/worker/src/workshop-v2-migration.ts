/**
 * Migration 28: the crafting loop (Gear B; see `gear.ts` and `docs/design/gear-and-creatures-v2.md`
 * section 3). Never edit a released migration.
 *
 * `workshop_jobs` is rebuilt (SQLite cannot widen a CHECK) so a job can be a dismantle, and gains
 * `work_minutes`: the nominal minutes of work a claimed job did. The creatures step credits creature
 * experience from it (4 experience per hour of a Workshop job, `gear-and-creatures-v2.md` 9.1), so every
 * claim records the work now and nothing has to be reconstructed later. Jobs claimed before this
 * migration keep 0. Existing rows keep their order and values.
 */
export function workshopV2Migration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE workshop_jobs_v3 (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('craft', 'improve', 'enchant', 'supply', 'dismantle')),
    gear_id TEXT,
    input_json TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    claimed_at INTEGER,
    result_json TEXT,
    work_minutes INTEGER NOT NULL DEFAULT 0 CHECK (work_minutes >= 0)
  )`);
  sql.exec(`INSERT INTO workshop_jobs_v3
      (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at, result_json)
    SELECT id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at, result_json
    FROM workshop_jobs ORDER BY rowid`);
  sql.exec('DROP TABLE workshop_jobs');
  sql.exec('ALTER TABLE workshop_jobs_v3 RENAME TO workshop_jobs');
  sql.exec(
    'CREATE UNIQUE INDEX workshop_jobs_creature_open ON workshop_jobs(creature_id) WHERE claimed_at IS NULL',
  );
  sql.exec(
    'CREATE UNIQUE INDEX workshop_jobs_gear_open ON workshop_jobs(gear_id) WHERE claimed_at IS NULL AND gear_id IS NOT NULL',
  );
  sql.exec('CREATE INDEX workshop_jobs_user ON workshop_jobs(user_id, claimed_at)');
}
