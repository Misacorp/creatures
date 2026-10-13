import * as v from 'valibot';
import type { Outcome } from './collection';
import { DiscordError } from './discord';
import {
  errorResponse,
  json,
  MAX_ACTION_BODY_BYTES,
  parseBody,
  parseJsonObject,
  readLimitedText,
  type Routes,
} from './http';
import type { Raid } from './raid';
import {
  AbilityBodySchema,
  AutofireBodySchema,
  LiveActionBodySchema,
  OptOutBodySchema,
  PlacementBodySchema,
  RaidChannelBodySchema,
  ReplayParamsSchema,
  RevealSeenBodySchema,
  TeamBodySchema,
  UnplaceBodySchema,
} from './raid-schemas';

/** What these routes need from the request context (GuildCore's context satisfies it). */
export interface RaidRouteContext {
  user: { id: string };
  /** The channel the caller's session was launched from (Discord's verified location), if known. */
  channelId: string | null;
  /** Path parameters of a template route, raw: validated here before use. */
  params: Record<string, string>;
  core: {
    raid: Raid;
    /** The guild's timezone: the raid calendar is guild-local. */
    timezone(): string;
    channelPinned(): boolean;
    isPinnedTo(channelId: string | null): boolean;
    pinChannel(channelId: string): boolean;
    unpinChannel(): void;
    cachedCanManage(userId: string): boolean | null;
    canManageServer(userId: string, options?: { fresh?: boolean }): Promise<boolean>;
  };
}

/** A POST that takes no payload: no body, or an empty JSON object. Anything else is invalid. */
async function hasNoPayload(request: Request): Promise<boolean> {
  const raw = await readLimitedText(request, MAX_ACTION_BODY_BYTES);
  if (raw === null) return false;
  if (raw.trim() === '') return true;
  const parsed = parseJsonObject(raw);
  return parsed !== undefined && v.safeParse(v.strictObject({}), parsed).success;
}

const invalidBody = (): Response => errorResponse('invalid_body', 400);

/**
 * Whether the caller may manage the server, asked of Discord (or the 60 s cache). A Discord failure
 * becomes the 503 answer. Only the error kind is logged.
 */
async function manageCheck(
  core: RaidRouteContext['core'],
  userId: string,
  fresh: boolean,
): Promise<boolean | Response> {
  try {
    return await core.canManageServer(userId, { fresh });
  } catch (err) {
    if (!(err instanceof DiscordError)) throw err;
    console.error('discord permission check failed', err.kind);
    return errorResponse('discord_unavailable', 503);
  }
}

function channelAnswer(
  core: RaidRouteContext['core'],
  channelId: string | null,
  canManage: boolean,
): Response {
  return json({ pinned: core.channelPinned(), here: core.isPinnedTo(channelId), canManage });
}

function failure(outcome: Extract<Outcome<unknown>, { ok: false }>): Response {
  return errorResponse(outcome.error, outcome.status);
}

export const raidRoutes: Routes<RaidRouteContext> = {
  '/api/raid': {
    GET: (_request, { user, core }) =>
      json({
        ...core.raid.view(user.id, core.timezone()),
        // `canManage` is only known after the player asked (GET /api/raid/channel); no Discord call here.
        channel: { pinned: core.channelPinned(), canManage: core.cachedCanManage(user.id) },
      }),
  },
  '/api/raid/channel': {
    GET: async (_request, { user, channelId, core }) => {
      const canManage = await manageCheck(core, user.id, false);
      if (typeof canManage !== 'boolean') return canManage;
      return channelAnswer(core, channelId, canManage);
    },
    POST: async (request, { user, channelId, core }) => {
      const body = await parseBody(request, RaidChannelBodySchema);
      if (body === undefined) return invalidBody();
      // A change always asks Discord again: a role may have just been given or taken away.
      const canManage = await manageCheck(core, user.id, true);
      if (typeof canManage !== 'boolean') return canManage;
      if (!canManage) return errorResponse('forbidden', 403);
      if (body.action === 'unpin') {
        core.unpinChannel();
      } else {
        // Only the channel this session was launched from, as Discord reported it at login.
        if (channelId === null) return errorResponse('channel_unknown', 409);
        if (!core.pinChannel(channelId)) return errorResponse('channel_unknown', 409);
      }
      return channelAnswer(core, channelId, true);
    },
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
  '/api/raid/autofire': {
    PUT: async (request, { user, core }) => {
      const body = await parseBody(request, AutofireBodySchema);
      if (body === undefined) return invalidBody();
      const tz = core.timezone();
      const outcome = core.raid.setAutofire(user.id, tz, body.target, body.on);
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
  '/api/raid/stats/:week/:party/:phase': {
    GET: (_request, { params, user, core }) => {
      const parsed = v.safeParse(ReplayParamsSchema, {
        week: params['week'],
        party: params['party'],
        phase: params['phase'],
      });
      if (!parsed.success) return errorResponse('invalid_id', 400);
      const { week, party, phase } = parsed.output;
      // Members of that fight only; a missing fight and someone else's fight look the same.
      const stats = core.raid.stats(user.id, week, party, phase);
      if (stats === null) return errorResponse('not_found', 404);
      return json(stats);
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
