import { SCHEMA_VERSION } from '../src/migrations';
import {
  EXPEDITION_LENGTHS,
  GEAR_RARITIES,
  GOAL_RISKS,
  JOB_KINDS,
  PART_KINDS,
  RARITIES,
  RULES,
  content,
  craftLevelNeeded,
  createSeededRng,
  dungeonContent,
  dungeonEvents,
  dungeonKeepsakes,
  expeditionContent,
  gearContent,
  talentContent,
  type Rng,
} from '@creatures/game';
import { easyFoes, followRoute, playThrough, routeThrough } from './dungeon-helpers';
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  Analytics,
  MAX_PROPS_CHARS,
  RETENTION_MS,
  SESSION_GAP_MS,
  actorHash,
  capJson,
  propsOf,
  serializeProps,
  type AnalyticsEvent,
} from '../src/analytics';
import { enqueuePost, recordOutcome, type PostSender } from '../src/discord-posts';
import { getSessionKey } from '../src/session';
import { grantFestivalCreature } from '../src/raid-festival';
import { creditParts } from '../src/gear-store';
import { giveItem } from './gear-helpers';
import { GEAR_SOURCES } from '../src/analytics';
import { LIVE_ROUND_MS, evaluate, loadLive, roundStartsOf } from '../src/raid-live';
import { eventTimes } from '../src/raid-schedule';
import {
  OTHER_USER_ID,
  certainCatches,
  USER_ID,
  runCore,
  undoAnalyticsMigration,
  undoPacingMigration,
  type CoreContext,
} from './helpers';
import {
  HELSINKI,
  MINUTE,
  W02,
  count,
  forcePool,
  membersOf,
  nextGuild,
  rows,
  runRaid,
  seedPlayer,
  storedRuns,
  type Seeded,
} from './raid-helpers';
import { DAY, HOUR, captureConsole, give, newKey, setCreature } from './kit';

const USER = { id: USER_ID, displayName: 'Misa the Mighty' };
const OTHER = { id: OTHER_USER_ID, displayName: 'Other Person' };
const FINALE = eventTimes(W02.id, HELSINKI).finale;
// Well below, so the experience of the two raid stages before the finale does not carry a creature to the unlock.
const BELOW_UNLOCK = RULES.abilities.unlockLevel - 4;

interface EventRow {
  id: number;
  at: number;
  kind: string;
  actor_hash: string | null;
  props: Record<string, unknown>;
}

/** The logged events, oldest first, props parsed. */
function events(sql: SqlStorage, kind?: string): EventRow[] {
  return rows<{
    id: number;
    at: number;
    kind: string;
    actor_hash: string | null;
    props_json: string;
  }>(
    sql,
    `SELECT id, at, kind, actor_hash, props_json FROM analytics_events
     ${kind === undefined ? '' : `WHERE kind = '${kind}'`} ORDER BY id`,
  ).map((r) => ({
    id: r.id,
    at: r.at,
    kind: r.kind,
    actor_hash: r.actor_hash,
    props: JSON.parse(r.props_json) as Record<string, unknown>,
  }));
}

const kinds = (sql: SqlStorage): string[] => events(sql).map((e) => e.kind);

/** Returns the scripted values in order, then fails loudly. */
function scriptedRng(values: number[]): Rng {
  let i = 0;
  return {
    nextU32() {
      const value = values[i++];
      if (value === undefined) throw new Error('scripted rng exhausted');
      return value;
    },
  };
}
/**
 * Draws for one catch of a common splashet that is not shiny, and the same shiny: whether the roll
 * brings a creature at all (0: it does), the rarity, the species and the shiny.
 */
const SPLASHET_PLAIN = [0, 0, 0, 1];
const SPLASHET_SHINY = [0, 0, 0, 0];
/** A short trip is two ticks: the second one misses the creature chance and draws once. */
const THEN_MISS = [9_999];

type Json = Record<string, unknown>;

async function call(
  ctx: CoreContext,
  secret: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Json }> {
  const res = await ctx.request(secret, path, method, body);
  return { status: res.status, body: await res.json<Json>() };
}

/** A player with a starter and some Bait, signed in. */
async function joinWithStarter(
  ctx: CoreContext,
  user: { id: string; displayName: string },
  bait: number,
  species = 'splashet',
): Promise<{ secret: string; starterId: string }> {
  const secret = await ctx.core.createSession(ctx.guildId, user);
  give(ctx, user.id, { bait: bait });
  const res = await call(ctx, secret, 'POST', '/api/starter', {
    species,
    idempotencyKey: newKey(),
  });
  expect(res.status).toBe(200);
  const starterId = (
    (res.body['state'] as { creatures: { id: string }[] }).creatures[0] as { id: string }
  ).id;
  return { secret, starterId };
}

/** A new session for a player, for after the test clock has jumped (sessions idle out after an hour). */
const signIn = (ctx: CoreContext, user: { id: string; displayName: string }) =>
  ctx.core.createSession(ctx.guildId, user);

type Supply = { id: string; source: 'buy' | 'owned' };
const own = (id: string): Supply => ({ id, source: 'owned' });

/** Puts supplies in a player's stock (they cannot be bought; trips carry them from stock). */
function stock(sql: SqlStorage, userId: string, id: string, amount: number): void {
  sql.exec(
    `INSERT INTO supplies (user_id, supply_id, amount) VALUES (?, ?, ?)
     ON CONFLICT(user_id, supply_id) DO UPDATE SET amount = excluded.amount`,
    userId,
    id,
    amount,
  );
}

const send = (
  ctx: CoreContext,
  secret: string,
  creatureId: string,
  duration: 'short' | 'medium' | 'long' | 'day' = 'short',
  supplies: Supply[] = [],
  idempotencyKey = newKey(),
  destination = 'tidepools',
) =>
  call(ctx, secret, 'POST', '/api/expeditions', {
    creatureId,
    destination,
    duration,
    supplies,
    idempotencyKey,
  });

const expeditionOf = (res: { body: Json }) =>
  res.body['expedition'] as { id: string; startedAt: number; endsAt: number };

