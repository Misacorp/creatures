// Counts the Durable Object rows a piece of work reads. Cloudflare bills `rows_read` per statement (the
// `rowsRead` of its cursor), and the free tier allows 5,000,000 a day, so a whole-table scan on a hot path
// is a bug the tests should see. See `read-budget.test.ts` and testing.md, "Database reads".
import { expect } from 'vitest';

/** The rows one statement shape read in a measured piece of work. */
export interface StatementReads {
  sql: string;
  rows: number;
  calls: number;
}

export interface ReadReport {
  /** The sum of `rowsRead` of every cursor created during the work. */
  total: number;
  statements: number;
  /** Statement shapes, most rows first. */
  top: StatementReads[];
}

export interface MeteredStorage {
  /** The storage to hand to a `GuildCore` (its `sql` records every cursor). */
  storage: DurableObjectStorage;
  sql: SqlStorage;
  /** Runs `fn` and reports the rows read by every statement it ran (not reentrant). */
  measure<T>(fn: () => T | Promise<T>): Promise<{ result: T; reads: ReadReport }>;
}

const shape = (query: string): string => query.replace(/\s+/g, ' ').trim().slice(0, 140);

function wrap<T extends object>(target: T, over: Record<string, unknown>): T {
  return new Proxy(target, {
    get(t, prop) {
      if (typeof prop === 'string' && prop in over) return over[prop];
      const value = Reflect.get(t, prop) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(t) : value;
    },
  });
}

/** Wraps a Durable Object's storage so `measure` can sum the rows read by what runs through it. */
export function meterStorage(raw: DurableObjectStorage): MeteredStorage {
  let recorded: { query: string; cursor: { rowsRead: number } }[] = [];
  const sql = wrap(raw.sql, {
    exec: (query: string, ...bindings: unknown[]) => {
      const cursor = raw.sql.exec(query, ...(bindings as []));
      recorded.push({ query, cursor });
      return cursor;
    },
  });
  const storage = wrap(raw, { sql });
  return {
    storage,
    sql,
    async measure(fn) {
      recorded = [];
      const result = await fn();
      // A cursor's `rowsRead` is final once it is consumed, which every statement of finished work is.
      const byShape = new Map<string, StatementReads>();
      let total = 0;
      for (const { query, cursor } of recorded) {
        total += cursor.rowsRead;
        const key = shape(query);
        const entry = byShape.get(key) ?? { sql: key, rows: 0, calls: 0 };
        entry.rows += cursor.rowsRead;
        entry.calls += 1;
        byShape.set(key, entry);
      }
      const reads = {
        total,
        statements: recorded.length,
        top: [...byShape.values()].sort((a, b) => b.rows - a.rows),
      };
      recorded = [];
      return { result, reads };
    },
  };
}

/** The top statements as text: what a failing assertion shows, so the culprit is at the top. */
export function describeReads(label: string, reads: ReadReport, top = 8): string {
  const lines = reads.top
    .slice(0, top)
    .map((s) => `  ${String(s.rows).padStart(7)} rows  x${String(s.calls)}  ${s.sql}`);
  return [
    `${label}: ${String(reads.total)} rows read by ${String(reads.statements)} statements. Top statements:`,
    ...lines,
  ].join('\n');
}

/** Fails, listing the top statements by rows read, when the work read more than `budget` rows. */
export function expectReadsUnder(label: string, reads: ReadReport, budget: number): void {
  expect(
    reads.total,
    `${describeReads(label, reads)}\nBudget: ${String(budget)} rows. A whole-table scan on a hot path needs an index (CLAUDE.md, Conventions).`,
  ).toBeLessThanOrEqual(budget);
}
