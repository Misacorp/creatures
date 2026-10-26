// The read budget: how many Durable Object rows the hot paths read in a guild a month old. Cloudflare's free
// tier allows 5,000,000 rows read a day and a whole-table scan on a path that runs on every request, every
// alarm or every object start used it up twice (decisions.md, 2026-10-25). The budgets below are about 1.5x
// what each path read when they were set (the measured value is next to each); a failure lists the top
// statements by rows read. Raise a budget only with a reason in the PR. See testing.md, "Database reads".
// The seeded guild is `read-world.ts`; `query-plan-audit.test.ts` checks how the statements are planned and
// `read-day.test.ts` adds them up over a day.
import { describe, expect, it } from 'vitest';
import { ReadMeter, readSourceOfPath } from '../src/read-meter';
import { addDays, gameDay } from '../src/time';
import { USER_ID, runCore } from './helpers';
import { captureConsole } from './kit';
import { HELSINKI, MINUTE, nextGuild, rows, seedPlayer } from './raid-helpers';
import { describeReads, expectReadsUnder, type ReadReport } from './read-meter';
import {
  BUILD,
  HISTORY_DAYS,
  TODAY,
  callAs,
  boardSwap,
  fakeLounge,
  inGuild,
  loungeTick,
  seedHistory,
  seedWorld,
  startLounge,
  type FakeLounge,
  userId,
  type GuildEnv,
  type World,
} from './read-world';

const PATHS = [
  '/api/me',
  '/api/state',
  '/api/room',
  '/api/games',
  '/api/raid',
  '/api/dungeon/today',
];

/** Budgets: about 1.5x the rows read when they were set, rounded up (the measured value is in the comment). */
const BUDGET = {
  start: 70, // measured 45 (43 of them: `MAX(version)` reads every row of schema_version, one per migration)
  alarm: 30, // measured 19
  '/api/me': 40, // measured 25
  '/api/state': 700, // measured 465 (610 before migration 44's trip indexes)
  '/api/room': 50, // measured 33
  '/api/games': 350, // measured 222
  '/api/raid': 950, // measured 633, 15 players joined with three placed creatures each (was 2,773, then 780; a player is loaded by id from the placements, no collection is read)
  '/api/dungeon/today': 120, // measured 78
  lounge: 180, // an alarm tick with 5 players lounging together (the object woke up for it; its start is `start`): measured 120 (98 statements: each lounger's payment, about 20 rows)
  board: 235, // one raid placement (a swap of two creatures, without the view the route returns) with a teammate's board socket open: measured 155 (the push is about 10 of them, the rest is the placement's own checks)
} as const;

/** What another month of history may add to a path: a new whole-table scan adds hundreds. */
const GROWTH_ROWS = 6;

interface Measured {
  start: ReadReport;
  alarm: ReadReport;
  paths: Record<string, ReadReport>;
  /** An alarm tick of a lounge with company; the object woke up for it (the start is `start`). */
  lounge: ReadReport;
  /** A swap of two of a player's creatures on the raid board while a teammate has the board open. */
  board: ReadReport;
}

describe('read budget', () => {
  let first: Measured | null = null;
  let second: Measured | null = null;

  /** Measures every hot path against a core that has been warm for a minute (`warm` runs before it). */
  async function measureAll(env: GuildEnv, world: World, lounge: FakeLounge): Promise<Measured> {
    const { metered, clock, mk } = env;
    const { core, secrets } = world;
    // An object start after the first one of this build: a new core, `migrate` with the same build.
    mk(BUILD).migrate();
    const start = (await metered.measure(() => mk(BUILD).migrate())).reads;
    // Warm: the first call of each path today pays one-off work (the allowance, the week's rows, the draws,
    // the raid's readiness band, which is recomputed every 5 minutes: the clock jumps past that first, so
    // the band is always fresh when the paths are measured).
    clock.t += 6 * MINUTE;
    for (const path of PATHS) await callAs(core, secrets, 1, path);
    clock.t += MINUTE;
    await core.alarm();
    clock.t += MINUTE;
    const alarm = (await metered.measure(() => core.alarm())).reads;
    const paths: Record<string, ReadReport> = {};
    for (const path of PATHS)
      paths[path] = (await metered.measure(() => callAs(core, secrets, 1, path))).reads;
    // The lounge: the object is evicted between ticks, so each tick is a new core. A few ticks first, so
    // the company has been counted and the payment path is the one measured.
    if (lounge.instances.size === 0) await startLounge(env, lounge);
    for (let i = 0; i < 3; i++) await loungeTick(env, lounge);
    const loungeReads = await loungeTick(env, lounge);
    await boardSwap(env, world);
    const board = await boardSwap(env, world);
    return { start, alarm, paths, lounge: loungeReads, board };
  }

  it('seeds a month-old guild and measures the hot paths', async () => {
    await inGuild(async (env) => {
      const { metered } = env;
      const world = await seedWorld(env);
      const lounge = fakeLounge();
      first = await measureAll(env, world, lounge);

      // Another month, older than the first: the tables are twice as long, the hot paths must not notice.
      seedHistory(
        metered.sql,
        metered.storage,
        addDays(TODAY, -HISTORY_DAYS),
        HISTORY_DAYS,
        world.creatures,
      );
      second = await measureAll(env, world, lounge);
    });
  }, 60_000);

  it.each(Object.keys(BUDGET) as (keyof typeof BUDGET)[])('%s reads few rows', (name) => {
    const reads =
      name === 'start'
        ? first?.start
        : name === 'alarm'
          ? first?.alarm
          : name === 'lounge'
            ? first?.lounge
            : name === 'board'
              ? first?.board
              : first?.paths[name];
    if (reads === undefined) throw new Error('the seeding test did not run');
    expectReadsUnder(name, reads, BUDGET[name]);
  });

  it('does not read more rows after another month of history', () => {
    if (first === null || second === null) throw new Error('the seeding test did not run');
    const grown = (label: string, before: ReadReport, after: ReadReport): void => {
      expect(
        after.total - before.total,
        `${label} read ${String(before.total)} rows in a month-old guild and ${String(after.total)} after another month: a whole-table scan?\n${describeReads(label, after)}`,
      ).toBeLessThanOrEqual(GROWTH_ROWS);
    };
    grown('alarm', first.alarm, second.alarm);
    grown('lounge tick', first.lounge, second.lounge);
    grown('board placement', first.board, second.board);
    for (const path of ['/api/me', '/api/state', '/api/raid'])
      grown(path, first.paths[path] as ReadReport, second.paths[path] as ReadReport);
  });
});