describe('the event writer', () => {
  it('rebuilds every prop from checked values, so free text cannot get through', () => {
    const dirty = {
      kind: 'expedition_claim',
      duration: 'a nickname',
      destination: 'Misa the Mighty',
      supplies: ['Misa the Mighty', 'lure-basic', 'x', 'y'],
      pushOn: 'free text',
      xp: -4.5,
      stars: 99,
      waitedMin: -5.7,
      catches: Array.from({ length: 20 }, () => ({
        species: '<b>Bob</b>',
        rarity: 'legendary',
        shiny: 'yes',
        result: 'free text',
      })),
    } as unknown as AnalyticsEvent;
    const props = propsOf(dirty) as { catches: unknown[] } & Record<string, unknown>;
    expect(props).toMatchObject({
      duration: 'short',
      destination: 'unknown',
      // At most two supplies, each a content id or "unknown".
      supplies: ['unknown', 'lure-basic'],
      pushOn: 'declined',
      xp: 0,
      stars: 3,
      waitedMin: 0,
    });
    // At most 12 catches, each reduced to known values.
    expect(props.catches).toHaveLength(12);
    expect(props.catches[0]).toEqual({
      species: 'unknown',
      rarity: 'common',
      shiny: true,
      result: 'new',
    });

    expect(propsOf({ kind: 'starter_chosen', species: 'definitely not a species' })).toEqual({
      species: 'unknown',
    });
    expect(propsOf({ kind: 'daily_allowance', amount: 25 })).toEqual({ amount: 25 });
    expect(propsOf({ kind: 'daily_allowance', amount: Number.NaN })).toEqual({ amount: 0 });
    expect(propsOf({ kind: 'ability_pick', ability: 'x'.repeat(500) })).toEqual({
      ability: 'unknown',
    });
    expect(
      propsOf({
        kind: 'post_result',
        result: 'sent',
        error: 'secret token' as never,
        attempts: 2.9,
      }),
    ).toEqual({ result: 'sent', error: 'rejected', attempts: 2 });
    expect(
      propsOf({
        kind: 'team_set',
        auto: false,
        species: ['splashet', 'cindle', 'sproutle', 'zipmouse'],
      }),
    ).toEqual({ auto: false, species: ['splashet', 'cindle', 'sproutle'] });
    expect(
      propsOf({
        kind: 'phase_result',
        phase: 'finale',
        boss: 'real-boss-id-not-in-content',
        rank: Number.NaN,
        festival: false,
        partySize: 5,
        win: true,
        rounds: 12,
        topShareBp: 99_999,
      }),
    ).toMatchObject({ boss: 'unknown', rank: 0, topShareBp: 10_000 });
  });

  it('writes a retired modifier id (Fog) as unknown, since only shipped content ids are kept', () => {
    const run = propsOf({
      kind: 'dungeon_run',
      depth: 1,
      attempt: 1,
      roomsCleared: 0,
      cleared: false,
      landmark: false,
      modifiers: ['fog', 'echoing', 'dark'],
      team: [],
      gear: 0,
    });
    expect((run as { modifiers: unknown }).modifiers).toEqual(['unknown', 'echoing', 'dark']);
  });

  it('rebuilds the map run fields of dungeon_run, and the event and camp events, from content ids and numbers only', () => {
    const keepsake = dungeonKeepsakes[0]?.id as string;
    const event = dungeonEvents[0]?.id as string;
    const run = propsOf({
      kind: 'dungeon_run',
      depth: 3,
      attempt: 1,
      roomsCleared: 4,
      cleared: false,
      landmark: false,
      modifiers: [],
      team: [],
      gear: 0,
      outcome: 'home',
      path: ['fight', 'mystery', 'Zorblax', 'camp', ...Array.from({ length: 9 }, () => 'boss')],
      keepsakes: [
        keepsake,
        'a keepsake a player named',
        ...Array.from({ length: 20 }, () => keepsake),
      ],
      campChoice: 'swap',
      elites: 99,
      packFound: -4,
      packKept: 1_000_000,
    });
    expect(run).toMatchObject({
      outcome: 'home',
      campChoice: 'swap',
      elites: 9,
      packFound: 0,
      packKept: 999,
    });
    const props = run as { path: string[]; keepsakes: string[] };
    expect(props.path).toHaveLength(13); // the longest path of a run is its main map and its Undercroft levels
    expect(props.path.slice(0, 4)).toEqual(['fight', 'mystery', 'fight', 'camp']); // an unknown kind is a fight
    expect(props.keepsakes).toHaveLength(12);
    expect(props.keepsakes.slice(0, 2)).toEqual([keepsake, 'unknown']);
    // Absent fields stay absent, and a value that is not an outcome or a choice falls back.
    expect(
      propsOf({
        kind: 'dungeon_run',
        depth: 1,
        attempt: 1,
        roomsCleared: 0,
        cleared: false,
        landmark: false,
        modifiers: [],
        team: [],
        gear: 0,
      }),
    ).not.toHaveProperty('outcome');
    expect(
      propsOf({
        kind: 'dungeon_run',
        depth: 1,
        attempt: 1,
        roomsCleared: 0,
        cleared: false,
        landmark: false,
        modifiers: [],
        team: [],
        gear: 0,
        outcome: 'won' as never,
        campChoice: 'dance' as never,
      }),
    ).toMatchObject({ outcome: 'defeat', campChoice: 'none' });
    expect(propsOf({ kind: 'dungeon_event', event, option: 1, won: false })).toEqual({
      event,
      option: 1,
      won: false,
    });
    expect(propsOf({ kind: 'dungeon_event', event: 'Misa was here', option: 7 })).toEqual({
      event: 'unknown',
      option: 1,
    });
    // The Undercroft: levels cleared and the rooms a carved door added, as numbers and room kinds only.
    const deep = propsOf({
      kind: 'dungeon_run',
      depth: 9,
      attempt: 1,
      roomsCleared: 9,
      cleared: true,
      landmark: false,
      modifiers: [],
      team: [],
      gear: 0,
      path: ['fight', 'door', 'epic', 'boss', 'Misa', ...Array.from({ length: 30 }, () => 'epic')],
      deepest: 99,
      marks: ['epic', 'Misa was here', 'camp'],
    }) as { deepest: number; marks: string[]; path: string[] };
    expect(deep.deepest).toBe(3);
    expect(deep.marks).toEqual(['epic', 'fight']); // at most two, and an unknown kind is a fight
    expect(deep.path).toHaveLength(24);
    expect(deep.path.slice(0, 5)).toEqual(['fight', 'door', 'epic', 'boss', 'fight']);
    expect(propsOf({ kind: 'dungeon_descend', level: 2 })).toEqual({ level: 2 });
    expect(propsOf({ kind: 'dungeon_descend', level: 40 })).toEqual({ level: 3 });
    expect(propsOf({ kind: 'dungeon_descend', level: -1 })).toEqual({ level: 0 });
    expect(
      propsOf({
        kind: 'dungeon_run',
        depth: 1,
        attempt: 1,
        roomsCleared: 0,
        cleared: false,
        landmark: false,
        modifiers: [],
        team: [],
        gear: 0,
      }),
    ).not.toHaveProperty('deepest');
    expect(propsOf({ kind: 'dungeon_camp', choice: 'keepsake' })).toEqual({ choice: 'keepsake' });
    expect(propsOf({ kind: 'dungeon_camp', choice: 'nap' as never })).toEqual({ choice: 'rest' });
    // The fullest dungeon_run fits the cap.
    const fullest = serializeProps({
      kind: 'dungeon_run',
      depth: 9_999,
      attempt: 2,
      roomsCleared: 6,
      cleared: true,
      landmark: true,
      modifiers: Array.from({ length: 6 }, () => 'overgrown'),
      team: Array.from({ length: 3 }, () => ({ species: 'hearthshell', role: 'support' as const })),
      gear: 3,
      outcome: 'cleared',
      path: Array.from({ length: 24 }, () => 'mystery'),
      deepest: 3,
      marks: ['camp', 'camp'],
      keepsakes: Array.from({ length: 12 }, () => dungeonKeepsakes.at(-1)?.id as string),
      campChoice: 'keepsake',
      elites: 2,
      packFound: 40,
      packKept: 40,
    });
    expect(fullest.length).toBeLessThanOrEqual(MAX_PROPS_CHARS);
    expect(fullest).not.toContain('truncated');
  });

  it('rebuilds the dungeon events from content ids and numbers only', () => {
    const run = propsOf({
      kind: 'dungeon_run',
      depth: 12.9,
      attempt: 7,
      roomsCleared: -3,
      cleared: false,
      landmark: true,
      modifiers: ['flooded', 'Misa was here', 'echoing', 'dark', 'dark', 'dark', 'dark'],
      team: [
        { species: 'cindle', role: 'payoff' },
        { species: 'a nickname', role: 'king' as never },
        { species: 'sproutle', role: 'guard' },
        { species: 'zipmouse', role: 'setter' },
      ],
      gear: 99,
    });
    expect(run).toEqual({
      depth: 12,
      attempt: 2,
      roomsCleared: 0,
      cleared: false,
      landmark: true,
      modifiers: ['flooded', 'unknown', 'echoing', 'dark', 'dark', 'dark'],
      team: [
        { species: 'cindle', role: 'payoff' },
        { species: 'unknown', role: 'setter' },
        { species: 'sproutle', role: 'guard' },
      ],
      gear: 9,
    });
    expect(
      propsOf({
        kind: 'dungeon_reward',
        depth: 3,
        bait: 13,
        essence: -1,
        scrap: 4,
        shards: Number.NaN,
        glimmer: 1,
        gear: 1,
        supplies: 2,
        landmark: false,
        streakBonusDay: 3,
      }),
    ).toEqual({
      depth: 3,
      bait: 13,
      essence: 0,
      scrap: 4,
      shards: 0,
      glimmer: 1,
      gear: 1,
      supplies: 2,
      landmark: false,
      streakBonusDay: 3,
    });
    const long = serializeProps({
      kind: 'dungeon_run',
      depth: 9_999,
      attempt: 2,
      roomsCleared: 3,
      cleared: true,
      landmark: true,
      modifiers: ['overgrown', 'scorched', 'brittle'],
      team: [
        { species: 'coralynx', role: 'payoff' },
        { species: 'hearthshell', role: 'guard' },
        { species: 'lanternfin', role: 'support' },
      ],
      gear: 3,
    });
    expect(long.length).toBeLessThanOrEqual(MAX_PROPS_CHARS);
    expect(long).not.toContain('truncated');
  });

  it('caps the stored JSON', () => {
    expect(capJson('{"a":1}')).toBe('{"a":1}');
    const long = JSON.stringify({ text: 'x'.repeat(MAX_PROPS_CHARS) });
    expect(capJson(long)).toBe('{"truncated":true}');
    // A claim with every catch listed stays under the cap.
    const catches = Array.from({ length: 12 }, () => ({
      species: 'coralynx',
      rarity: 'epic' as const,
      shiny: true,
      result: 'converted' as const,
    }));
    const json = serializeProps({
      kind: 'expedition_claim',
      duration: 'day',
      destination: 'festival-grounds',
      supplies: ['satchel-great', 'map-scrap-great'],
      waitedMin: 1_000_000,
      catches,
      pushOn: 'declined',
      xp: 100_000,
      stars: 3,
    });
    expect(json.length).toBeLessThanOrEqual(MAX_PROPS_CHARS);
    expect(json).not.toContain('truncated');
  });
});

