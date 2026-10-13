import { RULES } from '@creatures/game';
import * as v from 'valibot';
import { IdSchema } from './collection-schemas';
import { SPEND_KEY_RE } from './ledger';

const idempotencyKey = v.pipe(v.string(), v.regex(SPEND_KEY_RE));

/**
 * The body of `POST /api/dungeon/run`. Strict: unknown keys are rejected, so a client can never send
 * a user id, a seed, stats or anything else the server decides. An old body that still carries
 * `abilities` or a `formation` is refused as `invalid_body`.
 *
 * - `team`: the three creatures, in the order they stand in the one row, left to right: `team[i]` is
 *   position i (ids the caller owns, all different: the server checks that). There is no formation:
 *   the order is the formation.
 *
 * There is no ability choice: every unlocked creature ability fires at its default round.
 */
export const RunBodySchema = v.strictObject({
  team: v.pipe(v.array(IdSchema), v.length(RULES.dungeon.teamSize)),
  idempotencyKey,
});
export type RunBody = v.InferOutput<typeof RunBodySchema>;
