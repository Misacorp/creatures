import { describe, expect, it } from 'vitest';
import { applyMigrations, MIGRATIONS, type Migration } from '../src/migrations';
import { runCore } from './helpers';
import { nextGuild } from './raid-helpers';

/**
 * The reserved versions 64 to 66 (the valley branch's) and housing at 67. The lists below stand in for the real ones
 * with one marker table per migration, so each scenario can see which ran and how often. "Production today" is
 * recorded up to 63; "staging" has the valley's real 64 to 66 recorded.
 */
const BEFORE = 63;
const noop: Migration = () => undefined;
const MARKERS = ['visitor', 'school', 'trials', 'houses'];

function marker(name: string, runs: string[]): Migration {
  return (sql) => {
    runs.push(name);
    sql.exec(`CREATE TABLE ${name} (x INTEGER)`);
  };
}

function lists(runs: string[]) {
  const base = Array.from({ length: BEFORE }, () => noop);
  const valley = [marker('visitor', runs), marker('school', runs), marker('trials', runs)];
  const housing = marker('houses', runs);
  return {
    // This branch: reserved gaps, then housing.
    housingBranch: [...base, null, null, null, housing],
    // The valley branch: its real migrations at 64 to 66.
    valleyBranch: [...base, ...valley],
    // After both merged: the valley's in place of the reserved gaps, housing after them.
    merged: [...base, ...valley, housing],
  };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const recorded = (sql: SqlStorage) =>
  sql
    .exec<{ version: number }>('SELECT version FROM schema_version ORDER BY version')
    .toArray()
    .map((r) => r.version);
const tables = (sql: SqlStorage) =>
  sql
    .exec<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE name IN (${MARKERS.map((m) => `'${m}'`).join(',')}) ORDER BY name`,
    )
    .toArray()
    .map((r) => r.name);
/** A blank database for the scenario: the real start's records and the marker tables are cleared. */
const blank = (sql: SqlStorage) => {
  sql.exec('DROP TABLE IF EXISTS schema_version');
  for (const t of MARKERS) sql.exec(`DROP TABLE IF EXISTS ${t}`);
};

describe('reserved migration versions', () => {
  it('the real list reserves exactly 64 to 66 and puts housing at 67', () => {
    expect(MIGRATIONS.slice(63, 66)).toEqual([null, null, null]);
    expect(MIGRATIONS.filter((m) => m === null)).toHaveLength(3);
    expect(MIGRATIONS[66]?.name).toBe('housingMigration');
  });

  it('a fresh database records every real version and nothing for the reserved ones', async () => {
    await runCore(nextGuild(), ({ sql, storage }) => {
      blank(sql);
      const runs: string[] = [];
      const l = lists(runs);
      applyMigrations(storage, sql, l.housingBranch);
      const versions = recorded(sql);
      expect(versions).toHaveLength(64);
      expect(versions.slice(-2)).toEqual([63, 67]);
      expect(runs).toEqual(['houses']);
      applyMigrations(storage, sql, l.housingBranch);
      expect(runs).toEqual(['houses']);
      return Promise.resolve();
    });
  });

  it('production gets housing first: the valley migrations still run, once, when they merge later', async () => {
    await runCore(nextGuild(), ({ sql, storage }) => {
      blank(sql);
      const runs: string[] = [];
      const l = lists(runs);
      // Production today: recorded up to 63.
      applyMigrations(storage, sql, l.valleyBranch.slice(0, BEFORE));
      expect(Math.max(...recorded(sql))).toBe(63);
      applyMigrations(storage, sql, l.housingBranch);
      expect(runs).toEqual(['houses']);
      expect(recorded(sql)).not.toContain(64);
      // Later: the merged list (valley in place of the gaps).
      applyMigrations(storage, sql, l.merged);
      expect(runs).toEqual(['houses', 'visitor', 'school', 'trials']);
      expect(recorded(sql)).toEqual(range(67));
      expect(tables(sql)).toEqual(['houses', 'school', 'trials', 'visitor']);
      // And never again.
      applyMigrations(storage, sql, l.merged);
      expect(runs).toHaveLength(4);
      return Promise.resolve();
    });
  });

  it('staging, which has the valley 64 to 66 recorded, gets housing: only 67 runs', async () => {
    await runCore(nextGuild(), ({ sql, storage }) => {
      blank(sql);
      const runs: string[] = [];
      const l = lists(runs);
      applyMigrations(storage, sql, l.valleyBranch);
      expect(runs).toEqual(['visitor', 'school', 'trials']);
      applyMigrations(storage, sql, l.housingBranch);
      expect(runs).toEqual(['visitor', 'school', 'trials', 'houses']);
      // Staging switches branches and the merge arrives: nothing runs twice.
      applyMigrations(storage, sql, l.valleyBranch);
      applyMigrations(storage, sql, l.merged);
      expect(runs).toHaveLength(4);
      expect(recorded(sql)).toEqual(range(67));
      return Promise.resolve();
    });
  });

  it('the valley merges first: production runs 64 to 66, then the merged list adds housing', async () => {
    await runCore(nextGuild(), ({ sql, storage }) => {
      blank(sql);
      const runs: string[] = [];
      const l = lists(runs);
      applyMigrations(storage, sql, l.valleyBranch.slice(0, BEFORE));
      applyMigrations(storage, sql, l.valleyBranch);
      expect(runs).toEqual(['visitor', 'school', 'trials']);
      applyMigrations(storage, sql, l.merged);
      expect(runs).toEqual(['visitor', 'school', 'trials', 'houses']);
      expect(recorded(sql)).toEqual(range(67));
      return Promise.resolve();
    });
  });

  it('a failing migration records nothing and runs again at the next start', async () => {
    await runCore(nextGuild(), ({ sql, storage }) => {
      blank(sql);
      let attempts = 0;
      const list: Migration[] = [
        noop,
        () => {
          attempts += 1;
          throw new Error('boom');
        },
      ];
      expect(() => {
        applyMigrations(storage, sql, list);
      }).toThrow('boom');
      expect(recorded(sql)).toEqual([1]);
      expect(() => {
        applyMigrations(storage, sql, list);
      }).toThrow('boom');
      expect(attempts).toBe(2);
      return Promise.resolve();
    });
  });
});
