import { describe, expect, it } from 'vitest';
import { hasOpenEntries, lastAwardedDay, lastShownDay, unawardedDays } from '../src/games-store';
import { runCore } from './helpers';
import { nextGuild } from './raid-helpers';

/** A show day row: locked (or not) and awarded (or not). */
function day(sql: SqlStorage, d: string, locked: boolean, awarded = false): void {
  sql.exec(
    `INSERT INTO games_days (day, lineup_json, created_at, locked_at, show_at, ends_at, awarded_at)
     VALUES (?, '[]', 1, ?, ?, ?, ?)`,
    d,
    locked ? 2 : null,
    locked ? 3 : null,
    locked ? 4 : null,
    awarded ? 5 : null,
  );
}

function enter(sql: SqlStorage, d: string, creatureId: string): void {
  sql.exec(
    `INSERT INTO games_entries (day, user_id, event_id, slot, creature_id, entered_at)
     VALUES (?, ?, 'melon-run', 0, ?, 1)`,
    d,
    `8${creatureId.padStart(17, '1')}`,
    creatureId,
  );
}

/** The query plan, flattened to its text. */
function plan(sql: SqlStorage, query: string, ...args: unknown[]): string {
  return sql
    .exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${query}`, ...(args as []))
    .toArray()
    .map((r) => r.detail)
    .join(' | ');
}

describe('Valley Games day lookups', () => {
  it('see open entries past a locked day, and none when every day with entries is locked', async () => {
    await runCore(nextGuild(), ({ sql }) => {
      expect(hasOpenEntries(sql, '2027-01-10')).toBe(false);
      day(sql, '2027-01-10', true);
      enter(sql, '2027-01-10', 'a');
      enter(sql, '2027-01-10', 'b');
      // Today is locked: its entries are not open.
      expect(hasOpenEntries(sql, '2027-01-10')).toBe(false);
      // An entry for a day with no row yet is open, like one for a day not locked yet.
      enter(sql, '2027-01-12', 'c');
      expect(hasOpenEntries(sql, '2027-01-10')).toBe(true);
      day(sql, '2027-01-12', false);
      expect(hasOpenEntries(sql, '2027-01-10')).toBe(true);
      // An older day never counts.
      expect(hasOpenEntries(sql, '2027-01-13')).toBe(false);
    });
  });

  it('read the day rows through their indexes', async () => {
    await runCore(nextGuild(), ({ sql }) => {
      day(sql, '2027-01-10', true, true);
      day(sql, '2027-01-11', true);
      expect(unawardedDays(sql).map((d) => d.day)).toEqual(['2027-01-11']);
      expect(lastShownDay(sql, 10)?.day).toBe('2027-01-11');
      expect(lastAwardedDay(sql)?.day).toBe('2027-01-10');
      expect(
        plan(
          sql,
          'SELECT * FROM games_days WHERE locked_at IS NOT NULL AND awarded_at IS NULL ORDER BY ends_at, day',
        ),
      ).toContain('games_days_unawarded');
      expect(
        plan(
          sql,
          'SELECT * FROM games_days WHERE locked_at IS NOT NULL AND show_at <= ? ORDER BY show_at DESC, day DESC LIMIT 1',
          10,
        ),
      ).toContain('games_days_shown');
      expect(
        plan(
          sql,
          'SELECT * FROM games_days WHERE awarded_at IS NOT NULL ORDER BY awarded_at DESC, day DESC LIMIT 1',
        ),
      ).toContain('games_days_awarded');
    });
  });
});
