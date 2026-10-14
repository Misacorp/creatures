import { failure, pathId } from './collection-routes';
import type { Dungeon } from './dungeon';
import { RunBodySchema } from './dungeon-schemas';
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
 * a seed, stats or anything else the server decides. A run answers `{ run, today }`; the client
 * refreshes the collection and gear views itself (balances, items and parts changed).
 */
export const dungeonRoutes: Routes<DungeonRouteContext> = {
  '/api/dungeon/today': {
    GET: (_request, ctx) => json(ctx.core.dungeon.today(ctx.user.id)),
  },
  '/api/dungeon/run': {
    POST: async (request, ctx) => {
      const body = await parseBody(request, RunBodySchema);
      if (body === undefined) return errorResponse('invalid_body', 400);
      const outcome = ctx.core.dungeon.run(ctx.user.id, body);
      if (!outcome.ok) return failure(outcome);
      return json(outcome.value);
    },
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
