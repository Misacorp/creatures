import { ElementSchema, MAX_ROOM_ROUNDS, RULES, ZoneSchema, basicAbilities } from '@creatures/game';
import * as v from 'valibot';
import { IdSchema } from './collection-schemas';
import { SPEND_KEY_RE } from './ledger';

const idempotencyKey = v.pipe(v.string(), v.regex(SPEND_KEY_RE));

/**
 * A round to fire an ability in, or null for "auto": it fires at its default round, as an absent
 * player's ability does in the live finale. A room lasts at most `MAX_ROOM_ROUNDS` rounds.
 */
const FireAtRound = v.nullable(
  v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_ROOM_ROUNDS)),
);

const BASIC_IDS = basicAbilities().map((a) => a.id);

/**
 * The body of `POST /api/dungeon/run`. Strict: unknown keys are rejected, so a client can never send
 * a user id, a seed, stats or anything else the server decides.
 *
 * - `team`: the three creatures, in the order they stand in the one row, left to right: `team[i]` is
 *   position i (ids the caller owns, all different: the server checks that). There is no formation:
 *   the order is the formation.
 * - `abilities`: the pre-run choices that replace live input. `basic` is the basic ability and when
 *   to fire it (`zone` for Shield Wall, `element` for Re-mark, nothing for the others). `creatures`
 *   lists the creature abilities whose round the player sets; every unlocked creature ability is in
 *   the run and the ones not listed fire at their default round.
 */
export const RunBodySchema = v.strictObject({
  team: v.pipe(v.array(IdSchema), v.length(RULES.dungeon.teamSize)),
  abilities: v.strictObject({
    basic: v.strictObject({
      abilityId: v.picklist(BASIC_IDS),
      fireAtRound: FireAtRound,
      zone: v.optional(ZoneSchema),
      element: v.optional(ElementSchema),
    }),
    creatures: v.pipe(
      v.array(v.strictObject({ creatureId: IdSchema, fireAtRound: FireAtRound })),
      v.maxLength(RULES.dungeon.teamSize),
    ),
  }),
  idempotencyKey,
});
export type RunBody = v.InferOutput<typeof RunBodySchema>;
