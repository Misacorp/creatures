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
  /**
   * The creatures of the team that get a treat (Bait, paid with the run): they earn double experience.
   * Each is a creature of `team`, once; the server checks that. Absent: no treats.
   */
  treats: v.optional(v.pipe(v.array(IdSchema), v.maxLength(RULES.dungeon.teamSize)), []),
  idempotencyKey: IdempotencyKeySchema,
});
export type RunBody = v.InferOutput<typeof RunBodySchema>;

/** `POST /api/dungeon/start`: the same body as the old all-at-once run (docs/design/dungeon-paths.md). */
export const StartBodySchema = RunBodySchema;
export type StartBody = RunBody;

/** A node of the map: `f<floor>l<lane>`, or `u<level>f<floor>l<lane>` in an Undercroft. Whether it is on this run's map and reachable is the server's check. */
const NodeIdSchema = v.pipe(v.string(), v.regex(/^(?:u\d)?f\d{1,2}l\d$/));
/** A content id (a keepsake). Whether it is one of the camp's offers is the server's check. */
const ContentIdSchema = v.pipe(
  v.string(),
  v.maxLength(32),
  v.regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
);

/**
 * What a player can do next on the map, strict: unknown keys are rejected, so a client can never send
 * a user id, a seed, HP, loot or anything else the server decides. The server decides whether the act
 * is allowed now (the room is reachable, something is pending, the swap is possible).
 */
export const ActSchema = v.variant('type', [
  v.strictObject({ type: v.literal('move'), node: NodeIdSchema }),
  v.strictObject({ type: v.literal('event'), option: v.picklist([0, 1]) }),
  v.strictObject({
    type: v.literal('camp'),
    choice: v.picklist(['rest', 'swap', 'keepsake']),
    /**
     * The row in the order the player wants it, left to right: a permutation of the creature ids the row
     * holds once the choice is done (after a swap: the creature that comes in, not the one that leaves).
     */
    order: v.optional(v.pipe(v.array(IdSchema), v.length(RULES.dungeon.teamSize))),
    /** Swap: the creature of the row that goes home, and the player's own creature that comes in. */
    out: v.optional(IdSchema),
    in: v.optional(IdSchema),
    /** Keepsake: one of the two offers. */
    keepsake: v.optional(ContentIdSchema),
  }),
  /** Heads home from the camp, or from the descent card (the run ends and keeps the whole pack). */
  v.strictObject({ type: v.literal('home') }),
  /** Goes down into the Undercroft, when the descent card is waiting. */
  v.strictObject({ type: v.literal('descend') }),
]);
export type Act = v.InferOutput<typeof ActSchema>;

/** The body of `POST /api/dungeon/act`. Strict. The run must be the caller's own; `step` is the run's current step. */
export const ActBodySchema = v.strictObject({
  runId: IdSchema,
  step: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(999)),
  idempotencyKey: IdempotencyKeySchema,
  act: ActSchema,
});
export type ActBody = v.InferOutput<typeof ActBodySchema>;

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
