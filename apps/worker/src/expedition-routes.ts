import type { Collection } from './collection';
import { PushOnBodySchema } from './collection-schemas';
import { failure, invalidBody, invalidId, json, parseBody, pathId, type Routes } from './http';

/** What these routes need from the request context (GuildCore's context satisfies it). */
export interface ExpeditionRouteContext {
  user: { id: string };
  /** Path parameters of a template route, raw: validated here before use. */
  params: Record<string, string>;
  core: {
    collection: Collection;
    /** The guild's timezone: night and Festival weeks are by guild-local time. */
    timezone(): string;
  };
}

export const expeditionRoutes: Routes<ExpeditionRouteContext> = {
  /** Choose a goal of a finished trip's end-of-trip offer. Ignoring the offer is coming home: claim as usual. */
  '/api/expeditions/:id/push-on': {
    POST: async (request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return invalidId();
      const body = await parseBody(request, PushOnBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.collection.trips.choosePushOn(ctx.user.id, id, body.goalId);
      if (!outcome.ok) return failure(outcome);
      return json({ expedition: outcome.value, state: ctx.core.collection.state(ctx.user.id) });
    },
  },
  /** The caller's account stats, milestones, journal and explorers. */
  '/api/profile': {
    GET: (_request, ctx) =>
      json(ctx.core.collection.trips.profile(ctx.user.id, ctx.core.timezone())),
  },
  /** The weekly special, what is open right now and the caller's familiarity. */
  '/api/destinations': {
    GET: (_request, ctx) =>
      json(ctx.core.collection.trips.destinations(ctx.user.id, ctx.core.timezone())),
  },
};
