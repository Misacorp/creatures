// The query plan audit: every distinct SQL statement the hot paths run in the seeded month-old guild is
// planned with `EXPLAIN QUERY PLAN`, and a plan that scans a whole table that grows with play fails. The read
// budget (`read-budget.test.ts`) only sees a scan once the table is long and only on the statements it
// measures; this sees the shape of every statement the paths run, the moment it is written (decisions.md,
// 2026-10-26). A failure names the statement, its plan and where in `src/` it ran.
//
// What it records: an object start of a build that already started, alarm ticks of a lounge with company
// (the object evicted before each), an alarm with no lounge, a login, the main GETs (`/api/me`, `/api/state`,
// `/api/room`, `/api/games`, `/api/raid`, `/api/dungeon/today`, `/api/notifications`, `/api/weather`,
// `/api/gear`), a raid placement with a board listener, and the lounge payment the ticks make. Statements are
// compared by their text with whitespace collapsed; the bindings of the first execution are used for the plan.
//
// What to do when it fails (testing.md, "Database reads"): fix the statement (an index in a new migration, or
// a query that uses one). Only a table that is small by design may be scanned (`SMALL_BY_DESIGN`), and only
// with a reason; a single statement that must scan is accepted in `ACCEPTED`, with a reason and the day it
// stops mattering. A statement that does not scan a table or only scans a small one needs nothing.
import { describe, expect, it } from 'vitest';
import { MINUTE } from './raid-helpers';
import {
  BUILD,
  GUILD_ID,
  boardSwap,
  callAs,
  fakeLounge,
  inGuild,
  loungeTick,
  seedWorld,
  startLounge,
  userId,
} from './read-world';

/**
 * Tables that stay small however long the game runs, so scanning one is fine: one row per guild, per
 * player, or per day / week of the current retention window, or a handful of rows kept by the cleanup. A
 * table that grows with play (analytics, ledger, creatures, history of any kind) never belongs here.
 */
const SMALL_BY_DESIGN: Record<string, string> = {
  sessions:
    'a session is dropped after an hour idle, and every login prunes (`SESSION_IDLE_MS`): the logins of one hour',
  players: 'one row per player of the server (5 to 15 active, a few dozen ever)',
  dm_prefs: 'one row per player who set a DM preference',
  games_medals: 'one row per player who won a Games medal',
  raid_readiness:
    'one row per party of the current week; other weeks are deleted when a band is stored',
  schema_version: 'one row per migration (about 50), read by the start',
  guild_meta: 'one row per guild',
  maintenance: 'one row: the day the daily cleanup last finished',
  startup_passes: 'one row per deployed build of the recent past',
  lounge_message: 'one row: the lounge message of the guild',
  lounge_instances: 'the Activity instances open right now (a few)',
  lounge_company: 'one row per player who lounges with company (players, at most a few dozen)',
};

/**
 * Statements accepted although they scan a growing table, each with the reason. Match is a substring of the
 * normalised statement text. Keep this list short: it is a debt list (an entry says "fix me", not "fine").
 */
const ACCEPTED: { sql: string; reason: string }[] = [];

interface Recorded {
  sql: string;
  bindings: unknown[];
  site: string;
}

const normalise = (query: string): string => query.replace(/\s+/g, ' ').trim();

const NO_SITE = '(no src frame)';

