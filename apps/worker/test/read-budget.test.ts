// The read budget: how many Durable Object rows the hot paths read in a guild a month old. Cloudflare's free
// tier allows 5,000,000 rows read a day and a whole-table scan on a path that runs on every request, every
// alarm or every object start used it up twice (decisions.md, 2026-10-25). The budgets below are about 1.5x
// what each path read when they were set (the measured value is next to each); a failure lists the top
// statements by rows read. Raise a budget only with a reason in the PR. See testing.md, "Database reads".
// The seeded guild is `read-world.ts`; `query-plan-audit.test.ts` checks how the statements are planned and
// `read-day.test.ts` adds them up over a day.
import { describe, expect, it } from 'vitest';
import { eventTimes, weekIdFor } from '../src/raid-schedule';
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
  PLAYERS,
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
  // Step 5: the seeded creatures are far below the player's 3rd best, so catch-up (x3 at most) makes each pass pay whole XP: 23 level/exp rows written more (the carries alone were enough before). Raised from 50.
  visit: { reads: 1100, writes: 80 }, // measured 723 reads, 54 written
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
  visit2: { reads: 1200, writes: 85 }, // measured 774-778 reads, 56 written (step 5: catch-up pays whole XP each pass, +23; was 33 and 55)
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
  visit2: { reads: 1200, writes: 90 }, // measured 783 reads, 63 written (step 5: catch-up pays whole XP each pass, +23; was 40 and 60)
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
  look: { reads: 1200, writes: 85 }, // measured 793 reads, 56 written (step 5: catch-up pays whole XP each pass, +23; was 33 and 55)
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

/**
 * The bonfire in full (phase 5 step 5, `valley-bonfire.ts`): the three things it adds to a request or to the daily job, each priced as
 * `docs/design/database-reads.md` asks. Measured in the seeded guild (15 players with 30 creatures each, one of them looking):
 * - the daily middle (`maintain`): one read of the players who visited in the last week and each one's creatures, one row written;
 * - who is online: the lounge's instance rows plus, for each of up to four players, their name and up to three creatures that are not posted;
 * - the raid pause: only inside a raid weekend's calendar span, the player's own placements, the week's row and the finale marker.
 * The last two are the extra rows of one `/api/state` look, over the same look without them.
 */
const BONFIRE_BUDGET = {
  // 15 players visited today, their 30 creatures each read through the `creatures_user` index; one row written.
  middle: { reads: 650, writes: 3 }, // measured 420 reads, 1 written
  // The lounge's instance rows, four names and up to three creatures each (index order, so no sort), a seat lookup per creature.
  online: { reads: 30, writes: 0 }, // measured 18
  // Inside a raid weekend's span: the player's placements (their own index), the week's row and the finale marker; outside it, none.
  raid: { reads: 10, writes: 0 }, // measured 5
} as const;

