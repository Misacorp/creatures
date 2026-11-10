/**
 * The strict response shapes of every housing endpoint (`docs/design/housing.md` 3.4), shared by the worker's tests and the
 * client's parsers, as `valley/view.ts` does for the valley. Names, hints, sources and prices are not sent: the client has
 * the content.
 */
import * as v from 'valibot';
import { ELEMENTS, type Element } from '../content/schema';
import { PriceLineSchema } from './schema';

const Count = v.pipe(v.number(), v.integer(), v.minValue(0));
const Amount = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000));
const Id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
/** A room id: `<part>:<key>`. */
const RoomId = v.pipe(v.string(), v.minLength(1), v.maxLength(80));
const Name = v.pipe(v.string(), v.maxLength(100));
const Time = v.pipe(v.number(), v.integer(), v.minValue(0));

const record = <T extends v.GenericSchema>(value: T, max: number) =>
  v.pipe(v.record(Id, value), v.maxEntries(max));
const ids = (max: number) => v.pipe(v.array(Id), v.maxLength(max));

const UserRef = v.strictObject({ userId: Id, name: Name });

export const RoomViewSchema = v.strictObject({
  id: RoomId,
  kind: Id,
  wall: Id,
  floor: Id,
  spots: record(v.nullable(Id), 32),
});
export type RoomView = v.InferOutput<typeof RoomViewSchema>;

export const HousemateViewSchema = v.strictObject({
  roomId: RoomId,
  spotId: Id,
  /** False when the creature is away (a trip, a job, a valley post, an open dungeon run). */
  home: v.boolean(),
  creature: v.strictObject({
    id: Id,
    species: Id,
    shiny: v.boolean(),
    nickname: v.nullable(v.pipe(v.string(), v.maxLength(100))),
    level: Count,
  }),
});
export type HousemateView = v.InferOutput<typeof HousemateViewSchema>;

export const GuestbookEntrySchema = v.strictObject({
  visitor: UserRef,
  stampId: Id,
  at: Time,
});
export type GuestbookEntry = v.InferOutput<typeof GuestbookEntrySchema>;

const display = <K extends string, T extends v.ObjectEntries>(kind: K, entries: T) =>
  v.strictObject({ roomId: RoomId, spotId: Id, kind: v.literal(kind), ...entries });

export const DisplayViewSchema = v.variant('kind', [
  display('raid-plaques', {
    plaques: v.pipe(
      v.array(v.strictObject({ bossId: Id, best: Count, wins: Count })),
      v.maxLength(32),
    ),
    current: v.nullable(Id),
  }),
  display('games-medals', { gold: Count, silver: Count, bronze: Count, pins: Count }),
  display('games-badges', {
    events: v.pipe(v.array(v.strictObject({ eventId: Id, wins: Count })), v.maxLength(64)),
  }),
  display('festival', { species: ids(16) }),
  display('keepsakes', {
    places: v.pipe(v.array(v.strictObject({ place: Id, count: Count })), v.maxLength(32)),
  }),
  display('journal', { sets: ids(32), pages: Count }),
  display('dungeon', { depth: Count, clears: Count }),
  display('set-keepsakes', { sets: ids(32) }),
]);
export type DisplayView = v.InferOutput<typeof DisplayViewSchema>;
/** The display's data without its place in the house. */
export type DisplayData = DisplayView extends infer D
  ? D extends DisplayView
    ? Omit<D, 'roomId' | 'spotId'>
    : never
  : never;

export const HouseViewSchema = v.strictObject({
  /** The stored, sanitised display name. */
  owner: UserRef,
  /** Built part ids. */
  built: ids(32),
  exterior: v.strictObject({ roof: Id, walls: Id }),
  /** Every built room, indoor and outdoor. */
  rooms: v.pipe(v.array(RoomViewSchema), v.maxLength(32)),
  /** One per display spot of a built room. */
  displays: v.pipe(v.array(DisplayViewSchema), v.maxLength(32)),
  housemates: v.pipe(v.array(HousemateViewSchema), v.maxLength(8)),
  /** Newest first. */
  guestbook: v.pipe(v.array(GuestbookEntrySchema), v.maxLength(100)),
  setsComplete: ids(32),
});
export type HouseView = v.InferOutput<typeof HouseViewSchema>;