/** The first `src/` frames of the stack at the moment a statement ran: where in the Worker it came from. */
function callSite(): string {
  const frames = (new Error().stack ?? '')
    .split('\n')
    .filter(
      (line) =>
        line.includes('/apps/worker/src/') &&
        !line.includes('/src/read-meter.ts') &&
        !line.includes('node_modules'),
    )
    .map((line) => line.replace(/^.*\/apps\/worker\/src\//, 'src/').replace(/\)$/, ''));
  return frames.slice(0, 3).join(' <- ') || NO_SITE;
}

/** `SCAN x`, `SEARCH x` ...: the step's table (or alias) and whether it reads every row of it. */
function scannedTable(detail: string): string | null {
  const m = /^SCAN (?:TABLE )?(\S+)(?: AS (\S+))?(.*)$/.exec(detail);
  if (m === null) return null;
  // `SCAN t USING INDEX i` and `USING COVERING INDEX` walk an index in order (the read budget watches the
  // rows); `SCAN t` alone is a full scan of the table.
  if (/ USING /.test(m[3] ?? '')) return null;
  return m[2] ?? m[1] ?? null;
}

/** The table behind an alias in the statement (`FROM players p`), or the name itself. */
function resolveTable(sql: string, name: string): string {
  const re = /\b(?:FROM|JOIN)\s+"?(\w+)"?(?:\s+AS)?\s+"?(\w+)"?/gi;
  for (const m of sql.matchAll(re)) if (m[2] === name && m[1] !== undefined) return m[1];
  return name;
}

describe('query plan audit', () => {
  it('plans every statement of the hot paths without a whole-table scan of a table that grows', async () => {
    let recording = false;
    const seen = new Map<string, Recorded>();
    const found: string[] = [];
    let planned = 0;

    await inGuild(
      async (env) => {
        const { metered, clock, mk } = env;
        const world = await seedWorld(env);
        const lounge = fakeLounge();
        recording = true;

        // An object start after the first one of this build.
        mk(BUILD).migrate();
        // A login, as the Activity does when it opens.
        await world.core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' });
        clock.t += 6 * MINUTE;
        const paths = [
          '/api/me',
          '/api/state',
          '/api/room',
          '/api/games',
          '/api/raid',
          '/api/dungeon/today',
          '/api/notifications',
          '/api/weather',
          '/api/gear',
        ];
        // Twice: the first call of a day pays one-off work, the second is the usual one.
        for (let round = 0; round < 2; round++)
          for (const path of paths) await callAs(world.core, world.secrets, 1, path);
        // An alarm with no lounge, then a lounge with company: ticks that pay, each on a fresh object.
        clock.t += MINUTE;
        await world.core.alarm();
        await startLounge(env, lounge);
        for (let i = 0; i < 4; i++) await loungeTick(env, lounge);
        // A raid placement while a teammate has the board open.
        await boardSwap(env, world);
        recording = false;

        const tables = new Set(
          metered.sql
            .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
            .toArray()
            .map((r) => r.name),
        );
        for (const { sql, bindings, site } of seen.values()) {
          if (!/^(SELECT|WITH|UPDATE|DELETE|INSERT)\b/i.test(sql)) continue;
          let plan: { detail: string }[];
          try {
            plan = metered.sql
              .exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, ...(bindings as []))
              .toArray();
          } catch (err) {
            // A statement that cannot be planned here (its table is gone, a temp table) is a test gap.
            found.push(`could not plan: ${sql}\n  ${String(err)}\n  at ${site}`);
            continue;
          }
          planned++;
          for (const step of plan) {
            const name = scannedTable(step.detail);
            if (name === null) continue;
            const table = resolveTable(sql, name);
            // A CTE, a subquery or a constant row is not a table.
            if (!tables.has(table)) continue;
            if (SMALL_BY_DESIGN[table] !== undefined) continue;
            if (ACCEPTED.some((a) => sql.includes(a.sql))) continue;
            found.push(
              `${step.detail}\n  statement: ${sql}\n  plan: ${plan.map((p) => p.detail).join(' | ')}\n  at ${site}`,
            );
          }
        }
      },
      {
        onExec: (query, bindings) => {
          if (!recording) return;
          const sql = normalise(query);
          if (seen.has(sql)) return;
          const site = callSite();
          // A statement the test itself runs (a lookup for its setup) is not the Worker's.
          if (site !== NO_SITE) seen.set(sql, { sql, bindings: [...bindings], site });
        },
      },
    );

    // The paths are not empty: a refactor that stops running them would make this test pass for nothing.
    expect(seen.size, 'statements recorded').toBeGreaterThan(100);
    expect(planned, 'statements planned').toBeGreaterThan(100);
    expect(
      found,
      `${String(found.length)} whole-table scan(s) of a table that grows with play. Add an index (a new migration) or change the query; allowlist only with a reason (testing.md, "Database reads"):\n${found.join('\n\n')}`,
    ).toEqual([]);
  }, 60_000);

  it('sees a full scan, an indexed search and an aliased scan in this SQLite (the detector works)', async () => {
    await inGuild(({ metered }) => {
      const plan = (query: string): string[] =>
        metered.sql
          .exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${query}`)
          .toArray()
          .map((r) => r.detail);
      metered.sql.exec('CREATE TABLE audit_probe (a INTEGER, b INTEGER)');
      const scans = (query: string): (string | null)[] =>
        plan(query).map((d) => {
          const name = scannedTable(d);
          return name === null ? null : resolveTable(query, name);
        });
      expect(scans('SELECT * FROM audit_probe WHERE a = 1')).toEqual(['audit_probe']);
      expect(scans('SELECT * FROM audit_probe p WHERE p.a = 1')).toEqual(['audit_probe']);
      metered.sql.exec('CREATE INDEX audit_probe_a ON audit_probe(a)');
      expect(scans('SELECT * FROM audit_probe WHERE a = 1')).toEqual([null]);
      // An index walked in order or covering is not a full-table scan to this audit (the read budget counts the rows).
      expect(scans('SELECT a FROM audit_probe')).toEqual([null]);
      return Promise.resolve();
    });
  });
});