describe('read budget with the bonfire', () => {
  const measured: Record<string, number> = {};
  let middleWrites = 0;

  it('measures the daily middle, a look with company and a look in a raid weekend', async () => {
    await inGuild(
      async (env) => {
        const { metered, clock } = env;
        const world = await seedWorld(env, { valleySystems: true });
        const { core, secrets } = world;
        const state = (): Promise<unknown> => callAs(core, secrets, 1, '/api/state');
        const mine = world.creatures[userId(1)] ?? [];
        clock.t += 6 * MINUTE;
        await callAs(core, secrets, 1, '/api/me');
        await state();
        seedSeats(metered.sql, userId(1), mine, 2);
        for (let p = 1; p <= PLAYERS; p++) {
          metered.sql.exec(
            'INSERT OR IGNORE INTO valley_players (user_id, settled_at, last_visit_at, visit_started_at) VALUES (?, ?, ?, ?)',
            userId(p),
            clock.t,
            clock.t,
            clock.t,
          );
        }
        const bonfire = core.valleyBonfire;
        if (bonfire === null) throw new Error('the valley is off');
        const daily = (await metered.measure(() => bonfire.writeMiddle(clock.t))).reads;
        measured['middle'] = daily.total;
        middleWrites = daily.written;
        // Who is online: four other players in the Activity, measured as the pass asks for it.
        metered.sql.exec(
          'INSERT INTO lounge_instances (instance_id, user_ids, first_seen_at, checked_at) VALUES (?, ?, ?, ?)',
          'bonfire-test',
          JSON.stringify([2, 3, 4, 5, 1].map((p) => userId(p))),
          clock.t,
          clock.t,
        );
        const company = await metered.measure(() => bonfire.online(userId(1)));
        expect(company.result).toHaveLength(4);
        measured['online'] = company.reads.total;
        // A raid weekend: the player has posted creatures and three of them are placed, and a pass reads the windows.
        const week = weekIdFor(clock.t, HELSINKI);
        const times = eventTimes(week, HELSINKI, 2);
        metered.sql.exec(
          "INSERT OR IGNORE INTO raid_weeks (week_id, boss_id, status, created_at, rules_version) VALUES (?, 'boss', 'open', ?, 2)",
          week,
          clock.t,
        );
        metered.sql.exec('DELETE FROM raid_placements WHERE user_id = ?', userId(1));
        for (const [slot, id] of mine.slice(0, 3).entries()) {
          metered.sql.exec(
            'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, 99, ?, ?, ?)',
            week,
            slot,
            userId(1),
            id,
          );
        }
        const inside = await metered.measure(() =>
          bonfire.raidWindows(
            userId(1),
            times.phase1 - 60 * MINUTE,
            times.phase1 + 120 * MINUTE,
            true,
          ),
        );
        expect(inside.result).toHaveLength(3);
        measured['raid'] = inside.reads.total;
        // Outside any raid weekend's span (a week later by the calendar) nothing is read at all.
        const outside = await metered.measure(() =>
          bonfire.raidWindows(
            userId(1),
            times.finale + 60 * 60 * MINUTE,
            times.finale + 61 * 60 * MINUTE,
            true,
          ),
        );
        expect(outside.reads.total).toBe(0);
      },
      { fresh: true },
    );
  }, 60_000);

  it.each(Object.keys(BONFIRE_BUDGET) as (keyof typeof BONFIRE_BUDGET)[])(
    'the bonfire: %s reads few rows',
    (name) => {
      const rows = measured[name];
      if (rows === undefined) throw new Error('the measuring test did not run');
      expect(rows, `${name}: ${String(rows)} rows read`).toBeLessThanOrEqual(
        BONFIRE_BUDGET[name].reads,
      );
    },
  );

  it('the daily middle writes one row', () => {
    expect(middleWrites).toBeLessThanOrEqual(BONFIRE_BUDGET.middle.writes);
  });
});

/**
 * The commons (phase 5 step 6, `valley-commons.ts`, `valley-gifts.ts`): what a look, a gift and an arrival with a communal seat read and
 * write, for the seeded player's 30 creatures (each pass settles them all; the commons add a few rows on top, V-COM-8):
 * - a look mid-visit: the places (one row each), the fire's last row and its last five, the collections' set sockets, the keystone
 *   clocks, the player's own gift rows and the weight of the server;
 * - a gift: the pass before it, then the project's row, the gift row and the purse; a gift that finishes a level also reads the helpers'
 *   names for the plaque and writes the place's row and the fire's;
 * - an arrival with a communal seat: the seat row, then the credit into the project (the place row and the gift row).
 * The daily job that writes the weight reads no more than the middle's (`BONFIRE_BUDGET.middle`: the columns come from the same rows).
 */
const COMMONS_BUDGET = {
  // Ten minutes into the visit: a pass (723 reads and 54 written without the commons, `VALLEY_BUDGET.visit`), so the commons add about 45 reads.
  look: { reads: 1150, writes: 85 }, // measured 768 reads, 55 written
  // The pass before the gift (a settle), then the project's row, the gift row and the Acorns' purse.
  gift: { reads: 1150, writes: 110 }, // measured 758 reads, 71 written
  // A gift that finishes the level: the helpers' names for the plaque, the place's row and the fire's row.
  levelUp: { reads: 1200, writes: 110 }, // measured 782 reads, 73 written
  // A day away with a communal seat holding 20 hours: the seat's row and the credit into the project.
  arrivalCommunal: { reads: 1300, writes: 110 }, // measured 859 reads, 71 written
} as const;