export const PartProgressViewSchema = v.strictObject({
  partId: Id,
  paid: v.pipe(v.array(PriceLineSchema), v.maxLength(12)),
  remaining: v.pipe(v.array(PriceLineSchema), v.maxLength(12)),
});
export type PartProgressView = v.InferOutput<typeof PartProgressViewSchema>;

const ShardPurse = v.strictObject(
  Object.fromEntries(ELEMENTS.map((e) => [e, Count])) as Record<Element, typeof Count>,
);

/** The Acorns, scrap and shards a player holds. */
export const PurseSchema = v.strictObject({ bait: Count, scrap: Count, shards: ShardPurse });
export type PurseView = v.InferOutput<typeof PurseSchema>;

/** What the player holds of one material, and how much of it is new since they last looked. */
export const MaterialHoldingSchema = v.strictObject({ have: Count, fresh: Count });
/** Materials by id: in a build or craft answer only the ones that changed. */
export const MaterialHoldingsSchema = record(MaterialHoldingSchema, 64);

export const OwnHouseViewSchema = v.strictObject({
  /** Parts started but not built. */
  progress: v.pipe(v.array(PartProgressViewSchema), v.maxLength(32)),
  buildable: ids(32),
  items: v.strictObject({
    pieces: record(Count, 400),
    skins: ids(200),
    stamps: ids(100),
    /** Learned blueprints (starters are known from the content). */
    blueprints: ids(600),
  }),
  /** Piece copies not placed. */
  free: record(Count, 400),
  materials: MaterialHoldingsSchema,
  purse: PurseSchema,
  /** Unclaimed gifts. */
  mailbox: v.strictObject({
    gifts: Count,
    acorns: Count,
    from: v.pipe(v.array(UserRef), v.maxLength(32)),
  }),
  /** The last drops, newest first. */
  recent: v.pipe(
    v.array(
      v.strictObject({
        at: Time,
        materials: record(Count, 16),
        blueprint: v.nullable(Id),
        stamp: v.nullable(Id),
      }),
    ),
    v.maxLength(20),
  ),
});
export type OwnHouseView = v.InferOutput<typeof OwnHouseViewSchema>;

/** What a payment offers: any part of it. Amounts are integers 0 to 1,000,000; the records hold at most 16 keys. */
export const HousePaySchema = v.strictObject({
  bait: v.optional(Amount),
  scrap: v.optional(Amount),
  shards: v.optional(
    v.strictObject(
      Object.fromEntries(ELEMENTS.map((e) => [e, v.optional(Amount)])) as Record<
        Element,
        v.OptionalSchema<typeof Amount, undefined>
      >,
    ),
  ),
  materials: v.optional(v.pipe(v.record(Id, Amount), v.maxEntries(16))),
});

/** What the caller did at a house today. */
export const VisitTodaySchema = v.strictObject({ gifted: v.boolean(), stamped: v.boolean() });
export type VisitToday = v.InferOutput<typeof VisitTodaySchema>;

export const HouseListViewSchema = v.strictObject({
  /** At most 15, sorted by name; the caller's own house is left out. */
  houses: v.pipe(
    v.array(
      v.strictObject({
        userId: Id,
        name: Name,
        built: ids(32),
        updatedAt: Time,
        today: VisitTodaySchema,
      }),
    ),
    v.maxLength(15),
  ),
  me: v.strictObject({ giftLeft: v.boolean() }),
});
export type HouseListView = v.InferOutput<typeof HouseListViewSchema>;

export const CatalogueViewSchema = v.strictObject({
  pieces: v.pipe(
    v.array(v.strictObject({ id: Id, owned: Count, placed: Count, known: v.boolean() })),
    v.maxLength(400),
  ),
  skins: v.pipe(
    v.array(v.strictObject({ id: Id, owned: v.boolean(), known: v.boolean() })),
    v.maxLength(200),
  ),
  stamps: v.pipe(v.array(v.strictObject({ id: Id, owned: v.boolean() })), v.maxLength(100)),
  materials: v.pipe(v.array(v.strictObject({ id: Id, have: Count })), v.maxLength(64)),
  parts: v.pipe(v.array(v.strictObject({ id: Id, built: v.boolean() })), v.maxLength(32)),
  sets: v.pipe(v.array(v.strictObject({ id: Id, complete: v.boolean() })), v.maxLength(32)),
});
export type CatalogueView = v.InferOutput<typeof CatalogueViewSchema>;

