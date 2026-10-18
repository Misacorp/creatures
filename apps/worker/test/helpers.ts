import { RULES, createSeededRng, type ExpeditionLength } from '@creatures/game';
import { expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { GuildCore, type GuildCoreOptions } from '../src/guild-core';
import { DiscordError, type DiscordApi, type GuildApi } from '../src/discord';
import { createHandler } from '../src/index';
import { formatSessionToken, getSessionKey } from '../src/session';
import type { ActivityInstance, DiscordMember, DiscordRole, DiscordUser } from '../src/schemas';

export const ORIGIN = 'https://creatures.test';

/**
 * Makes every catch roll of these trip lengths bring a creature (the chance is 100%), for a test that
 * needs a catch on every trip rather than the chance the game shipped with. Returns the function that
 * puts the shipped chances back; call it in a `finally`.
 */
export function certainCatches(lengths: readonly ExpeditionLength[]): () => void {
  // RULES is frozen by type only; the sim's tuning overrides write into it the same way.
  const rules = (l: ExpeditionLength) => RULES.expeditions.lengths[l] as { catchBp: number };
  const before = lengths.map((l) => rules(l).catchBp);
  for (const l of lengths) rules(l).catchBp = 10_000;
  return () => {
    lengths.forEach((l, i) => {
      rules(l).catchBp = before[i] as number;
    });
  };
}

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
      // The same secret source as the Worker's, so events carry real actor hashes.
      analyticsSecret: env.DISCORD_CLIENT_SECRET,
      // Seeded, so the talents of every creature a test makes are the same on every run (talent tests
      // pass their own `talentRng` through `options`).
      talentRng: createSeededRng('test-talents'),
      // Off by default so other features' tests keep exact Bait balances; allowance tests turn it on.
      dailyAllowance: false,
      // Off by default so other features' tests keep exact trip times, loot and experience; the weather
      // tests turn it on.
      weather: false,
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

/** Puts a database back to before migration 14 (the Auto fire preferences). */
export function undoAutofireMigration(sql: SqlStorage): void {
  undoPacingMigration(sql);
  sql.exec('DROP TABLE IF EXISTS raid_autofire');
  sql.exec('DELETE FROM schema_version WHERE version = 14');
}

/** Tables created by migration 17 (gear, parts, blueprints, the workshop and the Crafting skill). */
export const GEAR_TABLES = [
  'gear_items',
  'gear_legacy',
  'gear_conversion',
  'parts',
  'blueprints',
  'workshop_jobs',
  'crafting_skill',
  'gear_grants',
  'gear_actions',
] as const;

/**
 * Puts a database back to before migration 34 (the dungeon on a map): the steps table goes, and runs and
 * days lose the columns it added (a run that was open is dropped: a database from before had none).
 */
export function undoDungeonPathsMigration(sql: SqlStorage): void {
  // A test may already have dropped a table (the version 3 test does): only what is there goes.
  const has = (table: string, column: string): boolean =>
    sql.exec(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = '${column}'`).toArray()
      .length > 0;
  sql.exec('DROP TABLE IF EXISTS dungeon_steps');
  sql.exec('DROP INDEX IF EXISTS dungeon_runs_active');
  if (has('dungeon_runs', 'status')) {
    sql.exec("DELETE FROM dungeon_runs WHERE status = 'active'");
    sql.exec('ALTER TABLE dungeon_runs DROP COLUMN status');
  }
  if (has('dungeon_runs', 'state_json'))
    sql.exec('ALTER TABLE dungeon_runs DROP COLUMN state_json');
  if (has('dungeon_runs', 'outcome')) sql.exec('ALTER TABLE dungeon_runs DROP COLUMN outcome');
  if (has('dungeon_days', 'map_json')) sql.exec('ALTER TABLE dungeon_days DROP COLUMN map_json');
  sql.exec('DELETE FROM schema_version WHERE version = 34');
}

/** Puts a database back to before migration 33 (the lounge message). */
export function undoLoungeMessageMigration(sql: SqlStorage): void {
  undoDungeonPathsMigration(sql);
  sql.exec('DROP TABLE IF EXISTS lounge_instances');
  sql.exec('DROP TABLE IF EXISTS lounge_message');
  sql.exec('DELETE FROM schema_version WHERE version = 33');
}

/** Puts a database back to before migration 32 (who placed each raid creature). */
export function undoPlacedByMigration(sql: SqlStorage): void {
  undoLoungeMessageMigration(sql);
  const present = sql
    .exec("SELECT 1 FROM pragma_table_info('raid_placements') WHERE name = 'placed_by'")
    .toArray();
  if (present.length > 0) sql.exec('ALTER TABLE raid_placements DROP COLUMN placed_by');
  sql.exec('DELETE FROM schema_version WHERE version = 32');
}

/**
 * Puts a database back to before migration 31 (Boons and Omens): the weather table goes and trips lose
 * the weather stored with them.
 */
export function undoWeatherMigration(sql: SqlStorage): void {
  undoPlacedByMigration(sql);
  sql.exec('DROP TABLE IF EXISTS weather_days');
  // A test may already have dropped a table (the version 3 test does): only what is there goes.
  const present = sql
    .exec("SELECT 1 FROM pragma_table_info('expeditions') WHERE name = 'weather_json'")
    .toArray();
  if (present.length > 0) sql.exec('ALTER TABLE expeditions DROP COLUMN weather_json');
  sql.exec('DELETE FROM schema_version WHERE version = 31');
}

/**
 * Puts a database back to before migration 30 (creature experience and ribbons, the trip treat and the
 * pity counters): the added columns go.
 */
export function undoCreaturesBMigration(sql: SqlStorage): void {
  undoWeatherMigration(sql);
  // A test may already have dropped a table (the version 3 test does): only what is there goes.
  const drop = (table: string, column: string): void => {
    const present = sql
      .exec(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = '${column}'`)
      .toArray();
    if (present.length > 0) sql.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  };
  drop('creatures', 'exp');
  drop('creatures', 'ribbons');
  drop('expeditions', 'treat');
  drop('player_progress', 'pity_new');
  drop('player_progress', 'pity_creature');
  sql.exec('DELETE FROM schema_version WHERE version = 30');
}

