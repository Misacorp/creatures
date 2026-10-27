import type { Collection } from './collection';
import type { Gear } from './gear';
import {
  ClaimJobBodySchema,
  DismantleBodySchema,
  DismantleCheckBodySchema,
  DismantleJobSchema,
  DismissNoticeBodySchema,
  EquipBestBodySchema,
  EquipBodySchema,
  PreviewBodySchema,
  RemovedJobKindSchema,
  StartJobBodySchema,
} from './gear-schemas';
import {
  errorResponse,
  failure,
  invalidBody,
  invalidId,
  json,
  parseBody,
  pathId,
  type Handler,
  type Routes,
} from './http';

/** What these routes need from the request context (GuildCore's context satisfies it). */
export interface GearRouteContext {
  user: { id: string };
  /** Path parameters of a template route, raw: validated here before use. */
  params: Record<string, string>;
  core: { gear: Gear; collection: Collection };
}

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
  // The old instant dismantle of one item (before gear v2, Gear B): an old client gets a clear answer, and nothing is taken.
  '/api/gear/:id/dismantle': {
    POST: () => errorResponse('dismantle_is_a_job', 410),
  },
  // Which of the items cannot be dismantled now (worn by a creature whose running trip or job reads them live).
  '/api/gear/dismantle-check': {
    POST: async (request, ctx) => {
      const body = await parseBody(request, DismantleCheckBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.gear.dismantleCheck(ctx.user.id, body.itemIds);
      if (!outcome.ok) return failure(outcome);
      return json({ result: outcome.value });
    },
  },
  // Dismantles the named items at once with one free creature (worn ones come off); the request names the items the player saw.
  '/api/gear/dismantle': {
    POST: async (request, ctx) => {
      const body = await parseBody(request, DismantleBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.gear.dismantlePile(ctx.user.id, body);
      if (!outcome.ok) return failure(outcome);
      return json({ result: outcome.value, ...views(ctx) });
    },
  },
  // What dismantling a pile would give with a creature, and what a craft would: exact odds, parts, Essence, XP and refund ranges.
  '/api/workshop/preview': {
    POST: async (request, ctx) => {
      const body = await parseBody(request, PreviewBodySchema);
      if (body === undefined) return invalidBody();
      const outcome =
        body.kind === 'craft'
          ? ctx.core.gear.previewCraft(ctx.user.id, body.creatureId, body.blueprintId)
          : ctx.core.gear.previewDismantle(ctx.user.id, body.creatureId, body.itemIds);
      if (!outcome.ok) return failure(outcome);
      return json({ result: outcome.value });
    },
  },
  '/api/workshop/jobs': {
    POST: async (request, ctx) => {
      // Improve and Enchant are gone (gear v2): an old client gets a clear answer, and nothing is charged.
      const removed = await parseBody(request.clone(), RemovedJobKindSchema);
      if (removed !== undefined) return errorResponse('job_kind_removed', 410);
      // The timed dismantle job is gone too (a job already running still finishes and is claimed as before).
      const dismantle = await parseBody(request.clone(), DismantleJobSchema);
      if (dismantle !== undefined) return errorResponse('dismantle_job_removed', 410);
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
