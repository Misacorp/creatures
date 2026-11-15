import {
  EXPEDITION_LENGTHS,
  GIFT_CURRENCIES,
  ROOM_SPOT_IDS,
  RULES,
  KIT_NAMES,
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  content,
  placeIds,
  talentContent,
} from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import * as v from 'valibot';
import { DESTINATION_IDS, GOAL_IDS, SPECIES_IDS, SUPPLY_IDS } from './content-ids';
import { ROOM_MAX_USERS } from './lounger';
import { IdempotencyKeySchema, SNOWFLAKE_RE } from './schemas';

/** Every destination a scout seat can be posted to (the lab's six and the two extra shipped places). */
const VALLEY_PLACE_IDS = placeIds(VALLEY_RULES) as [string, ...string[]];
const COMMONS_PLACE_IDS = VALLEY_RULES.commons.places as unknown as [string, ...string[]];

/** Server-generated ids are random UUIDs; anything else is malformed. */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const IdSchema = v.pipe(v.string(), v.regex(ID_RE));

/** `SPECIES_IDS` is every species id: the schema of a field that names one (the server then checks it is a branch). */
const STARTER_IDS = content.creatures.filter((c) => c.starter).map((c) => c.id);

export const StarterBodySchema = v.strictObject({
  // A species that is not a starter fails here, so it never reaches the game logic.
  species: v.picklist(STARTER_IDS),
  idempotencyKey: IdempotencyKeySchema,
});

/**
 * Sending a creature on an expedition. Supplies are optional (a trip without any is free) and come from
 * stock (`owned`). `buy` is no longer allowed: it still parses so that an old client gets the clear
 * `supplies_not_for_sale` answer. Which kinds can go together is a rule the server checks (at most
 * `maxSupplies`, never two of one kind).
 */
export const StartExpeditionBodySchema = v.strictObject({
  creatureId: IdSchema,
  destination: v.picklist(DESTINATION_IDS),
  duration: v.picklist(EXPEDITION_LENGTHS),
  supplies: v.optional(
    v.pipe(
      v.array(v.strictObject({ id: v.picklist(SUPPLY_IDS), source: v.picklist(['buy', 'owned']) })),
      v.maxLength(RULES.expeditions.maxSupplies),
    ),
    [],
  ),
  /** Pack a treat for the explorer (Bait, paid when the trip starts): it doubles the trip's experience. */
  treat: v.optional(v.boolean(), false),
  idempotencyKey: IdempotencyKeySchema,
});

/** Choosing a push-on goal: the trip is in the path, the player is the session's. */
export const PushOnBodySchema = v.strictObject({ goalId: v.picklist(GOAL_IDS) });

/** Claiming takes no input: the expedition id is in the path and the user is the session's. */
export const ClaimBodySchema = v.strictObject({});

/** Dismissing the while-away card names the last payout it showed, so a later payout is not cleared unseen. */
export const DismissAwayBodySchema = v.strictObject({
  until: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
});

/** Dismissing the one-time level reset card carries nothing. */
export const DismissLevelResetBodySchema = v.strictObject({});

/**
 * Settling a pending duplicate (the card is in the path, the player is the session's). Teach and Fuse name
 * the creature of the line that gets it (Teach puts the talent into its Talent Book; a `slot` an old
 * client still sends is accepted and ignored); `recommended` takes the card's Recommended choice.
 */
export const CatchChoiceBodySchema = v.variant('choice', [
  v.strictObject({
    choice: v.literal('teach'),
    creatureId: IdSchema,
    slot: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3))),
    idempotencyKey: IdempotencyKeySchema,
  }),
  v.strictObject({
    choice: v.literal('fuse'),
    creatureId: IdSchema,
    idempotencyKey: IdempotencyKeySchema,
  }),
  v.strictObject({ choice: v.literal('release'), idempotencyKey: IdempotencyKeySchema }),
  v.strictObject({ choice: v.literal('keep'), idempotencyKey: IdempotencyKeySchema }),
  v.strictObject({ choice: v.literal('recommended'), idempotencyKey: IdempotencyKeySchema }),
]);

/** "Apply Recommended to all": settles every waiting duplicate with its Recommended choice. */
export const CatchRecommendedBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });

