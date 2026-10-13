import { createCryptoRng, type Rng } from '@creatures/game';
import * as v from 'valibot';
import { Analytics } from './analytics';
import { Collection } from './collection';
import { creatureQuirkMigration } from './creature-quirk-migration';
import { collectionRoutes } from './collection-routes';
import { baitForDay, leetPointsForDay } from './economy';
import { DiscordError, type GuildApi } from './discord';
import { canManageGuild } from './discord-permissions';
import {
  announceChannelId,
  claimNextPost,
  hasDuePosts,
  isChannelPinned,
  nextPostAt,
  pinAnnounceChannel,
  recordOutcome,
  unpinAnnounceChannel,
  type PostSender,
} from './discord-posts';
import { dispatch, errorResponse, json, matchTemplate, type Routes } from './http';
import {
  LEET_BACKFILL_DAYS,
  LeetSourceError,
  type LeetSource,
  type LeetSyncErrorKind,
} from './leet';
import {
  credit,
  getBalances,
  listEntries,
  spend,
  type CreditInput,
  type SpendInput,
  type SpendResult,
} from './ledger';
import { Raid } from './raid';
import { raidAutofireMigration } from './raid-autofire-migration';
import { raidLivePacingMigration } from './raid-live-pacing-migration';
import { raidLiveMigration } from './raid-live-migration';
import { raidMigration } from './raid-migration';
import { raidProgressionMigration } from './raid-progression-migration';
import { raidRoutes } from './raid-routes';
import { TokenBucketLimiter } from './ratelimit';
import { SNOWFLAKE_RE } from './schemas';
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_TOUCH_INTERVAL_MS,
  generateSessionSecret,
  hashSecret,
  parseAuthorization,
} from './session';
import {
  DEFAULT_GUILD_TIMEZONE,
  addDays,
  isValidTimeZone,
  nextOccurrence,
  previousOccurrence,
  zonedDate,
} from './time';

/** Per-user session cap: older sessions are dropped so storage stays bounded. */
const MAX_SESSIONS_PER_USER = 10;
/** Per-player API rate limit: burst of 30, refilling one request per second. */
const RATE_CAPACITY = 30;
const RATE_REFILL_PER_SECOND = 1;
const RATE_MAX_KEYS = 1000;

/** The daily leet sync runs at 13:40 guild-local time, just after the 13:37 leet window closes. */
const SYNC_HOUR = 13;
const SYNC_MINUTE = 40;
/** A sync triggered by /api/me only runs when the last one is older than this. */
const SYNC_STALE_MS = 15 * 60 * 1000;
/** After a failed sync, wait this long before /api/me triggers another attempt. */
const SYNC_RETRY_MS = 60 * 1000;
/**
 * How long /api/me waits for a sync before answering with stale data. Longer than the HTTP
 * source's 5000 ms timeout, so one slow upstream call (a cold start) can still finish in time.
 */
export const SYNC_BUDGET_MS = 6000;
const SYNC_MAX_PAGES = 20;
const SYNC_PAGE_LIMIT = 31;
/** Alarms re-arm from slightly in the future so a marginally early wake-up cannot fire twice. */
const ALARM_REARM_SKEW_MS = 60 * 1000;
/** A raid event that keeps failing is retried this long after the last attempt. */
const RAID_RETRY_MS = 60 * 1000;
/** Posts that are due but not yet delivered are looked at again this long later by the alarm. */
const POST_RETRY_MS = 60 * 1000;
/** Most posts one delivery run sends, so a run always ends. */
const MAX_POSTS_PER_RUN = 20;
/** How long a "may this player manage the server" answer from Discord is reused. */
const MANAGE_CACHE_MS = 60 * 1000;
/** Bound on remembered answers: one per player who asked. */
const MANAGE_CACHE_MAX = 200;

const LEDGER_DEFAULT_LIMIT = 20;
const LEDGER_MAX_LIMIT = 50;

