/**
 * Migration 15: content-paced rounds for the live finale. `raid_live.pacing` is 0 for a fight stored
 * before this change, which keeps its fixed `round_ms` rounds, and 1 for a fight whose rounds last as
 * long as their events take to play (`roundPlaybackMs` in the engine). New fights store 1; `round_ms`
 * then only holds the upper bound of a round. Never edit a released migration.
 */
export function raidLivePacingMigration(sql: SqlStorage): void {
  sql.exec('ALTER TABLE raid_live ADD COLUMN pacing INTEGER NOT NULL DEFAULT 0');
}