describe('the actor hash', () => {
  it('is 32 hex characters, stable for one user and different between users and secrets', async () => {
    const a1 = await actorHash('secret-one', USER_ID);
    const a2 = await actorHash('secret-one', USER_ID);
    const b = await actorHash('secret-one', OTHER_USER_ID);
    const otherSecret = await actorHash('secret-two', USER_ID);
    expect(a1).toMatch(/^[0-9a-f]{32}$/);
    expect(a1).toBe(a2);
    expect(b).not.toBe(a1);
    expect(otherSecret).not.toBe(a1);
    expect(a1).not.toContain(USER_ID);
  });

  it('is not a plain hash of the id and not made with the session key', async () => {
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(USER_ID)),
    );
    const plain = Array.from(digest.subarray(0, 16), (x) => x.toString(16).padStart(2, '0')).join(
      '',
    );
    const sessionMac = new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        await getSessionKey('secret-one'),
        new TextEncoder().encode(USER_ID),
      ),
    );
    const viaSessionKey = Array.from(sessionMac.subarray(0, 16), (x) =>
      x.toString(16).padStart(2, '0'),
    ).join('');
    const hash = await actorHash('secret-one', USER_ID);
    expect(hash).not.toBe(plain);
    expect(hash).not.toBe(viaSessionKey);
  });

  it('stores the same hash for one user across requests and a different one per user', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await joinWithStarter(ctx, USER, 50);
      const b = await joinWithStarter(ctx, OTHER, 50, 'cindle');
      const starters = events(ctx.sql, 'starter_chosen');
      expect(starters).toHaveLength(2);
      const [first, second] = starters as [EventRow, EventRow];
      expect(first.actor_hash).toBe(await actorHash(env.DISCORD_CLIENT_SECRET, USER_ID));
      expect(second.actor_hash).toBe(await actorHash(env.DISCORD_CLIENT_SECRET, OTHER_USER_ID));
      expect(first.actor_hash).not.toBe(second.actor_hash);
      void a;
      void b;
    });
  });
});

describe('migration 16 (the analytics event log)', () => {
  const tables = (sql: SqlStorage) =>
    sql
      .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .toArray()
      .map((r) => r.name);
  const version = (sql: SqlStorage) =>
    sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v;

  it('creates the tables and the index on a fresh database', async () => {
    await runCore(nextGuild(), ({ sql }) => {
      expect(tables(sql)).toEqual(
        expect.arrayContaining(['analytics_events', 'analytics_seen', 'analytics_once']),
      );
      expect(
        sql
          .exec<{ name: string }>('SELECT name FROM pragma_table_info(?)', 'analytics_events')
          .toArray()
          .map((c) => c.name),
      ).toEqual(['id', 'at', 'kind', 'actor_hash', 'props_json']);
      expect(
        sql
          .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'")
          .toArray()
          .map((i) => i.name),
      ).toContain('analytics_events_at');
      expect(version(sql)).toBe(SCHEMA_VERSION);
      return Promise.resolve();
    });
  });

  it('applies on a schema-15 database, keeping its data, and is a no-op the second time', async () => {
    await runCore(nextGuild(), async ({ core, sql, guildId }) => {
      await core.createSession(guildId, USER, '555555555555555555');
      undoPacingMigration(sql);
      // Back to before the pacing column and before analytics: version 14, no analytics tables.
      expect(version(sql)).toBe(14);
      expect(tables(sql)).not.toContain('analytics_events');
      core.migrate();
      expect(version(sql)).toBe(SCHEMA_VERSION);
      expect(tables(sql)).toContain('analytics_events');
      expect(sql.exec('SELECT announce_channel_id FROM guild_meta').one()).toEqual({
        announce_channel_id: '555555555555555555',
      });
      expect(sql.exec('SELECT user_id FROM players').toArray()).toEqual([{ user_id: USER_ID }]);
      core.migrate();
      expect(sql.exec('SELECT * FROM schema_version').toArray()).toHaveLength(SCHEMA_VERSION);
    });
  });

  it('applies on a database that is exactly at version 15 and can be replayed', async () => {
    await runCore(nextGuild(), async ({ core, sql, guildId }) => {
      await core.createSession(guildId, USER);
      undoAnalyticsMigration(sql);
      expect(version(sql)).toBe(15);
      core.migrate();
      expect(version(sql)).toBe(SCHEMA_VERSION);
      sql.exec(
        "INSERT INTO analytics_events (at, kind, actor_hash, props_json) VALUES (1, 'x', NULL, '{}')",
      );
      expect(count(sql, 'analytics_events')).toBe(1);
      undoAnalyticsMigration(sql);
      core.migrate();
      expect(count(sql, 'analytics_events')).toBe(0);
    });
  });
});

describe('session start', () => {
  it('logs the first request of a player and then a request after more than 30 minutes of silence', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const secret = await ctx.core.createSession(ctx.guildId, USER);
      expect(events(ctx.sql)).toEqual([]); // logging in is not a request
      await ctx.request(secret, '/api/state');
      const [first] = events(ctx.sql, 'session_start');
      expect(events(ctx.sql, 'session_start')).toHaveLength(1);
      expect(first).toMatchObject({
        at: ctx.clock.t,
        actor_hash: await actorHash(env.DISCORD_CLIENT_SECRET, USER_ID),
        props: { returning: false },
      });

      // Activity every few minutes is one session, however long it lasts.
      for (let i = 0; i < 8; i++) {
        ctx.clock.t += 10 * MINUTE;
        await ctx.request(secret, '/api/state');
      }
      expect(events(ctx.sql, 'session_start')).toHaveLength(1);

      // Exactly the gap does not start a session; more than the gap does.
      ctx.clock.t += SESSION_GAP_MS;
      await ctx.request(secret, '/api/state');
      expect(events(ctx.sql, 'session_start')).toHaveLength(1);
      ctx.clock.t += SESSION_GAP_MS + 2 * MINUTE;
      await ctx.request(secret, '/api/state');
      const all = events(ctx.sql, 'session_start');
      expect(all).toHaveLength(2);
      expect(all[1]?.props).toEqual({ returning: true });
    });
  });

  it('tracks each player on their own and ignores requests that are refused', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await ctx.core.createSession(ctx.guildId, USER);
      const b = await ctx.core.createSession(ctx.guildId, OTHER);
      await ctx.request(a, '/api/state');
      await ctx.request(b, '/api/state');
      await ctx.request(a, '/api/state');
      const sessions = events(ctx.sql, 'session_start');
      expect(sessions).toHaveLength(2);
      expect(new Set(sessions.map((s) => s.actor_hash)).size).toBe(2);
      // An unknown session is rejected before anything is logged.
      const before = count(ctx.sql, 'analytics_events');
      const res = await ctx.request('A'.repeat(43), '/api/state');
      expect(res.status).toBe(401);
      expect(count(ctx.sql, 'analytics_events')).toBe(before);
    });
  });
});

