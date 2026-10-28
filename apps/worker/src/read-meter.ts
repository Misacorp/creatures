/**
 * Rows read per source and game day (decisions.md, 2026-10-25). Cloudflare's free tier allows 5,000,000
 * Durable Object `rows_read` a day, and a whole-table scan on a hot path (every request, every alarm, every
 * object start) used up that allowance twice. Every statement returns a cursor whose `rowsRead` is the
 * number of rows the database looked at; this wraps the guild's `SqlStorage`, keeps the cursors it hands
 * out and, at the end of a request or an alarm, adds their sum to the day's counter in `db_reads` (migration
 * 43). The daily rollup copies a finished day into `analytics_daily` as `db.rows_read`, and the ops report
 * shows it.
 *
 * - A source is `start` (constructor and `migrate`), `alarm`, `socket` (the hibernation handlers), or
 *   `request:<area>` where the area is the first segment after `/api/` if it is one of `READ_AREAS`, and
 *   `other` otherwise. A source never holds an id or anything a player typed.
 * - Attribution is approximate: requests interleave at every `await`, so the cursors of two overlapping
 *   requests go to whichever flushes first. The daily total stays exact.
 * - The meter writes one UPSERT per flush (through the raw storage, so it does not count itself) and reads
 *   nothing. It never throws into a request or an alarm.
 */

/** The route areas that get a source of their own; anything else is `request:other`. */
export const READ_AREAS: ReadonlySet<string> = new Set([
  'me',
  'state',
  'room',
  'raid',
  'finale',
  'games',
  'dungeon',
  'expeditions',
  'gear',
  'workshop',
  'creatures',
  'catches',
  'destinations',
  'starter',
  'profile',
  'level-reset',
  'away',
  'ledger',
  'lounge',
  'lounge-spot',
  'lounger',
  'notifications',
  'weather',
  'dev',
  // Not a path: the login the Worker makes over RPC (`createSession`).
  'session',
]);

export type ReadSource = 'start' | 'alarm' | 'socket' | `request:${string}`;

/** The source of a request path: `request:<area>`, with `other` for a path that is not a known area. */
export function readSourceOfPath(pathname: string): ReadSource {
  const match = /^\/api\/([a-z-]+)/.exec(pathname);
  const area = match?.[1];
  return `request:${area !== undefined && READ_AREAS.has(area) ? area : 'other'}`;
}

/** Cursors kept between two flushes; past this the older ones are summed into `overflow` first. */
const MAX_PENDING = 5000;

/** Migration 43: the daily counters, one row per game day and source. */
export function dbReadsMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE db_reads (
    day TEXT NOT NULL,
    source TEXT NOT NULL,
    rows INTEGER NOT NULL,
    PRIMARY KEY (day, source)
  )`);
}

/** Deletes the counters of game days before `cutoffDay` (the daily maintenance; the rollup has kept them). */
export function pruneReads(sql: SqlStorage, cutoffDay: string): void {
  // Never throws: the counters must not stop the cleanup passes after them.
  try {
    sql.exec('DELETE FROM db_reads WHERE day < ?', cutoffDay);
  } catch (err) {
    console.error('read meter failed', err instanceof Error ? err.name : 'unknown');
  }
}

export class ReadMeter {
  /** The wrapped storage: hand this, not the raw one, to everything that reads. */
  readonly sql: SqlStorage;
  private pending: { rowsRead: number }[] = [];
  /** Rows of cursors that were dropped from `pending` to bound it. */
  private overflow = 0;
  /** Settled rows per source, waiting for the next flush (the start's wait here for the first one). */
  private readonly settled = new Map<string, number>();

  constructor(private readonly raw: SqlStorage) {
    this.sql = new Proxy(raw, {
      get: (target, prop) => {
        if (prop === 'exec') {
          return (query: string, ...bindings: unknown[]) => {
            const cursor = target.exec(query, ...(bindings as []));
            this.track(cursor);
            return cursor;
          };
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });
  }

  private track(cursor: { rowsRead: number }): void {
    if (this.pending.length >= MAX_PENDING) {
      for (const c of this.pending) this.overflow += c.rowsRead;
      this.pending = [];
    }
    this.pending.push(cursor);
  }

  /** Moves the rows read since the last settle to `source` (in memory only). */
  settle(source: ReadSource): void {
    let sum = this.overflow;
    for (const c of this.pending) sum += c.rowsRead;
    this.pending = [];
    this.overflow = 0;
    if (sum > 0) this.settled.set(source, (this.settled.get(source) ?? 0) + sum);
  }

  /**
   * Settles to `source`, then adds everything settled (including an earlier start) to the counters of
   * `day`. Never throws; what cannot be written is dropped.
   */
  flush(source: ReadSource, day: string): void {
    try {
      this.settle(source);
      const entries = [...this.settled];
      this.settled.clear();
      for (const [name, rows] of entries) {
        this.raw.exec(
          `INSERT INTO db_reads (day, source, rows) VALUES (?, ?, ?)
           ON CONFLICT(day, source) DO UPDATE SET rows = rows + excluded.rows`,
          day,
          name,
          rows,
        );
      }
    } catch (err) {
      console.error('read meter failed', err instanceof Error ? err.name : 'unknown');
    }
  }
}
