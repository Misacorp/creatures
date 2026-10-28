import { DurableObject } from 'cloudflare:workers';
import { createGuildApi } from './discord';
import { createPostSender, publicOrigin } from './discord-posts';
import { createDmSender } from './dm-send';
import { createLoungeClient } from './lounge-discord';
import { LIVE_PATH, FINALE_LIVE_PATH, RAID_LIVE_PATH } from './live-socket';
import { LiveHub } from './live-hub';
import type { DailyRow } from './analytics-rollup';
import { GuildCore, type SessionUser } from './guild-core';
import { DIRECTORY_NAME } from './guild-directory';
import { LEET_BACKFILL_DAYS, createLeetSourceFromEnv } from './leet';

/**
 * One Durable Object per Discord guild (`idFromName(guildId)`). Holds that guild's state in its
 * SQLite database. `fetch` serves authenticated API routes forwarded by the Worker; session
 * creation is an RPC method, callable only from Worker code with the binding, never over HTTP.
 */
export class GuildWorld extends DurableObject<Env> {
  private readonly core: GuildCore;
  /** The live sockets (Hibernation API) and their three pushes; `LOUNGE_LIVE`, `FINALE_LIVE` and `RAID_LIVE` turn them on. */
  readonly live: LiveHub;
  /** The UTC day this object last told the directory about its guild. */
  private directoryDay: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.live = new LiveHub({
      sockets: {
        ctx,
        enabled: {
          lounge: env.LOUNGE_LIVE === 'on',
          finale: env.FINALE_LIVE === 'on',
          raid: env.RAID_LIVE === 'on',
        },
        clientSecret: env.DISCORD_CLIENT_SECRET,
        guildId: () => ctx.id.name ?? '',
        now: Date.now,
      },
      residentOf: (userId) => this.core.collection.lounge.room([userId])[0] ?? null,
      snapshotFor: (userId, week, party) => this.core.finaleSnapshotFor(userId, week, party),
      nextChangeAt: (week, party) => this.core.finaleNextChangeAt(week, party),
    });
    this.core = new GuildCore(ctx.storage, Date.now, {
      guildId: () => ctx.id.name,
      raidPractice: env.RAID_PRACTICE === 'on',
      devTools: env.DEV_TOOLS === 'on',
      // CI sets VERSION to the commit; "dev" (local) keeps the start-up passes on every start.
      ...(env.VERSION !== 'dev' && env.VERSION !== '' ? { build: env.VERSION } : {}),
      live: this.live,
      analyticsSecret: env.DISCORD_CLIENT_SECRET,
      guildApi: createGuildApi({
        botToken: env.DISCORD_BOT_TOKEN,
        fetch: (input, init) => fetch(input, init),
      }),
      postSender: createPostSender({
        botToken: env.DISCORD_BOT_TOKEN,
        origin: publicOrigin(env.ENVIRONMENT),
        fetch: (input, init) => fetch(input, init),
      }),
      dmSender: createDmSender({
        botToken: env.DISCORD_BOT_TOKEN,
        fetch: (input, init) => fetch(input, init),
      }),
      lounge: createLoungeClient({
        botToken: env.DISCORD_BOT_TOKEN,
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        fetch: (input, init) => fetch(input, init),
      }),
      createLeetSource: (knownPlayers) =>
        createLeetSourceFromEnv(env, {
          now: Date.now,
          knownPlayers,
          backfillDays: LEET_BACKFILL_DAYS,
          fetch: (input, init) => fetch(input, init),
        }),
    });
    void ctx.blockConcurrencyWhile(() => {
      this.core.migrate();
      return Promise.resolve();
    });
  }

  async createSession(
    guildId: string,
    user: SessionUser,
    channelId: string | null,
    instanceId: string | null = null,
  ): Promise<string> {
    const secret = await this.core.createSession(guildId, user, channelId, instanceId);
    this.noteInDirectory(guildId);
    return secret;
  }

  /**
   * The analytics rollup rows of a range of game days, and of an optional compare range, for the
   * ops report (RPC only, counts only).
   */
  analyticsDaily(
    from: string,
    to: string,
    compare: { from: string; to: string } | null = null,
  ): { current: DailyRow[]; previous: DailyRow[] | null } {
    return this.core.analyticsDaily(from, to, compare);
  }

  /**
   * Tells the guild directory this guild exists, at most once a day per object. Best effort: it is
   * not awaited, and a failure is logged (error type only) and retried by a later login; it can
   * never delay or fail a login.
   */
  private noteInDirectory(guildId: string): void {
    const day = new Date().toISOString().slice(0, 10);
    if (this.directoryDay === day) return;
    this.directoryDay = day;
    try {
      const directory = this.env.GUILD_DIRECTORY.get(
        this.env.GUILD_DIRECTORY.idFromName(DIRECTORY_NAME),
      );
      this.ctx.waitUntil(
        Promise.resolve(directory.note(guildId, day)).catch((err: unknown) => {
          this.directoryDay = null;
          console.error('directory note failed', err instanceof Error ? err.name : 'unknown');
        }),
      );
    } catch (err) {
      this.directoryDay = null;
      console.error('directory note failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  override async fetch(request: Request): Promise<Response> {
    // The socket upgrades have no Authorization header: they carry a one-time ticket (live-ticket.ts).
    const { pathname } = new URL(request.url);
    if (pathname === LIVE_PATH || pathname === RAID_LIVE_PATH) {
      return this.counted(() => this.live.upgrade(request));
    }
    if (pathname === FINALE_LIVE_PATH) {
      return this.counted(async () => {
        const res = await this.live.upgrade(request);
        // A finale socket needs the alarm at the next round start (the lounge's never touches it).
        if (res.status === 101) await this.core.ensureAlarm();
        return res;
      });
    }
    return this.core.handle(request);
  }

  /** Runs socket work and adds the rows it read to the `socket` source of the day's counter (`read-meter.ts`). */
  private counted<T>(work: () => T): T {
    try {
      const result = work();
      if (result instanceof Promise) {
        return result.finally(() => {
          this.core.flushSocketReads();
        }) as T;
      }
      this.core.flushSocketReads();
      return result;
    } catch (err) {
      this.core.flushSocketReads();
      throw err;
    }
  }

  // The Hibernation API's handlers: the runtime calls them even after the object slept.
  override webSocketMessage(ws: WebSocket): void {
    this.counted(() => {
      this.live.webSocketMessage(ws);
    });
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    this.counted(() => {
      this.live.webSocketClose(ws, code);
    });
  }

  override webSocketError(ws: WebSocket): void {
    this.counted(() => {
      this.live.webSocketError(ws);
    });
  }

  override alarm(): Promise<void> {
    return this.core.alarm();
  }
}