describe('collection events', () => {
  it('logs the starter once and nothing for a refused second pick', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const secret = await ctx.core.createSession(ctx.guildId, USER);
      const bad = await call(ctx, secret, 'POST', '/api/starter', {
        species: 'zipmouse',
        idempotencyKey: newKey(),
      });
      expect(bad.status).toBe(400);
      expect(events(ctx.sql, 'starter_chosen')).toEqual([]);
      expect(
        (
          await call(ctx, secret, 'POST', '/api/starter', {
            species: 'cindle',
            idempotencyKey: newKey(),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await call(ctx, secret, 'POST', '/api/starter', {
            species: 'cindle',
            idempotencyKey: newKey(),
          })
        ).status,
      ).toBe(409);
      expect(events(ctx.sql, 'starter_chosen')).toMatchObject([
        {
          props: { species: 'cindle' },
          actor_hash: await actorHash(env.DISCORD_CLIENT_SECRET, USER_ID),
        },
      ]);
    });
  });

  it('logs a send once, and no second event for a retry, an unaffordable or a refused send', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const { secret, starterId } = await joinWithStarter(ctx, USER, 100);
      const key = newKey();
      stock(ctx.sql, USER_ID, 'lure-good', 2);
      const first = await send(ctx, secret, starterId, 'medium', [own('lure-good')], key);
      expect(first.status).toBe(200);
      expect(events(ctx.sql, 'expedition_send')).toMatchObject([
        {
          props: {
            species: 'splashet',
            duration: 'medium',
            destination: 'tidepools',
            supplies: ['lure-good'],
            rank: 1,
          },
        },
      ]);
      expect(events(ctx.sql, 'expedition_send')[0]?.props).not.toHaveProperty('bought');
      // The same key again replays the stored result: no new event.
      expect((await send(ctx, secret, starterId, 'medium', [own('lure-good')], key)).status).toBe(
        200,
      );
      // The explorer is away: refused, nothing logged.
      expect((await send(ctx, secret, starterId)).status).toBe(409);
      // A player without that supply: refused, nothing logged.
      const broke = await ctx.core.createSession(ctx.guildId, OTHER);
      await call(ctx, broke, 'POST', '/api/starter', {
        species: 'cindle',
        idempotencyKey: newKey(),
      });
      const state = (await call(ctx, broke, 'GET', '/api/state')).body['creatures'] as {
        id: string;
      }[];
      const refused = await send(ctx, broke, (state[0] as { id: string }).id, 'long', [
        own('lure-great'),
      ]);
      expect(refused.status).toBe(409);
      expect(events(ctx.sql, 'expedition_send')).toHaveLength(1);
    });
  });

  it('logs a claim with its catches and their talents, and a talent roll for the duplicate, once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const joined = await joinWithStarter(ctx, USER, 100);
        const { starterId } = joined;
        let secret = joined.secret;
        ctx.sql.exec('UPDATE player_progress SET expeditions_claimed = 1');
        const exp = expeditionOf(await send(ctx, secret, starterId));
        ctx.clock.t = exp.endsAt + 90 * MINUTE;
        secret = await signIn(ctx, USER);
        const rollsBefore = events(ctx.sql, 'talent_roll').length;
        const res = await call(ctx, secret, 'POST', `/api/expeditions/${exp.id}/claim`, {});
        expect(res.status).toBe(200);
        expect(events(ctx.sql, 'expedition_claim')).toMatchObject([
          {
            props: {
              duration: 'short',
              destination: 'tidepools',
              supplies: [],
              waitedMin: 90,
              catches: [
                { species: 'splashet', rarity: 'common', shiny: true, result: 'duplicate' },
              ],
              pushOn: 'none',
              xp: RULES.expeditions.lengths.short.ticks * RULES.expeditions.tick.xp,
              // The scripted catch is a shiny: a star on its own.
              stars: 1,
            },
          },
        ]);
        const claimed = events(ctx.sql, 'expedition_claim')[0]?.props as {
          catches: { talent: string; golden: boolean }[];
        };
        const rolls = events(ctx.sql, 'talent_roll');
        expect(rolls).toHaveLength(rollsBefore + 1);
        expect(rolls.at(-1)?.props).toMatchObject({
          species: 'splashet',
          talent: claimed.catches[0]?.talent,
          golden: claimed.catches[0]?.golden,
        });
        // The duplicate waits: nothing fused, so there is no fuse event yet.
        expect(events(ctx.sql, 'fuse')).toEqual([]);
        expect(events(ctx.sql, 'expedition_recall')).toEqual([]);
        // Claiming again returns the stored result and logs nothing more.
        const again = await call(ctx, secret, 'POST', `/api/expeditions/${exp.id}/claim`, {});
        expect(again.body['result']).toEqual(res.body['result']);
        expect(events(ctx.sql, 'expedition_claim')).toHaveLength(1);
        expect(events(ctx.sql, 'talent_roll')).toHaveLength(rollsBefore + 1);
        // An unknown expedition is refused and logs nothing.
        const missing = await call(
          ctx,
          secret,
          'POST',
          '/api/expeditions/00000000-0000-4000-8000-000000000000/claim',
          {},
        );
        expect(missing.status).toBe(404);
        expect(events(ctx.sql, 'expedition_claim')).toHaveLength(1);
      },
      { rng: scriptedRng([...SPLASHET_SHINY, ...THEN_MISS]) },
    );
  });

  it('logs the answer to a duplicate as a choice, and a fusion as a fuse, once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const joined = await joinWithStarter(ctx, USER, 100);
        const { starterId } = joined;
        let secret = joined.secret;
        ctx.sql.exec('UPDATE player_progress SET expeditions_claimed = 1');
        const exp = expeditionOf(await send(ctx, secret, starterId));
        ctx.clock.t = exp.endsAt;
        secret = await signIn(ctx, USER);
        const claimed = await call(ctx, secret, 'POST', `/api/expeditions/${exp.id}/claim`, {});
        const card = (claimed.body['state'] as { pending: { id: string }[] }).pending[0];
        const key = newKey();
        const choose = () =>
          call(ctx, secret, 'POST', `/api/catches/${card?.id ?? ''}/choose`, {
            choice: 'fuse',
            creatureId: starterId,
            idempotencyKey: key,
          });
        expect((await choose()).status).toBe(200);
        expect(events(ctx.sql, 'fuse')).toMatchObject([
          {
            props: {
              species: 'splashet',
              rarity: 'common',
              converted: false,
              fusionCount: 1,
              bait: 0,
            },
          },
        ]);
        expect(events(ctx.sql, 'duplicate_choice')).toMatchObject([
          { props: { choice: 'fuse', auto: false, species: 'splashet', rarity: 'common' } },
        ]);
        // A retry with the same key returns the stored answer and logs nothing more.
        expect((await choose()).status).toBe(200);
        expect(events(ctx.sql, 'fuse')).toHaveLength(1);
        expect(events(ctx.sql, 'duplicate_choice')).toHaveLength(1);
      },
      { rng: scriptedRng([...SPLASHET_PLAIN, ...THEN_MISS]) },
    );
  });

  it('logs a recall as a recall, with how much of the trip had passed', async () => {
    const restore = certainCatches();
    try {
      await runCore(
        nextGuild(),
        async (ctx) => {
          const joined = await joinWithStarter(ctx, USER, 200);
          const { starterId } = joined;
          let secret = joined.secret;
          ctx.sql.exec('UPDATE player_progress SET expeditions_claimed = 1');
          stock(ctx.sql, USER_ID, 'lure-good', 1);
          const exp = expeditionOf(await send(ctx, secret, starterId, 'long', [own('lure-good')]));
          ctx.clock.t = exp.startedAt + 8 * HOUR; // two thirds of 12 hours
          secret = await signIn(ctx, USER);
          const res = await call(ctx, secret, 'POST', `/api/expeditions/${exp.id}/claim`, {});
          expect(res.status).toBe(200);
          expect(events(ctx.sql, 'expedition_claim')).toEqual([]);
          expect(events(ctx.sql, 'expedition_recall')).toMatchObject([
            {
              props: {
                duration: 'long',
                destination: 'tidepools',
                supplies: ['lure-good'],
                elapsedPct: 66,
                // 8 of 12 hours: eight ticks, each of them a creature (the chance is made certain).
                catches: Array.from({ length: 8 }, () => ({
                  species: expect.any(String) as string,
                })),
              },
            },
          ]);
          // The replay logs nothing.
          await call(ctx, secret, 'POST', `/api/expeditions/${exp.id}/claim`, {});
          expect(events(ctx.sql, 'expedition_recall')).toHaveLength(1);
        },
        { rng: createSeededRng('recall-log') },
      );
    } finally {
      restore();
    }
  });

  it('logs an evolution once and nothing for a retry or a refusal', async () => {
    await runRaid(async (ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 2, level: 15, species: ['splashet', 'stormray'] });
      const secret = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
      ctx.core.credit({
        userId: p.id,
        currency: 'essence',
        amount: 50,
        source: 'raid',
        idempotencyKey: 'seed:essence',
      });
      const evolve = (id: string, key: string) =>
        call(ctx, secret, 'POST', `/api/creatures/${id}/evolve`, { idempotencyKey: key });
      const key = newKey();
      expect((await evolve(p.creatureIds[0] as string, key)).status).toBe(200);
      expect(events(ctx.sql, 'evolve')).toMatchObject([
        { props: { from: 'splashet', to: 'tidewing', cost: 20 } },
      ]);
      expect((await evolve(p.creatureIds[0] as string, key)).status).toBe(200); // retry
      expect((await evolve(p.creatureIds[0] as string, newKey())).status).toBe(409); // already evolved
      expect(events(ctx.sql, 'evolve')).toHaveLength(1);
    });
  });
});

/** Seeds players in the roster of week 2027-W02 and opens it. */
function twoPlayers(ctx: CoreContext): Seeded[] {
  const players = [
    seedPlayer(ctx, 1, { level: BELOW_UNLOCK, creatures: 4 }),
    seedPlayer(ctx, 2, { level: BELOW_UNLOCK, creatures: 4 }),
  ];
  ctx.core.raid.currentWeek(HELSINKI);
  return players;
}

