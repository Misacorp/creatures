/**
 * Migration 61: the commons (phase 5 step 6, docs/design/valley/systems/commons.md). Additive: production runs it with the flag off
 * and every table stays empty. The guild-level tables are cleared by `valley-fresh` through `VALLEY_GUILD_TABLES`; `valley_gifts` and
 * the new `valley_players` columns carry `user_id` and go with `purgeUser`.
 *
 * - `valley_places`: one row per place of the valley (V-COM-8). `level` (1 to the max) and `project`, the serial number of the project
 *   the place is on (the first is 1; past the max level the serial goes on with cosmetic projects, counted in `cosmetic`). `size` is the
 *   open project's size in Acorns' worth, fixed when it opened (0: no project is open); `have_*` is what each part has taken (REAL: the
 *   communal seats' trickle is fractional). A finished project sets `opens_at` three build days on, and the next one opens lazily when a
 *   read finds the time past (no timer, V-COM-5). `plaque` is the names of everyone who helped the last finished level, written once.
 * - `valley_gifts`: one row per player per project (V-COM-8): `given_milli` is what they gave in thousandths of an Acorn's worth (gifts
 *   and credited communal work), `plaque` marks the player as a helper (a name on the plaque, the keepsake, V-COM-3).
 * - `valley_collections`: one row per socket that has been set (V-COM-12): the place's board, the socket's index, the find's source and
 *   the finder's name for good. A socket with no row is empty.
 * - `valley_fire_log`: the fire's warming (V-COM-13), one row for every step: its source, the place, the step and the fire's total after
 *   it, in thousandths of a level. The last row is the fire (one row read); the last five are "what warmed it".
 * - `valley_keystones`: one row per scouting destination (V-SCOUT-9): the server's one clock (`ready_at`) and how many were found.
 * - `valley_players.visit_mask`, `mask_day`, `joined_day`: the days of the last seven the player visited (bit 0 is `mask_day`, a UTC day
 *   number) and the day they joined, so the daily job can weigh the active players (V-COM-5).
 * - `valley_server.weight`: the server's active weight, written once a game day beside the middle.
 */
export function valleyCommonsMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_places (
    place TEXT PRIMARY KEY,
    level INTEGER NOT NULL DEFAULT 1,
    project INTEGER NOT NULL DEFAULT 1,
    size REAL NOT NULL DEFAULT 0,
    have_acorns REAL NOT NULL DEFAULT 0,
    have_scrap REAL NOT NULL DEFAULT 0,
    have_shards REAL NOT NULL DEFAULT 0,
    opened_at INTEGER NOT NULL DEFAULT 0,
    opens_at INTEGER NOT NULL DEFAULT 0,
    done_at INTEGER,
    cosmetic INTEGER NOT NULL DEFAULT 0,
    plaque TEXT NOT NULL DEFAULT '[]'
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_gifts (
    user_id TEXT NOT NULL,
    place TEXT NOT NULL,
    project INTEGER NOT NULL,
    given_milli INTEGER NOT NULL DEFAULT 0,
    plaque INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, place, project)
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_collections (
    place TEXT NOT NULL,
    socket INTEGER NOT NULL,
    source TEXT NOT NULL,
    finder TEXT NOT NULL,
    found_at INTEGER NOT NULL,
    PRIMARY KEY (place, socket)
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_fire_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    source TEXT NOT NULL,
    place TEXT,
    warmth_milli INTEGER NOT NULL,
    total_milli INTEGER NOT NULL
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_keystones (
    destination TEXT PRIMARY KEY,
    ready_at INTEGER NOT NULL,
    found INTEGER NOT NULL DEFAULT 0
  )`);
  sql.exec('ALTER TABLE valley_players ADD COLUMN visit_mask INTEGER NOT NULL DEFAULT 0');
  sql.exec('ALTER TABLE valley_players ADD COLUMN mask_day INTEGER NOT NULL DEFAULT 0');
  sql.exec('ALTER TABLE valley_players ADD COLUMN joined_day INTEGER NOT NULL DEFAULT 0');
  sql.exec('ALTER TABLE valley_server ADD COLUMN weight REAL NOT NULL DEFAULT 0');
}
