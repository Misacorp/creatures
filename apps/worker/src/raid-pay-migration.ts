/**
 * Migration 70: stage rewards held until the replay ends (Misa, 2026-11-17: "pay stage rewards when the replay ends, no new timer").
 * `raid_stage_pay` holds one row per stage 1 or 2 result whose payout waits: the facts `payStage` needs (who fought, the contributions,
 * the thresholds crossed, the kill) and `due_at`, the end of the playing window. The row is the "owed" marker: the payout and the row's
 * delete happen in one transaction, so a stage pays once. It stays small by design (at most two rows per party of the current weekend,
 * empty between payouts), so the "anything due?" check on every request reads no row when nothing waits. A durable table, not the
 * stage's summary, because a payout that is late (the object slept for days) must still be found: a time-window query on `raid_results`
 * would lose it.
 */
export function raidStagePayMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS raid_stage_pay (
    week_id TEXT NOT NULL,
    party INTEGER NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('stage1', 'stage2')),
    due_at INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (week_id, party, phase)
  )`);
  sql.exec('CREATE INDEX IF NOT EXISTS raid_stage_pay_due ON raid_stage_pay (due_at)');
}
