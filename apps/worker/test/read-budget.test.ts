// The read budget: how many Durable Object rows the hot paths read in a guild a month old. Cloudflare's free
// tier allows 5,000,000 rows read a day and a whole-table scan on a path that runs on every request, every
// alarm or every object start used it up twice (decisions.md, 2026-10-25). The budgets below are about 1.5x
// what each path read when they were set (the measured value is next to each); a failure lists the top
// statements by rows read. Raise a budget only with a reason in the PR. See testing.md, "Database reads".
import {
  content,
  createSeededRng,
  gamesContent,
  pickQuirk,
  ribbonsForLevel,
} from '@creatures/game';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { GuildCore, type GuildCoreOptions } from '../src/guild-core';
import { ReadMeter, readSourceOfPath } from '../src/read-meter';
import { rollMissingTalents } from '../src/talent-store';
import { addDays, gameDay, zonedTimeToEpoch } from '../src/time';
import { ORIGIN, USER_ID, runCore, tokenFor } from './helpers';
import { captureConsole } from './kit';
import { DAY, HELSINKI, HOUR, MINUTE, W02, nextGuild, rows, seedPlayer } from './raid-helpers';
import { describeReads, expectReadsUnder, meterStorage, type ReadReport } from './read-meter';

const GUILD_ID = '555555555555555555';
const PLAYERS = 15;
const CREATURES_PER_PLAYER = 30;
const HISTORY_DAYS = 30;
/** Tuesday 15:00 in the guild, after the daily reset and the rollup, a quiet moment of the raid week. */
const NOW = W02.monday + DAY + HOUR;

const userId = (n: number): string => `8${String(n).padStart(17, '0')}`;
const EVENTS = gamesContent.events.slice(0, 3).map((e) => e.id);

/** The first game-day a month of history covers, and the day of `NOW`. */
const TODAY = gameDay(NOW, HELSINKI, { hour: 13, minute: 37 });

/** Seeds the players, their creatures and talents: a guild that has played for a while. */
function seedPlayers(sql: SqlStorage, storage: DurableObjectStorage): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  storage.transactionSync(() => {
    for (let n = 1; n <= PLAYERS; n++) {
      const id = userId(n);
      sql.exec(
        'INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
        id,
        `Player ${String(n)}`,
        NOW - 60 * DAY,
        NOW - HOUR,
      );
      sql.exec("INSERT INTO balances (user_id, currency, amount) VALUES (?, 'bait', 900)", id);
      sql.exec("INSERT INTO balances (user_id, currency, amount) VALUES (?, 'essence', 40)", id);
      const perLine = new Map<string, number>();
      const own: string[] = [];
      for (const species of content.creatures) {
        if (own.length >= CREATURES_PER_PLAYER) break;
        const slot = (perLine.get(species.line) ?? 0) + 1;
        if (slot > 2) continue;
        perLine.set(species.line, slot);
        const level = Math.min(8 + own.length, species.levelCap);
        const creatureId = crypto.randomUUID();
        sql.exec(
          `INSERT INTO creatures (id, user_id, line, species, level, fusion_count, origin, caught_at, quirk_id, ribbons, line_slot)
           VALUES (?, ?, ?, ?, ?, 0, 'test', ?, ?, ?, ?)`,
          creatureId,
          id,
          species.line,
          species.id,
          level,
          NOW - 50 * DAY + own.length,
          pickQuirk(species.id, createSeededRng(`quirk:${String(n)}:${String(own.length)}`)),
          ribbonsForLevel(level),
          slot,
        );
        own.push(creatureId);
      }
      ids[id] = own;
    }
  });
  // Every creature without a talent gets the slots its level has opened, as the start-up pass does.
  rollMissingTalents(
    { sql, transactionSync: (fn) => storage.transactionSync(fn) },
    createSeededRng('read-budget-talents'),
    NOW - 50 * DAY,
  );
  return ids;
}

/**
 * Adds `days` game days of history ending the day before `lastDay`, a few rows per player per day in every
 * table that grows. Everything is finished (games awarded, expeditions claimed, jobs claimed, runs done).
 */
