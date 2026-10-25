/**
 * Migration 44: indexes for lookups that walked a player's whole history (decisions.md, 2026-10-25). The
 * state's recent claimed and cancelled trips read every trip of the player, and the raid view's worn gear
 * every item of each party member: both grew with every month played. Never edit a released migration.
 */
export function historyIndexMigration(sql: SqlStorage): void {
  sql.exec(
    "CREATE INDEX expeditions_user_claimed ON expeditions (user_id, claimed_at) WHERE status = 'claimed'",
  );
  sql.exec(
    "CREATE INDEX expeditions_user_cancelled ON expeditions (user_id, started_at) WHERE status = 'cancelled'",
  );
  sql.exec(
    'CREATE INDEX gear_items_user_worn ON gear_items (user_id) WHERE equipped_on IS NOT NULL',
  );
}
