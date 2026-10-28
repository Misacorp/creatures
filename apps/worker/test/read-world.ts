// The seeded month-old guild the read tests share (`read-budget.test.ts`, `query-plan-audit.test.ts`,
// `read-day.test.ts`): 15 players with 30 creatures and talents each, 30 game days of history in every table
// that grows, everyone joined to this week's raid. Built straight into the tables (about 1 s).
import {
  content,
  createSeededRng,
  gamesContent,
  gearContent,
  pickQuirk,
  ribbonsForLevel,
} from '@creatures/game';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { GuildCore, type GuildCoreOptions } from '../src/guild-core';
import type { LiveHooks } from '../src/live-socket';
import { rollMissingTalents } from '../src/talent-store';
import { addDays, gameDay, zonedTimeToEpoch } from '../src/time';
import type { LoungeClient } from '../src/lounge-discord';
import type { ActivityInstance } from '../src/schemas';
import { ORIGIN, tokenFor, type CoreContext } from './helpers';
import { DAY, HELSINKI, HOUR, MINUTE, W02, joinRaid, rows, type Seeded } from './raid-helpers';
import { meterStorage, type ExecHook, type ReadReport } from './read-meter';

export const GUILD_ID = '555555555555555555';
export const PLAYERS = 15;
export const CREATURES_PER_PLAYER = 30;
export const HISTORY_DAYS = 30;
/** Tuesday 15:00 in the guild, after the daily reset and the rollup, a quiet moment of the raid week. */
export const NOW = W02.monday + DAY + HOUR;

export const userId = (n: number): string => `8${String(n).padStart(17, '0')}`;
/** The seeded players as `joinRaid` wants them: each places the first three creatures they own. */
export const PLAYERS_SEEDED = (creatures: Record<string, string[]>): Seeded[] =>
  Object.entries(creatures).map(([id, creatureIds]) => ({ id, name: id, creatureIds }));
/** The base of the seeded gear: a real one, so the gear view can show it. */
const GEAR_BASE = gearContent.bases[0] as (typeof gearContent.bases)[number];
export const EVENTS = gamesContent.events.slice(0, 3).map((e) => e.id);

/** The first game-day a month of history covers, and the day of `NOW`. */
export const TODAY = gameDay(NOW, HELSINKI, { hour: 13, minute: 37 });

