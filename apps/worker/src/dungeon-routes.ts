import { failure, pathId } from './collection-routes';
import type { Dungeon } from './dungeon';
import { ActBodySchema, DraftBodySchema, StartBodySchema } from './dungeon-schemas';
import { errorResponse, json, parseBody, type Routes } from './http';

/** What these routes need from the request context (GuildCore's context satisfies it). */
export interface DungeonRouteContext {
  user: { id: string };
  /** Path parameters of a template route, raw: validated here before use. */
  params: Record<string, string>;
  core: { dungeon: Dungeon };
}

/**
 * The daily dungeon's routes. The caller is always the session's user: no route takes a user id,
 * a seed, stats, HP, loot or anything else the server decides. `start` answers `{ state, today }`
 * and each `act` answers `{ state, room?, summary?, today? }` (the last two when the run ended); the
 * client refreshes the collection and gear views itself when it ends (balances, items and parts
 * changed).
 */
export const dungeonRoutes: Routes<DungeonRouteContext> = {
  '/api/dungeon/today': {
    GET: (_request, ctx) => json(ctx.core.dungeon.today(ctx.user.id)),
  },
  '/api/dungeon/team': {
    // Saves the row the player set up, so it survives a tab switch. Not a spend: no key.
    PUT: async (request, ctx) => {
      const body = await parseBody(request, DraftBodySchema);
      if (body === undefined) return errorResponse('invalid_body', 400);
      return json({ draftTeam: ctx.core.dungeon.saveDraft(ctx.user.id, body.team) });
    },
  },
  '/api/dungeon/start': {
    POST: async (request, ctx) => {
      const body = await parseBody(request, StartBodySchema);
      if (body === undefined) return errorResponse('invalid_body', 400);
      const outcome = ctx.core.dungeon.start(ctx.user.id, body);
      if (!outcome.ok) return failure(outcome);
      return json(outcome.value);
    },
  },
  '/api/dungeon/act': {
    POST: async (request, ctx) => {
      const body = await parseBody(request, ActBodySchema);
      if (body === undefined) return errorResponse('invalid_body', 400);
      const outcome = ctx.core.dungeon.act(ctx.user.id, body);
      if (!outcome.ok) return failure(outcome);
      return json(outcome.value);
    },
  },
  // The all-at-once run is gone: an Activity that still sends it is out of date and must reload.
  '/api/dungeon/run': {
    POST: () => errorResponse('gone', 410),
  },
  '/api/dungeon/run/:id': {
    GET: (_request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return errorResponse('invalid_id', 400);
      const replay = ctx.core.dungeon.replay(ctx.user.id, id);
      if (replay === null) return errorResponse('not_found', 404);
      return json(replay);
    },
  },
};
