import { DurableObject } from 'cloudflare:workers';
import { createGuildApi } from './discord';
import { createPostSender } from './discord-posts';
import { GuildCore, type SessionUser } from './guild-core';
import { LEET_BACKFILL_DAYS, createLeetSourceFromEnv } from './leet';

/**
 * One Durable Object per Discord guild (`idFromName(guildId)`). Holds that guild's state in its
 * SQLite database. `fetch` serves authenticated API routes forwarded by the Worker; session
 * creation is an RPC method, callable only from Worker code with the binding, never over HTTP.
 */
export class GuildWorld extends DurableObject<Env> {
  private readonly core: GuildCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new GuildCore(ctx.storage, Date.now, {
      guildId: () => ctx.id.name,
      raidPractice: env.RAID_PRACTICE === 'on',
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

  createSession(guildId: string, user: SessionUser, channelId: string | null): Promise<string> {
    return this.core.createSession(guildId, user, channelId);
  }

  override fetch(request: Request): Promise<Response> {
    return this.core.handle(request);
  }

  override alarm(): Promise<void> {
    return this.core.alarm();
  }
}
