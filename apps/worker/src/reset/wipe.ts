/**
 * The wipe (`docs/design/reset.md`, section 3): deletes a guild's whole store and runs the migrations from zero, then sets the leet
 * sync so payouts start from the switch day. **Nothing calls this function.** It is exported for the release PR's trigger; no route, alarm
 * or dev tool reaches it (`test/reset/inert.test.ts` scans the source for that).
 *
 * It refuses unless it is given the archive's receipt for this guild's archive key, and the receipt's counts still match the live
 * database (a record taken before more play is stale), so a failed or missing archive write never wipes. All of it runs in one
 * transaction: a failure leaves the guild as it was.
 *
 * The schema is rebuilt by the migrations; the caller then runs the object's own start (`GuildCore.migrate()`), exactly as a fresh object
 * does, which adds what the start-up passes create (for example the level reset's table). The tests do the same.
 *
 * Left in place (`wipe-tables.ts`): `guild_meta` and the analytics' hashed daily counts.
 */
import * as v from 'valibot';
import { loungeMigration } from '../lounge';
import { applyMigrations } from '../migrations';
import { ArchiveReceiptSchema } from './record-schema';
import { countSettlersAndCreatures } from './settlers-record';
import { KEPT_TABLES, quoteTable, wipedRowCounts, wipedTables } from './wipe-tables';

export type WipeRefusal = 'no_receipt' | 'wrong_archive_key' | 'stale_receipt' | 'bad_switch_day';

export class WipeRefused extends Error {
  constructor(readonly reason: WipeRefusal) {
    super(`wipe refused: ${reason}`);
    this.name = 'WipeRefused';
  }
}

export interface WipeOptions {
  /** This guild's archive key (from its record). */
  archiveKey: string;
  /** What the archive answered to `put`: proof that the record is stored. */
  receipt: unknown;
  /** The guild-local day the new server's leet payouts start from (`YYYY-MM-DD`). */
  switchDay: string;
  /** The configured leet source's kind: the sync forgets its start day when this differs from the stored one. */
  leetSource: 'http' | 'mock';
}

export interface WipeResult {
  tablesDeleted: number;
  rowsDeleted: number;
}

interface WipeStorage {
  sql: SqlStorage;
  transactionSync<T>(closure: () => T): T;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Throws `WipeRefused` unless the receipt proves this guild's record is archived. */
export function checkReceipt(sql: SqlStorage, options: WipeOptions): void {
  if (!DAY_RE.test(options.switchDay)) throw new WipeRefused('bad_switch_day');
  const parsed = v.safeParse(ArchiveReceiptSchema, options.receipt);
  if (!parsed.success) throw new WipeRefused('no_receipt');
  if (parsed.output.archiveKey !== options.archiveKey) throw new WipeRefused('wrong_archive_key');
  const live = countSettlersAndCreatures(sql);
  if (parsed.output.settlers !== live.settlers || parsed.output.creatures !== live.creatures) {
    throw new WipeRefused('stale_receipt');
  }
}

/** Deletes the guild's store and rebuilds it from the migrations. Never called by the game today. */
export function wipeGuild(storage: WipeStorage, options: WipeOptions): WipeResult {
  const { sql } = storage;
  checkReceipt(sql, options);
  return storage.transactionSync(() => {
    const counts = wipedRowCounts(sql);
    const rowsDeleted = counts.reduce((sum, c) => sum + c.rows, 0);
    // The kept tables' rows wait in memory while their tables are rebuilt (the migrations create them again).
    const kept = [...KEPT_TABLES].flatMap((table) => {
      const exists =
        sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", table).toArray()
          .length > 0;
      if (!exists) return [];
      return [
        {
          table,
          rows: sql
            .exec<Record<string, SqlStorageValue>>(`SELECT * FROM ${quoteTable(table)}`)
            .toArray(),
        },
      ];
    });
    // Sessions reference players: drop them first.
    const tables = wipedTables(sql);
    const ordered = ['sessions', ...tables.filter((t) => t !== 'sessions')];
    for (const table of ordered) sql.exec(`DROP TABLE IF EXISTS ${quoteTable(table)}`);
    for (const { table } of kept) sql.exec(`DROP TABLE IF EXISTS ${quoteTable(table)}`);
    // The same two steps as a fresh object's start (`GuildCore.runMigrations`).
    applyMigrations(storage, sql);
    loungeMigration(sql);
    for (const { table, rows } of kept) {
      for (const row of rows) {
        const columns = Object.keys(row);
        sql.exec(
          `INSERT INTO ${quoteTable(table)} (${columns.map(quoteTable).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          ...columns.map((c) => row[c] ?? null),
        );
      }
    }
    // Payouts start from the switch day: a fresh server would backfill LEET_BACKFILL_DAYS, and those days were paid already.
    sql.exec(
      'INSERT OR REPLACE INTO leet_sync (id, cursor, since_date, source) VALUES (1, NULL, ?, ?)',
      options.switchDay,
      options.leetSource,
    );
    return { tablesDeleted: tables.length, rowsDeleted };
  });
}