function seedHistory(
  sql: SqlStorage,
  storage: DurableObjectStorage,
  lastDay: string,
  days: number,
  creatures: Record<string, string[]>,
): void {
  storage.transactionSync(() => {
    for (let back = 1; back <= days; back++) {
      const day = addDays(lastDay, -back);
      const start = zonedTimeToEpoch(day, 13, 37, HELSINKI);
      const rng = createSeededRng(`history:${day}`);
      const pick = (n: number): number => rng.nextU32() % n;
      // The Valley Games: a locked and awarded show day with three events.
      sql.exec(
        `INSERT INTO games_days (day, lineup_json, created_at, locked_at, seed, show_at, ends_at, awarded_at)
         VALUES (?, ?, ?, ?, 'seed', ?, ?, ?)`,
        day,
        JSON.stringify(EVENTS),
        start - DAY,
        start,
        start + 3 * MINUTE,
        start + 10 * MINUTE,
        start + 11 * MINUTE,
      );
      EVENTS.forEach((eventId, idx) => {
        sql.exec(
          'INSERT INTO games_results (day, idx, event_id, input_json, result_json) VALUES (?, ?, ?, ?, NULL)',
          day,
          idx,
          eventId,
          '[]',
        );
      });
      for (let n = 1; n <= PLAYERS; n++) {
        const id = userId(n);
        const own = creatures[id] ?? [];
        const at = start - 3 * HOUR + n * MINUTE;
        const actor = (n * 7919).toString(16).padStart(24, '0');
        for (const kind of [
          'session_start',
          'train',
          'expedition_claim',
          'job_claim',
          'games_entry',
        ]) {
          sql.exec(
            'INSERT INTO analytics_events (at, kind, actor_hash, props_json) VALUES (?, ?, ?, ?)',
            at + pick(HOUR),
            kind,
            actor,
            '{"returning":true}',
          );
        }
        sql.exec(
          `INSERT INTO ledger (user_id, currency, amount, source, idempotency_key, created_at)
           VALUES (?, 'bait', 40, 'allowance', ?, ?), (?, 'bait', -25, 'training', ?, ?)`,
          id,
          `allowance:${day}`,
          at,
          id,
          `train:${day}`,
          at + MINUTE,
        );
        EVENTS.forEach((eventId, slot) => {
          const creatureId = own[(slot + back) % own.length];
          if (creatureId === undefined) return;
          sql.exec(
            `INSERT INTO games_entries (day, user_id, event_id, slot, creature_id, entered_at)
             VALUES (?, ?, ?, 0, ?, ?)`,
            day,
            id,
            eventId,
            creatureId,
            at,
          );
          sql.exec(
            `INSERT INTO games_placings (day, event_id, user_id, creature_ids, place, medal, score)
             VALUES (?, ?, ?, ?, ?, NULL, ?)`,
            day,
            eventId,
            id,
            JSON.stringify([creatureId]),
            1 + pick(PLAYERS),
            pick(1000),
          );
        });
        sql.exec(
          `INSERT INTO gear_items (id, user_id, base_id, slot, tag, rarity, item_level, lines_json, source, created_at)
           VALUES (?, ?, 'seed-base', 'hat', 'seed', 'common', 3, '[]', 'dungeon', ?)`,
          crypto.randomUUID(),
          id,
          at,
        );
        sql.exec(
          'INSERT INTO gear_grants (user_id, key, source, result_json, created_at) VALUES (?, ?, ?, ?, ?)',
          id,
          `dungeon:${day}`,
          'dungeon',
          '{}',
          at,
        );
        sql.exec(
          `INSERT INTO dungeon_runs (id, user_id, day, attempt, idempotency_key, fingerprint, depth, seed, cleared,
                                     rooms_cleared, summary_json, rewards_json, created_at)
           VALUES (?, ?, ?, 1, ?, 'fp', 2, 'seed', 1, 3, '{}', '{}', ?)`,
          crypto.randomUUID(),
          id,
          day,
          `run:${day}`,
          at,
        );
        sql.exec(
          `INSERT INTO expeditions (id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at,
                                    status, claimed_at, result)
           VALUES (?, ?, ?, 'short', '[]', 2, 0, ?, ?, 'claimed', ?, '{}')`,
          crypto.randomUUID(),
          id,
          own[back % own.length] ?? '',
          at,
          at + HOUR,
          at + 2 * HOUR,
        );
        sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at, claimed_at, result_json)
           VALUES (?, ?, ?, 'craft', '{}', ?, ?, ?, '{}')`,
          crypto.randomUUID(),
          id,
          own[(back + 1) % own.length] ?? '',
          at,
          at + HOUR,
          at + 2 * HOUR,
        );
      }
      // The rollup of the day, as the daily alarm wrote it: a few dozen rows.
      for (const [metric, dims] of [
        ['dau', '{}'],
        ['sessions', '{}'],
        ['events', '{"kind":"train"}'],
        ['events', '{"kind":"games_entry"}'],
        ['rolled', '{}'],
      ] as const) {
        sql.exec(
          'INSERT INTO analytics_daily (day, metric, dims_json, value) VALUES (?, ?, ?, ?)',
          day,
          metric,
          dims,
          PLAYERS,
        );
      }
    }
  });
}

const stubs = {
  dmSender: {
    openChannel: () => Promise.resolve({ kind: 'ok' as const, channelId: '999999999999999999' }),
    send: () => Promise.resolve({ kind: 'sent' as const }),
  },
  postSender: () => Promise.resolve({ kind: 'sent' as const }),
};

const coreOptions = (build?: string): GuildCoreOptions => ({
  guildId: () => GUILD_ID,
  analyticsSecret: env.DISCORD_CLIENT_SECRET,
  talentRng: createSeededRng('a'),
  dungeonRng: createSeededRng('b'),
  gearRng: createSeededRng('c'),
  tripRng: createSeededRng('d'),
  raidRng: createSeededRng('e'),
  quirkRng: createSeededRng('f'),
  gamesRng: createSeededRng('g'),
  weatherRng: createSeededRng('h'),
  rng: createSeededRng('j'),
  // As in production: weather, the allowance, DMs and posts are on; there is no lounge.
  weather: true,
  dailyAllowance: true,
  ...stubs,
  ...(build === undefined ? {} : { build }),
});

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
  '/api/raid': 4200, // measured 2773 (every party member's creatures, talents and gear: it scales with the roster)
  '/api/dungeon/today': 120, // measured 78
} as const;

/** What another month of history may add to a path: a new whole-table scan adds hundreds. */
const GROWTH_ROWS = 6;

async function inGuild<T>(
  fn: (ctx: {
    metered: ReturnType<typeof meterStorage>;
    clock: { t: number };
    mk: (build?: string) => GuildCore;
  }) => Promise<T>,
): Promise<T> {
  const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(GUILD_ID));
  return runInDurableObject(stub, async (_instance, state) => {
    const metered = meterStorage(state.storage);
    const clock = { t: NOW };
    const mk = (build?: string) =>
      new GuildCore(metered.storage, () => clock.t, coreOptions(build));
    return fn({ metered, clock, mk });
  });
}

interface Measured {
  start: ReadReport;
  alarm: ReadReport;
  paths: Record<string, ReadReport>;
}

describe('read budget', () => {
  let first: Measured | null = null;
  let second: Measured | null = null;

  /** Measures every hot path against a core that has been warm for a minute (`warm` runs before it). */
  async function measureAll(
    ctx: Parameters<Parameters<typeof inGuild>[0]>[0],
    core: GuildCore,
    secrets: Map<string, string>,
  ): Promise<Measured> {
    const { metered, clock, mk } = ctx;
    const get = async (path: string) => {
      const secret = secrets.get(userId(1));
      if (secret === undefined) throw new Error('no session');
      const res = await core.handle(
        new Request(`${ORIGIN}${path}`, {
          // The living room is a POST that carries the players in the room (it only reads).
          method: path === '/api/room' ? 'POST' : 'GET',
          headers: { Authorization: `Bearer ${await tokenFor(GUILD_ID, secret)}` },
          ...(path === '/api/room'
            ? {
                body: JSON.stringify({
                  userIds: Array.from({ length: PLAYERS }, (_, i) => userId(i + 1)),
                }),
              }
            : {}),
        }),
      );
      expect(res.status, path).toBe(200);
      await res.json();
    };
    // An object start after the first one of this build: a new core, `migrate` with the same build.
    mk('read-budget').migrate();
    const start = (await metered.measure(() => mk('read-budget').migrate())).reads;
    // Warm: the first call of each path today pays one-off work (the allowance, the week's rows, the draws).
    for (const path of PATHS) await get(path);
    clock.t += MINUTE;
    await core.alarm();
    clock.t += MINUTE;
    const alarm = (await metered.measure(() => core.alarm())).reads;
    const paths: Record<string, ReadReport> = {};
    for (const path of PATHS) paths[path] = (await metered.measure(() => get(path))).reads;
    return { start, alarm, paths };
  }

  it('seeds a month-old guild and measures the hot paths', async () => {
    await inGuild(async (ctx) => {
      const { metered, clock, mk } = ctx;
      // The Worker's own start: the schema and the one-off passes of this build.
      const core = mk('read-budget');
      core.migrate();
      const creatures = seedPlayers(metered.sql, metered.storage);
      seedHistory(metered.sql, metered.storage, TODAY, HISTORY_DAYS, creatures);
      const secrets = new Map<string, string>();
      for (let n = 1; n <= PLAYERS; n++) {
        secrets.set(
          userId(n),
          await core.createSession(GUILD_ID, { id: userId(n), displayName: `Player ${String(n)}` }),
        );
      }
      // The first alarm of the day does the daily work (the rollup catch-up, the cleanup): not measured.
      await core.alarm();
      clock.t += MINUTE;
      first = await measureAll(ctx, core, secrets);

      // Another month, older than the first: the tables are twice as long, the hot paths must not notice.
      seedHistory(
        metered.sql,
        metered.storage,
        addDays(TODAY, -HISTORY_DAYS),
        HISTORY_DAYS,
        creatures,
      );
      second = await measureAll(ctx, core, secrets);
    });
  }, 60_000);

  it.each(Object.keys(BUDGET) as (keyof typeof BUDGET)[])('%s reads few rows', (name) => {
    const reads =
      name === 'start' ? first?.start : name === 'alarm' ? first?.alarm : first?.paths[name];
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