/** Slotting a talent from a creature's Talent Book: the creature is in the path. */
export const TalentSlotBodySchema = v.strictObject({
  talentId: v.picklist([...talentContent.byId.keys()]),
  golden: v.boolean(),
  slot: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3)),
  idempotencyKey: IdempotencyKeySchema,
});

const KNACK_IDS = Object.keys(combatV2.knacks) as [string, ...string[]];
const V2_TALENT_IDS = Object.keys(combatV2.talents) as [string, ...string[]];

/**
 * Saving a creature's Knack (combat v2): the creature is in the path. An id of a Knack of the content, or
 * null for none (the server checks the creature knows it). `where` is which screen saved it, for analytics.
 */
export const KnackBodySchema = v.strictObject({
  knack: v.nullable(v.picklist(KNACK_IDS)),
  where: v.optional(v.picklist(['page', 'raid']), 'page'),
});

/** A creature learns a v2 talent from its line's Talent Book for Bait: the creature is in the path. */
export const TalentLearnV2BodySchema = v.strictObject({
  talentId: v.picklist(V2_TALENT_IDS),
  idempotencyKey: IdempotencyKeySchema,
});

/** Slotting a learned v2 talent (free), or taking it out of its slot (`slot` null): the creature is in the path. */
export const TalentSlotV2BodySchema = v.strictObject({
  talentId: v.picklist(V2_TALENT_IDS),
  slot: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3))),
});

/** Earning the ribbon a creature waits for: the creature is in the path, the player is the session's. */
export const RibbonBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });

/**
 * Evolving a creature: the creature is in the path. `species` names the form it grows into, one of its
 * branches (the server checks); a client that sends none (an older one) gets the first branch.
 */
export const EvolveBodySchema = v.strictObject({
  species: v.optional(v.picklist(SPECIES_IDS)),
  idempotencyKey: IdempotencyKeySchema,
});

/** Length and character rules are applied by `sanitizeNickname`, which reports a reason. */
export const NicknameBodySchema = v.strictObject({
  nickname: v.nullable(v.string()),
});

/** A creature's private note (null removes it); the length and characters are checked by `sanitizeCreatureNote`. */
export const NoteBodySchema = v.strictObject({
  note: v.nullable(v.pipe(v.string(), v.maxLength(RULES.creatureNote.maxRawLength))),
});

/** Choosing the lounger: the player is the session's. */
export const LoungerBodySchema = v.strictObject({ creatureId: IdSchema });

/** Choosing a spot in the living room (or null to clear it): the player is the session's. */
export const LoungeSpotBodySchema = v.strictObject({
  spotId: v.nullable(v.picklist(ROOM_SPOT_IDS)),
});

/**
 * Who to look up for the living room: 1 to `ROOM_MAX_USERS` distinct Discord snowflakes. Duplicates are
 * rejected, not merged: the client sends each id once.
 */
export const RoomBodySchema = v.strictObject({
  userIds: v.pipe(
    v.array(v.pipe(v.string(), v.regex(SNOWFLAKE_RE))),
    v.minLength(1),
    v.maxLength(ROOM_MAX_USERS),
    v.check((ids) => new Set(ids).size === ids.length),
  ),
});

// --- The valley's scouts (phase 5 step 2): seats and kit ---

/** Posts a creature to a scout seat (or empties it with `null`) and may point the seat at another destination. */
export const ValleySeatBodySchema = v.strictObject({
  seatId: IdSchema,
  creatureId: v.optional(v.nullable(IdSchema)),
  destination: v.optional(v.picklist(VALLEY_PLACE_IDS)),
});

export const ValleySeatBuyBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });

/** Closes the welcome-back Gazette's paper (marks it read); `paperId` is the `id` the state's paper carried. */
export const ValleyGazetteCloseBodySchema = v.strictObject({
  paperId: v.pipe(v.string(), v.regex(/^\d{1,16}$/)),
});

/** Takes a scout into its destination's deeper area (only while the unread paper offers it) or back up (free, any time). */
/** What the broker trades toward (V-FORGE-11): an element it keeps a small stock of, or null (only what the orders wait on). */
export const ValleyBrokerBodySchema = v.strictObject({
  seatId: IdSchema,
  toward: v.nullable(v.picklist(VALLEY_ELEMENTS)),
});

