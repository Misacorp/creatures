import type { Housing } from './housing';
import {
  BuildBodySchema,
  CollectBodySchema,
  CraftBodySchema,
  GiftBodySchema,
  HousemateBodySchema,
  PlaceBodySchema,
  SeenBodySchema,
  SkinBodySchema,
  StampBodySchema,
} from './housing-schemas';
import {
  errorResponse,
  failure,
  invalidBody,
  json,
  notFound,
  parseBody,
  type Handler,
  type Routes,
} from './http';
import { SNOWFLAKE_RE } from './schemas';

/** What these routes need from the request context (GuildCore's context satisfies it). */
export interface HousingRouteContext {
  user: { id: string };
  /** Path parameters of a template route, raw: validated here before use. */
  params: Record<string, string>;
  core: { housing: Housing | null };
}

/** True for the paths of the housing routes (`/api/house...` and `/api/houses...`). With the flag off they answer like a missing route. */
export function isHousingPath(pathname: string): boolean {
  return (
    pathname === '/api/house' ||
    pathname === '/api/houses' ||
    pathname.startsWith('/api/house/') ||
    pathname.startsWith('/api/houses/')
  );
}

/** The housing module, or the answer of a missing route when the flag is off. */
function withHousing(
  run: (
    housing: Housing,
    request: Request,
    ctx: HousingRouteContext,
  ) => Response | Promise<Response>,
): Handler<HousingRouteContext> {
  return (request, ctx) => {
    const housing = ctx.core.housing;
    return housing === null ? notFound() : run(housing, request, ctx);
  };
}

/** The staging dev tools' simulated players (`dev-guest-<n>`): they have houses, so they can be visited. */
const DEV_GUEST_RE = /^dev-guest-\d{1,3}$/;

/** The `:id` of a visited house: a Discord snowflake (or a dev guest), else it names no house. */
function ownerId(ctx: HousingRouteContext): string | undefined {
  const id = ctx.params['id'];
  return id !== undefined && (SNOWFLAKE_RE.test(id) || DEV_GUEST_RE.test(id)) ? id : undefined;
}

/**
 * The housing routes. The caller is always the session's user. The caller's own house is under `/api/house` (fixed paths only), other
 * houses under `/api/houses`, so no template path can swallow a fixed one.
 *
 * - `GET  /api/house`                  `{ house, own }`; makes the hut on the first call.
 * - `GET  /api/house/catalogue`        everything that exists with owned and placed counts.
 * - `POST /api/house/build`            `{ partId, pay, idempotencyKey }` pays into a part.
 * - `POST /api/house/craft`            `{ itemId, idempotencyKey }` makes a piece or a skin.
 * - `PUT  /api/house/place`            `{ roomId, spotId, pieceId | null }`.
 * - `PUT  /api/house/skin`             a room's wallpaper and floor, or the roof and walls.
 * - `PUT  /api/house/housemate`        `{ roomId, spotId, creatureId | null }`.
 * - `POST /api/house/mail/collect`     `{ idempotencyKey }` collects the waiting gifts.
 * - `POST /api/house/seen`             `{}` clears the "+N" on the materials.
 * - `GET  /api/houses`                 the server's houses.
 * - `GET  /api/houses/:id`             another player's house, read-only.
 * - `POST /api/houses/:id/gift`        `{ idempotencyKey }` leaves a gift in their mailbox.
 * - `POST /api/houses/:id/stamp`       `{ stampId }` signs their guestbook.
 */
export const housingRoutes: Routes<HousingRouteContext> = {
  '/api/house': {
    GET: withHousing((housing, _request, ctx) => {
      const outcome = housing.own(ctx.user.id);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
  '/api/house/catalogue': {
    GET: withHousing((housing, _request, ctx) => {
      const outcome = housing.catalogue(ctx.user.id);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
  '/api/house/build': {
    POST: withHousing(async (housing, request, ctx) => {
      const body = await parseBody(request, BuildBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = housing.build(ctx.user.id, body);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
  '/api/house/craft': {
    POST: withHousing(async (housing, request, ctx) => {
      const body = await parseBody(request, CraftBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = housing.craft(ctx.user.id, body);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
  '/api/house/place': {
    PUT: withHousing(async (housing, request, ctx) => {
      const body = await parseBody(request, PlaceBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = housing.place(ctx.user.id, body);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
  '/api/house/skin': {
    PUT: withHousing(async (housing, request, ctx) => {
      const body = await parseBody(request, SkinBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = housing.skin(ctx.user.id, body);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
  '/api/house/housemate': {
    PUT: withHousing(async (housing, request, ctx) => {
      const body = await parseBody(request, HousemateBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = housing.housemate(ctx.user.id, body);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
  '/api/house/mail/collect': {
    POST: withHousing(async (housing, request, ctx) => {
      const body = await parseBody(request, CollectBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = housing.collect(ctx.user.id, body.idempotencyKey);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
  '/api/house/seen': {
    POST: withHousing(async (housing, request, ctx) => {
      const body = await parseBody(request, SeenBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = housing.seen(ctx.user.id);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
  '/api/houses': {
    GET: withHousing((housing, _request, ctx) => {
      const outcome = housing.list(ctx.user.id);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
  '/api/houses/:id': {
    GET: withHousing((housing, _request, ctx) => {
      const owner = ownerId(ctx);
      if (owner === undefined) return errorResponse('no_house', 404);
      const outcome = housing.visit(ctx.user.id, owner);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
  '/api/houses/:id/gift': {
    POST: withHousing(async (housing, request, ctx) => {
      const owner = ownerId(ctx);
      if (owner === undefined) return errorResponse('no_house', 404);
      const body = await parseBody(request, GiftBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = housing.gift(ctx.user.id, owner, body.idempotencyKey);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
  '/api/houses/:id/stamp': {
    POST: withHousing(async (housing, request, ctx) => {
      const owner = ownerId(ctx);
      if (owner === undefined) return errorResponse('no_house', 404);
      const body = await parseBody(request, StampBodySchema);
      if (body === undefined) return invalidBody();
      const outcome = housing.stamp(ctx.user.id, owner, body.stampId);
      return outcome.ok ? json(outcome.value) : failure(outcome);
    }),
  },
};
