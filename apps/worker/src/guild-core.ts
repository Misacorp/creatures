import { RULES, type Rng } from '@creatures/game';
import * as v from 'valibot';
import { DailyAllowance } from './allowance';
import { Analytics, RETENTION_MS } from './analytics';
import { attentionOf, type Attention } from './attention';
import { AnalyticsRollup, type DailyRow } from './analytics-rollup';
import { Collection } from './collection';
import { Dungeon } from './dungeon';
import { dungeonRoutes } from './dungeon-routes';
import { Gear } from './gear';
import { Games } from './games';
import { gamesRoutes } from './games-routes';
import { convertPendingGear } from './gear-convert';
import { normaliseGearRows } from './gear-normalise';
import { rollMissingTalents } from './talent-store';
import { gearRoutes } from './gear-routes';
import { convertPendingLevels } from './level-reset';
import { Weather } from './weather';
import { weatherRoutes } from './weather-routes';
import { expeditionRoutes } from './expedition-routes';
import { collectionRoutes } from './collection-routes';
import { LoungeCompany, loungeDay } from './lounge-company';
import { FINALE_ACTION_PATHS, LIVE_QUIET_PATHS, type LiveHooks } from './live-socket';
import { liveRoutes } from './live-routes';
import type { LiveSnapshot } from './raid-live-view';
import { pruneOldData } from './old-data';
import { pruneAway } from './while-away';
import { maintainedDay, markMaintained, markStartupPasses, startupPassesRan } from './maintenance';
import { DevState } from './dev-state';
import { DevTools, devRoutes, isDevPath } from './dev-tools';
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
  type SendOutcome,
} from './discord-posts';
import {
  DM_KINDS,
  cachedChannel,
  markBlocked,
  nextDmDueAt,
  pruneSent,
  readPrefs,
  scanDm,
  setPrefs,
  storeChannel,
  welcomeText,
  type DmChanges,
} from './dm-notify';
import { dmRoutes, type NotificationsView } from './dm-routes';
import {
  claimNextDm,
  enqueueDm,
  failDm,
  hasDueDms,
  nextDmAt,
  pruneOutbox,
  recordDmOutcome,
  welcomedSince,
  WELCOME_GAP_MS,
  type ClaimedDm,
} from './dm-queue';
import type { DmSender } from './dm-send';
import { dispatch, errorResponse, json, matchTemplate, notFound, type Routes } from './http';
import type { LeetSource } from './leet';
import {
  LeetSync,
  SYNC_BUDGET_MS,
  logSyncError,
  type LeetSyncResult,
  type LeetSyncStatus,
} from './leet-sync';
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
import { raidRoutes } from './raid-routes';
import { TokenBucketLimiter } from './ratelimit';
import { SNOWFLAKE_RE } from './schemas';
import {
  LOUNGE_BLOCK_MS,
  LOUNGE_BOUNDARY_DELAY_MS,
  LOUNGE_DEBOUNCE_MS,
  LOUNGE_MAX_FAILURES,
  LOUNGE_TICK_MS,
  blockMessages,
  clearBuriedFlag,
  clearMessage,
  deleteInstance,
  loungeMigration,
  playerNames,
  readLounge,
  recordInstance,
  renderLounge,
  type RaidLine,
  renderedSignature,
  setFailures,
  setLastVisit,
  setNextCheck,
  storeInstanceUsers,
  storeMessage,
  storeSignature,
  trackedInstances,
} from './lounge';
import { MIGRATIONS } from './migrations';
import { ReadMeter, pruneReads, readSourceOfPath, type ReadSource } from './read-meter';
import { liveRng } from './rng';
import type { LoungeClient, LoungeResult } from './lounge-discord';
import { nextRaidBoundary, raidStageAt } from './lounge-raid';
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
  gameDay,
  isValidTimeZone,
  nextOccurrence,
  previousOccurrence,
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
/** Alarms re-arm from slightly in the future so a marginally early wake-up cannot fire twice. */
const ALARM_REARM_SKEW_MS = 60 * 1000;
/** The analytics rollup of a finished game day runs this long after the daily reset (13:37 + 3 min = 13:40). */
const ROLLUP_DELAY_MS = 3 * 60 * 1000;
/** A raid event that keeps failing is retried this long after the last attempt. */
const RAID_RETRY_MS = 60 * 1000;
/** Posts that are due but not yet delivered are looked at again this long later by the alarm. */
const POST_RETRY_MS = 60 * 1000;
/** Most posts one delivery run sends, so a run always ends. */
const MAX_POSTS_PER_RUN = 20;
/** The same for DMs. */
const MAX_DMS_PER_RUN = 20;
/** How long a "may this player manage the server" answer from Discord is reused. */
const MANAGE_CACHE_MS = 60 * 1000;
/** Bound on remembered answers: one per player who asked. */
const MANAGE_CACHE_MAX = 200;

const LEDGER_DEFAULT_LIMIT = 20;
const LEDGER_MAX_LIMIT = 50;

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

/**
 * Query of GET /api/ledger: strict, only `limit` and `credits=bait` (Bait credits only, no spends).
 * Duplicates and unknown keys are rejected.
 */
