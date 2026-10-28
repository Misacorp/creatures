/**
 * Version 48: items marked for dismantling, and the day's count of dismantled items (decisions.md,
 * 2026-10-27, "Marked items, dismantled as a pile").
 *
 * - `gear_items.dismantle_mark` is 1 while the player has marked the item. It is read with the bag (the rows
 *   are read anyway), so it needs no index. Equipping an item clears it.
 * - `dismantle_days` counts the items a player dismantled in one game day (keyed by the day's start), so
 *   Market Day's "first 2 dismantles" can be counted in items without scanning old actions.
 */
export function dismantleMarkMigration(sql: SqlStorage): void {
  sql.exec('ALTER TABLE gear_items ADD COLUMN dismantle_mark INTEGER NOT NULL DEFAULT 0');
  sql.exec(`CREATE TABLE dismantle_days (
    user_id TEXT NOT NULL,
    day_start INTEGER NOT NULL,
    items INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day_start)
  ) WITHOUT ROWID`);
}