describe('rows read counter', () => {
  const counters = (ctx: { sql: SqlStorage }): Record<string, number> =>
    Object.fromEntries(
      rows<{ source: string; rows: number }>(ctx.sql, 'SELECT source, rows FROM db_reads').map(
        (r) => [r.source, r.rows],
      ),
    );

  it('names the source of a path by its area, with other for anything unknown', () => {
    expect(readSourceOfPath('/api/state')).toBe('request:state');
    expect(readSourceOfPath('/api/raid/live/action')).toBe('request:raid');
    expect(readSourceOfPath('/api/level-reset/dismiss')).toBe('request:level-reset');
    expect(readSourceOfPath('/api/away/dismiss')).toBe('request:away');
    expect(readSourceOfPath('/api/zzz')).toBe('request:other');
    expect(readSourceOfPath('/api/')).toBe('request:other');
    expect(readSourceOfPath('/elsewhere')).toBe('request:other');
    // An id or anything a player typed never becomes part of a source.
    expect(readSourceOfPath('/api/creatures/8000000000000000001/train')).toBe('request:creatures');
    expect(readSourceOfPath('/api/8000000000000000001')).toBe('request:other');
  });

  it('adds the rows its statements read, and not its own write, to the source and the day', async () => {
    await runCore(nextGuild(), (ctx) => {
      for (let n = 1; n <= 3; n++) seedPlayer(ctx, n, { creatures: 0 });
      const meter = new ReadMeter(ctx.sql);
      meter.sql.exec('SELECT * FROM players').toArray();
      meter.sql.exec('SELECT * FROM players WHERE user_id = ?', userId(1)).toArray();
      meter.flush('alarm', '2027-01-14');
      expect(counters(ctx)).toEqual({ alarm: 4 });
      // A second flush with nothing read in between adds nothing; the next day starts its own row.
      meter.flush('alarm', '2027-01-14');
      meter.sql.exec('SELECT * FROM players').toArray();
      meter.flush('alarm', '2027-01-15');
      expect(rows(ctx.sql, 'SELECT day, source, rows FROM db_reads ORDER BY day')).toEqual([
        { day: '2027-01-14', source: 'alarm', rows: 4 },
        { day: '2027-01-15', source: 'alarm', rows: 3 },
      ]);
    });
  });

  it('attributes the start, the login, each request area and the alarm', async () => {
    await runCore(nextGuild(), async (ctx) => {
      ctx.core.migrate();
      const secret = await ctx.core.createSession(ctx.guildId, {
        id: USER_ID,
        displayName: 'Player',
      });
      expect((await ctx.request(secret, '/api/me')).status).toBe(200);
      expect((await ctx.request(secret, '/api/state')).status).toBe(200);
      expect((await ctx.request(secret, '/api/zzz')).status).toBe(404);
      await ctx.core.alarm();
      const written = counters(ctx);
      expect(Object.keys(written).sort()).toEqual([
        'alarm',
        'request:me',
        'request:other',
        'request:session',
        'request:state',
        'start',
      ]);
      for (const n of Object.values(written)) expect(n).toBeGreaterThan(0);
      // The state is the heavy one; a 404 reads little. All of it is on the game day of the clock.
      expect(written['request:state']).toBeGreaterThan(written['request:other'] as number);
      const days = rows<{ day: string }>(ctx.sql, 'SELECT DISTINCT day FROM db_reads');
      expect(days).toEqual([{ day: gameDay(ctx.clock.t, HELSINKI, { hour: 13, minute: 37 }) }]);
      // The start is counted once: a second request adds no start rows.
      await ctx.request(secret, '/api/me');
      expect(counters(ctx)['start']).toBe(written['start']);
    });
  });

  it('never throws into the caller, even where the table is missing', async () => {
    const logged = captureConsole();
    await runCore(nextGuild(), async (ctx) => {
      const secret = await ctx.core.createSession(ctx.guildId, {
        id: USER_ID,
        displayName: 'Player',
      });
      ctx.sql.exec('DROP TABLE db_reads');
      expect((await ctx.request(secret, '/api/me')).status).toBe(200);
      await ctx.core.alarm();
    });
    expect(logged.text()).toContain('read meter failed');
  });

  it('drops the counters older than the analytics retention in the daily cleanup', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const today = gameDay(ctx.clock.t, HELSINKI, { hour: 13, minute: 37 });
      const put = (day: string) =>
        ctx.sql.exec("INSERT INTO db_reads (day, source, rows) VALUES (?, 'alarm', 1)", day);
      put(addDays(today, -91));
      put(addDays(today, -89));
      await ctx.core.alarm();
      const days = rows<{ day: string }>(ctx.sql, 'SELECT day FROM db_reads ORDER BY day').map(
        (r) => r.day,
      );
      expect(days).toContain(addDays(today, -89));
      expect(days).not.toContain(addDays(today, -91));
    });
  });
});