/**
 * Puts a database back to before migration 29 (the crafting loop): the Workshop jobs table goes back to
 * its old kinds (dismantle jobs are dropped) and loses `work_minutes`.
 */
export function undoWorkshopV2Migration(sql: SqlStorage): void {
  undoCreaturesBMigration(sql);
  sql.exec("DELETE FROM workshop_jobs WHERE kind = 'dismantle'");
  sql.exec('ALTER TABLE workshop_jobs RENAME TO workshop_jobs_v3');
  sql.exec(`CREATE TABLE workshop_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('craft', 'improve', 'enchant', 'supply')),
    gear_id TEXT,
    input_json TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    claimed_at INTEGER,
    result_json TEXT
  )`);
  sql.exec(`INSERT INTO workshop_jobs
      (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at, result_json)
    SELECT id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at, result_json
    FROM workshop_jobs_v3 ORDER BY rowid`);
  sql.exec('DROP TABLE workshop_jobs_v3');
  sql.exec(
    'CREATE UNIQUE INDEX workshop_jobs_creature_open ON workshop_jobs(creature_id) WHERE claimed_at IS NULL',
  );
  sql.exec(
    'CREATE UNIQUE INDEX workshop_jobs_gear_open ON workshop_jobs(gear_id) WHERE claimed_at IS NULL AND gear_id IS NOT NULL',
  );
  sql.exec('CREATE INDEX workshop_jobs_user ON workshop_jobs(user_id, claimed_at)');
  sql.exec('DELETE FROM schema_version WHERE version = 29');
}

/**
 * Puts a database back to before migration 28 (talents and the duplicate choice): the Talent Book and the
 * pending duplicates go, `creatures` gets its one-creature-per-line constraint back (a second creature of
 * a line is dropped, which a database from before the migration never had) and so does the Festival
 * grants' old outcome check.
 */
export function undoCreaturesAMigration(sql: SqlStorage): void {
  undoWorkshopV2Migration(sql);
  sql.exec('DROP TABLE IF EXISTS creature_talents');
  sql.exec('DROP TABLE IF EXISTS pending_catches');
  sql.exec('DROP INDEX IF EXISTS creatures_user');
  const columns = sql
    .exec<{ name: string }>("SELECT name FROM pragma_table_info('creatures')")
    .toArray()
    .map((r) => r.name);
  if (columns.includes('line_slot')) {
    sql.exec(`CREATE TABLE creatures_old (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      line TEXT NOT NULL,
      species TEXT NOT NULL,
      level INTEGER NOT NULL CHECK (level >= 1),
      fusion_count INTEGER NOT NULL DEFAULT 0 CHECK (fusion_count BETWEEN 0 AND 5),
      shiny INTEGER NOT NULL DEFAULT 0,
      nickname TEXT,
      away_expedition_id TEXT,
      origin TEXT NOT NULL,
      caught_at INTEGER NOT NULL,
      quirk_id TEXT,
      UNIQUE (user_id, line)
    )`);
    sql.exec(`INSERT INTO creatures_old
      (id, user_id, line, species, level, fusion_count, shiny, nickname, away_expedition_id, origin, caught_at, quirk_id)
      SELECT id, user_id, line, species, level, fusion_count, shiny, nickname, away_expedition_id, origin, caught_at, quirk_id
      FROM creatures WHERE line_slot = 1 ORDER BY rowid`);
    sql.exec('DROP TABLE creatures');
    sql.exec('ALTER TABLE creatures_old RENAME TO creatures');
  }
  const hasTalentJson = sql
    .exec("SELECT 1 FROM pragma_table_info('raid_festival_grants') WHERE name = 'talent_json'")
    .toArray();
  if (hasTalentJson.length > 0) {
    sql.exec(`CREATE TABLE raid_festival_grants_old (
      week_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      species TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('new', 'fused', 'converted')),
      fusion_count INTEGER,
      bait INTEGER,
      first_on_server INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (week_id, user_id)
    )`);
    sql.exec(`INSERT INTO raid_festival_grants_old
      SELECT week_id, user_id, species,
             CASE outcome WHEN 'duplicate' THEN 'fused' ELSE outcome END,
             fusion_count, bait, first_on_server, created_at
      FROM raid_festival_grants`);
    sql.exec('DROP TABLE raid_festival_grants');
    sql.exec('ALTER TABLE raid_festival_grants_old RENAME TO raid_festival_grants');
  }
  sql.exec('DELETE FROM schema_version WHERE version = 28');
}