describe('read budget with the commons', () => {
  const measured: Record<string, ReadReport> = {};

  it('measures a look, a gift, a gift that finishes a level and an arrival with a communal seat', async () => {
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
        core.credit({
          userId: userId(1),
          currency: 'bait',
          amount: 5000,
          source: 'test',
          idempotencyKey: 'commons-budget-funds',
        });
        clock.t += 10 * MINUTE;
        measured['look'] = (await metered.measure(state)).reads;
        clock.t += 10 * MINUTE;
        const gift = (amount: number, key: string): Promise<unknown> =>
          callAs(core, secrets, 1, '/api/valley/gift', {
            method: 'POST',
            body: { place: 'bonfire', currency: 'acorns', amount, idempotencyKey: key },
          });
        measured['gift'] = (await metered.measure(() => gift(5, 'commons-gift-1'))).reads;
        // The project is one gift from done: every part is full but the Acorns.
        const open = metered.sql
          .exec<{ size: number }>("SELECT size FROM valley_places WHERE place = 'bonfire'")
          .one();
        metered.sql.exec(
          "UPDATE valley_places SET have_scrap = 1e9, have_shards = 1e9, have_acorns = ? WHERE place = 'bonfire'",
          open.size * 0.4 - 0.5,
        );
        for (let p = 2; p <= 6; p++) {
          metered.sql.exec(
            'INSERT OR IGNORE INTO valley_gifts (user_id, place, project, given_milli, plaque) VALUES (?, ?, 1, 1000, 1)',
            userId(p),
            'bonfire',
          );
        }
        clock.t += 10 * MINUTE;
        measured['levelUp'] = (await metered.measure(() => gift(1, 'commons-gift-2'))).reads;
        // A communal seat holding a day of work, credited at the arrival after a day away.
        metered.sql.exec(
          `INSERT INTO valley_seats (seat_id, user_id, place, kind, position, destination_id, prev_destination_id, creature_id,
             communal, store_hours, passed_at) VALUES (?, ?, 'commons', 'communal', 0, 'forge', 'forge', ?, 1, 20, ?)`,
          crypto.randomUUID(),
          userId(1),
          mine[0] ?? null,
          clock.t,
        );
        clock.t += 24 * 60 * MINUTE;
        await relog();
        measured['arrivalCommunal'] = (await metered.measure(state)).reads;
      },
      { fresh: true },
    );
  }, 60_000);

  it.each(Object.keys(COMMONS_BUDGET) as (keyof typeof COMMONS_BUDGET)[])(
    'the commons: %s reads and writes few rows',
    (name) => {
      const reads = measured[name];
      if (reads === undefined) throw new Error('the measuring test did not run');
      expectReadsUnder(`commons ${name}`, reads, COMMONS_BUDGET[name].reads);
      expectWritesUnder(`commons ${name}`, reads, COMMONS_BUDGET[name].writes);
    },
  );
});

/**
 * The Market's broker (phase 5 step 7, `valley-settle.ts`, `valley-seats.ts`): what the same pass reads and writes when the Market is
 * built and a creature stands at the broker's seat while two anvils wait for tide shards the player has none of (so the broker trades
 * every pass). The broker adds its seat's row (already among the player's seats, one read through the `(user_id)` index), the market
 * place row (already among the places) and the trading hours' column (one more on each creature row); its trades are shard writes
 * through the parts, and the carry one seat row. The first look after the Market is built makes the seat (one insert). The crit draws
 * are live, so the numbers are the largest of a few runs; the budgets are about 1.5x.
 */
const MARKET_BUDGET = {
  // A day away with two anvils (`FORGE_BUDGET.arrival2`) and a broker that trades.
  arrival: { reads: 1450, writes: 180 }, // measured 971 reads, 118 written (the forge's arrival2 is 939 and 110: the broker adds the commons' and the seat's rows)
  // Ten minutes on, the same visit.
  visit: { reads: 1250, writes: 100 }, // measured 836 reads, 67 written
  // The first look after the Market is built: the seat is made.
  first: { reads: 1250, writes: 100 }, // measured 833 reads, 61 written (the seat's one insert is among them)
  // Setting what the broker trades toward: a settle on either side of one update.
  toward: { reads: 1500, writes: 100 }, // measured 1007 reads, 63 written
} as const;

