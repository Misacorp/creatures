/**
 * Migration 24: the raid difficulty version of a week (see `raid-difficulty.ts`). Weeks that exist when
 * this runs get 0, "declared before versions", so the first deploy with a newer
 * `RAID_DIFFICULTY_VERSION` re-declares an open week that has not resolved any stage. Never edit a
 * released migration.
 */
export function raidDifficultyMigration(sql: SqlStorage): void {
  sql.exec('ALTER TABLE raid_weeks ADD COLUMN difficulty_version INTEGER NOT NULL DEFAULT 0');
}
