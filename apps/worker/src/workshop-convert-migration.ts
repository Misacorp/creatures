/**
 * Migration 36: Workshop conversions (refine and recycle; see `workshop.ts` and
 * `docs/design/decisions.md`, 2026-10-20). Never edit a released migration.
 *
 * `workshop_jobs` is rebuilt (SQLite cannot widen a CHECK) so a job can be a `convert` job. Every
 * column, row and index is kept as it was, in the same order.
 */
export function workshopConvertMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE workshop_jobs_v4 (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('craft', 'improve', 'enchant', 'supply', 'dismantle', 'convert')),
    gear_id TEXT,
    input_json TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    claimed_at INTEGER,
    result_json TEXT,
    work_minutes INTEGER NOT NULL DEFAULT 0 CHECK (work_minutes >= 0)
  )`);
  sql.exec(`INSERT INTO workshop_jobs_v4
      (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at, result_json, work_minutes)
    SELECT id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at, result_json, work_minutes
    FROM workshop_jobs ORDER BY rowid`);
  sql.exec('DROP TABLE workshop_jobs');
  sql.exec('ALTER TABLE workshop_jobs_v4 RENAME TO workshop_jobs');
  sql.exec(
    'CREATE UNIQUE INDEX workshop_jobs_creature_open ON workshop_jobs(creature_id) WHERE claimed_at IS NULL',
  );
  sql.exec(
    'CREATE UNIQUE INDEX workshop_jobs_gear_open ON workshop_jobs(gear_id) WHERE claimed_at IS NULL AND gear_id IS NOT NULL',
  );
  sql.exec('CREATE INDEX workshop_jobs_user ON workshop_jobs(user_id, claimed_at)');
}