describe('read budget with the broker', () => {
  const measured: Record<string, ReadReport> = {};

  it('measures the first look after the Market is built, an arrival and a visit with a broker that trades, and a setting', async () => {
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
        // No tide shards: the anvils' orders wait on them, and the broker pays the other piles.
        metered.sql.exec(
          "UPDATE parts SET amount = 0 WHERE user_id = ? AND kind = 'tide-shard'",
          userId(1),
        );
        metered.sql.exec("UPDATE valley_places SET level = 2 WHERE place = 'market'");
        clock.t += 10 * MINUTE;
        measured['first'] = (await metered.measure(state)).reads;
        const seat = metered.sql
          .exec<{ seat_id: string }>("SELECT seat_id FROM valley_seats WHERE place = 'market'")
          .one().seat_id;
        metered.sql.exec(
          'UPDATE valley_seats SET creature_id = ? WHERE seat_id = ?',
          mine[mine.length - 3] ?? null,
          seat,
        );
        clock.t += 24 * 60 * MINUTE;
        await relog();
        measured['arrival'] = (await metered.measure(state)).reads;
        clock.t += 10 * MINUTE;
        measured['visit'] = (await metered.measure(state)).reads;
        clock.t += 10 * MINUTE;
        measured['toward'] = (
          await metered.measure(() =>
            callAs(core, secrets, 1, '/api/valley/broker', {
              method: 'POST',
              body: { seatId: seat, toward: 'grove' },
            }),
          )
        ).reads;
      },
      { fresh: true },
    );
  }, 60_000);

  it.each(Object.keys(MARKET_BUDGET) as (keyof typeof MARKET_BUDGET)[])(
    'the broker: %s reads and writes few rows',
    (name) => {
      const reads = measured[name];
      if (reads === undefined) throw new Error('the measuring test did not run');
      expectReadsUnder(`market ${name}`, reads, MARKET_BUDGET[name].reads);
      expectWritesUnder(`market ${name}`, reads, MARKET_BUDGET[name].writes);
    },
  );
});

/**
 * The weekly visitor (phase 5 step 8, `valley-visitor.ts`): what a look at him, a reroll, a blueprint, the alarm during his days and the
 * paper's mention of him read and write. A look reads the week's row (`visitor_weeks` by its key) and the player's (`visitor_rerolls` by
 * its key), and the first look of a week makes the week's row and queues his post; the spends add the ledger and parts rows of any
 * keyed spend. The alarm reads one row while he is here and none outside his days. The valley's own settle before a spend is the
 * pass of `VALLEY_BUDGET`; the numbers here are the whole request.
 */
const VISITOR_BUDGET = {
  // The first look of the week: the week's row is made, the blueprint drawn and the post queued.
  first: { reads: 40, writes: 12 }, // measured 26 reads (the request's own: the session, the raid and Games checks; his two rows are 3 of them), 7 written (the week's row, the player's pass and the request's own counters)
  // A look with a piece asked about (its price and odds).
  look: { reads: 45, writes: 4 }, // measured 28 reads, 2 written (the request's own counters)
  // A reroll: the valley's pass before a spend (as `VALLEY_BUDGET.visit`) and the answer's own state.
  reroll: { reads: 1150, writes: 120 }, // measured 749 reads, 78 written (the debit, the scrap, the item's lines and the rerolls row are about 8 of them)
  blueprint: { reads: 1150, writes: 70 }, // measured 765 reads, 43 written
  // The alarm's own check while he is here (his row exists).
  alarm: { reads: 40, writes: 4 }, // measured 25 reads, none of them the visitor's once his row exists
  // A return after twelve hours inside his days: the pass tells him once.
  arrival: { reads: 1300, writes: 100 }, // measured 864 reads, 67 written (the pass of `VALLEY_BUDGET.arrival`; the paper's line adds the told row)
} as const;

