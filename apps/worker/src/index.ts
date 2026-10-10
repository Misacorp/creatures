import { handleAuthSession } from './auth';
import { createDiscordApi, type DiscordApi } from './discord';
import { dispatch, errorResponse, json, matchRoute, methodNotAllowed, type Routes } from './http';
import { TokenBucketLimiter } from './ratelimit';
import { formatSessionToken, getSessionKey, parseAuthorization, verifyTokenMac } from './session';

export { GuildWorld } from './guild-world';

export interface HandlerDeps {
  /** Builds the Discord client from the Worker's env. Tests inject a fake. */
  createDiscord(env: Env): DiscordApi;
  now(): number;
}

const defaultDeps: HandlerDeps = {
  createDiscord: (env) =>
    createDiscordApi({
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      botToken: env.DISCORD_BOT_TOKEN,
    }),
  now: () => Date.now(),
};

/** Builds the Worker's fetch handler. The default export uses the real Discord client and clock. */
export function createHandler(overrides: Partial<HandlerDeps> = {}): ExportedHandler<Env> {
  const deps = { ...defaultDeps, ...overrides };
  // Coarse limit per activity instance: burst of 10, then one attempt every 5 seconds.
  const authLimiter = new TokenBucketLimiter({
    capacity: 10,
    refillPerSecond: 0.2,
    now: deps.now,
    maxKeys: 5000,
  });

  const publicRoutes: Routes<Env> = {
    '/api/health': {
      GET: () => json({ ok: true }),
    },
    '/api/config': {
      GET: (_request, env) =>
        json({
          discordClientId: env.DISCORD_CLIENT_ID,
          environment: env.ENVIRONMENT,
          version: env.VERSION,
          leetSource: env.LEET_SOURCE,
        }),
    },
    '/api/auth/session': {
      POST: (request, env) =>
        handleAuthSession(request, {
          discord: deps.createDiscord(env),
          limiter: authLimiter,
          createSession: (guildId, user) =>
            env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId)).createSession(guildId, user),
          formatToken: async (guildId, secret) =>
            formatSessionToken(await getSessionKey(env.DISCORD_CLIENT_SECRET), guildId, secret),
        }),
    },
  };

  /** Every route that is not public goes to the guild's Durable Object, which verifies the session. */
  async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
    const match = matchRoute(publicRoutes, pathname, request.method);
    if (match.kind === 'ok') return dispatch(publicRoutes, request, pathname, env);
    if (match.kind === 'method_not_allowed') return methodNotAllowed(match.allow);

    // Parse strictly before touching any Durable Object, so junk never wakes one up.
    const token = parseAuthorization(request.headers.get('Authorization'));
    if (token === null) return errorResponse('invalid_session', 401);
    // The MAC proves we issued this token, so forged guild ids never address a Durable Object.
    const key = await getSessionKey(env.DISCORD_CLIENT_SECRET);
    if (!(await verifyTokenMac(key, token))) return errorResponse('invalid_session', 401);
    const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(token.guildId));
    return stub.fetch(request);
  }

  return {
    async fetch(request, env): Promise<Response> {
      const { pathname } = new URL(request.url);
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        try {
          return await handleApi(request, env, pathname);
        } catch (err) {
          // Log only the error type: messages could carry upstream data.
          console.error('unhandled error', err instanceof Error ? err.name : 'unknown');
          return errorResponse('internal_error', 500);
        }
      }
      // Only reached if run_worker_first is widened; static assets are normally served directly.
      return env.ASSETS.fetch(request);
    },
  };
}

export default createHandler();
