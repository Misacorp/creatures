/**
 * Migration 14: auto fire preferences for the finale. One row per (week, player, target), where the
 * target is `basic` (the player's basic ability) or the id of one of the player's own team creatures
 * (that creature's ability). `auto_fire` is 1 (the ability fires by itself at its default round) or 0
 * (it waits for its owner, with the last-round safety net). No row means the default: on. The rows
 * are only written by the raid code, always inside a transaction, and only until the finale starts;
 * at the live start they set each ability's first mode. Like the other raid tables there are no
 * foreign keys: a row for a creature that has left the team is simply never read. Never edit a
 * released migration.
 */
export function raidAutofireMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE raid_autofire (
    week_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    target TEXT NOT NULL,
    auto_fire INTEGER NOT NULL CHECK (auto_fire IN (0, 1)),
    PRIMARY KEY (week_id, user_id, target)
  )`);
}
