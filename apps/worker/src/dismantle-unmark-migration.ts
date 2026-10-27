/**
 * Version 49: the persisted dismantle marks go (decisions.md, 2026-10-27, "Bulk selection replaces marking").
 *
 * Selection lives only on the client now and the dismantle request names the items, so `gear_items.dismantle_mark`
 * (added by version 48, which already ran on staging and stays as it is) is dropped. `dismantle_days`, the day's
 * count of dismantled items that Market Day's boost reads, stays.
 */
export function dismantleUnmarkMigration(sql: SqlStorage): void {
  const present = sql
    .exec("SELECT 1 FROM pragma_table_info('gear_items') WHERE name = 'dismantle_mark'")
    .toArray();
  if (present.length > 0) sql.exec('ALTER TABLE gear_items DROP COLUMN dismantle_mark');
}
