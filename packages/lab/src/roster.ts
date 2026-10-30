/**
 * The roster profile: the seam between combat v2 (which owns the challenges) and the valley (which owns how fast a server's
 * players grow). `docs/design/combat/boss-track.md` says why it is the only thing the valley changes.
 *
 * A profile is plain data: for each kind of player and each week from 1 to 24, the levels of the player's 1st, 3rd, 10th and
 * 20th creature, how many creatures they own, which lab forms they can have, how many talent slots their best creature has
 * open, and a `gear` level (carried but unused: the lab has no gear yet). The functions below only read it. When the valley's
 * economy lab writes the same shape, `PLACEHOLDER_ROSTER` is replaced and nothing else here changes.
 */
import { RULES } from '@creatures/game';
import { formStats } from './species';
import type { Pick } from './search';

/** The creature level cap. */
export const LEVEL_CAP = 30;
/** The weeks a profile covers. */
export const ROSTER_WEEKS = 24;

/** The kinds of player: a daily player, a weekly player, and a new player (who joins at some week and catches up). */
export type RosterKind = 'daily' | 'weekly' | 'new';

/** A player of the profile: a new player also says the week they joined (1 = the server's first week). */
export interface RosterPlayer {
  readonly kind: RosterKind;
  readonly joinWeek?: number;
}

/** What one player has at one week. */
export interface RosterWeek {
  /** The week (1 to 24) for a daily or weekly player; the weeks since joining (1 = the week they join) for a new one's table. */
  readonly week: number;
  /** The level of the player's best, 3rd best, 10th best and 20th best creature. Levels between are interpolated, none is above the cap. */
  readonly first: number;
  readonly third: number;
  readonly tenth: number;
  readonly twentieth: number;
  /** How many creatures they own. */
  readonly size: number;
  /** The lab forms they can have: `'all'` for now; the valley can name the starters plus what scouts found. */
  readonly forms: 'all' | readonly string[];
  /** The talent slots open on their best creature (slot 2 at level 20, slot 3 at 25: `RULES.talents.slotLevels`). */
  readonly talentSlots: number;
  /** Whether the talents are picked (a Talent Book) or random rolls. */
  readonly talentsPicked: boolean;
  /** The gear level worn. Carried, unused: the lab has no gear yet. */
  readonly gear: number;
}

export interface RosterProfile {
  readonly daily: readonly RosterWeek[];
  readonly weekly: readonly RosterWeek[];
  /** A new player's roster by weeks since joining (index 0: the week they join); never above the daily player's of that week. */
  readonly newPlayer: readonly RosterWeek[];
}

/** The speeds of the roster: slow (levels 20% behind), expected, fast (20% ahead). A factor on every level, one profile for all. */
export type RosterSpeed = 'slow' | 'expected' | 'fast';
export const ROSTER_SPEEDS: readonly RosterSpeed[] = ['slow', 'expected', 'fast'];
export const SPEED_FACTOR: Readonly<Record<RosterSpeed, number>> = {
  slow: 0.8,
  expected: 1,
  fast: 1.2,
};

/** Talent slots open at a level (`RULES.talents.slotLevels`: 1, 20, 25). */
export const talentSlotsAt = (level: number): number =>
  RULES.talents.slotLevels.filter((l) => level >= l).length;

// ---------- the placeholder: a smooth curve through the valley docs' examples ----------

/**
 * A monotone cubic curve (Fritsch-Carlson) through the points `[t, value]`: smooth, never overshoots a point, flat past the
 * last. `t` is the weeks a player has played (0 is the start), and may be a fraction.
 */
