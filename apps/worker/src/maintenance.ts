/**
 * The guild's daily maintenance mark (docs/design/decisions.md, 2026-10-23). The alarm runs every minute
 * while anyone has the game open (the lounge check), and the cleanup passes it used to run each time
 * (old analytics, gear actions and dungeon runs) read whole tables. They now run on the first alarm of
 * each game day only; this table remembers which day that was, so an evicted object does not run them
 * again at its next wake.
 */

/**
 * Migration 38: the mark, and an index for the rollup's "last rolled day" lookup (`MAX(day) WHERE
 * metric = 'rolled'`), which read the whole rollup table on every alarm without it.
 */
export function maintenanceMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE maintenance (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    day TEXT NOT NULL
  )`);
  sql.exec('CREATE INDEX analytics_daily_metric_day ON analytics_daily(metric, day)');
}

/** The game day the cleanup last finished, or null before the first one. */
export function maintainedDay(sql: SqlStorage): string | null {
  return (
    sql.exec<{ day: string }>('SELECT day FROM maintenance WHERE id = 1').toArray()[0]?.day ?? null
  );
}

export function markMaintained(sql: SqlStorage, day: string): void {
  sql.exec(
    'INSERT INTO maintenance (id, day) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET day = excluded.day',
    day,
  );
}
