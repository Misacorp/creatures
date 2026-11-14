/**
 * Migration 64: the weekly visitor (phase 5 step 8, docs/design/valley/systems/visitor.md). Additive: production runs it with the flag
 * off and both tables stay empty.
 *
 * - `visitor_weeks`: one row per game week for the server, made the first time the server sees him here. `week_key` is the guild-local
 *   Monday of the week (`YYYY-MM-DD`), `blueprint_id` the week's blueprint (a craftable base, drawn then with live randomness),
 *   `arrived_at` when the row was made, `posted_at` when the arrival post was queued (null: no channel yet, or not posted). `forced` is 1
 *   when the staging dev tool brought him outside his days (he then counts as here for the rest of that week).
 * - `visitor_rerolls`: one row per player per week, made at the first thing the player does with him. `rerolls` is how many rerolls the
 *   player made (the price grows with it), `blueprint_bought` 1 once the week's blueprint was bought, `told` 1 once the Gazette told the
 *   player he is here. It carries `user_id`, so `purgeUser` (the `valley-fresh` tool) clears it; `visitor_weeks` has none and the tool
 *   clears it whole (`VALLEY_GUILD_TABLES`).
 *
 * Both are read by their primary key (one row each), so there is no further index.
 */
export function valleyVisitorMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS visitor_weeks (
    week_key TEXT PRIMARY KEY,
    blueprint_id TEXT NOT NULL,
    arrived_at INTEGER NOT NULL,
    posted_at INTEGER,
    forced INTEGER NOT NULL DEFAULT 0
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS visitor_rerolls (
    user_id TEXT NOT NULL,
    week_key TEXT NOT NULL,
    rerolls INTEGER NOT NULL DEFAULT 0,
    blueprint_bought INTEGER NOT NULL DEFAULT 0,
    told INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, week_key)
  )`);
}