export type HousePay = v.InferOutput<typeof HousePaySchema>;

/** The answer of each endpoint (3.4), so both sides parse the same shape. */
export const HouseAnswerSchema = v.strictObject({
  house: HouseViewSchema,
  own: OwnHouseViewSchema,
});
export const VisitAnswerSchema = v.strictObject({ house: HouseViewSchema });
/** What a part's finishing added to the house: the client folds it in, no second request. */
export const BuildGrownSchema = v.strictObject({
  /** Every built part id (content order). */
  parts: ids(32),
  /** The parts that can be paid into now. */
  buildable: ids(32),
  /** Blueprints the part taught (the client adds them to the learned ones). */
  learned: ids(64),
  /** The rooms the part made (bare, or as they already stood). */
  rooms: v.pipe(v.array(RoomViewSchema), v.maxLength(8)),
  /** The display spots of those rooms. */
  displays: v.pipe(v.array(DisplayViewSchema), v.maxLength(8)),
});
export type BuildGrown = v.InferOutput<typeof BuildGrownSchema>;
/** A payment: the part's progress (a finished part's has nothing remaining), the purse, the materials that changed, and `grown` when built. */
export const BuildAnswerSchema = v.strictObject({
  part: PartProgressViewSchema,
  built: v.boolean(),
  purse: PurseSchema,
  materials: MaterialHoldingsSchema,
  grown: v.optional(BuildGrownSchema),
});
/** A craft: the item's new count (a skin is 1), the purse and the materials that changed. */
export const CraftAnswerSchema = v.strictObject({
  itemId: Id,
  kind: v.picklist(['piece', 'skin']),
  count: Count,
  purse: PurseSchema,
  materials: MaterialHoldingsSchema,
});
export type BuildAnswer = v.InferOutput<typeof BuildAnswerSchema>;
export type CraftAnswer = v.InferOutput<typeof CraftAnswerSchema>;
export const PlaceAnswerSchema = v.strictObject({
  room: RoomViewSchema,
  own: v.strictObject({ free: record(Count, 400) }),
});
/** A skin change: the room (a wallpaper or floor) or the exterior (roof and walls) as it now stands. */
export const SkinAnswerSchema = v.variant('target', [
  v.strictObject({ target: v.literal('room'), room: RoomViewSchema }),
  v.strictObject({
    target: v.literal('exterior'),
    exterior: v.strictObject({ roof: Id, walls: Id }),
  }),
]);
export type SkinAnswer = v.InferOutput<typeof SkinAnswerSchema>;
export const HousemateAnswerSchema = v.strictObject({
  housemates: v.pipe(v.array(HousemateViewSchema), v.maxLength(8)),
});
export const GiftAnswerSchema = v.strictObject({
  gift: v.strictObject({ amount: Count }),
  today: VisitTodaySchema,
});
export const StampAnswerSchema = v.strictObject({
  guestbook: v.pipe(v.array(GuestbookEntrySchema), v.maxLength(100)),
  today: VisitTodaySchema,
});
export const CollectAnswerSchema = v.strictObject({ collected: Count, balance: Count });
export const SeenAnswerSchema = v.strictObject({ ok: v.literal(true) });

/** Parses an answer with its schema; `undefined` when the shape is wrong (the client treats that as a failed request). */
export function parseHouseAnswer<S extends v.GenericSchema>(
  schema: S,
  data: unknown,
): v.InferOutput<S> | undefined {
  const result = v.safeParse(schema, data);
  return result.success ? result.output : undefined;
}

export const parseHouseView = (data: unknown) => parseHouseAnswer(HouseViewSchema, data);
export const parseOwnHouseView = (data: unknown) => parseHouseAnswer(OwnHouseViewSchema, data);
export const parseHouseListView = (data: unknown) => parseHouseAnswer(HouseListViewSchema, data);
export const parseCatalogueView = (data: unknown) => parseHouseAnswer(CatalogueViewSchema, data);