/**
 * Puts a database back to before migration 27 (gear v2): the new item table goes, the first version's
 * comes back (empty), and the blueprint marks and the conversion list go.
 */
export function undoGearV2Migration(sql: SqlStorage): void {
  undoCreaturesAMigration(sql);
  sql.exec('DROP TABLE IF EXISTS gear_conversion');
  sql.exec('DROP TABLE IF EXISTS gear_legacy');
  sql.exec('DROP TABLE IF EXISTS gear_items');
  sql.exec(`CREATE TABLE gear_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    base_id TEXT NOT NULL,
    rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'festival')),
    level INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 5),
    rolls_json TEXT NOT NULL,
    enchant_id TEXT,
    equipped_on TEXT UNIQUE,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX gear_items_user ON gear_items(user_id, created_at)');
  const hasMarks = sql
    .exec("SELECT 1 FROM pragma_table_info('blueprints') WHERE name = 'marks'")
    .toArray();
  if (hasMarks.length > 0) sql.exec('ALTER TABLE blueprints DROP COLUMN marks');
  sql.exec('DELETE FROM schema_version WHERE version = 27');
}

/** Puts a database back to before migration 26 (the saved dungeon team draft). */
export function undoDungeonDraftMigration(sql: SqlStorage): void {
  undoGearV2Migration(sql);
  sql.exec('DROP TABLE IF EXISTS dungeon_drafts');
  sql.exec('DELETE FROM schema_version WHERE version = 26');
}

/** Puts a database back to before migration 25 (the daily Bait allowance). */
export function undoAllowanceMigration(sql: SqlStorage): void {
  undoDungeonDraftMigration(sql);
  sql.exec('DROP TABLE IF EXISTS daily_allowance');
  sql.exec('DELETE FROM schema_version WHERE version = 25');
}

/** Puts a database back to before migration 24 (the raid difficulty version of a week). */
export function undoDifficultyMigration(sql: SqlStorage): void {
  undoAllowanceMigration(sql);
  const has = sql
    .exec("SELECT 1 FROM pragma_table_info('raid_weeks') WHERE name = 'difficulty_version'")
    .toArray();
  if (has.length > 0) sql.exec('ALTER TABLE raid_weeks DROP COLUMN difficulty_version');
  sql.exec('DELETE FROM schema_version WHERE version = 24');
}

/** Puts a database back to before migration 23 (the living room's chosen spot). */
export function undoLoungeSpotMigration(sql: SqlStorage): void {
  undoDifficultyMigration(sql);
  // Tests that rebuild an older schema may have dropped the table or a column already.
  const columns = sql
    .exec<{ name: string }>("SELECT name FROM pragma_table_info('players')")
    .toArray()
    .map((r) => r.name);
  if (columns.includes('lounge_spot')) sql.exec('ALTER TABLE players DROP COLUMN lounge_spot');
  if (columns.includes('lounge_spot_at'))
    sql.exec('ALTER TABLE players DROP COLUMN lounge_spot_at');
  sql.exec('DELETE FROM schema_version WHERE version = 23');
}

/** Puts a database back to before migration 22 (the raid board repair has no schema to undo). */
export function undoPlacementCapMigration(sql: SqlStorage): void {
  undoLoungeSpotMigration(sql);
  sql.exec('DELETE FROM schema_version WHERE version = 22');
}

/** Puts a database back to before migration 21 (the living room's lounger). */
export function undoLoungerMigration(sql: SqlStorage): void {
  undoPlacementCapMigration(sql);
  // Tests that rebuild an older schema may have dropped the table already.
  const hasColumn = sql
    .exec("SELECT 1 FROM pragma_table_info('players') WHERE name = 'lounger_id'")
    .toArray();
  if (hasColumn.length > 0) sql.exec('ALTER TABLE players DROP COLUMN lounger_id');
  sql.exec('DELETE FROM schema_version WHERE version = 21');
}

/** Puts a database back to before migration 20 (the daily analytics rollups). */
export function undoRollupMigration(sql: SqlStorage): void {
  undoLoungerMigration(sql);
  sql.exec('DROP TABLE IF EXISTS analytics_daily');
  sql.exec('DELETE FROM schema_version WHERE version = 20');
}

/** Tables created by migration 18 (the daily dungeon). */
export const DUNGEON_TABLES = [
  'dungeon_runs',
  'dungeon_progress',
  'dungeon_days',
  'dungeon_steps',
] as const;

/** Puts a database back to before migration 18 (the daily dungeon). */
export function undoDungeonMigration(sql: SqlStorage): void {
  for (const table of DUNGEON_TABLES) sql.exec(`DROP TABLE IF EXISTS ${table}`);
  sql.exec('DELETE FROM schema_version WHERE version = 18');
}

/** Tables created by migration 19 (expeditions v2). */
export const EXPEDITION_TABLES = [
  'explorer_progress',
  'familiarity',
  'journal',
  'account_stats',
  'places_visited',
  'supplies',
  'expedition_offers',
] as const;

/**
 * Puts a database back to before migration 19 (expeditions v2): its tables go and `expeditions` gets its
 * old shape back (cancelled trips are dropped, the new columns lost). `workshop_jobs` is rebuilt by the
 * gear undo below. Only version 19 is removed; version 18 (the daily dungeon) stays, see
 * `undoDungeonMigration`.
 */
export function undoExpeditionsMigration(sql: SqlStorage): void {
  undoRollupMigration(sql);
  for (const table of EXPEDITION_TABLES) sql.exec(`DROP TABLE IF EXISTS ${table}`);
  // A test that rebuilds a much older schema may have dropped the table already.
  const hasTable = sql
    .exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'expeditions'")
    .toArray();
  if (hasTable.length === 0) {
    sql.exec('DELETE FROM schema_version WHERE version = 19');
    return;
  }
  sql.exec(`CREATE TABLE expeditions_v1 (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    duration TEXT NOT NULL,
    supplies TEXT NOT NULL,
    rolls INTEGER NOT NULL,
    cost INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'claimed')),
    claimed_at INTEGER,
    result TEXT
  )`);
  sql.exec(`INSERT INTO expeditions_v1
      (id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at, status, claimed_at, result)
    SELECT id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at, status, claimed_at, result
    FROM expeditions WHERE status != 'cancelled' ORDER BY rowid`);
  sql.exec('DROP TABLE expeditions');
  sql.exec('ALTER TABLE expeditions_v1 RENAME TO expeditions');
  sql.exec('CREATE INDEX expeditions_user_status ON expeditions(user_id, status)');
  sql.exec('DELETE FROM schema_version WHERE version = 19');
}

/** Puts a database back to before migration 17 (gear and crafting). */
export function undoGearMigration(sql: SqlStorage): void {
  undoExpeditionsMigration(sql);
  undoDungeonMigration(sql);
  for (const table of GEAR_TABLES) sql.exec(`DROP TABLE IF EXISTS ${table}`);
  sql.exec('DELETE FROM schema_version WHERE version = 17');
}

/** Tables created by migration 16 (the analytics event log). */
export const ANALYTICS_TABLES = ['analytics_events', 'analytics_seen', 'analytics_once'] as const;

/** Puts a database back to before migration 16 (the analytics event log). */
export function undoAnalyticsMigration(sql: SqlStorage): void {
  undoGearMigration(sql);
  for (const table of ANALYTICS_TABLES) sql.exec(`DROP TABLE IF EXISTS ${table}`);
  sql.exec('DELETE FROM schema_version WHERE version = 16');
}

/** Puts a database back to before migration 15 (content-paced live rounds). */
export function undoPacingMigration(sql: SqlStorage): void {
  undoAnalyticsMigration(sql);
  // Tests that rebuild an older schema may have dropped the table already.
  const hasColumn = sql
    .exec("SELECT 1 FROM pragma_table_info('raid_live') WHERE name = 'pacing'")
    .toArray();
  if (hasColumn.length > 0) sql.exec('ALTER TABLE raid_live DROP COLUMN pacing');
  sql.exec('DELETE FROM schema_version WHERE version = 15');
}

/** Puts a database back to before migration 13 (the creature quirk). */
export function undoQuirkMigration(sql: SqlStorage): void {
  undoAutofireMigration(sql);
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
