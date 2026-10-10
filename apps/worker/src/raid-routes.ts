import * as v from 'valibot';
import type { Outcome } from './collection';
import { errorResponse, json, readJsonBody, type Routes } from './http';
import type { Raid } from './raid';
import {
  OptOutBodySchema,
  PlacementBodySchema,
  ReplayParamsSchema,
  TeamBodySchema,
  UnplaceBodySchema,
} from './raid-schemas';

const MAX_BODY_BYTES = 2048;

/** What these routes need from the request context (GuildCore's context satisfies it). */
export interface RaidRouteContext {
  user: { id: string };
  /** Path parameters of a template route, raw: validated here before use. */
  params: Record<string, string>;
  core: {
    raid: Raid;
    /** The guild's timezone: the raid calendar is guild-local. */
    timezone(): string;
  };
}

async function parseBody<S extends v.GenericSchema>(
  request: Request,
  schema: S,
): Promise<v.InferOutput<S> | undefined> {
  const raw = await readJsonBody(request, MAX_BODY_BYTES);
  if (raw === undefined) return undefined;
  const parsed = v.safeParse(schema, raw);
  return parsed.success ? parsed.output : undefined;
}

const invalidBody = (): Response => errorResponse('invalid_body', 400);

function failure(outcome: Extract<Outcome<unknown>, { ok: false }>): Response {
  return errorResponse(outcome.error, outcome.status);
}

export const raidRoutes: Routes<RaidRouteContext> = {
  '/api/raid': {
    GET: (_request, { user, core }) => json(core.raid.view(user.id, core.timezone())),
  },
  '/api/raid/team': {
    PUT: async (request, { user, core }) => {
      const body = await parseBody(request, TeamBodySchema);
      if (body === undefined) return invalidBody();
      const tz = core.timezone();
      const outcome = core.raid.setTeam(user.id, tz, body.creatureIds);
      if (!outcome.ok) return failure(outcome);
      return json(core.raid.view(user.id, tz));
    },
  },
  '/api/raid/placement': {
    PUT: async (request, { user, core }) => {
      const body = await parseBody(request, PlacementBodySchema);
      if (body === undefined) return invalidBody();
      const tz = core.timezone();
      const outcome = core.raid.place(user.id, tz, body.creatureId, body.slot);
      if (!outcome.ok) return failure(outcome);
      return json(core.raid.view(user.id, tz));
    },
    DELETE: async (request, { user, core }) => {
      const body = await parseBody(request, UnplaceBodySchema);
      if (body === undefined) return invalidBody();
      const tz = core.timezone();
      const outcome = core.raid.unplace(user.id, tz, body.creatureId);
      if (!outcome.ok) return failure(outcome);
      return json(core.raid.view(user.id, tz));
    },
  },
  '/api/raid/opt-out': {
    PUT: async (request, { user, core }) => {
      const body = await parseBody(request, OptOutBodySchema);
      if (body === undefined) return invalidBody();
      const tz = core.timezone();
      const outcome = core.raid.setOptOut(user.id, tz, body.optOut);
      if (!outcome.ok) return failure(outcome);
      return json(core.raid.view(user.id, tz));
    },
  },
  '/api/raid/replay/:week/:party/:phase': {
    GET: (_request, { params, core }) => {
      const parsed = v.safeParse(ReplayParamsSchema, {
        week: params['week'],
        party: params['party'],
        phase: params['phase'],
      });
      if (!parsed.success) return errorResponse('invalid_id', 400);
      const { week, party, phase } = parsed.output;
      const replay = core.raid.replay(week, party, phase);
      if (replay === null) return errorResponse('not_found', 404);
      return json(replay);
    },
  },
};
