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

/**
 * The start-up passes' mark (decisions.md, 2026-10-25). The passes in `GuildCore.migrate` after the
 * numbered migrations (gear row shapes, the gear and level conversions, missing talents) read whole
 * tables, and the object starts again after every sleep: with the lounge's sockets open it sleeps between
 * the minute ticks. They now run once per deployed build; this remembers which build that was. Not a
 * numbered migration: it is created where it is read, so branches sharing a staging database never
 * disagree about a number.
 */
export function startupPassesRan(sql: SqlStorage, build: string): boolean {
  sql.exec(`CREATE TABLE IF NOT EXISTS startup_passes (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    build TEXT NOT NULL
  )`);
  const row = sql
    .exec<{ build: string }>('SELECT build FROM startup_passes WHERE id = 1')
    .toArray()[0];
  return row?.build === build;
}

export function markStartupPasses(sql: SqlStorage, build: string): void {
  sql.exec(
    'INSERT INTO startup_passes (id, build) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET build = excluded.build',
    build,
  );
}
