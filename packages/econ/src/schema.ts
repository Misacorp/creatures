import * as v from 'valibot';
import { ValleyRulesSchema } from '@creatures/game';

/** The schema of the rules lives with them in `@creatures/game` (one source of numbers); this file keeps the player profiles'. */
export const RulesSchema = ValleyRulesSchema;

const share = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const int = v.pipe(v.number(), v.integer(), v.minValue(0));

const hour = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(23));

export const ProfileSchema = v.strictObject({
  id: v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), v.maxLength(40)),
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
  /** The first week (1-based) of play. */
  joinWeek: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(104)),
  /** Weekdays (0 = Monday) the player opens the game, or every N days. */
  weekdays: v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))),
  everyNDays: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(30)),
  /** Hours of the day (0..23) of the visits on a visiting day. */
  hours: v.pipe(v.array(hour), v.minLength(1)),
  /** Weeks (inclusive) with no visits at all, or null. */
  away: v.nullable(
    v.tuple([
      v.pipe(v.number(), v.integer(), v.minValue(1)),
      v.pipe(v.number(), v.integer(), v.minValue(1)),
    ]),
  ),
  /** Whether the player runs the dungeon and the raid. */
  fights: v.boolean(),
  /** The share of Acorn income (and of spare scrap and shards) given to projects. */
  giveShare: share,
  /** Weeks of saving before giving everything (0: no hoarding). */
  hoardWeeks: int,
  policy: v.picklist(['setAndForget', 'optimiser']),
});
export type PlayerProfile = v.InferOutput<typeof ProfileSchema>;
