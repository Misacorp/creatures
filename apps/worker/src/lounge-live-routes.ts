import { errorResponse, json, notFound, type Routes } from './http';
import { TICKET_PATH, type LiveHooks } from './lounge-live';

/** What the ticket route needs from the request context (GuildCore's context satisfies it). */
export interface LiveRouteContext {
  user: { id: string };
  guildId: string;
  core: { live: LiveHooks | null };
}

export const liveRoutes: Routes<LiveRouteContext> = {
  [TICKET_PATH]: {
    // Normal session auth and the per-player rate limit happen before this. No body: the player is the
    // session's. Without the flag the route does not exist.
    POST: async (_request, { user, guildId, core }) => {
      const live = core.live;
      if (live === null || !live.enabled()) return notFound();
      try {
        return json({ ticket: await live.mintTicket(guildId, user.id) });
      } catch (err) {
        console.error('lounge ticket failed', err instanceof Error ? err.name : 'unknown');
        return errorResponse('internal_error', 500);
      }
    },
  },
};
