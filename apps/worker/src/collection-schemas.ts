import { EXPEDITION_LENGTHS, RULES, content, expeditionContent } from '@creatures/game';
import * as v from 'valibot';
import { SPEND_KEY_RE } from './ledger';

/** Server-generated ids are random UUIDs; anything else is malformed. */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const IdSchema = v.pipe(v.string(), v.regex(ID_RE));

const idempotencyKey = v.pipe(v.string(), v.regex(SPEND_KEY_RE));

const GOAL_IDS = expeditionContent.goals.map((g) => g.id);

const STARTER_IDS = content.creatures.filter((c) => c.starter).map((c) => c.id);

export const StarterBodySchema = v.strictObject({
  // A species that is not a starter fails here, so it never reaches the game logic.
  species: v.picklist(STARTER_IDS),
  idempotencyKey,
});

const DESTINATION_IDS = expeditionContent.destinations.map((d) => d.id);
const SUPPLY_IDS = expeditionContent.supplies.map((s) => s.id);

/**
 * Sending a creature on an expedition. Supplies are optional (a trip without any is free): each is
 * bought with Bait now (`buy`) or taken from stock (`owned`). Which kinds can go together is a rule
 * the server checks (at most `maxSupplies`, never two of one kind).
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
  idempotencyKey,
});

/** Choosing a push-on goal: the trip is in the path, the player is the session's. */
export const PushOnBodySchema = v.strictObject({ goalId: v.picklist(GOAL_IDS) });

/** Claiming takes no input: the expedition id is in the path and the user is the session's. */
export const ClaimBodySchema = v.strictObject({});

export const TrainBodySchema = v.strictObject({ idempotencyKey });

export const EvolveBodySchema = v.strictObject({ idempotencyKey });

/** Length and character rules are applied by `sanitizeNickname`, which reports a reason. */
export const NicknameBodySchema = v.strictObject({
  nickname: v.nullable(v.string()),
});
