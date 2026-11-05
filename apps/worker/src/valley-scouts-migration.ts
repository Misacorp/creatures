/**
 * Migration 57: scouts (phase 5 step 2, docs/design/valley/systems/scouts.md and posts.md). Additive: production runs it with the flag
 * off and the new tables stay empty; the new columns hold their defaults. Every per-player table carries `user_id`, so `purgeUser` (the
 * `valley-fresh` tool) clears it with the rest; nothing here is guild-level (keystones, V-SCOUT-9, wait for the commons in step 6).
 *
 * - `valley_seats`: one row per seat a player owns (bought through `/api/valley/seat/buy`, V-POST-2). `place` and `kind` name the post
 *   (`signpost`, `scout` today; anvils and the like join with their steps). `position` is the order the seats were bought in (V-SCOUT-10:
 *   a later seat at the same place is a "second" scout). `destination_id` is where the scout is posted; `prev_destination_id` the last
 *   open place it stood at (the Festival Grounds walk back to it when they close, V-SCOUT-8). `creature_id` is the posted creature (null:
 *   an empty seat) and the one source of truth for who stands where: `valley_creatures.seat_id` stays unused. `kit_id` is the kit on this
 *   seat (V-SCOUT-5). The store: `store_hours` of the pack (effective hours, up to three days, V-POST-5), the whole scrap and shards that
 *   wait with their fractional carries, and the counts of gear, blueprint and page finds waiting (each is rolled when it comes home).
 *   `deep` (V-SCOUT-6) and `communal` (V-POST-13) are kept for the steps that use them. `passed_at` is the time of the seat's last pass.
 *   Indexes: `(user_id)` for the pass, `(creature_id)` for "where does this creature stand".
 * - `valley_kit`: the kit a player has bought (once each, V-POST-11); any owned kit can be set on any seat for free.
 * - `valley_creatures.scout_hours`: the creature's scouting mastery in effective hours (V-POST-12); it stays with the creature.
 * - `valley_players.first_scout_done`: the starter's first scout has had its sure find (V-SCOUT-3 note).
 * - `pending_catches.auto_at`: when a duplicate waiting at the Paddock gate takes today's Recommended answer by itself (V-SCOUT-3); null
 *   for a card nobody auto-answers (the old trips' and the festival's).
 */
export function valleyScoutsMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_seats (
    seat_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    place TEXT NOT NULL,
    kind TEXT NOT NULL,
    position INTEGER NOT NULL,
    destination_id TEXT NOT NULL,
    prev_destination_id TEXT,
    creature_id TEXT,
    kit_id TEXT,
    store_hours REAL NOT NULL DEFAULT 0,
    scrap INTEGER NOT NULL DEFAULT 0,
    scrap_carry REAL NOT NULL DEFAULT 0,
    shards INTEGER NOT NULL DEFAULT 0,
    shard_carry REAL NOT NULL DEFAULT 0,
    gear_finds INTEGER NOT NULL DEFAULT 0,
    blueprint_finds INTEGER NOT NULL DEFAULT 0,
    page_finds INTEGER NOT NULL DEFAULT 0,
    deep INTEGER NOT NULL DEFAULT 0,
    communal INTEGER NOT NULL DEFAULT 0,
    passed_at INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX IF NOT EXISTS valley_seats_user ON valley_seats (user_id)');
  sql.exec('CREATE INDEX IF NOT EXISTS valley_seats_creature ON valley_seats (creature_id)');
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_kit (
    user_id TEXT NOT NULL,
    kit_id TEXT NOT NULL,
    bought_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, kit_id)
  )`);
  sql.exec('ALTER TABLE valley_creatures ADD COLUMN scout_hours REAL NOT NULL DEFAULT 0');
  sql.exec('ALTER TABLE valley_players ADD COLUMN first_scout_done INTEGER NOT NULL DEFAULT 0');
  sql.exec('ALTER TABLE pending_catches ADD COLUMN auto_at INTEGER');
}