describe('raid roster, team and ability events', () => {
  it('logs nothing for the retired sit-out route', async () => {
    await runRaid(async (ctx) => {
      const [p] = twoPlayers(ctx) as [Seeded, Seeded];
      await ctx.core.analytics.prepare(p.id);
      expect(ctx.core.raid.setOptOut(HELSINKI).ok).toBe(true);
      expect(ctx.core.raid.setOptOut(HELSINKI).ok).toBe(true);
      expect(events(ctx.sql, 'roster_optout')).toHaveLength(0);
    });
  });

  it('logs placements and removals, and nothing for the same slot or an empty removal', async () => {
    await runRaid(async (ctx) => {
      const [p] = twoPlayers(ctx) as [Seeded, Seeded];
      await ctx.core.analytics.prepare(p.id);
      const team = (ctx.core.raid.view(p.id, HELSINKI).you.team?.creatures ?? []).map((c) => ({
        id: c.creatureId,
        species: c.species,
      }));
      const [a, b] = team as unknown as [
        { id: string; species: string },
        { id: string; species: string },
      ];
      expect(ctx.core.raid.place(p.id, HELSINKI, a.id, 4).ok).toBe(true);
      expect(ctx.core.raid.place(p.id, HELSINKI, a.id, 4).ok).toBe(true); // same slot
      expect(ctx.core.raid.place(p.id, HELSINKI, b.id, 4).ok).toBe(true); // takes the slot (a swaps out)
      expect(ctx.core.raid.place(p.id, HELSINKI, b.id, 99)).toMatchObject({ ok: false });
      // `a` left the row when `b` took its slot, so there is nothing to remove for it.
      expect(ctx.core.raid.unplace(p.id, HELSINKI, a.id).ok).toBe(true);
      expect(ctx.core.raid.unplace(p.id, HELSINKI, b.id).ok).toBe(true);
      expect(ctx.core.raid.unplace(p.id, HELSINKI, b.id).ok).toBe(true); // nothing to remove
      const logged = events(ctx.sql, 'placement').map((e) => e.props);
      expect(logged).toEqual([
        { action: 'place', species: a.species, slot: 4, swap: false },
        { action: 'place', species: b.species, slot: 4, swap: true },
        { action: 'unplace', species: b.species, slot: 4, swap: false },
      ]);
    });
  });

  it('logs an ability pick when it changes, and nothing for the same pick or an unknown one', async () => {
    await runRaid(async (ctx) => {
      const [p] = twoPlayers(ctx) as [Seeded, Seeded];
      await ctx.core.analytics.prepare(p.id);
      const basics = content.finaleAbilities.filter((a) => a.kind === 'basic');
      const [x, y] = basics as unknown as [{ id: string }, { id: string }];
      expect(ctx.core.raid.setAbility(p.id, HELSINKI, x.id).ok).toBe(true);
      expect(ctx.core.raid.setAbility(p.id, HELSINKI, x.id).ok).toBe(true);
      expect(ctx.core.raid.setAbility(p.id, HELSINKI, 'not-an-ability')).toMatchObject({
        ok: false,
      });
      expect(ctx.core.raid.setAbility(p.id, HELSINKI, y.id).ok).toBe(true);
      expect(events(ctx.sql, 'ability_pick').map((e) => e.props)).toEqual([
        { ability: x.id },
        { ability: y.id },
      ]);
    });
  });

  it('logs Auto fire toggles when the value changes', async () => {
    await runRaid(async (ctx) => {
      const [p] = twoPlayers(ctx) as [Seeded, Seeded];
      await ctx.core.analytics.prepare(p.id);
      const first = ctx.core.raid.view(p.id, HELSINKI).you.team?.creatures[0];
      if (first === undefined) throw new Error('no team');
      const creature = { id: first.creatureId, species: first.species };
      const set = (target: string, on: boolean) =>
        ctx.core.raid.setAutofire(p.id, HELSINKI, target, on);
      expect(set('basic', true).ok).toBe(true); // already on by default: no change
      expect(set('basic', false).ok).toBe(true);
      expect(set('basic', false).ok).toBe(true); // repeat
      expect(set(creature.id, false).ok).toBe(true);
      expect(set('00000000-0000-4000-8000-000000000000', false)).toMatchObject({ ok: false });
      expect(set('basic', true).ok).toBe(true);
      expect(events(ctx.sql, 'autofire_toggle').map((e) => e.props)).toEqual([
        { target: 'basic', species: null, on: false },
        { target: 'creature', species: creature.species, on: false },
        { target: 'basic', species: null, on: true },
      ]);
    });
  });

  it('logs nothing for a player who is not in the roster', async () => {
    await runRaid(async (ctx) => {
      twoPlayers(ctx);
      await ctx.core.analytics.prepare('999999999999999999');
      expect(ctx.core.raid.place('999999999999999999', HELSINKI, 'whatever', 0)).toMatchObject({
        ok: false,
      });
      expect(ctx.core.raid.setAbility('999999999999999999', HELSINKI, 'whatever')).toMatchObject({
        ok: false,
      });
      expect(events(ctx.sql)).toEqual([]);
    });
  });
});

/** Seeds players, opens the week and resolves phases 1 and 2; leaves the clock before the finale. */
function toFinale(ctx: CoreContext): Seeded[] {
  const players = twoPlayers(ctx);
  ctx.clock.t = W02.afterPhase2;
  ctx.core.raid.runDue(HELSINKI);
  // A pool nobody can empty, so the finale lasts every round.
  forcePool(ctx.sql, 50_000_000, 50_000_000, 1);
  ctx.clock.t = FINALE - 10 * MINUTE;
  return players;
}

const aliasOf = (ctx: CoreContext, p: Seeded): string =>
  `m${membersOf(ctx.sql, 1).indexOf(p.id) + 1}`;
const scheduleOf = (ctx: CoreContext) => {
  const row = loadLive(ctx.sql, W02.id, 1, false);
  if (row === null) throw new Error('no stored fight');
  return roundStartsOf(row, evaluate(row, ctx.clock.t).result);
};