/** Seeds the players, their creatures and talents: a guild that has played for a while. */
export function seedPlayers(
  sql: SqlStorage,
  storage: DurableObjectStorage,
): Record<string, string[]> {
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
export function seedHistory(
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
           VALUES (?, ?, ?, ?, ?, 'common', 3, '[]', 'dungeon', ?)`,
          crypto.randomUUID(),
          id,
          GEAR_BASE.id,
          GEAR_BASE.slot,
          GEAR_BASE.tag,
          at,
        );
        sql.exec(
          'INSERT INTO gear_grants (user_id, key, source, result_json, created_at) VALUES (?, ?, ?, ?, ?)',
          id,
          `dungeon:${day}`,
          'dungeon',
          '{"gear":[],"converted":[],"parts":{},"blueprints":[]}',
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

export const coreOptions = (
  build?: string,
  extra: Partial<GuildCoreOptions> = {},
): GuildCoreOptions => ({
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
  ...extra,
});

/** The Worker's start of this build, as the tests name it. */
export const BUILD = 'read-budget';

export interface GuildEnv {
  /** The guild's storage, metered: every statement of every core made by `mk` goes through it. */
  metered: ReturnType<typeof meterStorage>;
  /** The fake clock (UTC epoch ms) every core of this guild reads. */
  clock: { t: number };
  /** A new `GuildCore` on the guild's storage (an object that woke up). `extra` replaces options. */
  mk: (build?: string, extra?: Partial<GuildCoreOptions>) => GuildCore;
}

/**
 * Runs `fn` inside the guild's Durable Object with a metered storage and a fake clock at `NOW`.
 * `onExec` sees every statement before it runs (the audit records them there).
 */
export async function inGuild<T>(
  fn: (env: GuildEnv) => Promise<T>,
  options: { onExec?: ExecHook } = {},
): Promise<T> {
  const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(GUILD_ID));
  return runInDurableObject(stub, async (_instance, state) => {
    const metered = meterStorage(state.storage, options.onExec);
    const clock = { t: NOW };
    const mk = (build?: string, extra: Partial<GuildCoreOptions> = {}) =>
      new GuildCore(metered.storage, () => clock.t, coreOptions(build, extra));
    return fn({ metered, clock, mk });
  });
}

export interface World {
  /** The core that seeded the world (warm). */
  core: GuildCore;
  creatures: Record<string, string[]>;
  /** Each player's session secret. */
  secrets: Map<string, string>;
}

/**
 * The month-old guild: start the Worker's schema, seed the players and `HISTORY_DAYS` of history, log
 * everyone in, have everyone join this week's raid by placing three creatures, and run the first alarm of
 * the day (its daily work is not what the tests measure). The clock ends a minute after `NOW`.
 */
export async function seedWorld({ metered, clock, mk }: GuildEnv): Promise<World> {
  // The Worker's own start: the schema and the one-off passes of this build.
  const core = mk(BUILD);
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
  // Everyone has joined this week's raid by placing three creatures (one party of 15, a full board).
  joinRaid({ core, sql: metered.sql } as unknown as CoreContext, PLAYERS_SEEDED(creatures));
  // The first alarm of the day does the daily work (the rollup catch-up, the cleanup).
  await core.alarm();
  clock.t += MINUTE;
  return { core, creatures, secrets };
}

/** One authenticated request of player `n` to `core`; returns the parsed JSON body. */
export async function callAs(
  core: GuildCore,
  secrets: ReadonlyMap<string, string>,
  n: number,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const secret = secrets.get(userId(n));
  if (secret === undefined) throw new Error('no session');
  const method = options.method ?? (path === '/api/room' ? 'POST' : 'GET');
  // The living room is a POST that carries the players in the room (it only reads).
  const body =
    options.body ??
    (path === '/api/room'
      ? { userIds: Array.from({ length: PLAYERS }, (_, i) => userId(i + 1)) }
      : undefined);
  const res = await core.handle(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await tokenFor(GUILD_ID, secret)}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  if (res.status !== 200) throw new Error(`${method} ${path} answered ${String(res.status)}`);
  return res.json();
}

// --- The lounge and the live sockets, as fakes ---

/** Discord as the lounge check sees it: the players in each Activity instance. */
export interface FakeLounge extends LoungeClient {
  instances: Map<string, string[]>;
}

export function fakeLounge(): FakeLounge {
  const ok = <T>(value: T) => Promise.resolve({ kind: 'ok' as const, value });
  const fake: FakeLounge = {
    instances: new Map(),
    getInstance(id): Promise<ActivityInstance | null> {
      const users = fake.instances.get(id);
      return Promise.resolve(
        users === undefined ? null : { location: { guild_id: GUILD_ID }, users },
      );
    },
    createMessage: () => ok('900000000000000001'),
    editMessage: () => ok(null),
    deleteMessage: () => ok(null),
    recentMessageIds: () => ok([]),
    appIconUrl: () => Promise.resolve(null),
  };
  return fake;
}

/** Live hooks with sockets "open" for the lounge XP and the raid board: they push nowhere. */
export function listeningHooks(): LiveHooks {
  return {
    enabled: () => true,
    mintTicket: () => Promise.resolve(''),
    notify: () => undefined,
    notifyLoungeXp: () => undefined,
    notifyFinale: () => undefined,
    raidBoardListening: () => true,
    notifyRaidBoard: () => undefined,
    tickFinale: () => undefined,
    finaleWatchers: () => new Set(),
    nextFinaleAt: () => null,
  };
}

export const LOUNGE_INSTANCE = 'i-1234-gc-5678';
/** How many players lounge together in the lounge tick measurements. */
export const LOUNGERS = 5;
/** The first of them: not player 1, whom the request measurements read, so lounging XP does not change what they read. */
export const LOUNGER_FIRST = 6;

/** Options that give a core a lounge (the fake Discord) and open sockets. */
export const loungeOptions = (lounge: FakeLounge): Partial<GuildCoreOptions> => ({
  lounge,
  live: listeningHooks(),
});

/**
 * `LOUNGERS` players open the Activity in one instance (a session with an instance id), and the first
 * lounge check sees them. Every later alarm is then a tick of a room with company.
 */
export async function startLounge({ mk, clock }: GuildEnv, lounge: FakeLounge): Promise<void> {
  const core = mk(BUILD, loungeOptions(lounge));
  core.migrate();
  lounge.instances.set(
    LOUNGE_INSTANCE,
    Array.from({ length: LOUNGERS }, (_, i) => userId(LOUNGER_FIRST + i)),
  );
  for (let n = LOUNGER_FIRST; n < LOUNGER_FIRST + LOUNGERS; n++) {
    await core.createSession(
      GUILD_ID,
      { id: userId(n), displayName: `Player ${String(n)}` },
      null,
      LOUNGE_INSTANCE,
    );
  }
  clock.t += 15_000;
  await core.runLounge();
}

/**
 * One alarm of a lounge with company, a minute after the last: the object had been evicted, so it is a
 * new core that starts (`migrate`, same build) and then runs the alarm. Returns what the alarm read.
 */
export async function loungeTick(env: GuildEnv, lounge: FakeLounge): Promise<ReadReport> {
  const { clock, mk, metered } = env;
  clock.t += MINUTE;
  const core = mk(BUILD, loungeOptions(lounge));
  core.migrate();
  return (await metered.measure(() => core.alarm())).reads;
}

/**
 * Player 2 swaps their first two placed creatures on the raid board while a teammate's board socket is
 * open (the hooks say so). The placement itself, without the raid view the route answers with (that is
 * `/api/raid`'s own budget): the move, its checks and the push. Returns what it read.
 */
export async function boardSwap(
  env: GuildEnv,
  world: Pick<World, 'creatures'>,
): Promise<ReadReport> {
  const { mk, metered } = env;
  const core = mk(BUILD, { live: listeningHooks() });
  core.migrate();
  const [a, b] = world.creatures[userId(2)] ?? [];
  const slotOfB = rows<{ slot: number }>(
    metered.sql,
    'SELECT slot FROM raid_placements WHERE creature_id = ?',
    b ?? '',
  )[0]?.slot;
  if (a === undefined || slotOfB === undefined) throw new Error('player 2 has not placed');
  return (
    await metered.measure(() => {
      const outcome = core.raid.place(userId(2), HELSINKI, a, slotOfB);
      if (!outcome.ok) throw new Error(outcome.error);
    })
  ).reads;
}
