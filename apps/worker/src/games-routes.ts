import type { Games } from './games';
import { AutoBodySchema, BuyBodySchema, EntryBodySchema } from './games-schemas';
import {
  errorResponse,
  failure,
  invalidBody,
  invalidId,
  json,
  parseBody,
  pathId,
  type Routes,
} from './http';

/** What these routes need from the request context (GuildCore's context satisfies it). */
export interface GamesRouteContext {
  user: { id: string };
  /** Path parameters of a template route, raw: validated here before use. */
  params: Record<string, string>;
  core: { games: Games };
}

/**
 * The Valley Games' routes. The caller is always the session's user: no route takes a user id, a seed,
 * a score or anything else the server decides.
 *
 * - `GET  /api/games`               the whole tab (`GamesView`).
 * - `PUT  /api/games/entry`         `{ day, eventId, creatureIds }` answers `{ next }`.
 * - `PUT  /api/games/auto`          `{ on }` answers `{ auto, joined }`.
 * - `POST /api/games/stall/buy`     `{ offerId, idempotencyKey }` answers `{ purchase, you, stall }`.
 * - `GET  /api/games/creature/:id`  the caller's creature's medals and records.
 */
export const gamesRoutes: Routes<GamesRouteContext> = {
  '/api/games': {
    GET: (_request, ctx) => json(ctx.core.games.view(ctx.user.id)),
  },
  '/api/games/entry': {
    PUT: async (request, ctx) => {
      const body = await parseBody(request, EntryBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.games.setEntry(ctx.user.id, body);
      if (!outcome.ok) return failure(outcome);
      return json(outcome.value);
    },
  },
  '/api/games/auto': {
    PUT: async (request, ctx) => {
      const body = await parseBody(request, AutoBodySchema);
      if (body === undefined) return invalidBody();
      return json(ctx.core.games.setAuto(ctx.user.id, body.on));
    },
  },
  '/api/games/stall/buy': {
    POST: async (request, ctx) => {
      const body = await parseBody(request, BuyBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = ctx.core.games.buy(ctx.user.id, body);
      if (!outcome.ok) return failure(outcome);
      return json(outcome.value);
    },
  },
  '/api/games/creature/:id': {
    GET: (_request, ctx) => {
      const id = pathId(ctx);
      if (id === undefined) return invalidId();
      const view = ctx.core.games.creature(ctx.user.id, id);
      if (view === null) return errorResponse('not_found', 404);
      return json(view);
    },
  },
};