const LedgerQuerySchema = v.strictObject({
  credits: v.optional(v.literal('bait')),
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

function parseLedgerQuery(url: URL): { limit: number; creditsOf: 'bait' | null } | null {
  const seen = new Set<string>();
  for (const [key] of url.searchParams) {
    if (seen.has(key)) return null;
    seen.add(key);
  }
  // fromEntries defines own properties, so a key like `__proto__` stays visible to the schema.
  const result = v.safeParse(LedgerQuerySchema, Object.fromEntries(url.searchParams));
  if (!result.success) return null;
  return {
    limit: result.output.limit ?? LEDGER_DEFAULT_LIMIT,
    creditsOf: result.output.credits ?? null,
  };
}

const routes: Routes<RequestContext> = {
  ...collectionRoutes,
  ...gearRoutes,
  ...dungeonRoutes,
  ...expeditionRoutes,
  ...raidRoutes,
  ...weatherRoutes,
  ...gamesRoutes,
  ...dmRoutes,
  ...liveRoutes,
  ...devRoutes,
  '/api/me': {
    GET: async (_request, { user, guildId, core }) => {
      await core.syncIfStale();
      return json({
        user,
        guildId,
        timezone: core.timezone(),
        balances: core.balances(user.id),
        // The allowance this request is the first to tell the player about (null on every later one).
        allowance: core.allowance.takeNotice(user.id),
        leetSync: core.leetSyncStatus(),
        // Staging only: lets the client load the dev panel. Absent (not false) everywhere else.
        ...(core.dev === null ? {} : { devTools: true }),
      });
    },
  },
  '/api/ledger': {
    GET: (request, { user, core }) => {
      const query = parseLedgerQuery(new URL(request.url));
      if (query === null) return errorResponse('invalid_query', 400);
      return json({ entries: core.ledgerEntries(user.id, query.limit, query.creditsOf) });
    },
  },
};

const ROUTE_KEYS = Object.keys(routes);

export interface GuildCoreOptions {
  /** The Discord calls of the lounge message. Without it the lounge message is off. */
  lounge?: LoungeClient;
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
  /**
   * Live randomness for talents: the first talent of a new creature (catch, starter, Festival grant), the
   * talent a duplicate's card rolls and the existing creatures' first roll. Defaults to
   * crypto.getRandomValues. Separate from the others, so a talent never consumes a test's scripted catch
   * draws, a quirk or a raid's fight seeds.
   */
  talentRng?: Rng;
  /** Test seam: the branches of a line, for the Keep choice (default: the shipped content). */
  branchesOf?: (line: string) => readonly string[];
  /**
   * Live randomness for the end-of-trip choice, push-on results and the journal of expeditions.
   * Defaults to crypto.getRandomValues. Separate from `rng` and `gearRng`, so none of them ever
   * consumes a test's scripted catch or loot draws.
   */
  tripRng?: Rng;
  /**
   * Live randomness for gear and crafting: every drop (raid, expedition, Festival, welcome kit) and the
   * result of every claimed job. Defaults to crypto.getRandomValues. Separate from the others, so a
   * drop never consumes a test's scripted catch draws or a raid's fight seeds.
   */
  gearRng?: Rng;
  /**
   * Live randomness for the daily dungeon: each run's seed and each day's modifier seed. Defaults to
   * crypto.getRandomValues. Separate from the others, so a dungeon run never consumes a test's scripted
   * draws and a test can script the seed of a run.
   */
  dungeonRng?: Rng;
  /**
   * Live randomness for the Valley Games: each day's lineup and each show's seed (drawn at the lock).
   * Defaults to crypto.getRandomValues. Separate from the others, so a show never consumes a test's
   * scripted draws and a test can script a show's seed.
   */
  gamesRng?: Rng;
  /**
   * Live randomness for the valley's weather: the Boon and Omen of a day, drawn a day ahead. Defaults to
   * crypto.getRandomValues. Separate from the others, so a draw never consumes a test's scripted draws.
   */
  weatherRng?: Rng;
  /**
   * Whether the valley has weather (default true). Only tests turn it off, so that the many tests of
   * other features keep exact trip times, loot and experience; the weather tests leave it on.
   */
  weather?: boolean;
  /** Fallback guild id (the Durable Object's name), used only until one is stored. */
  guildId?: () => string | undefined;
  /** Builds the leet source. Returning null disables syncing (fail closed). */
  createLeetSource?: (knownPlayers: () => string[]) => LeetSource | null;
  /** How long /api/me waits for a sync before answering with stale data. */
  syncBudgetMs?: number;
  /**
   * Whether the daily Bait allowance is paid (default true). Only tests turn it off, so that the many
   * tests of other features keep exact Bait balances; the allowance tests leave it on.
   */
  dailyAllowance?: boolean;
  /** Delivers Discord posts. Without one, posts stay queued and the alarm ignores them. */
  postSender?: PostSender | null;
  /**
   * Opens DM channels and sends the opt-in DMs (see `dm-notify.ts`). Without one, players can still see
   * their settings (marked unavailable) but nothing is queued, delivered or scheduled.
   */
  dmSender?: DmSender | null;
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
  /**
   * Staging only: the dev tools are on (the `DEV_TOOLS` var is "on", see `dev-tools.ts`): the `/api/dev/*`
   * routes exist and game time is the real clock plus the guild's dev clock offset. Off (the default),
   * `/api/dev/*` answers 404 and a stored offset is ignored.
   */
  devTools?: boolean;
  /**
   * The deployed build (the git commit). The start-up passes in `migrate` run once per build instead of
   * on every start. Without one (local dev, tests) they run on every start.
   */
  build?: string;
  /**
   * The live sockets (see `live-socket.ts`): makes tickets, is told when a player changed something, and
   * is ticked by the alarm for the finale. Without it the ticket routes answer 404 and nothing is pushed.
   */
  live?: LiveHooks;
}

export { SYNC_BUDGET_MS } from './leet-sync';
export type { LeetSyncResult, LeetSyncStatus } from './leet-sync';

type CoreStorage = Pick<DurableObjectStorage, 'sql' | 'transactionSync' | 'getAlarm' | 'setAlarm'>;

/**
 * All game logic of a guild's Durable Object, kept free of the runtime class so tests can drive it
 * with a fake clock. The Durable Object class is a thin wrapper around this.
 */
export class GuildCore {
  private readonly limiter: TokenBucketLimiter;
  /** Counts the rows read per source and game day (`read-meter.ts`). */
  private readonly meter: ReadMeter;
  private readonly storage: CoreStorage;
  /** The daily leet sync (`leet-sync.ts`); `syncLeet`, `leetSyncStatus` and `syncIfStale` delegate to it. */
  private readonly leet: LeetSync;
  /**
   * The game clock: everything in the guild's game logic (calendar, trips, jobs, raids, posts, alarms)
   * reads time through it. It is exactly the real clock unless the dev tools are on, when it is the real
   * clock plus the guild's dev clock offset. Sessions, the rate limit and the "may manage" cache keep real time.
   */
  private readonly now: () => number;
  /** Set only when the dev tools are on (staging). */
  private readonly devState: DevState | null;
  /** The dev clock offset, read once and kept in memory (only this object writes it). */
  private offsetCache: number | null = null;
  /** The dev tools: null unless `DEV_TOOLS` is on. Routes under `/api/dev` use it. */
  readonly dev: DevTools | null;
  readonly collection: Collection;
  /** The lounge's live socket hooks, or null when there is none (tests, or no flag). */
  readonly live: LiveHooks | null;
  /** Lounging with company: the lounger's experience for time spent in the room with others. */
  private readonly company: LoungeCompany;
  readonly gear: Gear;
  readonly dungeon: Dungeon;
  readonly raid: Raid;
  /** The Valley Games: the daily show, its entries, medals and the Prize Stall (see `games.ts`). */
  readonly games: Games;
  /** The valley's daily Boon and Omen, drawn a day ahead (see `weather.ts`). */
  readonly weather: Weather;
  readonly analytics: Analytics;
  readonly rollup: AnalyticsRollup;
  /** The daily Bait allowance, granted on a player's first authenticated request of a game day. */
  readonly allowance: DailyAllowance;
  private postsInFlight: Promise<void> | null = null;
  private dmsInFlight: Promise<void> | null = null;
  private loungeInFlight: Promise<void> | null = null;
  /** The last analytics prune left old rows behind: the alarm comes back soon to continue. */
  private pruneBacklog = false;
  /** The guild's timezone, cached per object; cleared whenever it changes. */
  private cachedTimezone: string | null = null;
  /** Recent "may manage the server" answers per player, and lookups that are still running. */
  private readonly manageCache = new Map<string, { allowed: boolean; until: number }>();
  private readonly manageInFlight = new Map<string, Promise<boolean>>();
  /** Live randomness for gear: drops, crafts and the one-time conversion of old gear. */
  private readonly gearRng: Rng;
  /** Live randomness for talents: a new creature's, a duplicate's and the first roll of the existing creatures'. */
  private readonly talentRng: Rng;

  constructor(
    rawStorage: CoreStorage,
    private readonly realNow: () => number,
    private readonly options: GuildCoreOptions = {},
  ) {
    // Everything below reads through the meter (`read-meter.ts`): it counts the rows each statement reads.
    this.meter = new ReadMeter(rawStorage.sql);
    const storage: CoreStorage = {
      sql: this.meter.sql,
      transactionSync: (fn) => rawStorage.transactionSync(fn),
      getAlarm: () => rawStorage.getAlarm(),
      setAlarm: (at, options) => rawStorage.setAlarm(at, options),
    };
    this.storage = storage;
    this.devState = options.devTools === true ? new DevState(storage.sql) : null;
    const now = this.devState === null ? realNow : () => realNow() + this.devOffset();
    this.now = now;
    this.leet = new LeetSync({
      storage,
      now,
      source: options.createLeetSource?.(() => this.knownPlayers()) ?? null,
      timezone: () => this.timezone(),
      guildId: () => this.storedGuildId() ?? options.guildId?.(),
      budgetMs: options.syncBudgetMs ?? SYNC_BUDGET_MS,
    });
    const quirkRng = options.quirkRng ?? liveRng();
    const talentRng = options.talentRng ?? liveRng();
    this.talentRng = talentRng;
    // Analytics keeps real time: its events and retention are about the real world.
    this.analytics = new Analytics({
      storage,
      now: realNow,
      ...(options.analyticsSecret === undefined ? {} : { secret: options.analyticsSecret }),
    });
    // The weather draws with live randomness at the moment a day is drawn, on the game clock.
    this.weather = new Weather({
      storage,
      now,
      rng: options.weatherRng ?? liveRng(),
      timezone: () => this.timezone(),
      analytics: this.analytics,
      enabled: options.weather !== false,
    });
    // Rollups keep real time too, like the events they count.
    this.rollup = new AnalyticsRollup({ storage, now: realNow, timezone: () => this.timezone() });
    this.allowance = new DailyAllowance(storage, this.analytics, now, () => this.timezone());
    const gearRng = options.gearRng ?? liveRng();
    this.gearRng = gearRng;
    this.collection = new Collection({
      storage,
      now,
      dev: this.devState ?? undefined,
      analytics: this.analytics,
      rng: options.rng ?? liveRng(),
      quirkRng,
      talentRng,
      gearRng,
      branchesOf: options.branchesOf,
      tripRng: options.tripRng ?? liveRng(),
      weather: this.weather,
      gameDay: () => loungeDay(this.now(), this.timezone()).day,
    });
    this.gear = new Gear({
      storage,
      now,
      rng: gearRng,
      analytics: this.analytics,
      weather: this.weather,
    });
    this.dungeon = new Dungeon({
      storage,
      now,
      rng: options.dungeonRng ?? liveRng(),
      gearRng,
      timezone: () => this.timezone(),
      analytics: this.analytics,
      dev: this.devState ?? undefined,
      weather: this.weather,
    });
    this.raid = new Raid({
      storage,
      now,
      rng: options.raidRng ?? liveRng(),
      practice: options.raidPractice === true,
      socketWatchers: (week, party) => this.live?.finaleWatchers(week, party) ?? new Set(),
      analytics: this.analytics,
      quirkRng,
      talentRng,
      gearRng,
      ...(options.readinessRng === undefined ? {} : { readinessRng: options.readinessRng }),
    });
    this.games = new Games({
      storage,
      now,
      rng: options.gamesRng ?? liveRng(),
      gearRng,
      timezone: () => this.timezone(),
      analytics: this.analytics,
    });
    this.limiter = new TokenBucketLimiter({
      capacity: RATE_CAPACITY,
      refillPerSecond: RATE_REFILL_PER_SECOND,
      now: realNow,
      maxKeys: RATE_MAX_KEYS,
    });
    this.live = options.live ?? null;
    this.company = new LoungeCompany({
      storage,
      analytics: this.analytics,
      timezone: () => this.timezone(),
      // Sockets keep real time; the game day follows the dev clock where it runs.
      gameOffset: () => this.now() - realNow(),
      loungerOf: (userId) => this.collection.lounge.resolve(userId),
      onPaid: (userId, paid) => {
        this.live?.notifyLoungeXp(userId, paid);
      },
    });
    this.dev =
      this.devState === null
        ? null
        : new DevTools({
            storage,
            state: this.devState,
            now,
            realNow,
            timezone: () => this.timezone(),
            analytics: this.analytics,
            raid: this.raid,
            games: this.games,
            weather: this.weather,
            rng: options.raidRng ?? liveRng(),
            gearRng,
            quirkRng,
            talentRng,
            offset: {
              get: () => this.devOffset(),
              set: (ms) => {
                this.setDevOffset(ms);
              },
              invalidate: () => {
                this.offsetCache = null;
              },
            },
            afterClockChange: async () => {
              // The game catches up to the new time and the alarm is set for it (real time).
              this.weather.ensure();
              this.catchUpRaid();
              this.catchUpGames();
              this.scanDmDue();
              this.kickPosts();
              this.kickDms();
              await this.rearmAlarm(this.now() + ALARM_REARM_SKEW_MS);
            },
            // Rolls up the finished game days not rolled yet, then today so far.
            rollupNow: () =>
              Promise.resolve({ rolled: this.rollup.runDue(), today: this.rollup.rollToday() }),
          });
  }

  /** The dev clock offset in ms: always 0 when the dev tools are off, whatever is stored. */
  private devOffset(): number {
    if (this.devState === null) return 0;
    this.offsetCache ??= this.devState.readOffset();
    return this.offsetCache;
  }

  private setDevOffset(ms: number): void {
    if (this.devState === null) throw new Error('dev tools are off');
    this.devState.writeOffset(ms);
    // Read again on the next use: if the tool's transaction rolls back, the stored value wins.
    this.offsetCache = null;
  }

  /** Alarms are real time: a time on the game clock is moved back by the dev clock offset. */
  private realAt(gameMs: number): number {
    return gameMs - this.devOffset();
  }

  private get sql(): SqlStorage {
    return this.storage.sql;
  }

  /** Brings the schema up to date. Call inside `blockConcurrencyWhile`. */
  migrate(): void {
    try {
      this.runMigrations();
    } finally {
      // The start's rows are added to the day's counter at the next flush.
      this.meter.settle('start');
    }
  }

  /** Adds the rows read since the last flush to `source` and to today's counter. Never throws. */
  private flushReads(source: ReadSource): void {
    try {
      this.meter.flush(source, gameDay(this.realNow(), this.timezone(), RULES.daily.reset));
    } catch (err) {
      console.error('read meter failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /** The hibernation handlers and the socket upgrade call this when they are done (source `socket`). */
  flushSocketReads(): void {
    this.flushReads('socket');
  }

  private runMigrations(): void {
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
    // The lounge tables, even where another branch's migration 33 ran first (staging; see lounge.ts).
    this.storage.transactionSync(() => {
      loungeMigration(this.sql);
    });
    // The passes below read whole tables, and the object starts again after every sleep (between the
    // lounge's minute ticks while sockets are open): they run once per deployed build. Each is idempotent,
    // and every deploy is a new build, so a branch switch on the shared staging database runs them again.
    const build = this.options.build;
    if (build !== undefined && startupPassesRan(this.sql, build)) return;
    // Rows of an earlier shape of gear v2 (staging ran one before its migration 27 was edited in place) are
    // brought to today's shape first, so nothing below or in a view meets an item it cannot read.
    normaliseGearRows(this.storage);
    // The first load after the gear v2 migration: every player who had gear is converted, once, with
    // live randomness (idempotent: nothing is waiting on later starts).
    convertPendingGear({
      storage: this.storage,
      now: this.now,
      rng: this.gearRng,
      analytics: this.analytics,
    });
    // The first load after the creatures B migration: every creature's level is halved and the Bait the
    // removed levels cost is refunded, once per player. After the gear conversion (it takes off what the
    // halved level cannot wear) and before the talent rolls (a creature that has none yet only rolls the
    // slots its new level opens); see level-reset.ts.
    convertPendingLevels({ storage: this.storage, now: this.now, analytics: this.analytics });
    // The first load after the creatures A migration: every creature without a talent gets the slots its
    // level has opened rolled, once, with live randomness (idempotent: nothing is waiting later).
    rollMissingTalents(this.storage, this.talentRng, this.now(), this.analytics);
    if (build !== undefined) markStartupPasses(this.sql, build);
  }

  /**
   * Upserts the player and creates a session. Returns the secret half of the token. `channelId` is
   * the channel Discord says the Activity was launched from: the session remembers it, and unless a
   * server admin pinned the announcement channel it becomes the announcement channel ("the channel
   * most recently launched from"). Anything that is not a snowflake is ignored. `instanceId` is the
   * Activity instance Discord confirmed (only ever pass a verified one): the lounge message tracks it.
   */
  async createSession(
    guildId: string,
    user: SessionUser,
    channelId?: string | null,
    instanceId?: string | null,
  ): Promise<string> {
    const secret = generateSessionSecret();
    const tokenHash = await hashSecret(secret);
    const t = this.realNow();
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
    if (this.options.lounge != null && typeof instanceId === 'string') {
      // Its own transaction: the lounge message must never stop a login.
      try {
        this.storage.transactionSync(() => recordInstance(this.sql, instanceId, user.id, t));
      } catch (err) {
        console.error('lounge record failed', err instanceof Error ? err.name : 'unknown');
      }
    }
    try {
      await this.ensureAlarm();
    } finally {
      this.flushReads('request:session');
    }
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

  /** The player's notification pips and when to look again (see `attention.ts`). Read-only apart from the raid week lookup. */
  attention(userId: string): Attention {
    return attentionOf(this, userId, this.timezone(), this.now());
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
    this.catchUpGames();
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
    const t = this.realNow();
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

  /**
   * The analytics rollup rows of the game days `from` to `to` (inclusive), and of the `compare` range
   * when given, for the ops report: one call answers both ranges. Counts only: no player, hash or
   * text is in them. Called over RPC by the Worker, never from a route.
   */
  analyticsDaily(
    from: string,
    to: string,
    compare: { from: string; to: string } | null = null,
  ): { current: DailyRow[]; previous: DailyRow[] | null } {
    try {
      return {
        current: this.rollup.rows(from, to),
        previous: compare === null ? null : this.rollup.rows(compare.from, compare.to),
      };
    } finally {
      this.flushReads('request:other');
    }
  }

  /** Handles an authenticated API request forwarded by the Worker. */
  async handle(request: Request): Promise<Response> {
    try {
      return await this.handleRequest(request);
    } finally {
      this.flushReads(readSourceOfPath(new URL(request.url).pathname));
    }
  }

  private async handleRequest(request: Request): Promise<Response> {
    // The dev routes do not exist unless the dev tools are on: checked before anything else, with a
    // plain 404.
    const pathname = new URL(request.url).pathname;
    if (this.dev === null && isDevPath(pathname)) return notFound();
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
    // The first authenticated request of a game day pays the daily allowance (once, race-safe).
    if (this.options.dailyAllowance !== false) this.allowance.grant(user.id);
    await this.ensureAlarm();
    const template = matchTemplate(ROUTE_KEYS, pathname);
    const response = await dispatch(routes, request, template?.template ?? pathname, {
      user,
      guildId: token.guildId,
      core: this,
      params: template?.params ?? {},
      channelId: session.channelId,
    });
    // A change by this player may show in the living room, or in their party's finale: tell the live
    // sockets (if any).
    if (this.live !== null && request.method !== 'GET' && response.ok)
      this.pushLive(pathname, user.id);
    return response;
  }

  /** Never throws: the push is a courtesy, the request already succeeded. */
  private pushLive(pathname: string, userId: string): void {
    if (this.live === null || LIVE_QUIET_PATHS.has(pathname)) return;
    try {
      this.live.notify(userId);
    } catch (err) {
      console.error('lounge push failed', err instanceof Error ? err.name : 'unknown');
    }
    // Fire, Hold, Unhold (and a practice start) change what the party's other watchers see.
    if (!FINALE_ACTION_PATHS.has(pathname)) return;
    try {
      this.live.notifyFinale(userId);
    } catch (err) {
      console.error('finale push failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /**
   * The finale snapshot of one player for a push, built like `GET /api/raid/live` builds it. Null when
   * the player's party or the week is not the one asked for.
   */
  finaleSnapshotFor(userId: string, week: string, party: number): LiveSnapshot | null {
    const snapshot = this.raid.liveSnapshot(userId, this.timezone());
    return snapshot.week === week && snapshot.party === party ? snapshot : null;
  }

  /** The next moment the finale of one party changes shape (see `Raid.nextPushAt`). */
  finaleNextChangeAt(week: string, party: number): number | null {
    return this.raid.nextPushAt(week, party, this.timezone());
  }

  /** Tells the finale's open sockets that the clock may have moved on (the alarm calls it). */
  private tickFinale(): void {
    try {
      this.live?.tickFinale();
    } catch (err) {
      console.error('finale tick failed', err instanceof Error ? err.name : 'unknown');
    }
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
    if (this.realNow() >= hit.until) {
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
        this.manageCache.set(userId, { allowed, until: this.realNow() + MANAGE_CACHE_MS });
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

  ledgerEntries(userId: string, limit: number, creditsOf: 'bait' | 'essence' | null = null) {
    return listEntries(this.sql, userId, limit, creditsOf);
  }

  private knownPlayers(): string[] {
    return (
      this.sql
        // Simulated raid guests from the staging dev tools are not real Discord users.
        .exec<{ user_id: string }>(
          "SELECT user_id FROM players WHERE user_id NOT LIKE 'dev-guest-%'",
        )
        .toArray()
        .map((r) => r.user_id)
    );
  }

  // --- Leet sync (see `leet-sync.ts`) ---

  /** Pulls finalised leet days and credits Bait. Concurrent calls share one run. */
  syncLeet(): Promise<LeetSyncResult> {
    return this.leet.sync();
  }

  /** The sync's health for the API. Read-only. */
  leetSyncStatus(): LeetSyncStatus {
    return this.leet.status();
  }

  /** Runs a sync from /api/me when the last one is stale, waiting at most the budget. */
  syncIfStale(): Promise<void> {
    return this.leet.syncIfStale();
  }

  // --- Scheduling ---

  /**
   * One alarm serves every schedule of the guild: the daily leet sync (13:40 guild-local), the raid
   * events and pending Discord posts. The alarm is always set to the earliest of them.
   */
  private desiredAlarmAt(from: number): number | null {
    const candidates: number[] = [];
    if (this.leet.enabled) candidates.push(this.nextSyncAt(from));
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
    // A finale socket is open: wake at the next round start to push it (the schedule above is untouched).
    const finalePushAt = this.live?.nextFinaleAt() ?? null;
    if (finalePushAt !== null) candidates.push(finalePushAt);
    // The Valley Games: the next lock and the end of a show not awarded yet. One still due after the
    // catch-up keeps failing: retry it later.
    const gamesAt = this.games.nextEventAt();
    if (gamesAt !== null) {
      candidates.push(gamesAt > this.now() ? gamesAt : this.now() + RAID_RETRY_MS);
    }
    if (this.options.postSender != null) {
      const postAt = nextPostAt(this.sql);
      // A post that is still due keeps failing to go out: look again later, not in a loop.
      if (postAt !== null)
        candidates.push(postAt > this.now() ? postAt : this.now() + POST_RETRY_MS);
    }
    if (this.options.dmSender != null) {
      // Opted-in players' next trip end, job end, finale ping or stall opening.
      const dueAt = nextDmDueAt(this.sql, this.now(), this.timezone());
      if (dueAt !== null) candidates.push(dueAt);
      // A DM that is still due keeps failing to go out: look again later, not in a loop.
      const dmAt = nextDmAt(this.sql);
      if (dmAt !== null) candidates.push(dmAt > this.now() ? dmAt : this.now() + POST_RETRY_MS);
    }
    if (this.pruneBacklog) candidates.push(this.now() + POST_RETRY_MS);
    if (this.options.lounge != null) {
      // The lounge keeps real time; like the rollup it is put on the game clock here.
      const checkAt = readLounge(this.sql).nextCheckAt;
      if (checkAt !== null) {
        const offset = this.devOffset();
        const real = this.realNow();
        candidates.push((checkAt > real ? checkAt : real + POST_RETRY_MS) + offset);
      }
    }
    // The daily analytics rollup, just after the game day turns over.
    // Rollups run on real time (see the constructor), so this candidate is found in real time and then
    // put on the game clock like the others (the offset is 0 unless the staging dev clock moved).
    if (this.storedGuildId() !== null) {
      const offset = this.devOffset();
      candidates.push(this.nextRollupAt(from - offset) + offset);
    }
    // The valley's weather of the next game day is drawn at the daily reset (13:37 guild-local).
    if (this.weather.enabled && this.storedGuildId() !== null) {
      const { hour, minute } = RULES.daily.reset;
      candidates.push(nextOccurrence(from, hour, minute, this.timezone()));
    }
    return candidates.length === 0 ? null : Math.min(...candidates);
  }

  /**
   * The next instant, after `from`, a finished game day can be rolled up: the daily reset plus
   * `ROLLUP_DELAY_MS`, which is the leet sync's 13:40 slot, so the two share one alarm.
   */
  private nextRollupAt(from: number): number {
    const { hour, minute } = RULES.daily.reset;
    return nextOccurrence(from - ROLLUP_DELAY_MS, hour, minute, this.timezone()) + ROLLUP_DELAY_MS;
  }

  private async rearmAlarm(from: number): Promise<void> {
    const at = this.desiredAlarmAt(from);
    if (at !== null) await this.storage.setAlarm(this.realAt(at));
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

  /** Runs the Valley Games' due lock and awards (missed ones run late). Failures never reach callers. */
  private catchUpGames(): void {
    try {
      this.games.runDue();
    } catch (err) {
      console.error('games catch-up failed', err instanceof Error ? err.name : 'unknown');
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

  // --- Discord DMs (see `dm-notify.ts`) ---

  /** A player's DM settings, and whether this server can send DMs at all. */
  dmView(userId: string): NotificationsView {
    return { ...readPrefs(this.sql, userId), available: this.options.dmSender != null };
  }

  /**
   * Turns kinds of DM on or off for a player and clears any block (flipping a setting is how a blocked
   * player tries again). Turning on the first kind queues a welcome DM, which also shows whether DMs
   * reach them; so does trying again after a block. The welcome is sent at most once an hour per player.
   */
  async setDmPrefs(userId: string, changes: DmChanges): Promise<NotificationsView> {
    const now = this.now();
    const canSend = this.options.dmSender != null;
    const { before, after } = this.storage.transactionSync(() => {
      const result = setPrefs(this.sql, userId, changes, now);
      const wasOn = DM_KINDS.some((k) => result.before.kinds[k]);
      const isOn = DM_KINDS.some((k) => result.after.kinds[k]);
      const retry = result.before.blocked && isOn;
      if (
        canSend &&
        isOn &&
        (retry || (!wasOn && !welcomedSince(this.sql, userId, now - WELCOME_GAP_MS)))
      ) {
        enqueueDm(
          this.sql,
          {
            key: `welcome:${userId}:${String(now)}`,
            userId,
            content: welcomeText(result.after.kinds),
          },
          now,
        );
      }
      return result;
    });
    for (const kind of DM_KINDS) {
      const wanted = changes[kind];
      if (wanted !== undefined && wanted !== before.kinds[kind]) {
        this.analytics.record({ kind: 'dm_pref', which: kind, on: wanted }, userId);
      }
    }
    // The new setting may be due sooner than the alarm: re-arm, and send the welcome.
    await this.ensureAlarm();
    return { ...after, available: canSend };
  }

  /** Finds the DMs that came due and queues them. Never throws: a failed scan is tried again at the next one. */
  private scanDmDue(): void {
    if (this.options.dmSender == null) return;
    try {
      this.storage.transactionSync(() =>
        scanDm(this.sql, {
          now: this.now(),
          tz: this.timezone(),
          realAt: (gameMs) => this.realAt(gameMs),
        }),
      );
    } catch (err) {
      console.error('dm scan failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /**
   * Delivers due DMs, oldest first. Concurrent calls share one run. Never throws. Like the posts, the
   * network calls happen outside any transaction and a 429 ends the run.
   */
  deliverDms(): Promise<void> {
    if (this.dmsInFlight !== null) return this.dmsInFlight;
    const run = this.runDmDelivery().finally(() => {
      this.dmsInFlight = null;
    });
    this.dmsInFlight = run;
    return run;
  }

  private async runDmDelivery(): Promise<void> {
    const sender = this.options.dmSender;
    if (sender == null) return;
    try {
      for (let i = 0; i < MAX_DMS_PER_RUN; i++) {
        const dm = this.storage.transactionSync(() => claimNextDm(this.sql, this.now()));
        if (dm === null) return;
        // Discord refused this player already (an earlier message of this run): do not ask again.
        if (readPrefs(this.sql, dm.userId).blocked) {
          this.storage.transactionSync(() => {
            failDm(this.sql, dm);
          });
          continue;
        }
        let outcome;
        try {
          outcome = await this.sendDm(sender, dm);
        } catch {
          outcome = { kind: 'retry', error: 'network', afterMs: null } as const;
        }
        const failure = this.storage.transactionSync(() => {
          if (outcome.kind === 'blocked') markBlocked(this.sql, dm.userId, this.now());
          return recordDmOutcome(this.sql, dm, outcome, this.now(), this.analytics);
        });
        if (failure !== null) console.error('discord dm failed', failure);
        if (failure === 'rate_limited') return;
      }
    } catch (err) {
      console.error('discord dm delivery failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /**
   * One attempt to deliver a DM: through the cached DM channel, or a freshly opened one. A channel that
   * Discord no longer knows (404) is forgotten and opened again once. A refusal of DMs (403) is `blocked`.
   */
  private async sendDm(
    sender: DmSender,
    dm: ClaimedDm,
  ): Promise<SendOutcome | { kind: 'blocked' }> {
    let channel = cachedChannel(this.sql, dm.userId);
    let reopened = false;
    for (;;) {
      if (channel === null) {
        const opened = await sender.openChannel(dm.userId);
        if (opened.kind === 'failed' && opened.error === 'forbidden') return { kind: 'blocked' };
        if (opened.kind !== 'ok') return opened;
        channel = opened.channelId;
        reopened = true;
        storeChannel(this.sql, dm.userId, channel);
      }
      const sent = await sender.send(channel, dm.content);
      if (sent.kind === 'failed' && sent.error === 'forbidden') return { kind: 'blocked' };
      if (sent.kind === 'failed' && sent.error === 'not_found' && !reopened) {
        storeChannel(this.sql, dm.userId, null);
        channel = null;
        reopened = true;
        continue;
      }
      return sent;
    }
  }

  /** Starts DM delivery in the background when one is due; the caller does not wait for it. */
  private kickDms(): void {
    if (this.options.dmSender == null || !hasDueDms(this.sql, this.now())) return;
    void this.deliverDms();
  }

  // --- The lounge message ---

  /**
   * Looks at the tracked Activity instances and brings the lounge message up to date, when a check
   * is due. Concurrent calls share one run. Never throws, and never blocks a request.
   */
  runLounge(): Promise<void> {
    if (this.loungeInFlight !== null) return this.loungeInFlight;
    const run = this.runLoungeCheck().finally(() => {
      this.loungeInFlight = null;
    });
    this.loungeInFlight = run;
    return run;
  }

  private async runLoungeCheck(): Promise<void> {
    const client = this.options.lounge;
    if (client == null) return;
    try {
      const t = this.realNow();
      const due = readLounge(this.sql).nextCheckAt;
      if (due === null || due > t) return;
      // Leased: a run that dies halfway is tried again at the next tick.
      setNextCheck(this.sql, t + LOUNGE_TICK_MS);
      const before = trackedInstances(this.sql);
      const present = await this.refreshInstances(client, t);
      // Lounging with company: who was together at the last check and still is earns the time between.
      this.company.observe(before, trackedInstances(this.sql), t);
      const retry = await this.syncLounge(client, present, t);
      const state = readLounge(this.sql);
      if (retry !== null && state.failures < LOUNGE_MAX_FAILURES) {
        setNextCheck(this.sql, t + Math.max(retry, LOUNGE_DEBOUNCE_MS));
      } else if (trackedInstances(this.sql).length === 0) {
        // A quiet message stays fresh at raid boundaries; with no message there is nothing to keep.
        const boundary =
          readLounge(this.sql).messageId === null
            ? null
            : this.realAt(nextRaidBoundary(this.now(), this.timezone()) + LOUNGE_BOUNDARY_DELAY_MS);
        setNextCheck(this.sql, boundary);
        if (retry !== null) setFailures(this.sql, 0);
      }
    } catch (err) {
      console.error('lounge check failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /** Asks Discord about every tracked instance; returns the players present. */
  private async refreshInstances(client: LoungeClient, t: number): Promise<string[]> {
    const present = new Set<string>();
    const guildId = this.storedGuildId();
    for (const tracked of trackedInstances(this.sql)) {
      try {
        const instance = await client.getInstance(tracked.id);
        if (instance === null || instance.location.guild_id !== guildId) {
          deleteInstance(this.sql, tracked.id);
          continue;
        }
        storeInstanceUsers(this.sql, tracked.id, instance.users, t);
        for (const id of trackedInstanceUsers(this.sql, tracked.id)) present.add(id);
      } catch (err) {
        // Discord cannot be asked right now: what is stored for this instance stands.
        console.error('lounge lookup failed', err instanceof Error ? err.name : 'unknown');
        for (const id of tracked.users) present.add(id);
      }
    }
    return [...present];
  }

  /**
   * Makes the message match `present`. Returns null when nothing needs retrying, or the wait in ms
   * after a transient failure. At most one message is written per call (plus the delete of a buried
   * or moved one).
   */
  private async syncLounge(
    client: LoungeClient,
    present: readonly string[],
    t: number,
  ): Promise<number | null> {
    const before = readLounge(this.sql);
    if (present.length > 0) {
      const keep = before.lastVisitUserId !== null && present.includes(before.lastVisitUserId);
      setLastVisit(
        this.sql,
        keep ? before.lastVisitUserId : (present[present.length - 1] ?? null),
        t,
      );
    }
    const state = readLounge(this.sql);
    const names = playerNames(this.sql, present);
    const lastName =
      state.lastVisitUserId === null
        ? null
        : (playerNames(this.sql, [state.lastVisitUserId]).get(state.lastVisitUserId) ?? null);
    const rendered = renderLounge({
      names: [...names.values()],
      unknown: present.length - names.size,
      lastVisit:
        state.lastVisitUserId === null || state.lastVisitAt === null
          ? null
          : { name: lastName, at: state.lastVisitAt },
      raid: this.loungeRaidLine(),
    });
    const signature = renderedSignature(rendered);
    const channel = announceChannelId(this.sql);
    // Nothing to do without a channel, while paused, or before anyone has ever been there.
    if (channel === null || (state.blockedUntil !== null && state.blockedUntil > t)) return null;
    if (state.messageId === null && state.lastVisitUserId === null) return null;

    let messageId = state.messageId;
    // A message posted before the embed (plain text, SUPPRESS_EMBEDS set, its signature not JSON) cannot
    // be edited into an embed: an edit cannot clear that flag reliably, so it is replaced once.
    if (messageId !== null && state.content !== null && !state.content.startsWith('[')) {
      await client.deleteMessage(state.channelId ?? channel, messageId);
      clearMessage(this.sql);
      messageId = null;
    }
    if (messageId !== null && state.channelId !== channel) {
      await client.deleteMessage(state.channelId ?? '', messageId);
      clearMessage(this.sql);
      messageId = null;
    }
    if (messageId !== null && state.checkBuried) {
      const recent = await client.recentMessageIds(channel);
      // A failed listing (no permission to read history) leaves the message where it is.
      if (recent.kind === 'ok' && !recent.value.includes(messageId)) {
        await client.deleteMessage(channel, messageId);
        clearMessage(this.sql);
        messageId = null;
      }
    }
    clearBuriedFlag(this.sql);

    if (messageId !== null) {
      if (state.content === signature && state.channelId === channel) return null;
      const body = { ...rendered, iconUrl: await client.appIconUrl() };
      const edited = await client.editMessage(channel, messageId, body);
      if (edited.kind === 'ok') {
        storeSignature(this.sql, signature);
        return null;
      }
      if (edited.kind !== 'not_found') return this.loungeFailure(edited, t);
      clearMessage(this.sql);
    }
    const created = await client.createMessage(channel, {
      ...rendered,
      iconUrl: await client.appIconUrl(),
    });
    if (created.kind === 'ok') {
      storeMessage(this.sql, channel, created.value, signature);
      return null;
    }
    return this.loungeFailure(created, t);
  }

  /**
   * The raid weekend line for the lounge message, from the game clock; Discord timestamps are real
   * time. Never throws: any error means no line.
   */
  private loungeRaidLine(): RaidLine | null {
    try {
      const stage = raidStageAt(this.sql, this.now(), this.timezone());
      if (stage === null) return null;
      return stage.stage === 'phase2' || stage.stage === 'finale'
        ? { ...stage, at: this.realAt(stage.at) }
        : stage;
    } catch (err) {
      console.error('lounge raid line failed', err instanceof Error ? err.name : 'unknown');
      return null;
    }
  }

  /** Records a failed Discord call (kind only in the log); returns the wait before a retry, or null. */
  private loungeFailure(result: LoungeResult<unknown>, t: number): number | null {
    if (result.kind === 'ok') return null;
    const kind = result.kind === 'retry' || result.kind === 'failed' ? result.error : result.kind;
    console.error('lounge message failed', kind);
    if (result.kind === 'forbidden' || result.kind === 'not_found') {
      blockMessages(this.sql, t + LOUNGE_BLOCK_MS);
      return null;
    }
    if (result.kind === 'failed') return null;
    setFailures(this.sql, readLounge(this.sql).failures + 1);
    return result.afterMs ?? LOUNGE_TICK_MS;
  }

  /** Starts a lounge check in the background when one is due; the caller does not wait for it. */
  private kickLounge(): void {
    if (this.options.lounge == null) return;
    const due = readLounge(this.sql).nextCheckAt;
    if (due !== null && due <= this.realNow()) void this.runLounge();
  }

  /**
   * Arms the alarm for the earliest of the next leet sync and the next raid event, unless an alarm
   * that is not later is already set. Runs due raid events first, so the alarm is never set in the
   * past. Cheap: one `getAlarm` plus a cached calendar lookup.
   */
  async ensureAlarm(): Promise<void> {
    // The days' weather first: a raid stage that is due now fights under the weather of its day.
    this.weather.ensure();
    this.catchUpRaid();
    this.catchUpGames();
    this.scanDmDue();
    this.kickPosts();
    this.kickDms();
    this.kickLounge();
    const at = this.desiredAlarmAt(this.now());
    if (at === null) return;
    const existing = await this.storage.getAlarm();
    const realAt = this.realAt(at);
    if (existing !== null && existing <= realAt) return;
    await this.storage.setAlarm(realAt);
  }

  /** The 13:40 slot a sync is due for, or null if the latest slot has already been attempted. */
  private dueSyncSlot(upTo: number): number | null {
    if (!this.leet.enabled) return null;
    const slot = previousOccurrence(upTo, SYNC_HOUR, SYNC_MINUTE, this.timezone());
    const last = this.leet.lastAttemptAt();
    return last === null || last < slot ? slot : null;
  }

  /**
   * Durable Object alarm handler: runs everything that is due in time order (raid events, the leet
   * sync), then always re-arms for the next one. Raid events are idempotent per (week, event), so a
   * duplicate or late alarm changes nothing.
   */
  async alarm(): Promise<void> {
    try {
      await this.runAlarm();
    } finally {
      this.flushReads('alarm');
    }
  }

  private async runAlarm(): Promise<void> {
    // At the daily reset: today's weather is known (it was drawn yesterday) and tomorrow's is drawn now.
    this.weather.ensure();
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
    // The fight moves with the clock: sockets watching it hear about a new round (or its end) now.
    this.tickFinale();
    // The Games' lock and awards, before the posts go out (the award queues the podium post).
    this.catchUpGames();
    this.scanDmDue();
    await this.deliverPosts();
    await this.deliverDms();
    await this.runLounge();
    this.rollup.runDue();
    this.maintain();
    await this.rearmAlarm(this.now() + ALARM_REARM_SKEW_MS);
  }

  /**
   * The cleanup passes, once per game day (they read whole tables, and the alarm can run every minute):
   * old analytics rows, gear action results, dungeon run data and the details of old trips, jobs, Games
   * days, raid weeks and Discord posts go (`old-data.ts`), and runs left open on an earlier day are closed. A long analytics backlog keeps the day unmarked, so the next alarms work it off.
   */
  private maintain(): void {
    const day = gameDay(this.now(), this.timezone(), RULES.daily.reset);
    if (maintainedDay(this.sql) === day && !this.pruneBacklog) return;
    const analyticsBacklog = this.analytics.prune();
    this.gear.prune();
    pruneReads(this.sql, addDays(day, -RETENTION_MS / 86_400_000));
    pruneSent(this.sql, this.now());
    pruneOutbox(this.sql, this.now());
    this.dungeon.closeStale();
    this.dungeon.prune();
    pruneAway(this.sql, this.now());
    const oldBacklog = pruneOldData(this.storage, this.now(), this.timezone());
    this.pruneBacklog = analyticsBacklog || oldBacklog;
    if (!this.pruneBacklog) markMaintained(this.sql, day);
  }
}

/** The players stored for a tracked instance. */
function trackedInstanceUsers(sql: SqlStorage, instanceId: string): string[] {
  return trackedInstances(sql).find((i) => i.id === instanceId)?.users ?? [];
}
