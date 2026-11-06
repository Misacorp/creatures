/**
 * Migration 58: the Forge loop (phase 5 step 3, docs/design/valley/systems/forge.md and gear.md). Additive: production runs it with the
 * flag off and the new tables stay empty; the new columns hold their defaults. Every per-player table carries `user_id`, so `purgeUser`
 * (the `valley-fresh` tool) clears it with the rest; nothing here is guild-level.
 *
 * - Anvils are seats: `valley_seats` rows with `place = 'forge'`, `kind = 'anvil'` (and `destination_id = 'forge'`). The columns added
 *   hold what only an anvil has: `floor_count` (pieces on its floor, kept in step with `forge_floor` so the pass never reads the rows,
 *   V-FORGE-5), the piece in hand (`piece_active` and the `piece_*` columns: its order, the blueprint's base, whether it is for the
 *   team, the shard element index or -1, the rarity drawn when it started, the Reach, the hours it needs and the progress), and what
 *   the smith waits on (`wait_reason`, `wait_element`, `wait_since`; null: working).
 * - `forge_orders`: an anvil's queue (V-FORGE-1): `position` in the queue, the blueprint's base (null: "for my team"), the shard
 *   `element` index (-1: any pile or the team's choice), the `count` asked for (0 for a team order, which goes on until the team is
 *   dressed), `made` pieces so far, the `reach` and `for_team`. Indexes `(user_id)` for the pass and `(seat_id)`.
 * - `forge_floor`: the finished pieces waiting on a floor (V-FORGE-5). The item itself is rolled when the piece comes home, so a row
 *   keeps only what decides it: the blueprint's base (null for a team piece), the element, the rarity and the item level (the fire's
 *   at the moment it was made). Indexes `(user_id)` and `(seat_id)`.
 * - `valley_bag`: the bag counter (V-GEAR-6): the items a player holds that are not worn, kept in step with every gear insert, delete,
 *   equip and unequip (`gear-store.ts`), so the bag's size is one row, never a count over the items.
 * - `valley_creatures.smith_hours`: the creature's smithing mastery in effective hours (V-POST-12); it stays with the creature.
 * - `valley_players.forge_carry`: tinkering scrap not yet whole (V-FORGE-2).
 */
export function valleyForgeMigration(sql: SqlStorage): void {
  for (const column of [
    'floor_count INTEGER NOT NULL DEFAULT 0',
    'piece_active INTEGER NOT NULL DEFAULT 0',
    'piece_order TEXT',
    'piece_blueprint TEXT',
    'piece_team INTEGER NOT NULL DEFAULT 0',
    'piece_element INTEGER NOT NULL DEFAULT -1',
    'piece_rarity INTEGER NOT NULL DEFAULT 0',
    "piece_reach TEXT NOT NULL DEFAULT 'none'",
    'piece_need REAL NOT NULL DEFAULT 0',
    'piece_progress REAL NOT NULL DEFAULT 0',
    'wait_reason TEXT',
    'wait_element INTEGER NOT NULL DEFAULT -1',
    'wait_since INTEGER',
  ]) {
    sql.exec(`ALTER TABLE valley_seats ADD COLUMN ${column}`);
  }
  sql.exec(`CREATE TABLE IF NOT EXISTS forge_orders (
    order_id TEXT PRIMARY KEY,
    seat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    blueprint_id TEXT,
    element INTEGER NOT NULL DEFAULT -1,
    count INTEGER NOT NULL DEFAULT 0,
    made INTEGER NOT NULL DEFAULT 0,
    reach TEXT NOT NULL DEFAULT 'none',
    for_team INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX IF NOT EXISTS forge_orders_user ON forge_orders (user_id)');
  sql.exec('CREATE INDEX IF NOT EXISTS forge_orders_seat ON forge_orders (seat_id)');
  sql.exec(`CREATE TABLE IF NOT EXISTS forge_floor (
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
  sql.exec('CREATE INDEX IF NOT EXISTS forge_floor_user ON forge_floor (user_id)');
  sql.exec('CREATE INDEX IF NOT EXISTS forge_floor_seat ON forge_floor (seat_id)');
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_bag (
    user_id TEXT PRIMARY KEY,
    items INTEGER NOT NULL DEFAULT 0
  )`);
  sql.exec('ALTER TABLE valley_creatures ADD COLUMN smith_hours REAL NOT NULL DEFAULT 0');
  sql.exec('ALTER TABLE valley_players ADD COLUMN forge_carry REAL NOT NULL DEFAULT 0');
}
