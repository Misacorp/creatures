import { DurableObject } from 'cloudflare:workers';
import { GuildCore, type SessionUser } from './guild-core';

/**
 * One Durable Object per Discord guild (`idFromName(guildId)`). Holds that guild's state in its
 * SQLite database. `fetch` serves authenticated API routes forwarded by the Worker; session
 * creation is an RPC method, callable only from Worker code with the binding, never over HTTP.
 */
export class GuildWorld extends DurableObject<Env> {
  private readonly core: GuildCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new GuildCore(ctx.storage, Date.now);
    void ctx.blockConcurrencyWhile(() => {
      this.core.migrate();
      return Promise.resolve();
    });
  }

  createSession(user: SessionUser): Promise<string> {
    return this.core.createSession(user);
  }

  override fetch(request: Request): Promise<Response> {
    return this.core.handle(request);
  }
}
