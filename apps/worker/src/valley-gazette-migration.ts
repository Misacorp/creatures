/**
 * Migration 59: the welcome-back Gazette's paper (phase 5 step 4, docs/design/valley/systems/return.md V-RET-0, V-POST-14). Additive:
 * production runs it with the flag off and the table stays empty. It carries `user_id`, so `purgeUser` (the `valley-fresh` tool) clears it.
 *
 * - `valley_gazette`: the last paper of each player, one row, keyed by `user_id` (so reading it is one row). `paper_id` is the arrival's
 *   settle time as text (what the close route names), `at` the same time, `away_hours` the whole hours the arrival settled. `log` is the
 *   capped JSON log of what happened while away (`PaperLog`, `@creatures/game`), strict-parsed on read; the headlines are composed from it
 *   with the shared ranking. `decision` is the paper's one decision (JSON, null when none or taken). `read_at` is when the paper was
 *   closed (null: unread, the state carries it and a reload replays it).
 */
export function valleyGazetteMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_gazette (
    user_id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    away_hours INTEGER NOT NULL,
    log TEXT NOT NULL,
    decision TEXT,
    read_at INTEGER
  )`);
}
