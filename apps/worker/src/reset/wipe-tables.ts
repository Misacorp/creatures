/**
 * Which tables the reset's wipe deletes (`docs/design/reset.md`, section 3), shared by the wipe and the dry run so the report cannot
 * drift from what the wipe does. Read-only helpers.
 *
 * Kept: `guild_meta` (this server's own setup: its Discord id for the leet source, its timezone and announce channel; the object cannot
 * run without them), and the analytics' hashed daily counts (`analytics_daily`, `db_reads`; no names), so before and after can be compared.
 * Everything else, including the raw analytics events (they carry actor hashes), sessions and the dev tools' state, goes.
 */

/** Tables the wipe leaves alone. */
export const KEPT_TABLES: ReadonlySet<string> = new Set([
  'guild_meta',
  'analytics_daily',
  'db_reads',
]);

/** Every table of the guild's database that the wipe would delete, by name. Internal tables (`sqlite_*`, `_cf_*`) are never listed. */
export function wipedTables(sql: SqlStorage): string[] {
  return sql
    .exec<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    )
    .toArray()
    .map((r) => r.name)
    .filter((name) => !KEPT_TABLES.has(name));
}

const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/** Rows per table that the wipe would delete (tables with no rows included, so a report shows every table). */
export function wipedRowCounts(sql: SqlStorage): { table: string; rows: number }[] {
  return wipedTables(sql).map((table) => ({
    table,
    rows: sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${quote(table)}`).one().n,
  }));
}

export { quote as quoteTable };
