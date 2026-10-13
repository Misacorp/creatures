import { DurableObject } from 'cloudflare:workers';
import { createGuildApi } from './discord';
import { createPostSender } from './discord-posts';
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
  /** The UTC day this object last told the directory about its guild. */
  private directoryDay: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new GuildCore(ctx.storage, Date.now, {
      guildId: () => ctx.id.name,
      raidPractice: env.RAID_PRACTICE === 'on',
      devTools: env.DEV_TOOLS === 'on',
      analyticsSecret: env.DISCORD_CLIENT_SECRET,
      guildApi: createGuildApi({
        botToken: env.DISCORD_BOT_TOKEN,
        fetch: (input, init) => fetch(input, init),
      }),
      postSender: createPostSender({
        botToken: env.DISCORD_BOT_TOKEN,
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
  ): Promise<string> {
    const secret = await this.core.createSession(guildId, user, channelId);
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

  override fetch(request: Request): Promise<Response> {
    return this.core.handle(request);
  }

  override alarm(): Promise<void> {
    return this.core.alarm();
  }
}
