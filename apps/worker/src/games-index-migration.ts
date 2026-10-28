/**
 * Migration 42: indexes for the Valley Games' day lookups (decisions.md, 2026-10-25). Every request and
 * every alarm asks for the locked days not awarded yet, and the Games tab for the latest shown and the
 * latest awarded day. Each read the whole `games_days` table, which grows by a row a day. Never edit a
 * released migration.
 */
export function gamesIndexMigration(sql: SqlStorage): void {
  sql.exec(
    `CREATE INDEX games_days_unawarded ON games_days (ends_at, day)
     WHERE locked_at IS NOT NULL AND awarded_at IS NULL`,
  );
  sql.exec(
    'CREATE INDEX games_days_shown ON games_days (show_at, day) WHERE locked_at IS NOT NULL',
  );
  sql.exec(
    'CREATE INDEX games_days_awarded ON games_days (awarded_at, day) WHERE awarded_at IS NOT NULL',
  );
}
