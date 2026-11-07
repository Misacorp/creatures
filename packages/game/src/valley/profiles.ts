import * as v from 'valibot';

/**
 * Player profiles (`docs/design/valley/economy/model.md` "Players"): data, not code. When they visit, whether they fight, how generously
 * they give and the default post policy. The lab (`@creatures/econ`) and the staging bots (`valley-bots`, step 10) read the same list, so a
 * bot of a kind visits and plays as the lab's player of that kind does. Weekdays count from Monday = 0; the raid's stages are Friday to
 * Sunday (4 to 6).
 */

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

const base = {
  joinWeek: 1,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  everyNDays: 0,
  hours: [20],
  away: null,
  fights: true,
  // ASSUMPTION: "about a third" of Acorn income goes to projects (commons.md example).
  giveShare: 1 / 3,
  hoardWeeks: 0,
  policy: 'setAndForget' as const,
};

export const PROFILES: readonly PlayerProfile[] = [
  { ...base, id: 'daily', label: 'Daily (one evening visit)' },
  // An active player visits three times a day and re-tilts their seats each time.
  {
    ...base,
    id: 'active',
    label: 'Active (3 visits a day)',
    hours: [8, 13, 20],
    policy: 'optimiser',
  },
  { ...base, id: 'every-other-day', label: 'Every other day', weekdays: [], everyNDays: 2 },
  { ...base, id: 'weekend-off', label: 'Weekend off', weekdays: [0, 1, 2, 3, 4] },
  { ...base, id: 'weekly', label: 'Weekly (Sundays)', weekdays: [6] },
  { ...base, id: 'new', label: 'New (joins in week 6)', joinWeek: 6, policy: 'optimiser' },
  { ...base, id: 'returner', label: 'Returner (away weeks 5 to 8)', away: [5, 8] },
  {
    ...base,
    id: 'hoarder',
    label: 'Hoarder (saves 4 weeks, then gives all)',
    hoardWeeks: 4,
  },
];

export const profileById = (id: string): PlayerProfile => {
  const found = PROFILES.find((p) => p.id === id);
  if (!found) throw new Error(`unknown profile ${id}`);
  return found;
};

/**
 * The hours (0..23) at which a player of this profile visits on game day `day` (0-based from the run's Monday; `id` is the player's
 * number on the server, which staggers the every-N-days players). Empty before the player joins, in the away weeks and on days off.
 */
export function visitHours(profile: PlayerProfile, day: number, id: number): readonly number[] {
  const joinDay = (profile.joinWeek - 1) * 7;
  if (day < joinDay) return [];
  const week = Math.floor(day / 7) + 1;
  if (profile.away && week >= profile.away[0] && week <= profile.away[1]) return [];
  const goes =
    profile.everyNDays > 0
      ? (day - joinDay + id) % profile.everyNDays === 0
      : profile.weekdays.includes(day % 7);
  return goes ? profile.hours : [];
}

/**
 * The players of the lab's mixed server of 8 (`mixed8`: two daily players, one of every other kind but the hoarder) that the staging bots
 * play (`valley-bots`). The number is the lab's player number on that server, which staggers the every-other-day player the same way.
 * Number 0 is the lab's first daily player, the human of a staging server: a month is played by a script that moves the clock, so nobody
 * plays that seat, and a bot stands in for it (it is never reported; the report's "daily" is bot 1). Without it the server has 7 players
 * where the lab has 8, and everything the players give together (the projects, the fire) comes out a seventh short.
 */
export const MIXED8_BOTS: readonly { readonly profile: string; readonly id: number }[] = [
  { profile: 'daily', id: 0 },
  { profile: 'daily', id: 1 },
  { profile: 'active', id: 2 },
  { profile: 'every-other-day', id: 3 },
  { profile: 'weekend-off', id: 4 },
  { profile: 'weekly', id: 5 },
  { profile: 'new', id: 6 },
  { profile: 'returner', id: 7 },
];

/** The number of the bot that stands in for the human's seat in the lab's server (never reported). */
export const STAND_IN_BOT = 0;