describe('live finale events', () => {
  it('logs one join per player however often they poll, with the stage they joined in', async () => {
    await runRaid(async (ctx) => {
      const [a, b] = toFinale(ctx) as [Seeded, Seeded];
      await ctx.core.analytics.prepare(a.id);
      await ctx.core.analytics.prepare(b.id);
      ctx.clock.t = FINALE - 2 * MINUTE; // the lobby is open
      for (let i = 0; i < 3; i++) ctx.core.raid.liveSnapshot(a.id, HELSINKI);
      expect(events(ctx.sql, 'live_join')).toMatchObject([
        {
          props: { stage: 'lobby', practice: false },
          actor_hash: ctx.core.analytics.hashFor(a.id),
        },
      ]);

      ctx.clock.t = FINALE;
      ctx.core.raid.runDue(HELSINKI);
      ctx.core.raid.liveSnapshot(a.id, HELSINKI); // joined in the lobby already
      ctx.clock.t = FINALE + 5000;
      ctx.core.raid.liveSnapshot(b.id, HELSINKI);
      ctx.core.raid.liveSnapshot(b.id, HELSINKI);
      expect(events(ctx.sql, 'live_join').map((e) => e.props)).toEqual([
        { stage: 'lobby', practice: false },
        { stage: 'fight', practice: false },
      ]);
      expect(count(ctx.sql, 'analytics_once')).toBe(2);
      // After a restart the in-memory marks are gone, but the stored ones still say "already joined".
      const restarted = new Analytics({
        storage: ctx.storage,
        now: () => ctx.clock.t,
        secret: env.DISCORD_CLIENT_SECRET,
      });
      await restarted.prepare(a.id);
      expect(restarted.once(a.id, `join:${W02.id}:real`)).toBe(false);
      expect(restarted.once(a.id, 'a-new-label')).toBe(true);
    });
  });

  it('does not count a look at a finished fight as a join', async () => {
    await runRaid(async (ctx) => {
      const [a] = toFinale(ctx) as [Seeded, Seeded];
      await ctx.core.analytics.prepare(a.id);
      ctx.clock.t = FINALE;
      ctx.core.raid.runDue(HELSINKI);
      ctx.clock.t = scheduleOf(ctx).endsAt + 1000;
      ctx.core.raid.liveSnapshot(a.id, HELSINKI);
      expect(events(ctx.sql, 'live_join')).toEqual([]);
    });
  });

  it('logs Fire, Hold and Unhold with the round and the default round, and nothing for refusals', async () => {
    await runRaid(async (ctx) => {
      const [a, b] = toFinale(ctx) as [Seeded, Seeded];
      await ctx.core.analytics.prepare(a.id);
      await ctx.core.analytics.prepare(b.id);
      ctx.clock.t = FINALE;
      ctx.core.raid.runDue(HELSINKI);
      ctx.clock.t = (scheduleOf(ctx).starts[0] as number) + 1000; // in round 1
      const act = (p: Seeded, action: 'fire' | 'hold' | 'unhold') =>
        ctx.core.raid.liveAction(p.id, HELSINKI, { action, key: `${aliasOf(ctx, p)}:basic` });

      expect(act(a, 'fire').ok).toBe(true);
      expect(act(a, 'fire')).toMatchObject({ ok: false, error: 'already_fired' });
      expect(act(b, 'hold').ok).toBe(true);
      expect(act(b, 'hold').ok).toBe(true); // already held: nothing changes
      expect(act(b, 'unhold').ok).toBe(true);
      expect(act(b, 'unhold')).toMatchObject({ ok: false, error: 'not_held' });

      const logged = events(ctx.sql, 'live_action');
      expect(logged.map((e) => [e.props['action'], e.actor_hash])).toEqual([
        ['fire', ctx.core.analytics.hashFor(a.id)],
        ['hold', ctx.core.analytics.hashFor(b.id)],
        ['unhold', ctx.core.analytics.hashFor(b.id)],
      ]);
      expect(logged[0]?.props).toMatchObject({ round: 2, practice: false });
      expect(logged[0]?.props['defaultRound']).toEqual(expect.any(Number));
      expect(logged[1]?.props).toMatchObject({ round: 1 });
      expect(content.finaleAbilities.map((x) => x.id)).toContain(logged[0]?.props['ability']);
      // Players who opened the fight by acting have joined it too: one join each.
      expect(events(ctx.sql, 'live_join')).toHaveLength(2);
    });
  });

  it('logs guild-level phase results, one rank change and no second copy when run again', async () => {
    await runRaid(async (ctx) => {
      const [a] = toFinale(ctx) as [Seeded, Seeded];
      await ctx.core.analytics.prepare(a.id);
      ctx.clock.t = FINALE;
      ctx.core.raid.runDue(HELSINKI);
      ctx.clock.t = scheduleOf(ctx).endsAt + 1000;
      ctx.core.raid.liveSnapshot(a.id, HELSINKI); // the read that sees the end resolves it
      const runs = storedRuns(ctx.sql);
      expect(runs.map((r) => r.phase)).toEqual(['phase1', 'phase2', 'finale']);

      // The profile counts the reactions every member saw in the three phases.
      const reactions = runs.reduce((n, r) => n + r.result.reactions.total, 0);
      expect(reactions).toBeGreaterThan(0);
      expect(
        rows<{ value: number }>(
          ctx.sql,
          "SELECT value FROM account_stats WHERE user_id = ? AND stat = 'reactions_seen'",
          a.id,
        )[0]?.value,
      ).toBe(reactions);

      const results = events(ctx.sql, 'phase_result');
      expect(results.map((e) => e.props['phase'])).toEqual(['phase1', 'phase2', 'finale']);
      const week = rows<{ boss_id: string; rank: number; effective_rank: number }>(
        ctx.sql,
        'SELECT boss_id, rank, effective_rank FROM raid_weeks WHERE week_id = ?',
        W02.id,
      )[0];
      results.forEach((event, i) => {
        const run = runs[i];
        const total = run?.summary.damage ?? 0;
        const top = Math.max(...(run?.summary.contributors ?? []).map((c) => c.damage));
        expect(event.actor_hash).toBeNull(); // guild-level: no player
        expect(Object.keys(event.props).sort()).toEqual(
          ['boss', 'festival', 'partySize', 'phase', 'rank', 'rounds', 'topShareBp', 'win'].sort(),
        );
        expect(event.props).toMatchObject({
          boss: week?.boss_id,
          rank: week?.effective_rank,
          partySize: 2,
          win: run?.summary.cleared,
          rounds: run?.result.rounds,
          topShareBp: total > 0 ? Math.floor((top * 10_000) / total) : 0,
        });
        expect(event.props['topShareBp']).toBeLessThanOrEqual(10_000);
      });

      const ladder = events(ctx.sql, 'rank_change');
      const stored = rows<{ rank_after: number; ladder_won: number }>(
        ctx.sql,
        'SELECT rank_after, ladder_won FROM raid_weeks WHERE week_id = ?',
        W02.id,
      )[0];
      expect(ladder).toHaveLength(1);
      expect(ladder[0]?.actor_hash).toBeNull();
      expect(ladder[0]?.props).toMatchObject({
        before: week?.rank,
        after: stored?.rank_after,
        won: stored?.ladder_won === 1,
        parties: 1,
      });

      // Everything is resolved already: running the events and reads again logs nothing.
      const total = count(ctx.sql, 'analytics_events');
      ctx.core.raid.runDue(HELSINKI);
      ctx.core.raid.settleDueLive();
      ctx.core.raid.liveSnapshot(a.id, HELSINKI);
      expect(count(ctx.sql, 'analytics_events')).toBe(total);
    });
  });

  it('logs a Festival grant by species and result, once, with no player', async () => {
    await runRaid((ctx) => {
      const species = content.creatures.find((c) => c.festival === true);
      if (species === undefined) throw new Error('content has no Festival species');
      const p = seedPlayer(ctx, 1);
      const grant = () =>
        grantFestivalCreature(
          ctx.storage,
          { quirk: createSeededRng('festival'), talent: createSeededRng('festival-talent') },
          W02.id,
          p.id,
          species.id,
          ctx.clock.t,
          ctx.core.analytics,
        );
      expect(grant()).toMatchObject({ outcome: 'new' });
      expect(grant()).toBeNull(); // already granted
      expect(events(ctx.sql, 'festival_grant')).toMatchObject([
        { actor_hash: null, props: { species: species.id, result: 'new' } },
      ]);
    });
  });
});

describe('Discord post delivery events', () => {
  const CHANNEL = '555555555555555555';

  it('logs sent, retry and failed kinds without any post content', async () => {
    const log = captureConsole();
    const outcomes = [
      { kind: 'sent' as const },
      { kind: 'retry' as const, error: 'server_error' as const, afterMs: null },
      { kind: 'failed' as const, error: 'forbidden' as const },
    ];
    const send: PostSender = () => {
      const next = outcomes.shift();
      return Promise.resolve(next ?? { kind: 'sent' });
    };
    await runCore(
      nextGuild(),
      async (ctx) => {
        await ctx.core.createSession(ctx.guildId, USER, CHANNEL);
        for (const key of ['a', 'b', 'c']) {
          enqueuePost(ctx.sql, { key, content: `top secret text ${key}` }, ctx.clock.t);
        }
        await ctx.core.deliverPosts();
        expect(events(ctx.sql, 'post_result').map((e) => e.props)).toEqual([
          { result: 'sent', error: null, attempts: 1 },
          { result: 'retry', error: 'server_error', attempts: 1 },
          { result: 'failed', error: 'forbidden', attempts: 1 },
        ]);
        expect(events(ctx.sql, 'post_result').every((e) => e.actor_hash === null)).toBe(true);
        expect(JSON.stringify(events(ctx.sql))).not.toContain('top secret');
        // The server's own log carries the kind of the failure only, never the post.
        expect(log.text()).toContain('discord post failed');
        expect(log.text()).toContain('server_error');
        expect(log.text()).toContain('forbidden');
        expect(log.text()).not.toContain('top secret');
      },
      { postSender: send },
    );
  });

  it('logs a retry that has run out of attempts as failed', async () => {
    await runCore(nextGuild(), async (ctx) => {
      await ctx.core.createSession(ctx.guildId, USER, CHANNEL);
      enqueuePost(ctx.sql, { key: 'a', content: 'x' }, ctx.clock.t);
      const post = { id: 1, channelId: CHANNEL, content: 'x', attempts: 5 };
      recordOutcome(
        ctx.sql,
        post,
        { kind: 'retry', error: 'timeout', afterMs: null },
        ctx.clock.t,
        ctx.core.analytics,
      );
      expect(events(ctx.sql, 'post_result').map((e) => e.props)).toEqual([
        { result: 'failed', error: 'timeout', attempts: 5 },
      ]);
    });
  });
});