describe('read budget with the visitor', () => {
  const measured: Record<string, ReadReport> = {};

  it('measures a look, a reroll, a blueprint, the alarm and a return while he is here', async () => {
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
        clock.t += 6 * MINUTE;
        await callAs(core, secrets, 1, '/api/me');
        await state();
        // Thursday afternoon: he is here. Funds and a piece to reroll.
        clock.t += 2 * 24 * 60 * MINUTE;
        await relog();
        const id = userId(1);
        metered.sql.exec(
          "UPDATE balances SET amount = 100000 WHERE user_id = ? AND currency = 'bait'",
          id,
        );
        metered.sql.exec(
          "INSERT INTO parts (user_id, kind, amount) VALUES (?, 'scrap', 100000), (?, 'mire-shard', 500) ON CONFLICT(user_id, kind) DO UPDATE SET amount = excluded.amount",
          id,
          id,
        );
        const item = metered.sql
          .exec<{ id: string }>('SELECT id FROM gear_items WHERE user_id = ? LIMIT 1', id)
          .one().id;
        clock.t += MINUTE;
        measured['first'] = (
          await metered.measure(() => callAs(core, secrets, 1, '/api/valley/visitor'))
        ).reads;
        clock.t += MINUTE;
        measured['look'] = (
          await metered.measure(() => callAs(core, secrets, 1, `/api/valley/visitor?item=${item}`))
        ).reads;
        clock.t += MINUTE;
        measured['reroll'] = (
          await metered.measure(() =>
            callAs(core, secrets, 1, '/api/valley/visitor/reroll', {
              method: 'POST',
              body: { itemId: item, idempotencyKey: 'budget-reroll-key' },
            }),
          )
        ).reads;
        clock.t += MINUTE;
        measured['blueprint'] = (
          await metered.measure(() =>
            callAs(core, secrets, 1, '/api/valley/visitor/blueprint', {
              method: 'POST',
              body: { idempotencyKey: 'budget-blueprint-key' },
            }),
          )
        ).reads;
        clock.t += MINUTE;
        await core.alarm();
        clock.t += MINUTE;
        measured['alarm'] = (await metered.measure(() => core.alarm())).reads;
        // Twelve hours away, still inside his days (Friday 03:00 Helsinki): the paper tells him.
        metered.sql.exec('UPDATE visitor_rerolls SET told = 0 WHERE user_id = ?', id);
        clock.t += 12 * 60 * MINUTE;
        await relog();
        measured['arrival'] = (await metered.measure(state)).reads;
      },
      { fresh: true },
    );
  }, 60_000);

  it.each(Object.keys(VISITOR_BUDGET) as (keyof typeof VISITOR_BUDGET)[])(
    'the visitor: %s reads and writes few rows',
    (name) => {
      const reads = measured[name];
      if (reads === undefined) throw new Error('the measuring test did not run');
      expectReadsUnder(`visitor ${name}`, reads, VISITOR_BUDGET[name].reads);
      expectWritesUnder(`visitor ${name}`, reads, VISITOR_BUDGET[name].writes);
    },
  );
});

/**
 * The School's teacher (phase 5 step 9a, `valley-school.ts`): the weekly pick, a look, seating a student, the alarm while he is announced
 * or here, and the return on which a lesson is learned. The pick is the one costly read of the week: it reads every creature's line
 * (`SELECT DISTINCT user_id, line FROM creatures`, one row per creature of the server) and every book entry (`line_talents`), once a week,
 * on a server of 15 with full rosters (the world of these tests). Everything after it reads the week's row by its key. The valley's own
 * settle before a seat is the pass of `VALLEY_BUDGET`; the numbers here are the whole request.
 */
const SCHOOL_BUDGET = {
  // The first look of the week: the pick over the whole server, the row and (with a channel) the post.
  pick: { reads: 2500, writes: 80 }, // measured 1925 reads (1330 of them the books, 390 the creatures' lines: once a week), 56 written (the pass of a first look, the week's row)
  // A look with the row made.
  look: { reads: 250, writes: 45 }, // measured 182 reads, 29 written (the valley's pass of this player: the first of the object's life here; the School's own part is the week's row and the player's creatures and book, about 51 rows)
  // Seating a student: the valley's pass before and after, the seat row and the checks.
  seat: { reads: 1100, writes: 90 }, // measured 801 reads, 62 written (the valley's pass before and after, the seat row and the two seat moves)
  // The alarm's own check while he is here (his row exists).
  alarm: { reads: 40, writes: 4 }, // measured 26 reads (the week's row is one of them), none written
  // A return after twelve hours on which the student's morning has come: the pass learns the lesson and sends it home.
  arrival: { reads: 1100, writes: 100 }, // measured 783 reads, 72 written (the pass of `VALLEY_BUDGET.arrival`; the lesson adds the seat's rows, the book entry and the player's week row)
} as const;