export const ValleyDeepBodySchema = v.strictObject({ seatId: IdSchema, deep: v.boolean() });

/** Buys a kit (a keyed spend of Acorns), or sets an owned kit on a seat (free; `null` takes it off). */
export const ValleyKitBodySchema = v.variant('action', [
  v.strictObject({
    action: v.literal('buy'),
    kit: v.picklist(KIT_NAMES),
    idempotencyKey: IdempotencyKeySchema,
  }),
  v.strictObject({
    action: v.literal('set'),
    seatId: IdSchema,
    kit: v.nullable(v.picklist(KIT_NAMES)),
  }),
]);

// --- The valley's Forge (phase 5 step 3): anvils, orders and the exchange ---

export const ValleyAnvilBuyBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });

const ReachSchema = v.picklist(['none', 'rare', 'epic']);

/**
 * An anvil's queue: adds an order (a blueprint and a count, or "for my team": no blueprint, no count), changes one's count or Reach,
 * or takes one off. The counts are bounded by the rules in the handler; here the shape and the lengths.
 */
export const ValleyOrderBodySchema = v.variant('action', [
  v.strictObject({
    action: v.literal('add'),
    seatId: IdSchema,
    blueprintId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
    forTeam: v.optional(v.boolean(), false),
    count: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(999))),
    reach: v.optional(ReachSchema, 'none'),
    /** A patchwork order's shard element (omitted: the pile held most when a piece starts). */
    element: v.optional(v.picklist(VALLEY_ELEMENTS)),
  }),
  v.strictObject({
    action: v.literal('edit'),
    orderId: IdSchema,
    count: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(999))),
    reach: v.optional(ReachSchema),
  }),
  v.strictObject({ action: v.literal('remove'), orderId: IdSchema }),
]);

/** The shard exchange: `times` trades for the element `to`, paid from `from` (null: the biggest pile that can pay). */
export const ValleyExchangeBodySchema = v.strictObject({
  to: v.picklist(VALLEY_ELEMENTS),
  from: v.optional(v.nullable(v.picklist(VALLEY_ELEMENTS)), null),
  times: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)), 1),
  idempotencyKey: IdempotencyKeySchema,
});

/**
 * A gift to a place's open project (V-COM-1, 5): Acorns, scrap or shards (a keyed spend). Shards name their element (the place's own
 * counts in full, another at the exchange's rate); the other two currencies take no element.
 */
export const ValleyGiftBodySchema = v.strictObject({
  place: v.picklist(COMMONS_PLACE_IDS),
  currency: v.picklist(GIFT_CURRENCIES),
  element: v.optional(v.picklist(VALLEY_ELEMENTS)),
  amount: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1_000_000)),
  idempotencyKey: IdempotencyKeySchema,
});

/** The weekly visitor's reroll of one of the caller's own pieces, worn or in the bag (V-VIS-2). */
export const ValleyVisitorRerollBodySchema = v.strictObject({
  itemId: IdSchema,
  idempotencyKey: IdempotencyKeySchema,
});

/** Buying the week's blueprint from the visitor (V-VIS-5): once a week per player. */
export const ValleyVisitorBlueprintBodySchema = v.strictObject({
  idempotencyKey: IdempotencyKeySchema,
});

/** The visitor's read: no query, or the one piece the player asks the price and odds of (`?item=<id>`). */
export const ValleyVisitorQuerySchema = v.strictObject({
  item: v.optional(IdSchema),
});

/** Seats a creature at one of the caller's School student seats (V-SCH-13), or empties the seat with `null`. */
export const ValleySchoolSeatBodySchema = v.strictObject({
  index: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(9)),
  creatureId: v.nullable(IdSchema),
});

/** Posts a creature to the caller's communal seat at a place (it opens the seat the first time), or empties it with `null`. */
export const ValleyCommunalBodySchema = v.strictObject({
  place: v.picklist(COMMONS_PLACE_IDS),
  creatureId: v.nullable(IdSchema),
});
