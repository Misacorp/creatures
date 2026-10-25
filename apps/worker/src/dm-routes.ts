import * as v from 'valibot';
import { DM_KINDS, type DmChanges, type DmPrefs } from './dm-notify';
import { invalidBody, json, parseBody, type Routes } from './http';

/**
 * Body of PUT /api/notifications: the kinds to turn on or off (at least one), nothing else. Only the
 * session's own player is ever changed.
 */
export const NotificationsBodySchema = v.strictObject({
  kinds: v.pipe(
    v.strictObject({
      trip: v.optional(v.boolean()),
      job: v.optional(v.boolean()),
      finale: v.optional(v.boolean()),
      stall: v.optional(v.boolean()),
    }),
    v.check((kinds) => DM_KINDS.some((kind) => kinds[kind] !== undefined)),
  ),
});

/** What the routes answer with. `available` is false when this server cannot send DMs at all. */
export interface NotificationsView extends DmPrefs {
  available: boolean;
}

/** What these routes need from the request context (GuildCore's context satisfies it). */
export interface DmRouteContext {
  user: { id: string };
  core: {
    dmView(userId: string): NotificationsView;
    setDmPrefs(userId: string, changes: DmChanges): Promise<NotificationsView>;
  };
}

export const dmRoutes: Routes<DmRouteContext> = {
  '/api/notifications': {
    GET: (_request, { user, core }) => json(core.dmView(user.id)),
    PUT: async (request, { user, core }) => {
      const body = await parseBody(request, NotificationsBodySchema);
      if (body === undefined) return invalidBody();
      return json(await core.setDmPrefs(user.id, body.kinds));
    },
  },
};
