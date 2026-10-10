import * as v from 'valibot';
import type { Collection, Outcome } from './collection';
import {
  ClaimBodySchema,
  EvolveBodySchema,
  IdSchema,
  NicknameBodySchema,
  StartExpeditionBodySchema,
  StarterBodySchema,
  TrainBodySchema,
} from './collection-schemas';
import type { LeetSyncStatus } from './guild-core';
import { errorResponse, json, readJsonBody, type Routes } from './http';

const MAX_BODY_BYTES = 2048;

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
  };
}

/** Parses the body with a strict schema; undefined means "answer 400 invalid_body". */
async function parseBody<S extends v.GenericSchema>(
  request: Request,
  schema: S,
): Promise<v.InferOutput<S> | undefined> {
  const raw = await readJsonBody(request, MAX_BODY_BYTES);
  if (raw === undefined) return undefined;
  const parsed = v.safeParse(schema, raw);
  return parsed.success ? parsed.output : undefined;
}

function pathId(ctx: CollectionRouteContext): string | undefined {
  const parsed = v.safeParse(IdSchema, ctx.params['id']);
  return parsed.success ? parsed.output : undefined;
}

function failure(outcome: Extract<Outcome<unknown>, { ok: false }>): Response {
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
      return json({
        ...core.collection.state(user.id),
        timezone: core.timezone(),
        leetSync: core.leetSyncStatus(),
      });
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
      const outcome = core.collection.startExpedition(user.id, body);
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
