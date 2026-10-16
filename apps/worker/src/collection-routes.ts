import * as v from 'valibot';
import type { Attention } from './attention';
import type { Collection, Outcome } from './collection';
import {
  CatchChoiceBodySchema,
  CatchRecommendedBodySchema,
  ClaimBodySchema,
  EvolveBodySchema,
  IdSchema,
  LoungerBodySchema,
  LoungeSpotBodySchema,
  NicknameBodySchema,
  RoomBodySchema,
  StartExpeditionBodySchema,
  StarterBodySchema,
  TalentSlotBodySchema,
  TrainBodySchema,
} from './collection-schemas';
import type { LeetSyncStatus } from './guild-core';
import { errorResponse, json, parseBody, type Routes } from './http';

/** What these routes need from the request context (GuildCore's context satisfies it). */
export interface CollectionRouteContext {
  user: { id: string };
  /** Path parameters of a template route, raw: validated here before use. */
  params: Record<string, string>;
  core: {
    collection: Collection;
    /** Runs the throttled leet sync, so the balance shown is fresh. */
    syncIfStale(): Promise<void>;
    /** The guild's timezone, so the client can show guild-local times. */
    timezone(): string;
    /** How healthy the leet sync is, so players can see why Bait may be missing. */
    leetSyncStatus(): LeetSyncStatus;
    /** The notification pips (dungeon, raid) and when to look again. May throw: the route copes. */
    attention(userId: string): Attention;
  };
}

export function pathId(ctx: { params: Record<string, string> }): string | undefined {
  const parsed = v.safeParse(IdSchema, ctx.params['id']);
  return parsed.success ? parsed.output : undefined;
}

export function failure(outcome: Extract<Outcome<unknown>, { ok: false }>): Response {
  if (outcome.reason !== undefined) {
    return json({ error: outcome.error, reason: outcome.reason }, outcome.status);
  }
  return errorResponse(outcome.error, outcome.status);
}

const invalidBody = (): Response => errorResponse('invalid_body', 400);
const invalidId = (): Response => errorResponse('invalid_id', 400);

export const collectionRoutes: Routes<CollectionRouteContext> = {
  '/api/state': {
    GET: async (_request, { user, core }) => {
      await core.syncIfStale();
      // Only this answer carries `attention` (action answers embed `state` without it; the client
      // keeps the last one, like `timezone`). A failure here must never take the state down with it.
      let attention: Attention | null = null;
      try {
        attention = core.attention(user.id);
      } catch (err) {
        console.error('attention failed', err instanceof Error ? err.name : 'unknown');
      }
      return json({
        ...core.collection.state(user.id),
        timezone: core.timezone(),
        leetSync: core.leetSyncStatus(),
        attention,
      });
    },
  },
  '/api/lounger': {
    PUT: async (request, { user, core }) => {
      const body = await parseBody(request, LoungerBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.collection.lounge.choose(user.id, body.creatureId);
      if (!outcome.ok) return failure(outcome);
      return json({ loungerId: outcome.value.loungerId });
    },
  },
  '/api/lounge-spot': {
    PUT: async (request, { user, core }) => {
      const body = await parseBody(request, LoungeSpotBodySchema);
      if (body === undefined) return invalidBody();
      return json({ spot: core.collection.lounge.chooseSpot(user.id, body.spotId) });
    },
  },
  '/api/room': {
    // A POST because it carries a body; it only reads (and may re-pick a lounger).
    POST: async (request, { core }) => {
      const body = await parseBody(request, RoomBodySchema);
      if (body === undefined) return invalidBody();
      return json({ residents: core.collection.lounge.room(body.userIds) });
    },
  },
  '/api/starter': {
    POST: async (request, { user, core }) => {
      const body = await parseBody(request, StarterBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.collection.chooseStarter(user.id, body.species);
      if (!outcome.ok) return failure(outcome);
      return json({ state: core.collection.state(user.id) });
    },
  },
  '/api/expeditions': {
    POST: async (request, { user, core }) => {
      const body = await parseBody(request, StartExpeditionBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.collection.startExpedition(user.id, body, core.timezone());
      if (!outcome.ok) return failure(outcome);
      return json({ expedition: outcome.value, state: core.collection.state(user.id) });
    },
  },
  '/api/expeditions/:id/claim': {
    POST: async (request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return invalidId();
      if ((await parseBody(request, ClaimBodySchema)) === undefined) return invalidBody();
      const outcome = ctx.core.collection.claimExpedition(ctx.user.id, id);
      if (!outcome.ok) return failure(outcome);
      return json({ result: outcome.value, state: ctx.core.collection.state(ctx.user.id) });
    },
  },
  '/api/catches/recommended': {
    POST: async (request, { user, core }) => {
      const body = await parseBody(request, CatchRecommendedBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.collection.choices.chooseAllRecommended(user.id, body.idempotencyKey);
      if (!outcome.ok) return failure(outcome);
      return json({ results: outcome.value.results, state: core.collection.state(user.id) });
    },
  },
  '/api/catches/:id/choose': {
    POST: async (request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return invalidId();
      const body = await parseBody(request, CatchChoiceBodySchema);
      if (body === undefined) return invalidBody();
      const { idempotencyKey, ...input } = body;
      const outcome = ctx.core.collection.choices.choose(ctx.user.id, id, input, idempotencyKey);
      if (!outcome.ok) return failure(outcome);
      return json({ result: outcome.value, state: ctx.core.collection.state(ctx.user.id) });
    },
  },
  '/api/creatures/:id/talents/slot': {
    POST: async (request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return invalidId();
      const body = await parseBody(request, TalentSlotBodySchema);
      if (body === undefined) return invalidBody();
      const { idempotencyKey, ...input } = body;
      const outcome = ctx.core.collection.choices.slotFromBook(
        ctx.user.id,
        id,
        input,
        idempotencyKey,
      );
      if (!outcome.ok) return failure(outcome);
      return json({ result: outcome.value, state: ctx.core.collection.state(ctx.user.id) });
    },
  },
  '/api/creatures/:id/train': {
    POST: async (request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return invalidId();
      const body = await parseBody(request, TrainBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.collection.train(ctx.user.id, id, body.idempotencyKey);
      if (!outcome.ok) return failure(outcome);
      return json({ level: outcome.value.level, state: ctx.core.collection.state(ctx.user.id) });
    },
  },
  '/api/creatures/:id/evolve': {
    POST: async (request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return invalidId();
      const body = await parseBody(request, EvolveBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.collection.evolve(ctx.user.id, id, body.idempotencyKey);
      if (!outcome.ok) return failure(outcome);
      return json({
        species: outcome.value.species,
        firstOnServer: outcome.value.firstOnServer,
        state: ctx.core.collection.state(ctx.user.id),
      });
    },
  },
  '/api/creatures/:id': {
    PATCH: async (request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return invalidId();
      const body = await parseBody(request, NicknameBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.collection.setNickname(ctx.user.id, id, body.nickname);
      if (!outcome.ok) return failure(outcome);
      return json({
        nickname: outcome.value.nickname,
        state: ctx.core.collection.state(ctx.user.id),
      });
    },
  },
};
