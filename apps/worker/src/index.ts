import { handleAuthSession } from './auth';
import { shownBranch } from './branch';
import { createDiscordApi, type DiscordApi } from './discord';
import { OPS_REPORT_PATH, handleOpsReport } from './ops-report';
import { isDevPath } from './dev-tools';
import {
  dispatch,
  errorResponse,
  json,
  matchRoute,
  methodNotAllowed,
  notFound,
  type Routes,
} from './http';
import { TokenBucketLimiter } from './ratelimit';
import { formatSessionToken, getSessionKey, parseAuthorization, verifyTokenMac } from './session';

export { GuildDirectory } from './guild-directory';
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

  // The ops report: a burst of 5, then one request every 10 seconds, per caller.
  const opsLimiter = new TokenBucketLimiter({
    capacity: 5,
    refillPerSecond: 0.1,
    now: deps.now,
    maxKeys: 1000,
  });

  const publicRoutes: Routes<Env> = {
    '/api/health': {
      GET: () => json({ ok: true }),
    },
    '/api/config': {
      GET: (_request, env) => {
        // The deployed branch, for the footer; left out when CI did not set a plain branch name.
        const branch = shownBranch(env.BRANCH);
        return json({
          discordClientId: env.DISCORD_CLIENT_ID,
          environment: env.ENVIRONMENT,
          version: env.VERSION,
          ...(branch === undefined ? {} : { branch }),
          leetSource: env.LEET_SOURCE,
          // Staging only: lets the client load the dev panel. Absent (not false) everywhere else.
          ...(env.DEV_TOOLS === 'on' ? { devTools: true } : {}),
        });
      },
    },
    '/api/auth/session': {
      POST: (request, env) =>
        handleAuthSession(request, {
          discord: deps.createDiscord(env),
          limiter: authLimiter,
          createSession: (guildId, user, channelId) =>
            env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId)).createSession(
              guildId,
              user,
              channelId,
            ),
          formatToken: async (guildId, secret) =>
            formatSessionToken(await getSessionKey(env.DISCORD_CLIENT_SECRET), guildId, secret),
        }),
    },
  };

  /** Every route that is not public goes to the guild's Durable Object, which verifies the session. */
  async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
    // Bearer OPS_TOKEN only; session tokens are not looked at here.
    if (pathname === OPS_REPORT_PATH) return handleOpsReport(request, env, { limiter: opsLimiter });
    // The dev routes do not exist unless the dev tools are on (staging): checked before anything else, with
    // a plain 404. The Durable Object checks again.
    if (isDevPath(pathname) && env.DEV_TOOLS !== 'on') return notFound();
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
