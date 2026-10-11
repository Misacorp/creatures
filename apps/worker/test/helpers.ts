import { expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { GuildCore, type GuildCoreOptions } from '../src/guild-core';
import { DiscordError, type DiscordApi, type GuildApi } from '../src/discord';
import { createHandler } from '../src/index';
import { formatSessionToken, getSessionKey } from '../src/session';
import type { ActivityInstance, DiscordMember, DiscordRole, DiscordUser } from '../src/schemas';

export const ORIGIN = 'https://creatures.test';

export const USER_ID = '111111111111111111';
export const OTHER_USER_ID = '222222222222222222';
export const GUILD_ID = '333333333333333333';
export const ACCESS_TOKEN = 'fake-access-token';

export interface FakeDiscordOptions {
  user?: DiscordUser;
  instance?: ActivityInstance | null;
  exchangeError?: DiscordError;
  userError?: DiscordError;
  instanceError?: DiscordError;
}

export interface FakeDiscord extends DiscordApi {
  calls: { exchangeCode: string[]; getCurrentUser: string[]; getActivityInstance: string[] };
}

export function fakeDiscord(options: FakeDiscordOptions = {}): FakeDiscord {
  const user = options.user ?? { id: USER_ID, username: 'misa', global_name: 'Misa' };
  const instance =
    options.instance === undefined
      ? { location: { guild_id: GUILD_ID }, users: [USER_ID] }
      : options.instance;
  const calls = { exchangeCode: [], getCurrentUser: [], getActivityInstance: [] } as {
    exchangeCode: string[];
    getCurrentUser: string[];
    getActivityInstance: string[];
  };
  return {
    calls,
    exchangeCode(code) {
      calls.exchangeCode.push(code);
      if (options.exchangeError) return Promise.reject(options.exchangeError);
      return Promise.resolve(ACCESS_TOKEN);
    },
    getCurrentUser(accessToken) {
      calls.getCurrentUser.push(accessToken);
      if (options.userError) return Promise.reject(options.userError);
      return Promise.resolve(user);
    },
    getActivityInstance(instanceId) {
      calls.getActivityInstance.push(instanceId);
      if (options.instanceError) return Promise.reject(options.instanceError);
      return Promise.resolve(instance);
    },
  };
}

export interface FakeGuildOptions {
  ownerId?: string;
  /** Roles besides @everyone; an @everyone role (id = the guild id) is added unless given. */
  roles?: DiscordRole[];
  /** The member's role ids per user id; a user not listed is not in the guild. */
  members?: Record<string, string[]>;
  /** Makes every call fail the way the real client does when Discord is down. */
  failure?: DiscordError;
  /** Makes the member lookup answer "not a member" for everyone (a 404). */
  noMembers?: boolean;
}

export interface FakeGuildApi extends GuildApi {
  calls: string[];
}

/** A mocked Discord guild API for the permission check. Records every call as `kind:id`. */
export function fakeGuildApi(guildId: string, options: FakeGuildOptions = {}): FakeGuildApi {
  const calls: string[] = [];
  const roles = options.roles ?? [];
  const allRoles = roles.some((r) => r.id === guildId)
    ? roles
    : [{ id: guildId, permissions: '0' }, ...roles];
  const fail = () => Promise.reject(options.failure ?? new Error('no failure set'));
  return {
    calls,
    getGuildOwnerId(id) {
      calls.push(`guild:${id}`);
      if (options.failure) return fail();
      return Promise.resolve(options.ownerId ?? '999999999999999999');
    },
    getGuildRoles(id) {
      calls.push(`roles:${id}`);
      if (options.failure) return fail();
      return Promise.resolve(allRoles);
    },
    getGuildMember(_id, userId): Promise<DiscordMember | null> {
      calls.push(`member:${userId}`);
      if (options.failure) return fail();
      const memberRoles = options.members?.[userId];
      if (options.noMembers === true || memberRoles === undefined) return Promise.resolve(null);
      return Promise.resolve({ roles: memberRoles });
    },
  };
}

const ctx = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
  props: {},
} as unknown as ExecutionContext;

export type Handler = ReturnType<typeof createHandler>;

export function callHandler(handler: Handler, request: Request): Promise<Response> {
  if (handler.fetch === undefined) throw new Error('handler has no fetch');
  return Promise.resolve(
    handler.fetch(request as Request<unknown, IncomingRequestCfProperties>, env, ctx),
  );
}

