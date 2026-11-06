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
import { describeReads, expectReadsUnder, expectWritesUnder, type ReadReport } from './read-meter';
import {
  BUILD,
  GUILD_ID,
  HISTORY_DAYS,
  TODAY,
  callAs,
  boardSwap,
  fakeLounge,
  inGuild,
  loungeTick,
  seedHistory,
  seedAnvils,
  seedSeats,
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

/**
 * The valley's lazy pass (phase 5 step 1, `valley-settle.ts`): what `/api/state` reads and writes with `VALLEY_SYSTEMS` on, for a
 * player with 30 creatures (the seeded guild's size; the plan's example is about 15). A pass reads the player row and the creatures
 * with their valley rows, and writes each creature's carry and the player row; the rows written have their own allowance (plan risk
 * 2). Every number is next to its measure; the budgets are about 1.5x.
 */
const VALLEY_BUDGET = {
  // The whole request, `/api/state` with 30 creatures (657 reads without the valley). First look: the player row and a row per creature.
  open: { reads: 1000, writes: 125 }, // measured 665 reads, 81 written
  // A day away: settles every creature (the XP through the level rules), pays the allowance, clears rows of creatures that left.
  arrival: { reads: 1250, writes: 95 }, // measured 828 reads, 63 written
  // Ten minutes into the visit: a pass writes each creature's carry and the player row.
  visit: { reads: 1100, writes: 50 }, // measured 723 reads, 31 written
  // A look within a minute of the last pass answers from what is stored and writes nothing.
  quick: { reads: 1050, writes: 5 }, // measured 692 reads, 1 written (the meter's own flush is not counted)
  // The pass before an intent (a dismiss of a card that is not there), with the request's own reads.
  intent: { reads: 860, writes: 85 }, // measured 572 reads, 56 written
} as const;

describe('read budget with the valley on', () => {
  const measured: Record<string, ReadReport> = {};

  it('measures the first look, an arrival, a look mid-visit, a repeat within a minute and an intent', async () => {
    await inGuild(
      async (env) => {
        const { metered, clock } = env;
        const world = await seedWorld(env, { valleySystems: true });
        const { core, secrets } = world;
        // Sessions idle out when the clock jumps by hours: the player signs in again at each step.
        const relog = async (): Promise<void> => {
          secrets.set(
            userId(1),
            await core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' }),
          );
        };
        const state = (): Promise<unknown> => callAs(core, secrets, 1, '/api/state');
        // Warm: today's one-off work (the week's rows, the draws) is not the valley's.
        clock.t += 6 * MINUTE;
        await callAs(core, secrets, 1, '/api/me');
        // The same state read by an object with the flag off, to tell what the pass adds.
        measured['baseline'] = (
          await metered.measure(() =>
            callAs(env.mk(BUILD, { combatV2: true }), secrets, 1, '/api/state'),
          )
        ).reads;
        measured['open'] = (await metered.measure(state)).reads;
        // A day away: an arrival settles 30 creatures and brings the allowance home.
        clock.t += 24 * 60 * MINUTE;
        await relog();
        measured['arrival'] = (await metered.measure(state)).reads;
        // Ten minutes on, the same visit: a pass that writes the carries.
        clock.t += 10 * MINUTE;
        measured['visit'] = (await metered.measure(state)).reads;
        // A repeat within the minute answers from what is stored.
        clock.t += 10_000;
        measured['quick'] = (await metered.measure(state)).reads;
        // The pass before an intent (the request's own work is a dismiss of a card that is not there).
        clock.t += 5 * MINUTE;
        await relog();
        measured['intent'] = (
          await metered.measure(() =>
            callAs(core, secrets, 1, '/api/away/dismiss', { method: 'POST', body: { until: 1 } }),
          )
        ).reads;
      },
      { fresh: true },
    );
  }, 60_000);

  it.each(Object.keys(VALLEY_BUDGET) as (keyof typeof VALLEY_BUDGET)[])(
    'the valley pass: %s reads and writes few rows',
    (name) => {
      const reads = measured[name];
      if (reads === undefined) throw new Error('the measuring test did not run');
      expectReadsUnder(`valley ${name}`, reads, VALLEY_BUDGET[name].reads);
      expectWritesUnder(`valley ${name}`, reads, VALLEY_BUDGET[name].writes);
    },
  );
});

/**
 * The valley's scouts (phase 5 step 2): what the same `/api/state` pass reads and writes with scout seats posted, for the seeded
 * player's 30 creatures: two seats (the Signpost at its first level) and six (its fifth). Each seat adds its row, the posted creature's
 * mastery, the kit row, the finds' draws, and on an arrival the store coming home (parts, gear, pages and a newcomer or a card at the
 * gate). The finds are live draws, so the numbers below are the largest of a few runs; the budgets are about 1.5x.
 */
const SCOUT_BUDGET = {
  // A day away with the seeded player's 30 creatures: 828 reads and 63 written without seats (`VALLEY_BUDGET.arrival`).
  arrival2: { reads: 1400, writes: 130 }, // measured 883-918 reads, 78-84 written (the draws differ run to run)
  // Ten minutes on, the same visit (778 reads, 31 written without seats here).
  visit2: { reads: 1200, writes: 55 }, // measured 774-778 reads, 33 written
  arrival6: { reads: 1600, writes: 210 }, // measured 944-1048 reads, 106-140 written (a store coming home: parts, gear, a newcomer or a card)
  visit6: { reads: 1300, writes: 100 }, // measured 806-838 reads, 63 written
} as const;

describe('read budget with scouts posted', () => {
  const measured: Record<string, ReadReport> = {};

  it('measures an arrival and a look mid-visit with two seats and with six', async () => {
    await inGuild(
      async (env) => {
        const { metered, clock } = env;
        const world = await seedWorld(env, { valleySystems: true });
        const { core, secrets } = world;
        const relog = async (): Promise<void> => {
          secrets.set(
            userId(1),
            await core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' }),
          );
        };
        const state = (): Promise<unknown> => callAs(core, secrets, 1, '/api/state');
        const mine = world.creatures[userId(1)] ?? [];
        clock.t += 6 * MINUTE;
        await callAs(core, secrets, 1, '/api/me');
        await state();
        seedSeats(metered.sql, userId(1), mine, 2);
        clock.t += 24 * 60 * MINUTE;
        await relog();
        measured['arrival2'] = (await metered.measure(state)).reads;
        clock.t += 10 * MINUTE;
        measured['visit2'] = (await metered.measure(state)).reads;
        // Four more seats: the Signpost at its fifth level.
        metered.sql.exec('DELETE FROM valley_seats WHERE user_id = ?', userId(1));
        seedSeats(metered.sql, userId(1), mine, 6);
        clock.t += 24 * 60 * MINUTE;
        await relog();
        measured['arrival6'] = (await metered.measure(state)).reads;
        clock.t += 10 * MINUTE;
        measured['visit6'] = (await metered.measure(state)).reads;
      },
      { fresh: true },
    );
  }, 60_000);

  it.each(Object.keys(SCOUT_BUDGET) as (keyof typeof SCOUT_BUDGET)[])(
    'the scouts pass: %s reads and writes few rows',
    (name) => {
      const reads = measured[name];
      if (reads === undefined) throw new Error('the measuring test did not run');
      expectReadsUnder(`scouts ${name}`, reads, SCOUT_BUDGET[name].reads);
      expectWritesUnder(`scouts ${name}`, reads, SCOUT_BUDGET[name].writes);
    },
  );
});

/**
 * The valley's Forge (phase 5 step 3): what the same `/api/state` pass reads and writes with anvils posted, for the seeded player's 30
 * creatures: two anvils (the Forge at its first level), each with a queue of two orders, two pieces on the floor, a stocked shelf and a
 * kit; and the same with two scouts posted as well. An anvil adds its row, its orders, the shelf (the parts and the Essence balance),
 * the blueprint marks, the weak slots of the team (one read of what is worn) and, on an arrival, the floors coming home (each piece
 * rolled, inserted into the bag, its floor row deleted). The rarity draws are live, so the numbers below are the largest of a few runs;
 * the budgets are about 1.5x.
 */
const FORGE_BUDGET = {
  // A day away: 828 reads and 63 written without anvils (`VALLEY_BUDGET.arrival`).
  arrival2: { reads: 1400, writes: 165 }, // measured 939 reads, 110 written (the floors' four pieces come home: each rolled, inserted, its row deleted)
  // Ten minutes on, the same visit.
  visit2: { reads: 1200, writes: 60 }, // measured 783 reads, 40 written
  // Two anvils and two scouts together.
  arrival2s2: { reads: 1500, writes: 175 }, // measured 978 reads, 116 written
  visit2s2: { reads: 1300, writes: 95 }, // measured 850 reads, 61 written
} as const;

describe('read budget with anvils posted', () => {
  const measured: Record<string, ReadReport> = {};

  it('measures an arrival and a look mid-visit with two anvils, and with two anvils and two scouts', async () => {
    await inGuild(
      async (env) => {
        const { metered, clock } = env;
        const world = await seedWorld(env, { valleySystems: true });
        const { core, secrets } = world;
        const relog = async (): Promise<void> => {
          secrets.set(
            userId(1),
            await core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' }),
          );
        };
        const state = (): Promise<unknown> => callAs(core, secrets, 1, '/api/state');
        const mine = world.creatures[userId(1)] ?? [];
        clock.t += 6 * MINUTE;
        await callAs(core, secrets, 1, '/api/me');
        await state();
        seedAnvils(metered.sql, userId(1), mine, 2);
        clock.t += 24 * 60 * MINUTE;
        await relog();
        measured['arrival2'] = (await metered.measure(state)).reads;
        clock.t += 10 * MINUTE;
        measured['visit2'] = (await metered.measure(state)).reads;
        // Two scouts as well (the anvils' smiths are the last creatures, the scouts the first).
        seedSeats(metered.sql, userId(1), mine, 2);
        metered.sql.exec(
          'UPDATE valley_seats SET floor_count = 2 WHERE user_id = ? AND place = ?',
          userId(1),
          'forge',
        );
        clock.t += 24 * 60 * MINUTE;
        await relog();
        measured['arrival2s2'] = (await metered.measure(state)).reads;
        clock.t += 10 * MINUTE;
        measured['visit2s2'] = (await metered.measure(state)).reads;
      },
      { fresh: true },
    );
  }, 60_000);

  it.each(Object.keys(FORGE_BUDGET) as (keyof typeof FORGE_BUDGET)[])(
    'the forge pass: %s reads and writes few rows',
    (name) => {
      const reads = measured[name];
      if (reads === undefined) throw new Error('the measuring test did not run');
      expectReadsUnder(`forge ${name}`, reads, FORGE_BUDGET[name].reads);
      expectWritesUnder(`forge ${name}`, reads, FORGE_BUDGET[name].writes);
    },
  );
});

/**
 * The welcome-back Gazette (phase 5 step 4): what an arrival that writes a paper reads and writes with two scouts posted (the paper's
 * one row is read when the state is built and written once at the arrival), a look with the paper unread (one more row to compose it),
 * a second arrival that joins the unread paper, closing it (one row written, no pass) and taking a way deeper (a settle, the seat's
 * pack home, the paper's decision cleared). The finds are live draws, so the numbers are the largest of a few runs; the budgets are about 1.5x.
 */
const GAZETTE_BUDGET = {
  // A day away with two seats: the arrival writes the paper (`SCOUT_BUDGET.arrival2` is the same arrival, which now includes it).
  arrival: { reads: 1400, writes: 130 }, // measured 903 reads, 88 written
  // Ten minutes on with the paper unread: the state carries it.
  look: { reads: 1200, writes: 55 }, // measured 793 reads, 33 written
  // A second arrival while the first paper is unread: the two are joined into one.
  joined: { reads: 1400, writes: 130 }, // measured 923 reads, 97 written
  // Closing the paper: one row of its own read and written, and no pass (the other rows are the session's).
  close: { reads: 35, writes: 4 }, // measured 23 reads, 2 written
  // Taking the way deeper: a settle, the seat's pack home and the decision cleared.
  deep: { reads: 950, writes: 12 }, // measured 624 reads, 6 written
} as const;

describe('read budget with the Gazette', () => {
  const measured: Record<string, ReadReport> = {};

  it('measures an arrival that writes a paper, a look with it unread, a joined arrival, a close and a way deeper', async () => {
    await inGuild(
      async (env) => {
        const { metered, clock } = env;
        const world = await seedWorld(env, { valleySystems: true });
        const { core, secrets } = world;
        const relog = async (): Promise<void> => {
          secrets.set(
            userId(1),
            await core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' }),
          );
        };
        const state = (): Promise<unknown> => callAs(core, secrets, 1, '/api/state');
        const mine = world.creatures[userId(1)] ?? [];
        clock.t += 6 * MINUTE;
        await callAs(core, secrets, 1, '/api/me');
        await state();
        seedSeats(metered.sql, userId(1), mine, 2);
        clock.t += 24 * 60 * MINUTE;
        await relog();
        measured['arrival'] = (await metered.measure(state)).reads;
        clock.t += 10 * MINUTE;
        measured['look'] = (await metered.measure(state)).reads;
        // Another day away with the paper still unread: the new one joins it.
        clock.t += 24 * 60 * MINUTE;
        await relog();
        measured['joined'] = (await metered.measure(state)).reads;
        const row = metered.sql
          .exec<{ paper_id: string }>(
            'SELECT paper_id FROM valley_gazette WHERE user_id = ?',
            userId(1),
          )
          .one();
        // The paper offers the first seat's scout a way deeper (as an arrival's draw would have written it).
        const seat = metered.sql
          .exec<{ seat_id: string; creature_id: string; destination_id: string }>(
            'SELECT seat_id, creature_id, destination_id FROM valley_seats WHERE user_id = ? AND position = 1',
            userId(1),
          )
          .one();
        metered.sql.exec(
          'UPDATE valley_gazette SET decision = ? WHERE user_id = ?',
          JSON.stringify({
            kind: 'push-on',
            seatId: seat.seat_id,
            creatureId: seat.creature_id,
            destination: seat.destination_id,
          }),
          userId(1),
        );
        measured['deep'] = (
          await metered.measure(() =>
            callAs(core, secrets, 1, '/api/valley/deep', {
              method: 'POST',
              body: { seatId: seat.seat_id, deep: true },
            }),
          )
        ).reads;
        measured['close'] = (
          await metered.measure(() =>
            callAs(core, secrets, 1, '/api/valley/gazette/close', {
              method: 'POST',
              body: { paperId: row.paper_id },
            }),
          )
        ).reads;
      },
      { fresh: true },
    );
  }, 60_000);

  it.each(Object.keys(GAZETTE_BUDGET) as (keyof typeof GAZETTE_BUDGET)[])(
    'the Gazette: %s reads and writes few rows',
    (name) => {
      const reads = measured[name];
      if (reads === undefined) throw new Error('the measuring test did not run');
      expectReadsUnder(`gazette ${name}`, reads, GAZETTE_BUDGET[name].reads);
      expectWritesUnder(`gazette ${name}`, reads, GAZETTE_BUDGET[name].writes);
    },
  );
});
