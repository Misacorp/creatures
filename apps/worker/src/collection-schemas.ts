import {
  EXPEDITION_LENGTHS,
  ROOM_SPOT_IDS,
  RULES,
  content,
  expeditionContent,
  talentContent,
} from '@creatures/game';
import * as v from 'valibot';
import { ROOM_MAX_USERS } from './lounger';
import { IdempotencyKeySchema, SNOWFLAKE_RE } from './schemas';

/** Server-generated ids are random UUIDs; anything else is malformed. */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const IdSchema = v.pipe(v.string(), v.regex(ID_RE));

const GOAL_IDS = expeditionContent.goals.map((g) => g.id);

const STARTER_IDS = content.creatures.filter((c) => c.starter).map((c) => c.id);

export const StarterBodySchema = v.strictObject({
  // A species that is not a starter fails here, so it never reaches the game logic.
  species: v.picklist(STARTER_IDS),
  idempotencyKey: IdempotencyKeySchema,
});

const DESTINATION_IDS = expeditionContent.destinations.map((d) => d.id);
const SUPPLY_IDS = expeditionContent.supplies.map((s) => s.id);

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
  idempotencyKey: IdempotencyKeySchema,
});

/** Choosing a push-on goal: the trip is in the path, the player is the session's. */
export const PushOnBodySchema = v.strictObject({ goalId: v.picklist(GOAL_IDS) });

/** Claiming takes no input: the expedition id is in the path and the user is the session's. */
export const ClaimBodySchema = v.strictObject({});

/**
 * Settling a pending duplicate (the card is in the path, the player is the session's). Teach and Fuse name
 * the creature of the line that gets it (and Teach the slot, 1 to 3: the server checks it is open);
 * `recommended` takes the card's Recommended choice.
 */
export const CatchChoiceBodySchema = v.variant('choice', [
  v.strictObject({
    choice: v.literal('teach'),
    creatureId: IdSchema,
    slot: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3)),
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

export const TrainBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });

export const EvolveBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });

/** Length and character rules are applied by `sanitizeNickname`, which reports a reason. */
export const NicknameBodySchema = v.strictObject({
  nickname: v.nullable(v.string()),
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