describe('read budget with the School', () => {
  const measured: Record<string, ReadReport> = {};

  it('measures the weekly pick, a look, a seat, the alarm and a return with a lesson', async () => {
    await inGuild(
      async (env) => {
        const { metered, clock } = env;
        const world = await seedWorld(env, { valleySystems: true });
        const { core, secrets } = world;
        clock.t += 6 * MINUTE;
        await callAs(core, secrets, 1, '/api/me');
        await callAs(core, secrets, 1, '/api/state');
        // Four players have found little: their books keep only what their creatures learned, so the teacher has students (the rest hold
        // whole pools, as a month of catches leaves them).
        metered.sql.exec(
          `DELETE FROM line_talents WHERE user_id IN (?, ?, ?, ?) AND NOT EXISTS (
             SELECT 1 FROM creature_talents_v2 t JOIN creatures c ON c.id = t.creature_id
             WHERE c.user_id = line_talents.user_id AND c.line = line_talents.line AND t.talent_id = line_talents.talent_id)`,
          userId(1),
          userId(2),
          userId(3),
          userId(4),
        );
        // The world's first alarm made this week's row from the full books (no talent): it is drawn again from these.
        metered.sql.exec('DELETE FROM school_weeks');
        // The teacher is here (a Tuesday afternoon).
        clock.t += MINUTE;
        measured['pick'] = (
          await metered.measure(() => callAs(core, secrets, 1, '/api/valley/school'))
        ).reads;
        clock.t += MINUTE;
        measured['look'] = (
          await metered.measure(() => callAs(core, secrets, 1, '/api/valley/school'))
        ).reads;
        // The student is one of the four who found little: the first of them the teacher benefits.
        let student = 0;
        let first: string | undefined;
        for (const n of [1, 2, 3, 4]) {
          const view = (await callAs(core, secrets, n, '/api/valley/school')) as {
            wouldLearn: string[];
          };
          if (view.wouldLearn[0] !== undefined) {
            student = n;
            first = view.wouldLearn[0];
            break;
          }
        }
        if (first === undefined) throw new Error('the world has no student for the teacher');
        clock.t += MINUTE;
        measured['seat'] = (
          await metered.measure(() =>
            callAs(core, secrets, student, '/api/valley/school/seat', {
              method: 'POST',
              body: { index: 0, creatureId: first },
            }),
          )
        ).reads;
        clock.t += MINUTE;
        await core.alarm();
        clock.t += MINUTE;
        measured['alarm'] = (await metered.measure(() => core.alarm())).reads;
        // Twelve hours later the next morning has come: the pass learns the lesson.
        clock.t += 12 * 60 * MINUTE;
        secrets.set(
          userId(student),
          await core.createSession(GUILD_ID, {
            id: userId(student),
            displayName: `Player ${String(student)}`,
          }),
        );
        measured['arrival'] = (
          await metered.measure(() => callAs(core, secrets, student, '/api/state'))
        ).reads;
        // The lesson was learned and the student is home.
        expect(
          metered.sql
            .exec<{ n: number }>(
              'SELECT COUNT(*) AS n FROM valley_seats WHERE user_id = ? AND place = ? AND creature_id IS NOT NULL',
              userId(student),
              'school',
            )
            .one().n,
        ).toBe(0);
        expect(
          metered.sql
            .exec<{ n: number }>('SELECT COALESCE(SUM(lessons), 0) AS n FROM school_students')
            .one().n,
        ).toBe(1);
      },
      { fresh: true },
    );
  }, 60_000);

  it.each(Object.keys(SCHOOL_BUDGET) as (keyof typeof SCHOOL_BUDGET)[])(
    'the School: %s reads and writes few rows',
    (name) => {
      const reads = measured[name];
      if (reads === undefined) throw new Error('the measuring test did not run');
      expectReadsUnder(`school ${name}`, reads, SCHOOL_BUDGET[name].reads);
      expectWritesUnder(`school ${name}`, reads, SCHOOL_BUDGET[name].writes);
    },
  );
});
