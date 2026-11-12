/**
 * Request bodies of the housing routes (`docs/design/housing.md` 3.4). Strict: unknown keys are rejected, so a client can never send a user
 * id, a price, a count or anything else the server decides. Ids are plain content ids; amounts are integers 0 to 1,000,000; records hold at
 * most 16 keys; idempotency keys are `SPEND_KEY_RE`. Whether an id names a real piece, part or room is the server's check.
 */
import { HousePaySchema } from '@creatures/game';
import * as v from 'valibot';
import { IdSchema } from './collection-schemas';
import { IdempotencyKeySchema } from './schemas';

/** A content id: lowercase words joined by hyphens (`ancient-stool`, `west-wing`, `window-a`). */
export const HouseIdSchema = v.pipe(
  v.string(),
  v.maxLength(64),
  v.regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
);

/** A room id: `<part>:<key>`, for example `hut:hearth`. */
export const RoomIdSchema = v.pipe(
  v.string(),
  v.maxLength(80),
  v.regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
);

/** What a payment offers: the shared schema, with the material ids held to plain content ids. */
const PaySchema = v.pipe(
  HousePaySchema,
  v.check(
    (pay) => Object.keys(pay.materials ?? {}).every((id) => v.is(HouseIdSchema, id)),
    'material ids must be content ids',
  ),
);

export const BuildBodySchema = v.strictObject({
  partId: HouseIdSchema,
  pay: PaySchema,
  idempotencyKey: IdempotencyKeySchema,
});

export const CraftBodySchema = v.strictObject({
  itemId: HouseIdSchema,
  idempotencyKey: IdempotencyKeySchema,
});

export const PlaceBodySchema = v.strictObject({
  roomId: RoomIdSchema,
  spotId: HouseIdSchema,
  pieceId: v.nullable(HouseIdSchema),
  /** A move: the spot the piece stands in now (it is emptied and the piece placed in `roomId`/`spotId`, a bed with its sleeper). */
  from: v.optional(v.strictObject({ roomId: RoomIdSchema, spotId: HouseIdSchema })),
});

/** A look: a skin id, or a generated skin in one of its colours (`paper-damask:rose`, `@creatures/game` `looks.ts`). */
export const LookSchema = v.pipe(
  v.string(),
  v.maxLength(64),
  v.regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?::[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/),
);

/** A room's layers or the house-wide ones; a trim, ceiling or frame of `null` takes it off (as built). At least one is given. */
export const SkinBodySchema = v.union([
  v.pipe(
    v.strictObject({
      target: v.literal('room'),
      roomId: RoomIdSchema,
      wall: v.optional(LookSchema),
      floor: v.optional(LookSchema),
      trim: v.optional(v.nullable(LookSchema)),
      ceiling: v.optional(v.nullable(LookSchema)),
    }),
    v.check(
      (b) =>
        b.wall !== undefined ||
        b.floor !== undefined ||
        b.trim !== undefined ||
        b.ceiling !== undefined,
      'give a wall, a floor, a trim or a ceiling',
    ),
  ),
  v.pipe(
    v.strictObject({
      target: v.literal('exterior'),
      roof: v.optional(HouseIdSchema),
      walls: v.optional(HouseIdSchema),
      frame: v.optional(v.nullable(LookSchema)),
    }),
    v.check(
      (b) => b.roof !== undefined || b.walls !== undefined || b.frame !== undefined,
      'give a roof, walls or a frame',
    ),
  ),
]);
export type SkinBody = v.InferOutput<typeof SkinBodySchema>;

export const HousemateBodySchema = v.strictObject({
  roomId: RoomIdSchema,
  spotId: HouseIdSchema,
  creatureId: v.nullable(IdSchema),
});

export const GiftBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });
export const StampBodySchema = v.strictObject({ stampId: HouseIdSchema });
export const CollectBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });
export const SeenBodySchema = v.strictObject({});

export type BuildBody = v.InferOutput<typeof BuildBodySchema>;
export type CraftBody = v.InferOutput<typeof CraftBodySchema>;
export type PlaceBody = v.InferOutput<typeof PlaceBodySchema>;
export type HousemateBody = v.InferOutput<typeof HousemateBodySchema>;
