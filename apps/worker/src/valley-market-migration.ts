/**
 * Migration 62: the Market and its broker (phase 5 step 7, docs/design/valley/systems/forge.md V-FORGE-11). Additive: production runs
 * it with the flag off and the new column holds its default.
 *
 * - The broker's seat is a `valley_seats` row (`place = 'market'`, `kind = 'broker'`, one per player, made when the server has built the
 *   Market). Its `destination_id` is what it trades toward (`any`: only what the orders wait on, or an element id), and its `shard_carry`
 *   the change in shards owed to its house (0 up to 1). It holds no store: its trades land on the shelf as they happen.
 * - `valley_creatures.trade_hours`: the creature's trading mastery in effective hours (V-POST-12); it stays with the creature.
 */
export function valleyMarketMigration(sql: SqlStorage): void {
  sql.exec('ALTER TABLE valley_creatures ADD COLUMN trade_hours REAL NOT NULL DEFAULT 0');
}
