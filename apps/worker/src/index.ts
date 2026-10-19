import { handleAuthSession } from './auth';
import { shownBranch } from './branch';
import { createDiscordApi, type DiscordApi } from './discord';
import { INTERACTIONS_PATH, handleInteraction } from './discord-interactions';
import { handleFeedbackRoute, isFeedbackOpsPath } from './feedback-routes';
import type { FetchAttachment } from './feedback-screenshot';
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
import { LIVE_PATH } from './lounge-live';
import { parseTicket, verifyTicketMac } from './lounge-ticket';
import { TokenBucketLimiter } from './ratelimit';
import { formatSessionToken, getSessionKey, parseAuthorization, verifyTokenMac } from './session';

export { GuildDirectory } from './guild-directory';
export { GuildWorld } from './guild-world';
export { FeedbackInbox } from './feedback-inbox';

export interface HandlerDeps {
  /** Builds the Discord client from the Worker's env. Tests inject a fake. */
  createDiscord(env: Env): DiscordApi;
  now(): number;
  /** Fetches a screenshot from Discord's CDN for `/feedback`. Tests inject a fake so none hit the network. */
  fetchAttachment: FetchAttachment;
}

const defaultDeps: HandlerDeps = {
  createDiscord: (env) =>
    createDiscordApi({
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      botToken: env.DISCORD_BOT_TOKEN,
    }),
  now: () => Date.now(),
  fetchAttachment: (url, init) => fetch(url, init),
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

  // The feedback ops routes have their own limiter, so they cannot use up the report's budget. One
  // export run makes up to 2 calls per target plus one per report (20 at most), and a triage session two
  // per report, so the burst is larger: a burst of 60, then one request every 2 seconds.
  const feedbackLimiter = new TokenBucketLimiter({
    capacity: 60,
    refillPerSecond: 0.5,
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
          // The lounge's live socket (LOUNGE_LIVE; off in production until Misa says so). Absent, not false.
          ...(env.LOUNGE_LIVE === 'on' ? { loungeLive: true } : {}),
        });
      },
    },
    '/api/auth/session': {
      POST: (request, env) =>
        handleAuthSession(request, {
          discord: deps.createDiscord(env),
          limiter: authLimiter,
          createSession: (guildId, user, channelId, instanceId) =>
            env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId)).createSession(
              guildId,
              user,
              channelId,
              instanceId,
            ),
          formatToken: async (guildId, secret) =>
            formatSessionToken(await getSessionKey(env.DISCORD_CLIENT_SECRET), guildId, secret),
        }),
    },
  };

  /** Every route that is not public goes to the guild's Durable Object, which verifies the session. */
  async function handleApi(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    pathname: string,
  ): Promise<Response> {
    // Bearer OPS_TOKEN only; session tokens are not looked at here.
    if (pathname === OPS_REPORT_PATH) return handleOpsReport(request, env, { limiter: opsLimiter });
    // Bearer OPS_TOKEN or FEEDBACK_READ_TOKEN, by route; session tokens are not looked at here either.
    if (isFeedbackOpsPath(pathname)) {
      return handleFeedbackRoute(pathname, request, env, {
        limiter: feedbackLimiter,
        now: deps.now,
      });
    }
    // Discord's interactions endpoint: authenticated by Discord's signature, not a session.
    if (pathname === INTERACTIONS_PATH) return handleInteraction(request, env, ctx, deps);
    // The dev routes do not exist unless the dev tools are on (staging): checked before anything else, with
    // a plain 404. The Durable Object checks again.
    if (isDevPath(pathname) && env.DEV_TOOLS !== 'on') return notFound();
    const match = matchRoute(publicRoutes, pathname, request.method);
    if (match.kind === 'ok') return dispatch(publicRoutes, request, pathname, env);
    if (match.kind === 'method_not_allowed') return methodNotAllowed(match.allow);

    // The lounge's socket upgrade: no Authorization header is possible, so it carries a one-time ticket.
    // Strict parse and MAC check first, like a session token, so junk never wakes a Durable Object.
    if (pathname === LIVE_PATH) {
      if (env.LOUNGE_LIVE !== 'on') return notFound();
      if (
        request.method !== 'GET' ||
        request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'
      ) {
        return errorResponse('upgrade_required', 426, { Upgrade: 'websocket' });
      }
      const ticket = parseTicket(new URL(request.url).searchParams.get('ticket'));
      if (ticket === null || !(await verifyTicketMac(env.DISCORD_CLIENT_SECRET, ticket))) {
        return errorResponse('invalid_ticket', 401);
      }
      return env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(ticket.guildId)).fetch(request);
    }

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
    async fetch(request, env, ctx): Promise<Response> {
      const { pathname } = new URL(request.url);
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        try {
          return await handleApi(request, env, ctx, pathname);
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
