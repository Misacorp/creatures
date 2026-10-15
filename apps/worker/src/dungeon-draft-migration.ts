/**
 * Migration 24: the saved dungeon team draft (see `dungeon.ts`). One row per player: the row they
 * set up (three creature ids or nulls, left to right, as JSON) so it survives a tab switch or a
 * reload. It is dropped when the player's next run is stored. No foreign keys, like the other game
 * tables; times are UTC epoch milliseconds. Never edit a released migration.
 */
export function dungeonDraftMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE dungeon_drafts (
    user_id TEXT PRIMARY KEY,
    team_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
}