/** Versioned schema migrations; index 0 is version 1. Never edit a released migration. */
const MIGRATIONS: readonly ((sql: SqlStorage) => void)[] = [
  (sql) => {
    sql.exec(`CREATE TABLE players (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES players(user_id),
      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
    sql.exec('CREATE INDEX sessions_user_id ON sessions(user_id)');
  },
  (sql) => {
    // No foreign key to players: leet credits can arrive for Discord users who have not opened
    // the game yet, and they see the balance on first login.
    sql.exec(`CREATE TABLE ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      currency TEXT NOT NULL CHECK (currency IN ('bait', 'essence')),
      amount INTEGER NOT NULL CHECK (amount <> 0),
      source TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      meta TEXT,
      result TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE (user_id, idempotency_key)
    )`);
    sql.exec('CREATE INDEX ledger_user_id_id ON ledger(user_id, id)');
    sql.exec(`CREATE TABLE balances (
      user_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount >= 0),
      PRIMARY KEY (user_id, currency)
    )`);
    sql.exec(`CREATE TABLE leet_sync (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cursor TEXT,
      since_date TEXT NOT NULL,
      last_synced_at INTEGER
    )`);
  },
  (sql) => {
    // The guild this object serves, written on first session creation. The Worker verifies the
    // guild with Discord, so the Durable Object does not rely on `ctx.id.name`.
    sql.exec(`CREATE TABLE guild_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      guild_id TEXT NOT NULL
    )`);
  },
  (sql) => {
    // One creature per (player, line): duplicates fuse into it. No foreign keys, as in the ledger:
    // rows are only written by this module, always inside a transaction.
    sql.exec(`CREATE TABLE creatures (
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
      UNIQUE (user_id, line)
    )`);
    sql.exec(`CREATE TABLE expeditions (
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
    sql.exec('CREATE INDEX expeditions_user_status ON expeditions(user_id, status)');
    sql.exec(`CREATE TABLE player_progress (
      user_id TEXT PRIMARY KEY,
      starter_species TEXT,
      expeditions_claimed INTEGER NOT NULL DEFAULT 0,
      dupe_streak INTEGER NOT NULL DEFAULT 0
    )`);
    // "First on server": every user who got the species in the drop that first produced it.
    sql.exec(`CREATE TABLE server_firsts (
      kind TEXT NOT NULL CHECK (kind IN ('catch', 'evolve')),
      species TEXT NOT NULL,
      user_id TEXT NOT NULL,
      drop_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (kind, species, user_id)
    )`);
  },
  (sql) => {
    // The guild's IANA timezone. The default is written out (not interpolated) because a released
    // migration must never change; it equals DEFAULT_GUILD_TIMEZONE.
    sql.exec("ALTER TABLE guild_meta ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Helsinki'");
  },
  (sql) => {
    // Sync health, shown to players. `last_error` is an error kind only (never a message, URL or
    // key); `last_days` is the number of days processed by the last successful run.
    sql.exec('ALTER TABLE leet_sync ADD COLUMN last_attempt_at INTEGER');
    sql.exec('ALTER TABLE leet_sync ADD COLUMN last_error TEXT');
    sql.exec('ALTER TABLE leet_sync ADD COLUMN last_days INTEGER');
  },
  (sql) => {
    // Which kind of leet source ('http' or 'mock') the stored cursor belongs to. When the
    // configured source changes, the cursor from the old source is meaningless and is reset.
    sql.exec('ALTER TABLE leet_sync ADD COLUMN source TEXT');
  },
  // Version 8: the weekly raid (see raid-migration.ts).
  raidMigration,
  (sql) => {
    // The channel the Activity was most recently launched from (Discord's verified location), and
    // the queue of posts to it. `key` is unique per announced thing, so a post is queued once.
    sql.exec('ALTER TABLE guild_meta ADD COLUMN announce_channel_id TEXT');
    sql.exec(`CREATE TABLE discord_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      channel_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    sql.exec('CREATE INDEX discord_posts_due ON discord_posts(status, next_attempt_at)');
  },
  // Version 10: the live finale (see raid-live-migration.ts).
  raidLiveMigration,
  (sql) => {
    // A server admin can pin the announcement channel: while pinned, logins no longer change
    // `announce_channel_id`. Each session also remembers the channel it was launched from (Discord's
    // verified location; null for sessions made before this migration).
    sql.exec(
      'ALTER TABLE guild_meta ADD COLUMN announce_channel_pinned INTEGER NOT NULL DEFAULT 0',
    );
    sql.exec('ALTER TABLE sessions ADD COLUMN channel_id TEXT');
  },
  // Version 12: the Boss Rank ladder, seasons and Festival weeks (see raid-progression-migration.ts).
  raidProgressionMigration,
  // Version 13: a personality quirk for every creature (see creature-quirk-migration.ts).
  creatureQuirkMigration,
  // Version 14: auto fire preferences for the finale (see raid-autofire-migration.ts).
  raidAutofireMigration,
  // Version 15: content-paced live rounds (see raid-live-pacing-migration.ts).
  raidLivePacingMigration,
  (sql) => {
    // Version 16: the analytics event log (see analytics.ts and docs/design/analytics.md). Events hold
    // ids from content, enums, integers and booleans only, and a hashed actor; never names or text.
    sql.exec(`CREATE TABLE analytics_events (
      id INTEGER PRIMARY KEY,
      at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      actor_hash TEXT,
      props_json TEXT NOT NULL
    )`);
    sql.exec('CREATE INDEX analytics_events_at ON analytics_events(at)');
    // Session detection: when each (hashed) player was last seen.
    sql.exec(`CREATE TABLE analytics_seen (
      actor_hash TEXT PRIMARY KEY,
      last_at INTEGER NOT NULL
    )`);
    // Once-only marks (for example one live join per player per finale), keyed by a hashed label.
    sql.exec(`CREATE TABLE analytics_once (
      key TEXT PRIMARY KEY,
      at INTEGER NOT NULL
    )`);
  },
];

export interface SessionUser {
  id: string;
  displayName: string;
}

interface RequestContext {
  user: SessionUser;
  guildId: string;
  core: GuildCore;
  /** Raw path parameters of a template route such as `/api/creatures/:id/train`. */
  params: Record<string, string>;
  /** The channel this session was launched from (Discord's verified location), if known. */
  channelId: string | null;
}

/** Query of GET /api/ledger: strict, only `limit`. Duplicates and unknown keys are rejected. */
const LedgerQuerySchema = v.strictObject({
  limit: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^\d{1,3}$/),
      v.transform(Number),
      v.minValue(1),
      v.maxValue(LEDGER_MAX_LIMIT),
    ),
  ),
});

function parseLedgerQuery(url: URL): number | null {
  const seen = new Set<string>();
  for (const [key] of url.searchParams) {
    if (seen.has(key)) return null;
    seen.add(key);
  }
  // fromEntries defines own properties, so a key like `__proto__` stays visible to the schema.
  const result = v.safeParse(LedgerQuerySchema, Object.fromEntries(url.searchParams));
  if (!result.success) return null;
  return result.output.limit ?? LEDGER_DEFAULT_LIMIT;
}

const routes: Routes<RequestContext> = {
  ...collectionRoutes,
  ...raidRoutes,
  '/api/me': {
    GET: async (_request, { user, guildId, core }) => {
      await core.syncIfStale();
      return json({
        user,
        guildId,
        timezone: core.timezone(),
        balances: core.balances(user.id),
        leetSync: core.leetSyncStatus(),
      });
    },
  },
  '/api/ledger': {
    GET: (request, { user, core }) => {
      const limit = parseLedgerQuery(new URL(request.url));
      if (limit === null) return errorResponse('invalid_query', 400);
      return json({ entries: core.ledgerEntries(user.id, limit) });
    },
  },
};

const ROUTE_KEYS = Object.keys(routes);

export interface GuildCoreOptions {
  /** Live randomness for catches. Defaults to crypto.getRandomValues; tests inject a seeded one. */
  rng?: Rng;
  /**
   * Live randomness for raids (fight seeds, jackpot rolls). Defaults to crypto.getRandomValues. It
   * is separate from `rng` so raid events never consume a test's scripted catch draws.
   */
  raidRng?: Rng;
  /**
   * Fresh randomness for the readiness band (the forecast dice). Defaults to crypto.getRandomValues.
   * Separate from `raidRng`, so a forecast never consumes the draws of a real fight.
   */
  readinessRng?: Rng;
  /**
   * Live randomness for the cosmetic quirk of a new creature (catch, starter, Festival grant).
   * Defaults to crypto.getRandomValues. It is separate from `rng` and `raidRng`, so a new quirk
   * never consumes a test's scripted catch draws or a raid's fight seeds.
   */
  quirkRng?: Rng;
  /** Fallback guild id (the Durable Object's name), used only until one is stored. */
  guildId?: () => string | undefined;
  /** Builds the leet source. Returning null disables syncing (fail closed). */
  createLeetSource?: (knownPlayers: () => string[]) => LeetSource | null;
  /** How long /api/me waits for a sync before answering with stale data. */
  syncBudgetMs?: number;
  /** Delivers Discord posts. Without one, posts stay queued and the alarm ignores them. */
  postSender?: PostSender | null;
  /**
   * Read-only guild lookups with the bot token, to check who may manage the server. Without one,
   * the check fails as "Discord unavailable" (fail closed).
   */
  guildApi?: GuildApi | null;
  /** Staging only: the practice finale is available (the `RAID_PRACTICE` var is "on"). */
  raidPractice?: boolean;
  /**
   * The secret the analytics actor hash is keyed from (the Discord client secret, through HKDF with
   * its own label). Without one, analytics events carry no actor and sessions are not tracked.
   */
  analyticsSecret?: string;
}

export interface LeetSyncResult {
  daysProcessed: number;
  creditsApplied: number;
}

/** How healthy the leet sync is, as shown to players. Contains no messages, URLs or keys. */
export interface LeetSyncStatus {
  source: 'http' | 'mock' | 'disabled';
  lastAttemptAt: number | null;
  lastSyncedAt: number | null;
  lastError: LeetSyncErrorKind | null;
  lastDays: number | null;
}

type CoreStorage = Pick<DurableObjectStorage, 'sql' | 'transactionSync' | 'getAlarm' | 'setAlarm'>;

/**
 * All game logic of a guild's Durable Object, kept free of the runtime class so tests can drive it
 * with a fake clock. The Durable Object class is a thin wrapper around this.
 */
export class GuildCore {
  private readonly limiter: TokenBucketLimiter;
  private readonly leetSource: LeetSource | null;
  private readonly syncBudgetMs: number;
  readonly collection: Collection;
  readonly raid: Raid;
  readonly analytics: Analytics;
  private syncInFlight: Promise<LeetSyncResult> | null = null;
  private postsInFlight: Promise<void> | null = null;
  /** The last analytics prune left old rows behind: the alarm comes back soon to continue. */
  private pruneBacklog = false;
  private lastSyncAttemptAt: number | null = null;
  /** The guild's timezone, cached per object; cleared whenever it changes. */
  private cachedTimezone: string | null = null;
  /** Recent "may manage the server" answers per player, and lookups that are still running. */
  private readonly manageCache = new Map<string, { allowed: boolean; until: number }>();
  private readonly manageInFlight = new Map<string, Promise<boolean>>();

  constructor(
    private readonly storage: CoreStorage,
    private readonly now: () => number,
    private readonly options: GuildCoreOptions = {},
  ) {
    this.syncBudgetMs = options.syncBudgetMs ?? SYNC_BUDGET_MS;
    this.leetSource = options.createLeetSource?.(() => this.knownPlayers()) ?? null;
    const quirkRng = options.quirkRng ?? createCryptoRng((array) => crypto.getRandomValues(array));
    this.analytics = new Analytics({
      storage,
      now,
      ...(options.analyticsSecret === undefined ? {} : { secret: options.analyticsSecret }),
    });
    this.collection = new Collection({
      storage,
      now,
      analytics: this.analytics,
      rng: options.rng ?? createCryptoRng((array) => crypto.getRandomValues(array)),
      quirkRng,
    });
    this.raid = new Raid({
      storage,
      now,
      rng: options.raidRng ?? createCryptoRng((array) => crypto.getRandomValues(array)),
      practice: options.raidPractice === true,
      analytics: this.analytics,
      quirkRng,
      ...(options.readinessRng === undefined ? {} : { readinessRng: options.readinessRng }),
    });
    this.limiter = new TokenBucketLimiter({
      capacity: RATE_CAPACITY,
      refillPerSecond: RATE_REFILL_PER_SECOND,
      now,
      maxKeys: RATE_MAX_KEYS,
    });
  }

  private get sql(): SqlStorage {
    return this.storage.sql;
  }

  /** Brings the schema up to date. Call inside `blockConcurrencyWhile`. */
  migrate(): void {
    this.sql.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
    const row = this.sql
      .exec<{ version: number | null }>('SELECT MAX(version) AS version FROM schema_version')
      .one();
    const current = row.version ?? 0;
    for (let version = current + 1; version <= MIGRATIONS.length; version++) {
      const migration = MIGRATIONS[version - 1];
      if (migration === undefined) throw new Error(`missing migration ${String(version)}`);
      this.storage.transactionSync(() => {
        migration(this.sql);
        this.sql.exec('INSERT INTO schema_version (version) VALUES (?)', version);
      });
    }
  }

  /**
   * Upserts the player and creates a session. Returns the secret half of the token. `channelId` is
   * the channel Discord says the Activity was launched from: the session remembers it, and unless a
   * server admin pinned the announcement channel it becomes the announcement channel ("the channel
   * most recently launched from"). Anything that is not a snowflake is ignored.
   */
  async createSession(
    guildId: string,
    user: SessionUser,
    channelId?: string | null,
  ): Promise<string> {
    const secret = generateSessionSecret();
    const tokenHash = await hashSecret(secret);
    const t = this.now();
    this.storage.transactionSync(() => {
      this.bindGuild(guildId);
      const launchChannel =
        typeof channelId === 'string' && SNOWFLAKE_RE.test(channelId) ? channelId : null;
      if (launchChannel !== null) {
        // A pinned channel stays put.
        this.sql.exec(
          'UPDATE guild_meta SET announce_channel_id = ? WHERE id = 1 AND announce_channel_pinned = 0',
          launchChannel,
        );
      }
      this.sql.exec(
        'DELETE FROM sessions WHERE expires_at <= ? OR last_used_at <= ?',
        t,
        t - SESSION_IDLE_MS,
      );
      this.sql.exec(
        `INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, last_seen_at = excluded.last_seen_at`,
        user.id,
        user.displayName,
        t,
        t,
      );
      this.sql.exec(
        'INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at, channel_id) VALUES (?, ?, ?, ?, ?, ?)',
        tokenHash,
        user.id,
        t,
        t,
        t + SESSION_ABSOLUTE_MS,
        launchChannel,
      );
      this.sql.exec(
        `DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (
           SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
         )`,
        user.id,
        user.id,
        MAX_SESSIONS_PER_USER,
      );
    });
    await this.ensureAlarm();
    return secret;
  }

  /** Records the guild on first use; a different guild later is a routing bug, so it throws. */
  private bindGuild(guildId: string): void {
    const stored = this.storedGuildId();
    if (stored === null) {
      this.sql.exec('INSERT INTO guild_meta (id, guild_id) VALUES (1, ?)', guildId);
    } else if (stored !== guildId) {
      throw new Error('guild id does not match this Durable Object');
    }
  }

  /**
   * The guild's timezone: the stored value, or the default when none is stored or the stored one is
   * not valid (logged without the value). Cached in memory until it changes. Resolve it once per
   * operation and pass it down explicitly.
   */
  timezone(): string {
    if (this.cachedTimezone !== null) return this.cachedTimezone;
    const row = this.sql
      .exec<{ timezone: string }>('SELECT timezone FROM guild_meta WHERE id = 1')
      .toArray()[0];
    // No row yet: the guild is not bound, so there is nothing stored to cache.
    if (row === undefined) return DEFAULT_GUILD_TIMEZONE;
    if (isValidTimeZone(row.timezone)) {
      this.cachedTimezone = row.timezone;
    } else {
      console.warn('stored guild timezone is invalid; using the default');
      this.cachedTimezone = DEFAULT_GUILD_TIMEZONE;
    }
    return this.cachedTimezone;
  }

  /**
   * Changes the guild's timezone and re-arms the alarm for it. Returns false (changing nothing)
   * for an invalid zone or a guild that is not bound yet. Not reachable from any route yet.
   */
  async setTimezone(timezone: string): Promise<boolean> {
    if (!isValidTimeZone(timezone) || this.storedGuildId() === null) return false;
    this.sql.exec('UPDATE guild_meta SET timezone = ? WHERE id = 1', timezone);
    this.cachedTimezone = null;
    this.catchUpRaid();
    this.kickPosts();
    await this.rearmAlarm(this.now());
    return true;
  }

  private nextSyncAt(fromMs: number): number {
    return nextOccurrence(fromMs, SYNC_HOUR, SYNC_MINUTE, this.timezone());
  }

  private storedGuildId(): string | null {
    const row = this.sql
      .exec<{ guild_id: string }>('SELECT guild_id FROM guild_meta WHERE id = 1')
      .toArray()[0];
    return row?.guild_id ?? null;
  }

  /** Returns the session's user, or null if the secret is unknown or the session expired. */
  async verifySession(secret: string): Promise<SessionUser | null> {
    return (await this.lookupSession(secret))?.user ?? null;
  }

  /** The session's user and the channel it was launched from, or null if unknown or expired. */
  private async lookupSession(
    secret: string,
  ): Promise<{ user: SessionUser; channelId: string | null } | null> {
    const tokenHash = await hashSecret(secret);
    const t = this.now();
    const rows = this.sql
      .exec<{
        user_id: string;
        display_name: string;
        last_used_at: number;
        expires_at: number;
        channel_id: string | null;
      }>(
        `SELECT s.user_id, p.display_name, s.last_used_at, s.expires_at, s.channel_id
         FROM sessions s JOIN players p ON p.user_id = s.user_id WHERE s.token_hash = ?`,
        tokenHash,
      )
      .toArray();
    const row = rows[0];
    if (row === undefined) return null;
    if (t >= row.expires_at || t - row.last_used_at >= SESSION_IDLE_MS) {
      this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
      return null;
    }
    if (t - row.last_used_at >= SESSION_TOUCH_INTERVAL_MS) {
      this.storage.transactionSync(() => {
        this.sql.exec('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?', t, tokenHash);
        this.sql.exec('UPDATE players SET last_seen_at = ? WHERE user_id = ?', t, row.user_id);
      });
    }
    return {
      user: { id: row.user_id, displayName: row.display_name },
      channelId:
        row.channel_id !== null && SNOWFLAKE_RE.test(row.channel_id) ? row.channel_id : null,
    };
  }

  /** Handles an authenticated API request forwarded by the Worker. */
  async handle(request: Request): Promise<Response> {
    const token = parseAuthorization(request.headers.get('Authorization'));
    if (token === null) return errorResponse('invalid_session', 401);
    const session = await this.lookupSession(token.secret);
    if (session === null) return errorResponse('invalid_session', 401);
    const { user } = session;

    const limit = this.limiter.take(user.id);
    if (!limit.allowed) {
      return errorResponse('rate_limited', 429, {
        'Retry-After': String(limit.retryAfterSeconds),
      });
    }
    // The actor hash is computed here, before any transaction, and used by the events the request logs.
    await this.analytics.prepare(user.id);
    this.analytics.touch(user.id);
    await this.ensureAlarm();
    const pathname = new URL(request.url).pathname;
    const template = matchTemplate(ROUTE_KEYS, pathname);
    return dispatch(routes, request, template?.template ?? pathname, {
      user,
      guildId: token.guildId,
      core: this,
      params: template?.params ?? {},
      channelId: session.channelId,
    });
  }

  // --- The raid-post channel ---

  /** True while a server admin has pinned the raid-post channel. */
  channelPinned(): boolean {
    return isChannelPinned(this.sql);
  }

  /** True if the pinned channel is `channelId`. Channel ids never leave the server. */
  isPinnedTo(channelId: string | null): boolean {
    if (channelId === null || !isChannelPinned(this.sql)) return false;
    return announceChannelId(this.sql) === channelId;
  }

  /** Pins the raid-post channel. False if the guild is not bound or the id is not a snowflake. */
  pinChannel(channelId: string): boolean {
    return pinAnnounceChannel(this.sql, channelId);
  }

  unpinChannel(): void {
    unpinAnnounceChannel(this.sql);
  }

  /** A fresh remembered answer to "may this player manage the server", or null if there is none. */
  cachedCanManage(userId: string): boolean | null {
    const hit = this.manageCache.get(userId);
    if (hit === undefined) return null;
    if (this.now() >= hit.until) {
      this.manageCache.delete(userId);
      return null;
    }
    return hit.allowed;
  }

  /**
   * Asks Discord (with the bot token) whether the player is the server's owner or has Manage Server
   * or Administrator. Answers are remembered for 60 s per player; `fresh` skips the remembered
   * answer (used before a change). Throws `DiscordError('unavailable')` when Discord cannot answer;
   * failures are never remembered.
   */
  canManageServer(userId: string, options: { fresh?: boolean } = {}): Promise<boolean> {
    if (options.fresh !== true) {
      const cached = this.cachedCanManage(userId);
      if (cached !== null) return Promise.resolve(cached);
      const running = this.manageInFlight.get(userId);
      if (running !== undefined) return running;
    }
    const guildId = this.storedGuildId();
    const api = this.options.guildApi ?? null;
    if (guildId === null || api === null) return Promise.reject(new DiscordError('unavailable'));
    const run = canManageGuild(api, guildId, userId)
      .then((allowed) => {
        if (this.manageCache.size >= MANAGE_CACHE_MAX) this.manageCache.clear();
        this.manageCache.set(userId, { allowed, until: this.now() + MANAGE_CACHE_MS });
        return allowed;
      })
      .finally(() => {
        if (this.manageInFlight.get(userId) === run) this.manageInFlight.delete(userId);
      });
    this.manageInFlight.set(userId, run);
    return run;
  }

  // --- Ledger ---

  /** Credits a balance once per (user, idempotency key). */
  credit(input: CreditInput): { applied: boolean } {
    return credit(this.storage, input, this.now());
  }

  /** Charges a balance and runs the grant atomically; retries with the same key are replays. */
  spend<T>(input: SpendInput<T>): SpendResult<T> {
    return spend(this.storage, input, this.now());
  }

  balances(userId: string): { bait: number; essence: number } {
    return getBalances(this.sql, userId);
  }

  ledgerEntries(userId: string, limit: number) {
    return listEntries(this.sql, userId, limit);
  }

  private knownPlayers(): string[] {
    return this.sql
      .exec<{ user_id: string }>('SELECT user_id FROM players')
      .toArray()
      .map((r) => r.user_id);
  }

  // --- Leet sync ---

  private getSyncState(timezone: string): {
    cursor: string | null;
    sinceDate: string;
    lastSyncedAt: number | null;
  } {
    const since = addDays(zonedDate(this.now(), timezone), -LEET_BACKFILL_DAYS);
    this.sql.exec(
      'INSERT OR IGNORE INTO leet_sync (id, cursor, since_date) VALUES (1, NULL, ?)',
      since,
    );
    const row = this.sql
      .exec<{
        cursor: string | null;
        since_date: string;
        last_synced_at: number | null;
      }>('SELECT cursor, since_date, last_synced_at FROM leet_sync WHERE id = 1')
      .one();
    return { cursor: row.cursor, sinceDate: row.since_date, lastSyncedAt: row.last_synced_at };
  }

  /**
   * A cursor only means something to the source that issued it. When the configured source kind
   * changes (for example from the mock to the real leet bot), forget the cursor and backfill again
   * from the guild-local date `LEET_BACKFILL_DAYS` ago. Credits are keyed by day id, so days that
   * were already credited are not paid twice.
   */
  private resetSyncIfSourceChanged(kind: 'http' | 'mock', timezone: string): void {
    this.getSyncState(timezone);
    const row = this.sql
      .exec<{ source: string | null }>('SELECT source FROM leet_sync WHERE id = 1')
      .one();
    if (row.source === kind) return;
    const since = addDays(zonedDate(this.now(), timezone), -LEET_BACKFILL_DAYS);
    this.sql.exec(
      'UPDATE leet_sync SET source = ?, cursor = NULL, since_date = ? WHERE id = 1',
      kind,
      since,
    );
  }

  /**
   * Pulls finalised leet days and credits Bait. Concurrent calls share one run. The await on the
   * source happens between page transactions, never inside one. Safe to repeat: credits are
   * keyed by day id.
   */
  syncLeet(): Promise<LeetSyncResult> {
    if (this.syncInFlight !== null) return this.syncInFlight;
    const run = this.runLeetSync().finally(() => {
      this.syncInFlight = null;
    });
    this.syncInFlight = run;
    return run;
  }

  private async runLeetSync(): Promise<LeetSyncResult> {
    const source = this.leetSource;
    if (source === null) {
      this.recordSyncOutcome({ error: 'disabled' });
      return { daysProcessed: 0, creditsApplied: 0 };
    }
    const guildId = this.storedGuildId() ?? this.options.guildId?.();
    if (guildId === undefined) {
      console.warn('leet sync skipped: guild id unknown');
      return { daysProcessed: 0, creditsApplied: 0 };
    }
    const timezone = this.timezone();
    this.recordSyncAttempt(timezone);
    try {
      const result = await this.pullLeetPages(source, guildId, timezone);
      this.recordSyncOutcome({ days: result.daysProcessed });
      return result;
    } catch (err) {
      this.recordSyncOutcome({ error: err instanceof LeetSourceError ? err.kind : 'internal' });
      throw err;
    }
  }

  private async pullLeetPages(
    source: LeetSource,
    guildId: string,
    timezone: string,
  ): Promise<LeetSyncResult> {
    const result: LeetSyncResult = { daysProcessed: 0, creditsApplied: 0 };
    this.resetSyncIfSourceChanged(source.kind ?? 'mock', timezone);
    const state = this.getSyncState(timezone);
    let cursor = state.cursor;

    for (let page = 0; page < SYNC_MAX_PAGES; page++) {
      const data = await source.getDays(
        guildId,
        cursor === null
          ? { timezone, since: state.sinceDate, limit: SYNC_PAGE_LIMIT }
          : { timezone, after: cursor, limit: SYNC_PAGE_LIMIT },
      );
      const nextCursor = data.nextCursor ?? cursor;
      const applied = this.storage.transactionSync(() => {
        let count = 0;
        for (const day of data.days) {
          const n = day.participants.length;
          const points = leetPointsForDay(n);
          const bait = baitForDay(n);
          if (bait === 0) continue;
          for (const participant of day.participants) {
            const credited = this.credit({
              userId: participant.userId,
              currency: 'bait',
              amount: bait,
              source: 'leet',
              idempotencyKey: `leet:${day.id}`,
              meta: { date: day.date, participants: n, points },
            });
            if (credited.applied) count++;
          }
        }
        this.sql.exec(
          'UPDATE leet_sync SET cursor = ?, last_synced_at = ? WHERE id = 1',
          nextCursor,
          this.now(),
        );
        return count;
      });
      result.daysProcessed += data.days.length;
      result.creditsApplied += applied;
      const progressed = nextCursor !== cursor;
      cursor = nextCursor;
      if (!data.hasMore || !progressed) break;
    }
    return result;
  }

  /** Notes that a sync attempt started. Its own small transaction, apart from the credits. */
  private recordSyncAttempt(timezone: string): void {
    this.getSyncState(timezone);
    this.storage.transactionSync(() => {
      this.sql.exec('UPDATE leet_sync SET last_attempt_at = ? WHERE id = 1', this.now());
    });
  }

  /**
   * Stores how a sync attempt ended: an error kind (never a message), or success with the number of
   * days processed. Its own small transaction, apart from the credits.
   */
  private recordSyncOutcome(outcome: { days: number } | { error: LeetSyncErrorKind }): void {
    this.getSyncState(this.timezone());
    const t = this.now();
    this.storage.transactionSync(() => {
      if ('error' in outcome) {
        this.sql.exec(
          'UPDATE leet_sync SET last_attempt_at = ?, last_error = ? WHERE id = 1',
          t,
          outcome.error,
        );
      } else {
        this.sql.exec(
          'UPDATE leet_sync SET last_error = NULL, last_days = ?, last_synced_at = ? WHERE id = 1',
          outcome.days,
          t,
        );
      }
    });
  }

  /** The sync's health for the API. Read-only; the source kind comes from the configured source. */
  private readSyncRow():
    | {
        last_attempt_at: number | null;
        last_synced_at: number | null;
        last_error: string | null;
        last_days: number | null;
      }
    | undefined {
    return this.sql
      .exec<{
        last_attempt_at: number | null;
        last_synced_at: number | null;
        last_error: string | null;
        last_days: number | null;
      }>(
        'SELECT last_attempt_at, last_synced_at, last_error, last_days FROM leet_sync WHERE id = 1',
      )
      .toArray()[0];
  }

  leetSyncStatus(): LeetSyncStatus {
    const row = this.readSyncRow();
    const source = this.leetSource === null ? 'disabled' : (this.leetSource.kind ?? 'mock');
    return {
      source,
      lastAttemptAt: row?.last_attempt_at ?? null,
      lastSyncedAt: row?.last_synced_at ?? null,
      lastError: source === 'disabled' ? 'disabled' : toErrorKind(row?.last_error ?? null),
      lastDays: row?.last_days ?? null,
    };
  }

  /**
   * Runs a sync from /api/me when the last one is stale, waiting at most the budget. On timeout or
   * error it returns anyway: stale data is fine. The sync keeps going in the background.
   */
  async syncIfStale(): Promise<void> {
    if (this.leetSource === null) {
      // Nothing to sync: make the reason visible, writing only when it is not stored yet.
      if (this.readSyncRow()?.last_error !== 'disabled') {
        this.recordSyncOutcome({ error: 'disabled' });
      }
      return;
    }
    const t = this.now();
    const last = this.getSyncState(this.timezone()).lastSyncedAt;
    if (last !== null && t - last < SYNC_STALE_MS) return;
    if (
      this.syncInFlight === null &&
      this.lastSyncAttemptAt !== null &&
      t - this.lastSyncAttemptAt < SYNC_RETRY_MS
    ) {
      return;
    }
    this.lastSyncAttemptAt = t;
    const run = this.syncLeet().then(
      () => undefined,
      (err: unknown) => {
        logSyncError(err);
      },
    );
    let timer: number | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.syncBudgetMs);
    });
    try {
      await Promise.race([run, timeout]);
    } finally {
      clearTimeout(timer ?? null);
    }
  }

  // --- Scheduling ---

  /**
   * One alarm serves every schedule of the guild: the daily leet sync (13:40 guild-local), the raid
   * events and pending Discord posts. The alarm is always set to the earliest of them.
   */
  private desiredAlarmAt(from: number): number | null {
    const candidates: number[] = [];
    if (this.leetSource !== null) candidates.push(this.nextSyncAt(from));
    const raidAt = this.raid.nextEventAt(this.timezone());
    if (raidAt !== null) {
      // An event that is still due after the catch-up keeps failing: retry it later, not in a loop.
      candidates.push(raidAt > this.now() ? raidAt : this.now() + RAID_RETRY_MS);
    }
    // A live finale resolves at the end of its last round: the 12th, or the one the boss falls in, plus
    // its playback (computed from the stored fight, so it follows the content-paced schedule; every
    // request that changes an ability re-arms the alarm). A read that sees the end resolves it earlier.
    // One that is still unresolved after that keeps failing: retry it later.
    const liveEndAt = this.raid.nextLiveEndAt();
    if (liveEndAt !== null) {
      candidates.push(liveEndAt > this.now() ? liveEndAt : this.now() + RAID_RETRY_MS);
    }
    if (this.options.postSender != null) {
      const postAt = nextPostAt(this.sql);
      // A post that is still due keeps failing to go out: look again later, not in a loop.
      if (postAt !== null)
        candidates.push(postAt > this.now() ? postAt : this.now() + POST_RETRY_MS);
    }
    if (this.pruneBacklog) candidates.push(this.now() + POST_RETRY_MS);
    return candidates.length === 0 ? null : Math.min(...candidates);
  }

  private async rearmAlarm(from: number): Promise<void> {
    const at = this.desiredAlarmAt(from);
    if (at !== null) await this.storage.setAlarm(at);
  }

  /**
   * Runs raid events that are due (missed ones run late, in order) and resolves live finales whose
   * last round has played. Failures never reach callers.
   */
  private catchUpRaid(until?: number): void {
    try {
      this.raid.runDue(this.timezone(), until);
      this.raid.settleDueLive();
    } catch (err) {
      console.error('raid catch-up failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  // --- Discord posts ---

  /**
   * Delivers due posts, one at a time, oldest first. Concurrent calls share one run. Never throws:
   * a post that cannot be delivered is retried later (see `recordOutcome`) and never blocks the
   * game. A 429 ends the run so the next post waits too. The network call happens outside any
   * transaction; claiming and recording are their own small ones.
   */
  deliverPosts(): Promise<void> {
    if (this.postsInFlight !== null) return this.postsInFlight;
    const run = this.runPostDelivery().finally(() => {
      this.postsInFlight = null;
    });
    this.postsInFlight = run;
    return run;
  }

  private async runPostDelivery(): Promise<void> {
    const send = this.options.postSender;
    if (send == null) return;
    try {
      for (let i = 0; i < MAX_POSTS_PER_RUN; i++) {
        const post = this.storage.transactionSync(() => claimNextPost(this.sql, this.now()));
        if (post === null) return;
        let outcome;
        try {
          outcome = await send(post.channelId, post.content);
        } catch {
          outcome = { kind: 'retry', error: 'network', afterMs: null } as const;
        }
        const failure = this.storage.transactionSync(() =>
          recordOutcome(this.sql, post, outcome, this.now(), this.analytics),
        );
        if (failure !== null) console.error('discord post failed', failure);
        if (failure === 'rate_limited') return;
      }
    } catch (err) {
      console.error('discord post delivery failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /** Starts delivery in the background when a post is due; the caller does not wait for it. */
  private kickPosts(): void {
    if (this.options.postSender == null || !hasDuePosts(this.sql, this.now())) return;
    void this.deliverPosts();
  }

  /**
   * Arms the alarm for the earliest of the next leet sync and the next raid event, unless an alarm
   * that is not later is already set. Runs due raid events first, so the alarm is never set in the
   * past. Cheap: one `getAlarm` plus a cached calendar lookup.
   */
  async ensureAlarm(): Promise<void> {
    this.catchUpRaid();
    this.kickPosts();
    const at = this.desiredAlarmAt(this.now());
    if (at === null) return;
    const existing = await this.storage.getAlarm();
    if (existing !== null && existing <= at) return;
    await this.storage.setAlarm(at);
  }

  /** The 13:40 slot a sync is due for, or null if the latest slot has already been attempted. */
  private dueSyncSlot(upTo: number): number | null {
    if (this.leetSource === null) return null;
    const slot = previousOccurrence(upTo, SYNC_HOUR, SYNC_MINUTE, this.timezone());
    const last = this.readSyncRow()?.last_attempt_at ?? null;
    return last === null || last < slot ? slot : null;
  }

  /**
   * Durable Object alarm handler: runs everything that is due in time order (raid events, the leet
   * sync), then always re-arms for the next one. Raid events are idempotent per (week, event), so a
   * duplicate or late alarm changes nothing.
   */
  async alarm(): Promise<void> {
    const now = this.now();
    const slot = this.dueSyncSlot(now + ALARM_REARM_SKEW_MS);
    // Raid events that came before the sync slot run first, then the sync, then the rest.
    if (slot !== null) this.catchUpRaid(slot);
    if (slot !== null) {
      try {
        await this.syncLeet();
      } catch (err) {
        logSyncError(err);
      }
    }
    this.catchUpRaid();
    await this.deliverPosts();
    // Old analytics rows go; a long backlog is worked off over the next alarms.
    this.pruneBacklog = this.analytics.prune();
    await this.rearmAlarm(this.now() + ALARM_REARM_SKEW_MS);
  }
}

const ERROR_KINDS: ReadonlySet<string> = new Set<LeetSyncErrorKind>([
  'unauthorized',
  'not_found',
  'rate_limited',
  'upstream',
  'timeout',
  'network',
  'invalid_response',
  'invalid_request',
  'disabled',
  'internal',
]);

/** Only known kinds leave the object, so a stored value can never leak anything else. */
function toErrorKind(stored: string | null): LeetSyncErrorKind | null {
  if (stored === null) return null;
  return ERROR_KINDS.has(stored) ? (stored as LeetSyncErrorKind) : 'internal';
}

/** Logs only the error kind or type: messages could carry upstream data. */
function logSyncError(err: unknown): void {
  const kind =
    err instanceof LeetSourceError ? err.kind : err instanceof Error ? err.name : 'unknown';
  console.error('leet sync failed', kind);
}