export function curveOf(points: readonly (readonly [number, number])[]): (t: number) => number {
  const n = points.length;
  const x = points.map((p) => p[0]);
  const y = points.map((p) => p[1]);
  const delta = Array.from(
    { length: n - 1 },
    (_, i) => ((y[i + 1] ?? 0) - (y[i] ?? 0)) / ((x[i + 1] ?? 0) - (x[i] ?? 0)),
  );
  const m = Array.from({ length: n }, (_, i) => {
    if (i === 0) return delta[0] ?? 0;
    if (i === n - 1) return delta[n - 2] ?? 0;
    const a = delta[i - 1] ?? 0;
    const b = delta[i] ?? 0;
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  return (t) => {
    if (t <= (x[0] ?? 0)) return y[0] ?? 0;
    if (t >= (x[n - 1] ?? 0)) return y[n - 1] ?? 0;
    let i = 0;
    while (t > (x[i + 1] ?? 0)) i++;
    const h = (x[i + 1] ?? 0) - (x[i] ?? 0);
    const s = (t - (x[i] ?? 0)) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * (y[i] ?? 0) +
      (s3 - 2 * s2 + s) * h * (m[i] ?? 0) +
      (-2 * s3 + 3 * s2) * (y[i + 1] ?? 0) +
      (s3 - s2) * h * (m[i + 1] ?? 0)
    );
  };
}

/**
 * The daily player's curves, by weeks played. Anchors are the valley docs' worked examples (examples, not decisions: the valley's
 * economy lab replaces them): the best three at about level 19 at week 4, 25 at week 8 and 29 at week 12 (cap 30, still growing
 * at week 12); the 10th creature at about 15 to 17 at week 4 (16 here); 15 creatures by week 4. A new player's first catch is
 * level 1 at week 0 and the first weeks climb fastest. Between and beyond the examples the curve is the smoothest one that never
 * falls and slows steadily: 1.5 levels a week from week 4 to 8, 1 a week to week 12, then a slow approach to 30 by week 18 to 24.
 * The best creature runs about one level ahead of the 3rd. The 20th is a guess in the same shape (the examples give none).
 */
const FIRST = curveOf([
  [0, 1],
  [1, 9],
  [4, 20],
  [8, 26],
  [12, 29.5],
  [16, 30],
  [24, 30],
]);
const THIRD = curveOf([
  [0, 1],
  [1, 8],
  [4, 19],
  [8, 25],
  [12, 29],
  [18, 30],
  [24, 30],
]);
const TENTH = curveOf([
  [0, 1],
  [1, 5],
  [4, 16],
  [8, 22],
  [12, 26],
  [18, 29],
  [24, 30],
]);
const TWENTIETH = curveOf([
  [0, 1],
  [1, 3],
  [4, 10],
  [8, 17],
  [12, 22],
  [18, 27],
  [24, 30],
]);
const SIZE = curveOf([
  [0, 3],
  [1, 6],
  [2, 9],
  [4, 15],
  [8, 21],
  [12, 26],
  [24, 36],
]);

/** A weekly player gets this share of a daily player's idle growth (the valley's target T-2 says 75% to 80%): its week t is the daily player's week 0.775 t. */
export const WEEKLY_GROWTH = 0.775;
/** A new player catches up this many weeks of a daily player's growth for each week since joining (a new catch reaches the 3rd best's level in about a week, so the roster follows quickly). */
export const NEW_CATCH_UP = 2;

const tenth = (v: number): number => Math.round(v * 10) / 10;

/** The daily player's week at (fractional) weeks played `t`, labelled `week`. */
function dailyAt(t: number, week: number): RosterWeek {
  const first = tenth(Math.min(LEVEL_CAP, FIRST(t)));
  return {
    week,
    first,
    third: tenth(Math.min(LEVEL_CAP, THIRD(t))),
    tenth: tenth(Math.min(LEVEL_CAP, TENTH(t))),
    twentieth: tenth(Math.min(LEVEL_CAP, TWENTIETH(t))),
    size: Math.round(SIZE(t)),
    forms: 'all',
    talentSlots: talentSlotsAt(first),
    talentsPicked: false,
    gear: 0,
  };
}

const weeks = (f: (week: number) => RosterWeek): RosterWeek[] =>
  Array.from({ length: ROSTER_WEEKS }, (_, i) => f(i + 1));

/** The placeholder profile, built from the curves above (a table of plain data like any profile). */
export const PLACEHOLDER_ROSTER: RosterProfile = {
  daily: weeks((w) => dailyAt(w, w)),
  weekly: weeks((w) => dailyAt(WEEKLY_GROWTH * w, w)),
  newPlayer: weeks((age) => dailyAt(Math.min(ROSTER_WEEKS, NEW_CATCH_UP * age), age)),
};

// ---------- reading a profile ----------

const clampWeek = (week: number): number => Math.min(ROSTER_WEEKS, Math.max(1, Math.round(week)));

/** What a player has at a calendar `week` (clamped to 1..24). A new player needs `joinWeek` and has nothing before it (an error). */
export function rosterWeek(
  profile: RosterProfile,
  kind: RosterKind,
  week: number,
  joinWeek?: number,
): RosterWeek {
  const w = clampWeek(week);
  if (kind === 'daily') return profile.daily[w - 1] as RosterWeek;
  if (kind === 'weekly') return profile.weekly[w - 1] as RosterWeek;
  if (joinWeek === undefined) throw new Error('a new player needs a join week');
  if (w < joinWeek)
    throw new Error(`a new player who joins in week ${joinWeek} has no roster in week ${w}`);
  const mine = profile.newPlayer[clampWeek(w - joinWeek + 1) - 1] as RosterWeek;
  const daily = profile.daily[w - 1] as RosterWeek;
  // Never ahead of a daily player of the same week.
  return {
    ...mine,
    week: w,
    first: Math.min(mine.first, daily.first),
    third: Math.min(mine.third, daily.third),
    tenth: Math.min(mine.tenth, daily.tenth),
    twentieth: Math.min(mine.twentieth, daily.twentieth),
    size: Math.min(mine.size, daily.size),
  };
}

/** The level of the `i`-th best creature (1-based): straight lines between the 1st, 3rd, 10th and 20th, flat beyond the 20th. */
export function levelOfCreature(r: RosterWeek, i: number): number {
  const at: readonly (readonly [number, number])[] = [
    [1, r.first],
    [3, r.third],
    [10, r.tenth],
    [20, r.twentieth],
  ];
  if (i <= 1) return r.first;
  for (let k = 1; k < at.length; k++) {
    const [i0, l0] = at[k - 1] as readonly [number, number];
    const [i1, l1] = at[k] as readonly [number, number];
    if (i <= i1) return l0 + ((l1 - l0) * (i - i0)) / (i1 - i0);
  }
  return r.twentieth;
}

/**
 * The levels of a player's `count` best creatures at a week, best first, whole numbers between 1 and the cap (fewer if they own
 * fewer). The speed moves every level: slow 20% lower, fast 20% higher (still capped at 30).
 */
export function rosterLevels(
  profile: RosterProfile,
  kind: RosterKind,
  week: number,
  speed: RosterSpeed,
  count: number = 4,
  joinWeek?: number,
): number[] {
  const r = rosterWeek(profile, kind, week, joinWeek);
  return Array.from({ length: Math.min(count, r.size) }, (_, k) =>
    Math.max(1, Math.min(LEVEL_CAP, Math.round(levelOfCreature(r, k + 1) * SPEED_FACTOR[speed]))),
  );
}

/**
 * A player's column of a raid line at a week: the same forms, Knacks and talents, each creature at the level of the player's
 * creature of that row (the best at the front row), capped by the form's own cap, with the talents the level has slots for.
 */
export function levelledColumn(column: readonly Pick[], levels: readonly number[]): Pick[] {
  return column.map((p, row) => {
    const level = Math.max(
      1,
      Math.min(
        Math.round(levels[row] ?? levels[levels.length - 1] ?? 1),
        formStats(p.formId, LEVEL_CAP).levelCap,
      ),
    );
    const { talents, ...rest } = p;
    const kept = (talents ?? []).slice(0, talentSlotsAt(level));
    return { ...rest, level, ...(kept.length ? { talents: kept } : {}) };
  });
}
