/**
 * Request bodies of the Valley Games routes. Strict: unknown keys are rejected, so a client can never
 * send a user id, a seed, a score or anything else the server decides. Whether an event is in the day's
 * lineup, a creature is the caller's and free, and the entries are open, is the server's check.
 */
import { RULES } from '@creatures/game';
import * as v from 'valibot';
import { IdSchema } from './collection-schemas';
import { IdempotencyKeySchema } from './schemas';

/** A content id (an event or a stall offer). */
const ContentIdSchema = v.pipe(
  v.string(),
  v.maxLength(32),
  v.regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
);

/**
 * `PUT /api/games/entry`: sets the caller's creatures in one event of a show day (1 in a solo event, 1
 * to 3 in a team event, in slot order); an empty list clears the entry. A set, so it needs no key.
 */
export const EntryBodySchema = v.strictObject({
  day: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  eventId: ContentIdSchema,
  creatureIds: v.pipe(v.array(IdSchema), v.maxLength(RULES.games.teamSize)),
});
export type EntryBody = v.InferOutput<typeof EntryBodySchema>;

/** `POST /api/games/stall/buy`: one purchase at the Prize Stall. */
export const BuyBodySchema = v.strictObject({
  offerId: ContentIdSchema,
  idempotencyKey: IdempotencyKeySchema,
});
export type BuyBody = v.InferOutput<typeof BuyBodySchema>;
