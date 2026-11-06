/**
 * The valley's scout routes (phase 5 step 2, behind `VALLEY_SYSTEMS`). With the flag off each answers 404, as an unknown route does,
 * before the body is read. The identity is the session's user; every body is a strict schema; the two spends carry an idempotency key.
 * Each answer carries the player's settled valley (`valley`, the same shape as `/api/state`'s) and the usual embedded `state`.
 */
import type { ValleyView } from '@creatures/game';
import type { Collection } from './collection';
import {
  ValleyAnvilBuyBodySchema,
  ValleyBrokerBodySchema,
  ValleyCommunalBodySchema,
  ValleyDeepBodySchema,
  ValleyExchangeBodySchema,
  ValleyGiftBodySchema,
  ValleyGazetteCloseBodySchema,
  ValleyKitBodySchema,
  ValleyOrderBodySchema,
  ValleySeatBodySchema,
  ValleySeatBuyBodySchema,
} from './collection-schemas';
import { failure, invalidBody, json, notFound, parseBody, type Routes } from './http';
import type { ValleyGazette } from './valley-gazette';
import type { ValleyGifts } from './valley-gifts';
import type { ValleyOrders } from './valley-orders';
import type { ValleySeats } from './valley-seats';

export interface ValleyRouteContext {
  user: { id: string };
  params: Record<string, string>;
  core: {
    collection: Collection;
    valleySystems: boolean;
    /** Seats and kit (null with the flag off). */
    valleySeats: ValleySeats | null;
    /** Anvils, orders and the exchange (null with the flag off). */
    valleyOrders: ValleyOrders | null;
    /** Gifts to the commons' projects (null with the flag off). */
    valleyGifts: ValleyGifts | null;
    /** The welcome-back Gazette's papers (null with the flag off). */
    valleyGazette: ValleyGazette | null;
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
  '/api/valley/deep': {
    POST: async (request, { user, core }) => {
      if (core.valleySeats === null) return notFound();
      const body = await parseBody(request, ValleyDeepBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.valleySeats.setDeep(user.id, body.seatId, body.deep);
      if (!outcome.ok) return failure(outcome);
      return json({
        ...outcome.value,
        valley: core.valleyState(user.id),
        state: core.collection.state(user.id),
      });
    },
  },
  '/api/valley/gazette/close': {
    POST: async (request, { user, core }) => {
      if (core.valleyGazette === null) return notFound();
      const body = await parseBody(request, ValleyGazetteCloseBodySchema);
      if (body === undefined) return invalidBody();
      // One row written, no pass: the answer is only whether a paper was closed (the client drops its own copy).
      return json({ closed: core.valleyGazette.close(user.id, body.paperId) });
    },
  },
  '/api/valley/anvil/buy': {
    POST: async (request, { user, core }) => {
      if (core.valleyOrders === null) return notFound();
      const body = await parseBody(request, ValleyAnvilBuyBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.valleyOrders.buyAnvil(user.id, body.idempotencyKey);
      if (!outcome.ok) return failure(outcome);
      return json({
        ...outcome.value,
        valley: core.valleyState(user.id),
        state: core.collection.state(user.id),
      });
    },
  },
  '/api/valley/order': {
    POST: async (request, { user, core }) => {
      if (core.valleyOrders === null) return notFound();
      const body = await parseBody(request, ValleyOrderBodySchema);
      if (body === undefined) return invalidBody();
      let outcome;
      if (body.action === 'add') {
        // "For my team" has no blueprint and no count; any other order needs both.
        if (body.forTeam) {
          if (body.blueprintId !== undefined || body.count !== undefined) return invalidBody();
          outcome = core.valleyOrders.addOrder(user.id, body.seatId, {
            forTeam: true,
            reach: body.reach,
          });
        } else {
          if (body.blueprintId === undefined || body.count === undefined) return invalidBody();
          outcome = core.valleyOrders.addOrder(user.id, body.seatId, {
            forTeam: false,
            blueprintId: body.blueprintId,
            count: body.count,
            reach: body.reach,
          });
        }
      } else if (body.action === 'edit') {
        outcome = core.valleyOrders.editOrder(user.id, body.orderId, {
          ...(body.count === undefined ? {} : { count: body.count }),
          ...(body.reach === undefined ? {} : { reach: body.reach }),
        });
      } else {
        outcome = core.valleyOrders.removeOrder(user.id, body.orderId);
      }
      if (!outcome.ok) return failure(outcome);
      return json({
        ...outcome.value,
        valley: core.valleyState(user.id),
        state: core.collection.state(user.id),
      });
    },
  },
  '/api/valley/exchange': {
    POST: async (request, { user, core }) => {
      if (core.valleyOrders === null) return notFound();
      const body = await parseBody(request, ValleyExchangeBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.valleyOrders.exchange(user.id, {
        to: body.to,
        from: body.from,
        times: body.times,
        key: body.idempotencyKey,
      });
      if (!outcome.ok) return failure(outcome);
      return json({
        ...outcome.value,
        valley: core.valleyState(user.id),
        state: core.collection.state(user.id),
      });
    },
  },
  '/api/valley/gift': {
    POST: async (request, { user, core }) => {
      if (core.valleyGifts === null) return notFound();
      const body = await parseBody(request, ValleyGiftBodySchema);
      if (body === undefined) return invalidBody();
      // Shards name their element; the other currencies take none.
      if ((body.currency === 'shards') !== (body.element !== undefined)) return invalidBody();
      const outcome = core.valleyGifts.give(user.id, {
        place: body.place,
        currency: body.currency,
        ...(body.element === undefined ? {} : { element: body.element }),
        amount: body.amount,
        key: body.idempotencyKey,
      });
      if (!outcome.ok) return failure(outcome);
      return json({
        ...outcome.value,
        valley: core.valleyState(user.id),
        state: core.collection.state(user.id),
      });
    },
  },
  '/api/valley/broker': {
    POST: async (request, { user, core }) => {
      if (core.valleySeats === null) return notFound();
      const body = await parseBody(request, ValleyBrokerBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.valleySeats.setBrokerToward(user.id, body.seatId, body.toward);
      if (!outcome.ok) return failure(outcome);
      return json({
        ...outcome.value,
        valley: core.valleyState(user.id),
        state: core.collection.state(user.id),
      });
    },
  },
  '/api/valley/communal': {
    POST: async (request, { user, core }) => {
      if (core.valleySeats === null) return notFound();
      const body = await parseBody(request, ValleyCommunalBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = core.valleySeats.postCommunal(user.id, body.place, body.creatureId);
      if (!outcome.ok) return failure(outcome);
      return json({
        ...outcome.value,
        valley: core.valleyState(user.id),
        state: core.collection.state(user.id),
      });
    },
  },
};
