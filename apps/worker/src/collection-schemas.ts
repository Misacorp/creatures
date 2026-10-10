import { DURATION_IDS, SUPPLIES_IDS, content } from '@creatures/game';
import * as v from 'valibot';
import { SPEND_KEY_RE } from './ledger';

/** Server-generated ids are random UUIDs; anything else is malformed. */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const IdSchema = v.pipe(v.string(), v.regex(ID_RE));

const idempotencyKey = v.pipe(v.string(), v.regex(SPEND_KEY_RE));

const STARTER_IDS = content.creatures.filter((c) => c.starter).map((c) => c.id);

export const StarterBodySchema = v.strictObject({
  // A species that is not a starter fails here, so it never reaches the game logic.
  species: v.picklist(STARTER_IDS),
  idempotencyKey,
});

export const StartExpeditionBodySchema = v.strictObject({
  creatureId: IdSchema,
  duration: v.picklist(DURATION_IDS),
  supplies: v.picklist(SUPPLIES_IDS),
  idempotencyKey,
});

/** Claiming takes no input: the expedition id is in the path and the user is the session's. */
export const ClaimBodySchema = v.strictObject({});

export const TrainBodySchema = v.strictObject({ idempotencyKey });

/** Length and character rules are applied by `sanitizeNickname`, which reports a reason. */
export const NicknameBodySchema = v.strictObject({
  nickname: v.nullable(v.string()),
});
