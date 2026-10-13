import type { Collection } from './collection';
import { failure, parseBody, pathId } from './collection-routes';
import type { Gear } from './gear';
import {
  ClaimJobBodySchema,
  DismantleBodySchema,
  EquipBodySchema,
  StartJobBodySchema,
  UpgradeBodySchema,
} from './gear-schemas';
import { errorResponse, json, type Routes } from './http';

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

export const gearRoutes: Routes<GearRouteContext> = {
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
  '/api/gear/:id/upgrade': {
    POST: async (request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return invalidId();
      const body = await parseBody(request, UpgradeBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.gear.upgrade(ctx.user.id, id, body.idempotencyKey);
      if (!outcome.ok) return failure(outcome);
      return json({ result: outcome.value, ...views(ctx) });
    },
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