describe('retention', () => {
  const insert = (sql: SqlStorage, at: number, kind = 'train') =>
    sql.exec(
      'INSERT INTO analytics_events (at, kind, actor_hash, props_json) VALUES (?, ?, NULL, ?)',
      at,
      kind,
      '{}',
    );

  it('prunes only rows older than 90 days, from the guild alarm', async () => {
    await runCore(nextGuild(), async (ctx) => {
      await ctx.core.createSession(ctx.guildId, USER);
      const now = ctx.clock.t;
      insert(ctx.sql, now - 200 * DAY, 'old-a');
      insert(ctx.sql, now - RETENTION_MS - 1, 'old-b');
      insert(ctx.sql, now - RETENTION_MS, 'edge');
      insert(ctx.sql, now - 89 * DAY, 'recent');
      insert(ctx.sql, now, 'now');
      ctx.sql.exec(
        'INSERT INTO analytics_seen (actor_hash, last_at) VALUES (?, ?)',
        'old',
        now - 120 * DAY,
      );
      ctx.sql.exec(
        'INSERT INTO analytics_seen (actor_hash, last_at) VALUES (?, ?)',
        'new',
        now - 1 * DAY,
      );
      ctx.sql.exec('INSERT INTO analytics_once (key, at) VALUES (?, ?)', 'old', now - 120 * DAY);
      ctx.sql.exec('INSERT INTO analytics_once (key, at) VALUES (?, ?)', 'new', now - 1 * DAY);

      await ctx.core.alarm();

      expect(kinds(ctx.sql)).toEqual(['edge', 'recent', 'now']);
      expect(rows(ctx.sql, 'SELECT actor_hash FROM analytics_seen')).toEqual([
        { actor_hash: 'new' },
      ]);
      expect(rows(ctx.sql, 'SELECT key FROM analytics_once')).toEqual([{ key: 'new' }]);
    });
  });

  it('works through a large backlog in bounded batches and asks to continue', async () => {
    await runCore(nextGuild(), ({ core, sql, clock }) => {
      for (let i = 0; i < 10_050; i++) insert(sql, clock.t - 100 * DAY + i);
      insert(sql, clock.t, 'keep');
      expect(core.analytics.prune()).toBe(true);
      expect(count(sql, 'analytics_events')).toBe(51);
      expect(core.analytics.prune()).toBe(false);
      expect(kinds(sql)).toEqual(['keep']);
      return Promise.resolve();
    });
  });

  it('the alarm comes back soon while a backlog is left, and not after', async () => {
    await runCore(nextGuild(), async ({ core, sql, clock, storage }) => {
      for (let i = 0; i < 10_050; i++) insert(sql, clock.t - 100 * DAY + i);
      await core.alarm();
      const soon = await storage.getAlarm();
      expect(soon).not.toBeNull();
      expect((soon as number) - clock.t).toBeLessThanOrEqual(2 * MINUTE);
      await core.alarm();
      expect(count(sql, 'analytics_events')).toBe(0);
      // Nothing is left to prune: the next alarm is for the raid calendar, not for pruning.
      await storage.deleteAlarm();
      await core.alarm();
      const next = await storage.getAlarm();
      expect(next === null || next - clock.t > 2 * MINUTE).toBe(true);
    });
  });
});

describe('transactions', () => {
  it('an event exists only if the surrounding transaction committed', async () => {
    await runCore(nextGuild(), async (ctx) => {
      await ctx.core.analytics.prepare(USER_ID);
      expect(() =>
        ctx.storage.transactionSync(() => {
          ctx.core.analytics.record(
            { kind: 'train', species: 'splashet', level: 2, cost: 3 },
            USER_ID,
          );
          throw new Error('the action failed after logging');
        }),
      ).toThrow('the action failed');
      expect(events(ctx.sql)).toEqual([]);
      ctx.storage.transactionSync(() =>
        ctx.core.analytics.record(
          { kind: 'train', species: 'splashet', level: 2, cost: 3 },
          USER_ID,
        ),
      );
      expect(kinds(ctx.sql)).toEqual(['train']);
    });
  });

  it('a failing write never breaks the action it describes', async () => {
    const log = captureConsole();
    await runCore(nextGuild(), ({ core, sql }) => {
      sql.exec('DROP TABLE analytics_events');
      expect(() => core.analytics.record({ kind: 'roster_optout', optOut: true })).not.toThrow();
      // Only the kind of the error is logged, not its message (which names the table).
      expect(log.text()).toBe('analytics write failed Error');
      expect(log.text()).not.toContain('analytics_events');
      return Promise.resolve();
    });
  });
});

/** Every string that may appear as a prop value: content ids and the fixed enums. */
function vocabulary(): Set<string> {
  return new Set<string>([
    'unknown',
    ...EXPEDITION_LENGTHS,
    ...GOAL_RISKS,
    'basic',
    'any',
    'none',
    'worked',
    'declined',
    'new',
    'duplicate',
    'fused',
    'converted',
    'teach',
    'fuse',
    'release',
    'keep',
    'place',
    'unplace',
    'creature',
    'lobby',
    'fight',
    'fire',
    'hold',
    'unhold',
    'phase1',
    'phase2',
    'finale',
    'sent',
    'retry',
    'failed',
    'rate_limited',
    'server_error',
    'network',
    'timeout',
    'forbidden',
    'not_found',
    'rejected',
    'redirect',
    ...RARITIES,
    ...GEAR_RARITIES,
    ...JOB_KINDS,
    ...GEAR_SOURCES,
    'equip',
    'unequip',
    'hat',
    'scarf',
    'charm',
    ...gearContent.bases.map((b) => b.id),
    ...expeditionContent.destinations.map((d) => d.id),
    ...expeditionContent.supplies.map((s) => s.id),
    ...expeditionContent.goals.map((g) => g.id),
    ...expeditionContent.journal.entries.map((e) => e.id),
    ...expeditionContent.journal.sets.map((s) => s.id),
    ...gearContent.lines.map((l) => l.id),
    ...talentContent.byId.keys(),
    ...content.creatures.map((c) => c.id),
    ...content.bosses.map((b) => b.id),
    ...content.finaleAbilities.map((a) => a.id),
    ...dungeonContent.modifiers.map((m) => m.id),
    // The map runs: keepsakes, events, the node kinds of a path, how a run ended and the camp's choice.
    ...dungeonKeepsakes.map((k) => k.id),
    ...dungeonEvents.map((e) => e.id),
    'mystery',
    'cache',
    'camp',
    'elite',
    'boss',
    'cleared',
    'home',
    'defeat',
    'rest',
    'swap',
    'keepsake',
    'setter',
    'payoff',
    'support',
    'guard',
    // Where experience came from, the ribbons and the pity kinds (Creatures B).
    'trip',
    'dungeon',
    'raid',
    'job',
    'ribbon',
    'evolve',
    'bronze',
    'silver',
    'gold',
  ]);
}

/** The keys and the string values of a parsed props object, separately. */
function walk(
  value: unknown,
  found: { keys: string[]; values: string[] } = { keys: [], values: [] },
): { keys: string[]; values: string[] } {
  if (typeof value === 'string') found.values.push(value);
  else if (Array.isArray(value)) for (const item of value) walk(item, found);
  else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      found.keys.push(key);
      walk(item, found);
    }
  }
  return found;
}

