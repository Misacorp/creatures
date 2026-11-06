/**
 * Migration 60: the bonfire in full (phase 5 step 5, docs/design/valley/systems/bonfire.md V-BON-2, V-BON-9, posts.md V-POST-7).
 * Additive: production runs it with the flag off and nothing reads the new columns.
 *
 * - `valley_server`: one row, the server's middle (V-BON-2), the median of the active players' top-three levels, written once a game day
 *   by the guild's daily `maintain` (`day` is that game day, `players` how many counted). A guild-level table, cleared by `valley-fresh`
 *   through `VALLEY_GUILD_TABLES`.
 * - `valley_players.catch_target`: the level the player's creatures catch up toward, fixed at each visit with the multiplier of each
 *   creature (0: none fixed yet). The pass fades a multiplier as a creature closes on it, so it never lifts a creature past it.
 * - `valley_creatures.moment_day`: the game day the creature last featured in a small moment (V-BON-9; null: never), so the next
 *   moment leans toward creatures that have not featured lately.
 * - `raid_placements_user`: the raid week's placements by player, so the pass finds the creatures a player has in the raid (V-POST-7)
 *   with a lookup of their own rows (three or so) instead of reading the whole week.
 */
export function valleyBonfireMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_server (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    middle REAL NOT NULL,
    day TEXT NOT NULL,
    players INTEGER NOT NULL
  )`);
  sql.exec('ALTER TABLE valley_players ADD COLUMN catch_target REAL NOT NULL DEFAULT 0');
  sql.exec('ALTER TABLE valley_creatures ADD COLUMN moment_day INTEGER');
  sql.exec(
    'CREATE INDEX IF NOT EXISTS raid_placements_user ON raid_placements (user_id, week_id)',
  );
}
