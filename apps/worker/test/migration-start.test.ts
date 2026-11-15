import { describe, expect, it } from 'vitest';
import { applyMigrations, type Migration } from '../src/migrations';
import { inGuild } from './read-world';

/**
 * Object start reads one row from `schema_version` however many versions are recorded: the runner makes a
 * non-unique index itself and reads `MAX(version)` (see `applyMigrations`). Stand-in lists, so the rows of the
 * runner alone are measured, not the rest of a start.
 */
const noop: Migration = () => undefined;
const list = (n: number): Migration[] => Array.from({ length: n }, () => noop);
const versions = (sql: SqlStorage) =>
  sql
    .exec<{ version: number }>('SELECT version FROM schema_version ORDER BY version')
    .toArray()
    .map((r) => r.version);
const indexed = (sql: SqlStorage) =>
  sql
    .exec<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'schema_version_version'",
    )
    .toArray().length;

describe('the migration runner at object start', () => {
  it('reads a flat number of rows on an up-to-date database, however many versions are recorded', async () => {
    const rows: number[] = [];
    for (const n of [10, 40, 200]) {
      await inGuild(
        async ({ metered }) => {
          const l = list(n);
          applyMigrations(metered.storage, metered.sql, l);
          const { reads } = await metered.measure(() => {
            applyMigrations(metered.storage, metered.sql, l);
          });
          rows.push(reads.total);
        },
        { fresh: true },
      );
    }
    expect(rows[1]).toBe(rows[0]);
    expect(rows[2]).toBe(rows[0]);
    // The index lookup of the highest version: one row.
    expect(rows[0]).toBeLessThanOrEqual(2);
  });

  it('plans the highest-version read as an index search, not a scan', async () => {
    await inGuild(
      ({ metered }) => {
        applyMigrations(metered.storage, metered.sql, list(5));
        const plan = metered.sql
          .exec<{
            detail: string;
          }>('EXPLAIN QUERY PLAN SELECT MAX(version) AS v FROM schema_version')
          .toArray()
          .map((p) => p.detail)
          .join(' | ');
        expect(plan).toContain('schema_version_version');
        expect(plan).not.toMatch(/SCAN schema_version(?! USING)/);
        return Promise.resolve();
      },
      { fresh: true },
    );
  });

  it('a database from before the index gets it on first start, applies nothing, and is flat after', async () => {
    await inGuild(
      async ({ metered }) => {
        const { sql, storage } = metered;
        sql.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
        for (let v = 1; v <= 30; v++)
          sql.exec('INSERT INTO schema_version (version) VALUES (?)', v);
        expect(indexed(sql)).toBe(0);
        let runs = 0;
        const l: Migration[] = Array.from({ length: 30 }, () => () => {
          runs += 1;
        });
        applyMigrations(storage, sql, l);
        expect(indexed(sql)).toBe(1);
        expect(runs).toBe(0);
        expect(versions(sql)).toHaveLength(30);
        const { reads } = await metered.measure(() => {
          applyMigrations(storage, sql, l);
        });
        expect(reads.total).toBeLessThanOrEqual(2);
        expect(runs).toBe(0);
      },
      { fresh: true },
    );
  });

  it('a fresh database applies everything once, a second start nothing', async () => {
    await inGuild(
      ({ metered }) => {
        const { sql, storage } = metered;
        let runs = 0;
        const l: Migration[] = Array.from({ length: 12 }, () => () => {
          runs += 1;
        });
        applyMigrations(storage, sql, l);
        expect(runs).toBe(12);
        expect(versions(sql)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
        applyMigrations(storage, sql, l);
        expect(runs).toBe(12);
        return Promise.resolve();
      },
      { fresh: true },
    );
  });

  it('a list that grew takes the slow path and fills a lower reserved gap', async () => {
    await inGuild(
      ({ metered }) => {
        const { sql, storage } = metered;
        const ran: string[] = [];
        const mark =
          (name: string): Migration =>
          () => {
            ran.push(name);
          };
        applyMigrations(storage, sql, [noop, null, noop]);
        expect(versions(sql)).toEqual([1, 3]);
        // The gap is filled in a change that also appends a migration: the list grew, so the slow path runs.
        applyMigrations(storage, sql, [noop, mark('gap'), noop, mark('appended')]);
        expect(ran).toEqual(['gap', 'appended']);
        expect(versions(sql)).toEqual([1, 2, 3, 4]);
        return Promise.resolve();
      },
      { fresh: true },
    );
  });

  it('pins the blind spot: a gap filled without the list growing is not seen at the top', async () => {
    await inGuild(
      ({ metered }) => {
        const { sql, storage } = metered;
        const ran: string[] = [];
        applyMigrations(storage, sql, [noop, null, noop]);
        // Documented in `applyMigrations`: the rule is to append a migration in the same change.
        applyMigrations(storage, sql, [
          noop,
          () => {
            ran.push('gap');
          },
          noop,
        ]);
        expect(ran).toEqual([]);
        expect(versions(sql)).toEqual([1, 3]);
        return Promise.resolve();
      },
      { fresh: true },
    );
  });

  it('a list ending in a reserved slot always takes the slow path', async () => {
    await inGuild(
      ({ metered }) => {
        const { sql, storage } = metered;
        let runs = 0;
        const real: Migration = () => {
          runs += 1;
        };
        applyMigrations(storage, sql, [noop, real, null]);
        expect(runs).toBe(1);
        expect(versions(sql)).toEqual([1, 2]);
        applyMigrations(storage, sql, [noop, real, null]);
        expect(runs).toBe(1);
        return Promise.resolve();
      },
      { fresh: true },
    );
  });
});