describe('privacy', () => {
  it('writes no user id, name, nickname, guild or secret into any event, across a broad scenario', async () => {
    const NICKNAME = 'Zorblax';
    const sender: PostSender = () => Promise.resolve({ kind: 'sent' });
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = W02.monday;
        // Collection: two players, a nickname, training, a recall and a claim.
        const a = await joinWithStarter(ctx, USER, 400);
        const b = await joinWithStarter(ctx, OTHER, 400, 'cindle');
        const nick = await call(ctx, a.secret, 'PATCH', `/api/creatures/${a.starterId}`, {
          nickname: NICKNAME,
        });
        expect(nick.status).toBe(200);
        ctx.sql.exec('UPDATE player_progress SET expeditions_claimed = 1');
        await call(ctx, a.secret, 'POST', `/api/creatures/${a.starterId}/train`, {
          idempotencyKey: newKey(),
        });
        stock(ctx.sql, USER_ID, 'lure-good', 1);
        const exp = expeditionOf(
          await send(ctx, a.secret, a.starterId, 'long', [own('lure-good')]),
        );
        const exp2 = expeditionOf(await send(ctx, b.secret, b.starterId));
        ctx.clock.t = exp.startedAt + 8 * HOUR;
        // Sessions idle out after an hour: sign in again after the jump.
        a.secret = await ctx.core.createSession(ctx.guildId, USER, '555555555555555555');
        b.secret = await ctx.core.createSession(ctx.guildId, OTHER);
        await call(ctx, a.secret, 'POST', `/api/expeditions/${exp.id}/claim`, {});
        await call(ctx, b.secret, 'POST', `/api/expeditions/${exp2.id}/claim`, {});
        // Expeditions v2: a trip with a supply from stock, a risky end-of-trip goal that is taken, the
        // claim, a journal page and the profile (rank, familiarity and journal events).
        ctx.sql.exec(
          `INSERT INTO supplies (user_id, supply_id, amount) VALUES (?, 'lure-great', 1)
           ON CONFLICT(user_id, supply_id) DO UPDATE SET amount = 1`,
          USER_ID,
        );
        ctx.sql.exec(
          `INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES (?, ?, ?, 0)
           ON CONFLICT(user_id, creature_id) DO UPDATE SET xp = excluded.xp`,
          USER_ID,
          a.starterId,
          RULES.expeditions.rank.xpForRank[2] ?? 0,
        );
        a.secret = await ctx.core.createSession(ctx.guildId, USER, '555555555555555555');
        const v2 = expeditionOf(
          await call(ctx, a.secret, 'POST', '/api/expeditions', {
            creatureId: a.starterId,
            destination: 'tidepools',
            duration: 'long',
            supplies: [{ id: 'lure-great', source: 'owned' }],
            idempotencyKey: newKey(),
          }),
        );
        ctx.clock.t = v2.endsAt;
        a.secret = await ctx.core.createSession(ctx.guildId, USER, '555555555555555555');
        const offered = (
          (await call(ctx, a.secret, 'GET', '/api/state')).body as {
            expeditions: { id: string; offer: { goals: { id: string }[] } | null }[];
          }
        ).expeditions.find((e) => e.id === v2.id);
        const goal = offered?.offer?.goals.at(-1)?.id;
        expect(goal).toBeDefined();
        const chosen = await call(ctx, a.secret, 'POST', `/api/expeditions/${v2.id}/push-on`, {
          goalId: goal,
        });
        expect(chosen.status).toBe(200);
        ctx.clock.t += 6 * HOUR;
        a.secret = await ctx.core.createSession(ctx.guildId, USER, '555555555555555555');
        await call(ctx, a.secret, 'POST', `/api/expeditions/${v2.id}/claim`, {});
        await call(ctx, a.secret, 'GET', '/api/profile');
        await call(ctx, a.secret, 'GET', '/api/destinations');
        // Gear and the workshop: the welcome kit, equip, a craft and a dismantle job. Every one of them is logged with content ids and numbers only.
        const kit = (await call(ctx, a.secret, 'GET', '/api/gear')).body as {
          items: { id: string }[];
        };
        // The trips may have found pieces too (a tick may), and a piece made for another role does not
        // fit this explorer: wear the first one that does.
        for (const item of kit.items) {
          const worn = await call(ctx, a.secret, 'POST', `/api/gear/${item.id}/equip`, {
            creatureId: a.starterId,
          });
          if (worn.status === 200) break;
        }
        // A base this Crafting level can make (a better base needs a higher level).
        const blueprint = rows<{ base_id: string }>(
          ctx.sql,
          'SELECT base_id FROM blueprints WHERE user_id = ? ORDER BY base_id',
          USER_ID,
        ).find((r) => craftLevelNeeded(r.base_id) === 1)?.base_id as string;
        creditParts(ctx.sql, USER_ID, {
          scrap: 30,
          'tide-shard': 2,
          'ember-shard': 2,
          'grove-shard': 2,
          'spark-shard': 2,
        });
        const crafting = await call(ctx, a.secret, 'POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: a.starterId,
          blueprintId: blueprint,
          idempotencyKey: newKey(),
        });
        expect(crafting.status).toBe(200);
        ctx.clock.t += 5 * HOUR;
        a.secret = await ctx.core.createSession(ctx.guildId, USER, '555555555555555555');
        const craftJob = (crafting.body['result'] as { jobId: string }).jobId;
        const done = await call(ctx, a.secret, 'POST', `/api/workshop/jobs/${craftJob}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(done.status).toBe(200);
        const rare = giveItem(ctx.sql, USER_ID, 'thundercap', {
          rarity: 'rare',
          level: 4,
          now: ctx.clock.t,
        });
        const taking = await call(ctx, a.secret, 'POST', '/api/workshop/jobs', {
          kind: 'dismantle',
          creatureId: a.starterId,
          itemIds: [rare],
          idempotencyKey: newKey(),
        });
        expect(taking.status).toBe(200);
        ctx.clock.t += 2 * HOUR;
        a.secret = await ctx.core.createSession(ctx.guildId, USER, '555555555555555555');
        const takenJob = (taking.body['result'] as { jobId: string }).jobId;
        const taken = await call(ctx, a.secret, 'POST', `/api/workshop/jobs/${takenJob}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(taken.status).toBe(200);
        // The daily dungeon: a player with a team of three runs it (with a nickname on one creature).
        const diver = seedPlayer(ctx, 3, { name: 'Diver Dana', level: 8 });
        const diverSecret = await ctx.core.createSession(ctx.guildId, {
          id: diver.id,
          displayName: diver.name,
        });
        setCreature(ctx, diver.creatureIds[0] as string, { nickname: 'Quibbly' });
        // The run is played through the map, by way of a mystery room and the camp (foes made easy so
        // that it gets that far): every event it logs is checked below.
        const backToNormal = easyFoes();
        let route: string[] | undefined;
        const dived = await playThrough(
          (method, path, body) => call(ctx, diverSecret, method, path, body),
          { team: diver.creatureIds, idempotencyKey: newKey() },
          {
            pick: (state) => {
              route ??= routeThrough(state.map, (n) => n.kind === 'mystery');
              return followRoute(route ?? [])(state);
            },
            camp: (state) => ({
              type: 'camp',
              choice: 'keepsake',
              keepsake: state.pending?.kind === 'camp' ? (state.pending.offers[0]?.id ?? '') : '',
            }),
          },
        );
        backToNormal();
        expect(dived.status).toBe(200);
        // Sessions idle out after an hour: sign in again after the jumps.
        a.secret = await ctx.core.createSession(ctx.guildId, USER, '555555555555555555');
        b.secret = await ctx.core.createSession(ctx.guildId, OTHER);
        // Raid actions through the API.
        await call(ctx, a.secret, 'GET', '/api/raid');
        await call(ctx, a.secret, 'PUT', '/api/raid/team', { creatureIds: null });
        await call(ctx, a.secret, 'PUT', '/api/raid/placement', {
          creatureId: a.starterId,
          slot: 0,
        });
        await call(ctx, a.secret, 'PUT', '/api/raid/autofire', { target: 'basic', on: false });
        await call(ctx, b.secret, 'PUT', '/api/raid/ability', {
          abilityId: content.finaleAbilities.find((x) => x.kind === 'basic')?.id,
        });
        // The week plays out and its posts are delivered.
        ctx.clock.t = W02.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.settleDueLive();
        await ctx.core.deliverPosts();

        const all = rows<{
          id: number;
          at: number;
          kind: string;
          actor_hash: string | null;
          props_json: string;
        }>(ctx.sql, 'SELECT id, at, kind, actor_hash, props_json FROM analytics_events');
        expect(all.length).toBeGreaterThan(10);
        // A broad scenario: the main kinds were all exercised.
        const seen = new Set(all.map((e) => e.kind));
        for (const kind of [
          'session_start',
          'starter_chosen',
          'expedition_send',
          'expedition_recall',
          'expedition_claim',
          'push_on_offer',
          'push_on_choose',
          'push_on_result',
          'creature_exp',
          'placement',
          'autofire_toggle',
          'ability_pick',
          'phase_result',
          'gear_drop',
          'gear_equip',
          'gear_dismantle',
          'job_start',
          'job_claim',
          'dungeon_run',
          'dungeon_event',
          'dungeon_camp',
          'dungeon_reward',
        ]) {
          expect(seen.has(kind), kind).toBe(true);
        }

        const haystack = JSON.stringify(all);
        const secrets = [
          USER_ID,
          OTHER_USER_ID,
          USER.displayName,
          OTHER.displayName,
          'Misa',
          NICKNAME,
          'Diver Dana',
          'Quibbly',
          diver.id,
          ctx.guildId,
          '555555555555555555',
          env.DISCORD_CLIENT_SECRET,
          env.DISCORD_BOT_TOKEN,
        ];
        for (const secret of secrets) expect(haystack).not.toContain(secret);
        // The session secrets and their hashes are not in the log either.
        for (const row of rows<{ token_hash: string }>(
          ctx.sql,
          'SELECT token_hash FROM sessions',
        )) {
          expect(haystack).not.toContain(row.token_hash);
        }

        // Structure: actors are 32 hex characters, and every prop is a boolean, an integer, null or
        // a string from content or a fixed enum: nothing that could be typed by a player.
        const allowed = vocabulary();
        for (const row of all) {
          expect(row.actor_hash === null || /^[0-9a-f]{32}$/.test(row.actor_hash)).toBe(true);
          expect(row.props_json.length).toBeLessThanOrEqual(MAX_PROPS_CHARS);
          const props: unknown = JSON.parse(row.props_json);
          const { keys, values } = walk(props);
          for (const key of keys) {
            // Prop names are camelCase; the only other keys are the part kinds of a `parts` prop.
            expect(
              /^[a-z][A-Za-z]*$/.test(key) || (PART_KINDS as readonly string[]).includes(key),
            ).toBe(true);
          }
          for (const value of values) expect(allowed.has(value), value).toBe(true);
        }
      },
      {
        postSender: sender,
        raidRng: createSeededRng('privacy'),
        gearRng: createSeededRng('privacy-gear'),
        dungeonRng: createSeededRng('privacy-dungeon'),
        tripRng: createSeededRng('privacy-trip'),
      },
    );
  });
});

void LIVE_ROUND_MS;
