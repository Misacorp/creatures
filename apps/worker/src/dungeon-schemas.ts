import { RULES } from '@creatures/game';
import * as v from 'valibot';
import { IdSchema } from './collection-schemas';
import { IdempotencyKeySchema } from './schemas';

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
  idempotencyKey: IdempotencyKeySchema,
});
export type RunBody = v.InferOutput<typeof RunBodySchema>;

/**
 * The part of a stored run summary that gives the team's order: the creature ids, left to right,
 * exactly `teamSize` of them. Other keys of the summary are ignored on purpose (it is our own
 * stored data, read for this one field); the ids go through the same `IdSchema` a request uses.
 */
export const LastTeamSchema = v.pipe(
  v.object({
    team: v.pipe(v.array(v.object({ id: IdSchema })), v.length(RULES.dungeon.teamSize)),
  }),
  v.transform((summary) => summary.team.map((member) => member.id)),
);

/**
 * The saved team draft: exactly `teamSize` slots, left to right, each a creature id or null (an empty
 * slot). The ids that are set must be different. Used for the `PUT /api/dungeon/team` body and for
 * reading the stored draft back.
 */
export const DraftTeamSchema = v.pipe(
  v.array(v.nullable(IdSchema)),
  v.length(RULES.dungeon.teamSize),
  v.check((team) => {
    const ids = team.filter((id) => id !== null);
    return new Set(ids).size === ids.length;
  }, 'creatures must be different'),
);

/** The body of `PUT /api/dungeon/team`. Strict: unknown keys are rejected. The player is the session's. */
export const DraftBodySchema = v.strictObject({ team: DraftTeamSchema });
export type DraftBody = v.InferOutput<typeof DraftBodySchema>;
