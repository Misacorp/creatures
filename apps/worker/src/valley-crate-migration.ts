/**
 * Migration 68: the Forge's sealed crate (V-FORGE-5, Misa 2026-11-15, option C of "collecting gear should be a big moment"). Additive:
 * with the flag off the table stays empty and the new columns hold their defaults. `forge_crate` carries `user_id`, so `purgeUser` (the
 * `valley-fresh` tool) clears it with the rest.
 *
 * - `forge_crate`: rare and epic pieces that came home from the floors and wait, sealed, until the player opens the crate. Like a floor
 *   row (`forge_floor`) it keeps only what decides the piece: the blueprint's base (null for a team piece), the element, the rarity and the
 *   item level, plus the seat that made it (the smith the reveal names). The item is rolled when the crate opens. Index `(user_id)`.
 * - `valley_players.crate_count` and `crate_best`: how many pieces the crate holds and the best rarity among them (1 rare, 2 epic; 0 when
 *   empty), kept in step with the table so the valley state shows the crate from the player's row without reading it.
 */
export function valleyCrateMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS forge_crate (
    piece_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    seat_id TEXT NOT NULL,
    blueprint_id TEXT,
    for_team INTEGER NOT NULL DEFAULT 0,
    element INTEGER NOT NULL DEFAULT -1,
    rarity INTEGER NOT NULL DEFAULT 0,
    item_level INTEGER NOT NULL,
    made_at INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX IF NOT EXISTS forge_crate_user ON forge_crate (user_id)');
  sql.exec('ALTER TABLE valley_players ADD COLUMN crate_count INTEGER NOT NULL DEFAULT 0');
  sql.exec('ALTER TABLE valley_players ADD COLUMN crate_best INTEGER NOT NULL DEFAULT 0');
}
