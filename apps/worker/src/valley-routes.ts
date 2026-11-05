/**
 * The valley's scout routes (phase 5 step 2, behind `VALLEY_SYSTEMS`). With the flag off each answers 404, as an unknown route does,
 * before the body is read. The identity is the session's user; every body is a strict schema; the two spends carry an idempotency key.
 * Each answer carries the player's settled valley (`valley`, the same shape as `/api/state`'s) and the usual embedded `state`.
 */
import type { ValleyView } from '@creatures/game';
import type { Collection } from './collection';
import {
  ValleyKitBodySchema,
  ValleySeatBodySchema,
  ValleySeatBuyBodySchema,
} from './collection-schemas';
import { failure, invalidBody, json, notFound, parseBody, type Routes } from './http';
import type { ValleySeats } from './valley-seats';

export interface ValleyRouteContext {
  user: { id: string };
  params: Record<string, string>;
  core: {
    collection: Collection;
    valleySystems: boolean;
    /** Seats and kit (null with the flag off). */
    valleySeats: ValleySeats | null;
    /** The caller's valley as `/api/state` shows it (null with the flag off). */
    valleyState(userId: string): ValleyView | null;
  };
}

export const valleyRoutes: Routes<ValleyRouteContext> = {
  '/api/valley/seat': {
    POST: async (request, { user, core }) => {
      if (core.valleySeats === null) return notFound();
      const body = await parseBody(request, ValleySeatBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.valleySeats.post(user.id, {
        seatId: body.seatId,
        ...(body.creatureId === undefined ? {} : { creatureId: body.creatureId }),
        ...(body.destination === undefined ? {} : { destination: body.destination }),
      });
      if (!outcome.ok) return failure(outcome);
      return json({
        ...outcome.value,
        valley: core.valleyState(user.id),
        state: core.collection.state(user.id),
      });
    },
  },
  '/api/valley/seat/buy': {
    POST: async (request, { user, core }) => {
      if (core.valleySeats === null) return notFound();
      const body = await parseBody(request, ValleySeatBuyBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.valleySeats.buySeat(user.id, body.idempotencyKey);
      if (!outcome.ok) return failure(outcome);
      return json({
        ...outcome.value,
        valley: core.valleyState(user.id),
        state: core.collection.state(user.id),
      });
    },
  },
  '/api/valley/kit': {
    POST: async (request, { user, core }) => {
      if (core.valleySeats === null) return notFound();
      const body = await parseBody(request, ValleyKitBodySchema);
      if (body === undefined) return invalidBody();
      const outcome =
        body.action === 'buy'
          ? core.valleySeats.buyKit(user.id, body.kit, body.idempotencyKey)
          : core.valleySeats.setKit(user.id, body.seatId, body.kit);
      if (!outcome.ok) return failure(outcome);
      return json({
        ...outcome.value,
        valley: core.valleyState(user.id),
        state: core.collection.state(user.id),
      });
    },
  },
};
