import { HOURS_PER_WEEK, type Player } from './types';

/**
 * Dungeon XP that grows with depth (a lab variant, off by default). Combat v2 reports that a dungeon run's creature XP will grow with
 * depth; the lab's flat `rules.fights.dungeon.xp` (120 a run) does not. `docs/design/valley/economy/dungeon-depth-xp.md` is the study.
 *
 * The numbers are what a top creature (in every room, a daily player, before treats and weather) gets from the dungeon in a day, by
 * the weeks of the player's own life; a run pays that for a daily player (one run a day), and a player who runs fewer runs (the lab's
 * passes: one a day, three stored) gets it per run and so scales by habit as the flat 120 did. Between the given weeks it is
 * interpolated linearly; before the first and after the last it is held.
 */
export type CurvePoints = readonly (readonly [week: number, xp: number])[];

/** Combat v2's report with the depth bonus (`RULES.dungeon.depthRewards.xp`: +1% a depth, +100% at most). */
export const DEPTH_XP_CURVE: CurvePoints = [
  [1, 157],
  [4, 373],
  [8, 449],
  [12, 503],
  [24, 594],
];

/** The same runs with no per-depth bonus (just deeper runs). */
export const V1_XP_CURVE: CurvePoints = [
  [1, 154],
  [4, 313],
  [8, 309],
  [12, 293],
  [24, 297],
];

/**
 * A lever study: the v1 column times a per-depth bonus. The depth is what the two columns imply under the default lever (the
 * ratio of the columns, at 100 basis points a depth), with an assumed 6.5 a week for the week 24 point, where the default cap binds.
 */
export interface DepthLevers {
  perDepthBp: number;
  maxBp: number;
}

/** What `DEPTH_XP_CURVE / V1_XP_CURVE` implies as depth at each of the given weeks (at 100 bp a depth). */
export const IMPLIED_DEPTH: CurvePoints = [
  [1, 2],
  [4, 19],
  [8, 45],
  [12, 72],
  [24, 156],
];

/** `'depth'` and `'v1'` are the two curves; an object is the lever study; absent is the lab's flat `rules.fights.dungeon.xp`. */
export type DungeonXp = 'depth' | 'v1' | DepthLevers;

export function interpolate(points: CurvePoints, week: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) throw new Error('an empty curve');
  if (week <= first[0]) return first[1];
  if (week >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (week <= b[0]) return a[1] + ((b[1] - a[1]) * (week - a[0])) / (b[0] - a[0]);
  }
  return last[1];
}

/** The XP of one dungeon run in the player's `week` (1 = the first week since they joined). */
export function dungeonRunXp(mode: DungeonXp, week: number): number {
  if (mode === 'depth') return interpolate(DEPTH_XP_CURVE, week);
  if (mode === 'v1') return interpolate(V1_XP_CURVE, week);
  const bp = Math.min(mode.maxBp, mode.perDepthBp * interpolate(IMPLIED_DEPTH, week));
  return interpolate(V1_XP_CURVE, week) * (1 + bp / 10000);
}

/** The player's week of life at this hour (the first week since joining is 1). */
export const playerWeek = (p: Player, hour: number): number =>
  Math.max(1, Math.floor((hour - p.joinHour) / HOURS_PER_WEEK) + 1);

/** The XP a run pays now: the variant's curve when the server has one, else the rules' flat amount. */
export const runXp = (
  mode: DungeonXp | undefined,
  p: Player,
  hour: number,
  flat: number,
): number => (mode === undefined ? flat : dungeonRunXp(mode, playerWeek(p, hour)));
