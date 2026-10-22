import { errorResponse, invalidBody, json, notFound, parseBody, type Routes } from './http';
import { FINALE_TICKET_PATH, TICKET_PATH, type LiveHooks } from './live-socket';
import { LOUNGE_TOPIC } from './live-topic';
import type { Raid } from './raid';
import { FinaleTicketBodySchema } from './raid-schemas';

/** What the ticket routes need from the request context (GuildCore's context satisfies it). */
export interface LiveRouteContext {
  user: { id: string };
  guildId: string;
  core: { live: LiveHooks | null; raid: Raid; timezone(): string };
}

export const liveRoutes: Routes<LiveRouteContext> = {
  [TICKET_PATH]: {
    // Normal session auth and the per-player rate limit happen before this. No body: the player is the
    // session's. Without the flag the route does not exist.
    POST: async (_request, { user, guildId, core }) => {
      const live = core.live;
      if (live === null || !live.enabled('lounge')) return notFound();
      try {
        return json({ ticket: await live.mintTicket(guildId, user.id, LOUNGE_TOPIC) });
      } catch (err) {
        console.error('lounge ticket failed', err instanceof Error ? err.name : 'unknown');
        return errorResponse('internal_error', 500);
      }
    },
  },
  [FINALE_TICKET_PATH]: {
    // The topic is chosen here, from the session's player and the validated body: the party must be the
    // one the player is in this week. A practice fight needs nothing more (it is the same party's topic).
    // Without the flag the route does not exist.
    POST: async (request, { user, guildId, core }) => {
      const live = core.live;
      if (live === null || !live.enabled('finale')) return notFound();
      const body = await parseBody(request, FinaleTicketBodySchema);
      if (body === undefined) return invalidBody();
      const week = core.raid.currentWeek(core.timezone());
      if (week.weekId !== body.week || !core.raid.isPartyMember(user.id, body.week, body.party)) {
        return errorResponse('forbidden', 403);
      }
      try {
        const topic = { kind: 'finale', week: body.week, party: body.party } as const;
        return json({ ticket: await live.mintTicket(guildId, user.id, topic) });
      } catch (err) {
        console.error('finale ticket failed', err instanceof Error ? err.name : 'unknown');
        return errorResponse('internal_error', 500);
      }
    },
  },
};
