/**
 * Migration 56: the valley's per-player tables (phase 5 step 1, docs/design/valley/phase5-plan.md). Additive: production runs it with
 * the flag off and the tables stay empty. Both carry `user_id`, so `purgeUser` (the `valley-fresh` tool) clears them with the rest.
 * Times are UTC epoch ms; fractions are REAL (carries below one unit); currencies are integers.
 *
 * - `valley_players`: one row per player who has been settled. `settled_at` is where the lazy pass last stopped; `last_visit_at` and
 *   `hearth_at_visit_bp` (basis points of the growth multiplier, fixed at each visit and held until the next, V-POST-14) are the
 *   pass's inputs; `visit_started_at` is when the current visit began (the "+N" counts from there); `allowance_store` and
 *   `allowance_carry` are the allowance building up (V-POST-5); `visit_allowance` is what this visit brought home.
 * - `valley_creatures`: one row per creature of a settled player: `seat_id` (null: resting at the bonfire; seats arrive in step 2),
 *   `catchup_bp` (the XP multiplier fixed at the visit, basis points), `xp_carry` (the fraction of an XP not yet paid) and
 *   `visit_xp` (the idle XP paid since this visit began).
 */
export function valleyMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_players (
    user_id TEXT PRIMARY KEY,
    settled_at INTEGER NOT NULL,
    last_visit_at INTEGER NOT NULL,
    hearth_at_visit_bp INTEGER NOT NULL DEFAULT 10000,
    visit_started_at INTEGER NOT NULL,
    allowance_store INTEGER NOT NULL DEFAULT 0,
    allowance_carry REAL NOT NULL DEFAULT 0,
    visit_allowance INTEGER NOT NULL DEFAULT 0
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_creatures (
    creature_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    seat_id TEXT,
    catchup_bp INTEGER NOT NULL DEFAULT 10000,
    xp_carry REAL NOT NULL DEFAULT 0,
    visit_xp INTEGER NOT NULL DEFAULT 0
  )`);
  sql.exec('CREATE INDEX IF NOT EXISTS valley_creatures_user ON valley_creatures (user_id)');
}