export function postAuth(
  handler: Handler,
  body: unknown,
  init: { raw?: boolean } = {},
): Promise<Response> {
  return callHandler(
    handler,
    new Request(`${ORIGIN}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: init.raw === true ? (body as string) : JSON.stringify(body),
    }),
  );
}

export function getWithToken(handler: Handler, path: string, token: string): Promise<Response> {
  return callHandler(
    handler,
    new Request(`${ORIGIN}${path}`, { headers: { Authorization: `Bearer ${token}` } }),
  );
}

export function expectApiHeaders(res: Response): void {
  expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false);
}

/** Builds a correctly signed token the way the Worker does, using the test env's client secret. */
export async function tokenFor(guildId: string, secret: string): Promise<string> {
  return formatSessionToken(await getSessionKey(env.DISCORD_CLIENT_SECRET), guildId, secret);
}

export const T0 = 1_800_000_000_000;

export interface CoreContext {
  guildId: string;
  core: GuildCore;
  clock: { t: number };
  sql: SqlStorage;
  storage: DurableObjectStorage;
  request: (secret: string, path?: string, method?: string, body?: unknown) => Promise<Response>;
}

/**
 * Runs `fn` inside the guild's real Durable Object with a GuildCore driven by a fake clock.
 * The GuildCore gets no leet source unless `options.createLeetSource` is given.
 */
export async function runCore<R>(
  guildId: string,
  fn: (ctx: CoreContext) => Promise<R> | R,
  options: GuildCoreOptions | ((clock: { t: number }) => GuildCoreOptions) = {},
): Promise<R> {
  const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));
  return runInDurableObject(stub, async (_instance, state) => {
    const clock = { t: T0 };
    const core = new GuildCore(state.storage, () => clock.t, {
      guildId: () => guildId,
      ...(typeof options === 'function' ? options(clock) : options),
    });
    const request = async (secret: string, path = '/api/me', method = 'GET', body?: unknown) =>
      core.handle(
        new Request(`${ORIGIN}${path}`, {
          method,
          headers: { Authorization: `Bearer ${await tokenFor(guildId, secret)}` },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    return fn({ guildId, core, clock, sql: state.storage.sql, storage: state.storage, request });
  });
}

/** Puts a database back to before migration 13 (the creature quirk). */
export function undoQuirkMigration(sql: SqlStorage): void {
  // Tests that rebuild an older schema may have dropped the table already.
  const hasColumn = sql
    .exec("SELECT 1 FROM pragma_table_info('creatures') WHERE name = 'quirk_id'")
    .toArray();
  if (hasColumn.length > 0) sql.exec('ALTER TABLE creatures DROP COLUMN quirk_id');
  sql.exec('DELETE FROM schema_version WHERE version = 13');
}

/** Columns migration 12 added to `raid_weeks`. */
export const PROGRESSION_WEEK_COLUMNS = [
  'rank',
  'effective_rank',
  'festival',
  'season_index',
  'festival_species',
  'ladder_at',
  'ladder_won',
  'rank_after',
] as const;

/**
 * Puts a database back to before migration 12 (the Boss Rank ladder). The wider `server_firsts`
 * check stays, as with migration 8 (a migration only ever widens it).
 */
export function undoProgressionMigration(sql: SqlStorage): void {
  undoQuirkMigration(sql);
  for (const column of PROGRESSION_WEEK_COLUMNS) {
    sql.exec(`ALTER TABLE raid_weeks DROP COLUMN ${column}`);
  }
  sql.exec('DROP TABLE IF EXISTS raid_ladder');
  sql.exec('DROP TABLE IF EXISTS raid_festival_grants');
  sql.exec('DELETE FROM schema_version WHERE version = 12');
}

/** Puts a database back to before migration 11 (the pinned announcement channel). */
export function undoChannelPinMigration(sql: SqlStorage): void {
  undoProgressionMigration(sql);
  sql.exec('ALTER TABLE guild_meta DROP COLUMN announce_channel_pinned');
  sql.exec('ALTER TABLE sessions DROP COLUMN channel_id');
  sql.exec('DELETE FROM schema_version WHERE version = 11');
}

/** Tables created by migration 10 (the live finale). */
export const LIVE_TABLES = ['raid_abilities', 'raid_live', 'raid_reveal_seen'] as const;

/** Puts a database back to before migration 10 (the live finale). */
export function undoLiveMigration(sql: SqlStorage): void {
  undoChannelPinMigration(sql);
  for (const table of LIVE_TABLES) sql.exec(`DROP TABLE IF EXISTS ${table}`);
  sql.exec('DELETE FROM schema_version WHERE version = 10');
}

/** Tables created by migration 8 (the weekly raid). */
export const RAID_TABLES = [
  'raid_weeks',
  'raid_parties',
  'raid_party_members',
  'raid_opt_outs',
  'raid_teams',
  'raid_placements',
  'raid_results',
  'raid_events',
  'jackpot_pity',
] as const;

/** Puts a database back to before migration 9 (the announcement channel and the post queue). */
export function undoDiscordPostsMigration(sql: SqlStorage): void {
  undoLiveMigration(sql);
  sql.exec('DROP TABLE IF EXISTS discord_posts');
  sql.exec('ALTER TABLE guild_meta DROP COLUMN announce_channel_id');
  sql.exec('DELETE FROM schema_version WHERE version = 9');
}

/**
 * Puts a database back to before migration 7 (reserved), 8 (the raid), 9 (Discord posts) and 10
 * (the live finale), for
 * tests that replay older migrations. The wider `server_firsts` check stays: migration 8 recreates
 * that table with its rows anyway.
 */
export function undoRaidMigration(sql: SqlStorage): void {
  undoDiscordPostsMigration(sql);
  for (const table of RAID_TABLES) sql.exec(`DROP TABLE IF EXISTS ${table}`);
  sql.exec('DELETE FROM schema_version WHERE version IN (7, 8)');
}
