/**
 * Migration 66: trials and graduation (phase 5 step 9c, docs/design/valley/systems/trials.md). Additive: production runs it with the flag
 * off and the table stays empty.
 *
 * `creature_trials`: one row per creature, made at its first tick, so a creature nothing was ticked for has none (the settle pass reads the
 * row with the creature's own row through the primary key; nothing scans the table).
 * - `boxes1`, `boxes2`, `boxes3`: the boxes ticked in Bronze, Silver and Gold, a bit per box in the order of `TRIALS` (`valley/trials.ts`).
 * - `ready1`, `ready2`, `ready3`: when all of a trial's boxes were ticked (UTC ms), null while some are open. Graduation is worked out from
 *   these and the ceremony hour alone (V-TRIAL-4), so it never depends on when the owner looked.
 * - `honour`: honours held (0 to 3); `honour_at`: the ceremony the last one was given at.
 * - `told`: the honours a return walk has already told (the paper says "graduated" once).
 * - `seat_hours`: effective hours credited to the commons' projects from a communal seat (Gold's Teacher box).
 * It carries `user_id`, so `purgeUser` (the `valley-fresh` tool) clears it. The index is by `user_id` for the valley's per-creature read.
 */
export function valleyTrialsMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS creature_trials (
    creature_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    boxes1 INTEGER NOT NULL DEFAULT 0,
    boxes2 INTEGER NOT NULL DEFAULT 0,
    boxes3 INTEGER NOT NULL DEFAULT 0,
    ready1 INTEGER,
    ready2 INTEGER,
    ready3 INTEGER,
    honour INTEGER NOT NULL DEFAULT 0,
    honour_at INTEGER,
    told INTEGER NOT NULL DEFAULT 0,
    seat_hours REAL NOT NULL DEFAULT 0
  )`);
  sql.exec('CREATE INDEX IF NOT EXISTS creature_trials_user ON creature_trials (user_id)');
}
