import type { Collection } from './collection';
import { failure, pathId } from './collection-routes';
import type { Gear } from './gear';
import {
  ClaimJobBodySchema,
  DismantleBodySchema,
  DismissNoticeBodySchema,
  EquipBestBodySchema,
  EquipBodySchema,
  RemovedJobKindSchema,
  StartJobBodySchema,
} from './gear-schemas';
import { errorResponse, json, parseBody, type Handler, type Routes } from './http';

/** What these routes need from the request context (GuildCore's context satisfies it). */
export interface GearRouteContext {
  user: { id: string };
  /** Path parameters of a template route, raw: validated here before use. */
  params: Record<string, string>;
  core: { gear: Gear; collection: Collection };
}

const invalidBody = (): Response => errorResponse('invalid_body', 400);
const invalidId = (): Response => errorResponse('invalid_id', 400);

/** The two views every action answers with: the gear screen and the collection (creature cards). */
function views(ctx: GearRouteContext): { gear: unknown; state: unknown } {
  return { gear: ctx.core.gear.state(ctx.user.id), state: ctx.core.collection.state(ctx.user.id) };
}

const routes: Routes<GearRouteContext> = {
  '/api/gear': {
    // The first gear load gives the welcome kit (once), so crafting can start on day 1.
    GET: (_request, ctx) => {
      ctx.core.gear.ensureWelcome(ctx.user.id);
      return json(ctx.core.gear.state(ctx.user.id));
    },
  },
  '/api/gear/:id/equip': {
    POST: async (request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return invalidId();
      const body = await parseBody(request, EquipBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.gear.equip(ctx.user.id, id, body.creatureId);
      if (!outcome.ok) return failure(outcome);
      return json({ result: outcome.value, ...views(ctx) });
    },
  },
  '/api/gear/equip-best': {
    POST: async (request, ctx) => {
      const body = await parseBody(request, EquipBestBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.gear.equipBest(ctx.user.id, body.creatureIds);
      if (!outcome.ok) return failure(outcome);
      return json({ result: outcome.value, ...views(ctx) });
    },
  },
  '/api/gear/conversion/dismiss': {
    POST: async (request, ctx) => {
      const body = await parseBody(request, DismissNoticeBodySchema);
      if (body === undefined) return invalidBody();
      ctx.core.gear.dismissNotice(ctx.user.id);
      return json({ result: { dismissed: true }, ...views(ctx) });
    },
  },
  // Gear upgrades are gone (gear v2): an old client gets a clear answer, and nothing is charged.
  '/api/gear/:id/upgrade': {
    POST: () => errorResponse('gear_upgrade_removed', 410),
  },
  '/api/gear/:id/dismantle': {
    POST: async (request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return invalidId();
      const body = await parseBody(request, DismantleBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.gear.dismantle(ctx.user.id, id, body.idempotencyKey);
      if (!outcome.ok) return failure(outcome);
      return json({ result: outcome.value, ...views(ctx) });
    },
  },
  '/api/workshop/jobs': {
    POST: async (request, ctx) => {
      // Improve and Enchant are gone (gear v2): an old client gets a clear answer, and nothing is charged.
      const removed = await parseBody(request.clone(), RemovedJobKindSchema);
      if (removed !== undefined) return errorResponse('job_kind_removed', 410);
      const body = await parseBody(request, StartJobBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.gear.startJob(ctx.user.id, body);
      if (!outcome.ok) return failure(outcome);
      return json({ result: outcome.value, ...views(ctx) });
    },
  },
  '/api/workshop/jobs/:id/claim': {
    POST: async (request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return invalidId();
      const body = await parseBody(request, ClaimJobBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.gear.claimJob(ctx.user.id, id, body.idempotencyKey);
      if (!outcome.ok) return failure(outcome);
      return json({ result: outcome.value, ...views(ctx) });
    },
  },
};

/**
 * A player whose old gear could not be converted yet (one bad legacy row: the conversion rolled back and
 * they stay pending) gets a clear 503 from every gear and Workshop route instead of a half-converted view.
 */
const guarded =
  (handler: Handler<GearRouteContext>): Handler<GearRouteContext> =>
  (request, ctx) =>
    ctx.core.gear.conversionPending(ctx.user.id)
      ? errorResponse('gear_conversion_pending', 503)
      : handler(request, ctx);

export const gearRoutes: Routes<GearRouteContext> = Object.fromEntries(
  Object.entries(routes).map(([path, methods]) => [
    path,
    Object.fromEntries(
      Object.entries(methods).map(([method, handler]) => [method, guarded(handler)]),
    ),
  ]),
);
