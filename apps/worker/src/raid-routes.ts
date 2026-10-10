import * as v from 'valibot';
import type { Outcome } from './collection';
import {
  errorResponse,
  json,
  parseJsonObject,
  readJsonBody,
  readLimitedText,
  type Routes,
} from './http';
import type { Raid } from './raid';
import {
  AbilityBodySchema,
  LiveActionBodySchema,
  OptOutBodySchema,
  PlacementBodySchema,
  ReplayParamsSchema,
  RevealSeenBodySchema,
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

/** A POST that takes no payload: no body, or an empty JSON object. Anything else is invalid. */
async function hasNoPayload(request: Request): Promise<boolean> {
  const raw = await readLimitedText(request, MAX_BODY_BYTES);
  if (raw === null) return false;
  if (raw.trim() === '') return true;
  const parsed = parseJsonObject(raw);
  return parsed !== undefined && v.safeParse(v.strictObject({}), parsed).success;
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
  '/api/raid/ability': {
    PUT: async (request, { user, core }) => {
      const body = await parseBody(request, AbilityBodySchema);
      if (body === undefined) return invalidBody();
      const tz = core.timezone();
      const outcome = core.raid.setAbility(user.id, tz, body.abilityId);
      if (!outcome.ok) return failure(outcome);
      return json(core.raid.view(user.id, tz));
    },
  },
  '/api/raid/live': {
    GET: (_request, { user, core }) => json(core.raid.liveSnapshot(user.id, core.timezone())),
  },
  '/api/raid/live/action': {
    POST: async (request, { user, core }) => {
      const body = await parseBody(request, LiveActionBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.raid.liveAction(user.id, core.timezone(), body);
      if (!outcome.ok) return failure(outcome);
      return json(outcome.value);
    },
  },
  '/api/raid/reveal-seen': {
    POST: async (request, { user, core }) => {
      const body = await parseBody(request, RevealSeenBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.raid.markRevealSeen(user.id, body.week);
      if (!outcome.ok) return failure(outcome);
      return json(core.raid.view(user.id, core.timezone()));
    },
  },
  '/api/raid/practice': {
    POST: async (request, { user, core }) => {
      // Off (production, local): the route does not exist.
      if (!core.raid.practiceEnabled()) return errorResponse('not_found', 404);
      if (!(await hasNoPayload(request))) return invalidBody();
      const outcome = core.raid.startPractice(user.id, core.timezone());
      if (!outcome.ok) return failure(outcome);
      return json(outcome.value);
    },
  },
  '/api/raid/replay/:week/:party/:phase': {
    GET: (_request, { params, user, core }) => {
      const parsed = v.safeParse(ReplayParamsSchema, {
        week: params['week'],
        party: params['party'],
        phase: params['phase'],
      });
      if (!parsed.success) return errorResponse('invalid_id', 400);
      const { week, party, phase } = parsed.output;
      const replay = core.raid.replay(user.id, week, party, phase);
      if (replay === null) return errorResponse('not_found', 404);
      return json(replay);
    },
  },
};
