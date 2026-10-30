/**
 * The raid targets as data, in one place: the numbers the tests, the lab report and the boss tuner (`tuner.ts`) all read.
 *
 * Two kinds. The thresholds the tests and the report already used (`TOOL_*`, `ROBUST_*`, `GATE_*`, `MARGIN_TARGET`) moved here
 * from `answerMeasure.ts` and `raidMeasure.ts` without a change of value (those modules re-export them). `RAID_TARGETS` is new:
 * for each Boss Rank, what a boss's numbers (HP, Attack, armour) should achieve, as bounds on measures the report already takes.
 * The tuner searches the numbers for the best fit and says which targets cannot be met together.
 *
 * The values of `RAID_TARGETS` are Misa's, 2026-10-30 (a failed boss returns next week; a raid measures the HP removed;
 * `docs/design/decisions/raids.md`). Changing one is a one-line edit here; no test pins what the tuner proposes, only these
 * numbers (`test/tuner.test.ts`).
 */

/** An answer's own tool must be worth at least this many win-rate points (panel 5, finding 3). */
export const TOOL_DROP_MIN = 20;
/**
 * An answer's own tool must also be worth at least this many points of the boss's HP removed (Misa, 2026-10-29: the share of HP
 * removed is the primary measure; the kill rate is the cliff). Tested at the high rank, with the line's written talents.
 */
export const TOOL_SHARE_MIN = 0.1;
/**
 * A Knack family is a gate on a boss when taking it out of an answer costs more than this many points of kill rate (the cliff:
 * "required"). The same removal is also shown as points of the boss's HP removed, the primary measure (Misa, 2026-10-29).
 */
export const GATE_DROP = 50;
/** The gate check fails for a family that is a gate on this many bosses or more. */
export const GATE_BOSSES = 3;
/** And remove at least this share of the boss's HP (the primary measure) with random legal talents. */
export const ROBUST_SHARE = 0.8;
/**
 * The old kill-rate target of the prepared line with random legal talents (panel 5, finding 4). The report still shows it; the
 * tuner no longer targets it (Misa, 2026-10-30: the kill is measured as `prepared.beat2` on the written talents instead).
 */
export const ROBUST_TARGET = 0.6;
/** A prepared team usually beats the boss within two weekends (Misa, 2026-10-30): the chance of a kill in at most two is this. */
export const BEAT2_MIN = 0.75;
/** A mixed server's and the classic party's weeks to a kill show as "20+" beyond this. */
export const WEEKS_CAP = 20;
/** The boss's win rate target at +10% Attack and at +10% HP (a well-prepared team should usually win, but not by a mile). */
export const MARGIN_TARGET = 0.6;

/** The Boss Ranks the lab sets up (`RAID_RANKS` in `bosses.ts`), lowest first. */
export type TargetRank = 'low' | 'mid' | 'high';
export const TARGET_RANKS: readonly TargetRank[] = ['low', 'mid', 'high'];

/**
 * What the tuner measures for one boss at one rank (all shares and rates are 0 to 1):
 * - `prepared.share`, `prepared.kill`: the prepared line (the boss's first written answer) with random legal talents: the mean
 *   share of the boss's HP removed and the share of weekends that kill (`robustnessOf`, `.random`). The kill rate is information.
 * - `prepared.written`: the kill rate of the same line with its written talents (a server facing a returning boss can re-pick
 *   talents from its Talent Book); `prepared.beat2` is the chance to kill in at most two weekends from it (`beatWithin`).
 * - `tool.share`: what the tool is worth with random legal talents: that share minus the same line's with its tool taken off
 *   (`withoutTool`). `tool.written`: the same gap with the line's written talents, as `test/bossAnswers.test.ts` measures it
 *   (`toolCost`'s `shareDrop`). Both must reach `TOOL_SHARE_MIN`, so the tuner cannot propose numbers that test rejects.
 * - `classic.*`: the classic party (`classicFor`) on the usual four columns.
 * - `mixed.*`: the mixed server of ten (2 min-maxers, 3 builders, 5 casual players on their top creatures with no Knack, as
 *   `mixedSpread` measures it).
 */
export const RAID_MEASURES = [
  'prepared.share',
  'prepared.kill',
  'prepared.written',
  'prepared.beat2',
  'tool.share',
  'tool.written',
  'classic.share',
  'classic.kill',
  'mixed.share',
  'mixed.kill',
] as const;
export type RaidMeasure = (typeof RAID_MEASURES)[number];
export type RaidMeasures = Readonly<Record<RaidMeasure, number>>;

/** A bound on one measure (`min` and/or `max`, inclusive), how much a miss costs the tuner, and where it comes from. */
export interface RaidTarget {
  readonly measure: RaidMeasure;
  readonly min?: number;
  readonly max?: number;
  /** The loss of a miss is this times the distance from the bound (in the measure's own unit: a share of 1). */
  readonly weight: number;
  readonly why: string;
}

const preparedTargets = (): RaidTarget[] => [
  {
    measure: 'prepared.share',
    min: ROBUST_SHARE,
    weight: 2,
    why: 'A prepared team removes most of the HP even with random legal talents (robustness, 2026-10-29)',
  },
  {
    measure: 'prepared.beat2',
    min: BEAT2_MIN,
    weight: 2,
    why: 'A prepared team usually wins within two weekends: a kill in about half of its weekends or more (Misa, 2026-10-30)',
  },
  {
    measure: 'tool.share',
    min: TOOL_SHARE_MIN,
    weight: 1,
    why: 'The boss’s tool is worth at least ten points of its HP removed with random legal talents (rule cards ask before they require)',
  },
  {
    measure: 'tool.written',
    min: TOOL_SHARE_MIN,
    weight: 1,
    why: 'and with the written talents too (the answer test’s own measure)',
  },
];

// The unprepared classic party may get anything but a clean kill, so its HP removed has no limit; the mixed server has no target
// (its numbers are information, `RAID_MEASURES`).
const unpreparedTargets = (): RaidTarget[] => [
  {
    measure: 'classic.kill',
    max: 0.05,
    weight: 1,
    why: 'The unprepared classic party kills at most about 5% of weekends (Misa, 2026-10-30)',
  },
];

/** Misa's targets, 2026-10-30: the same bounds at every rank (the ranks differ in the boss's numbers, not in what is asked of them). */
export const RAID_TARGETS: Readonly<Record<TargetRank, readonly RaidTarget[]>> = {
  low: [...preparedTargets(), ...unpreparedTargets()],
  mid: [...preparedTargets(), ...unpreparedTargets()],
  high: [...preparedTargets(), ...unpreparedTargets()],
};

/** The chance to kill in at most `weekends` weekends when each has the kill rate `p`, attempts assumed alike: `1 - (1 - p)^weekends`. */
export const beatWithin = (p: number, weekends: number): number => 1 - (1 - p) ** weekends;

/**
 * The expected number of weekends to the first kill, `1 / p` (a fixed track: a failed boss returns at full HP, attempts assumed
 * alike). Infinity when `p` is 0.
 */
export const weeksToBeat = (p: number): number => (p > 0 ? 1 / p : Number.POSITIVE_INFINITY);

/** Weeks to beat as text: "never" when `p` is 0, "20+" beyond `WEEKS_CAP`, else one decimal ("2.0"). */
export function weeksText(p: number): string {
  const w = weeksToBeat(p);
  if (w === Number.POSITIVE_INFINITY) return 'never';
  if (w > WEEKS_CAP) return `${WEEKS_CAP}+`;
  return w.toFixed(1);
}

/**
 * The ladder (a hard constraint, `test/strength.test.ts`): HP, Attack and armour rise from the low rank to the mid and the high
 * rank. HP and Attack of the low rank are at most 0.9 of the high rank's and of the mid rank's at most 0.95; armour does not fall.
 */
export const LADDER = { lowOfHigh: 0.9, midOfHigh: 0.95 } as const;

/** How far outside its bounds a value is (0 inside them, edges included). */
export function missOf(t: RaidTarget, value: number): number {
  if (t.min !== undefined && value < t.min) return t.min - value;
  if (t.max !== undefined && value > t.max) return value - t.max;
  return 0;
}

/** Whether the value meets the target. */
export const metBy = (t: RaidTarget, value: number): boolean => missOf(t, value) === 0;

/** How far inside its bounds a value is (negative: outside), the smaller of the two sides for a target with both bounds. */
export function marginInside(t: RaidTarget, value: number): number {
  const sides: number[] = [];
  if (t.min !== undefined) sides.push(value - t.min);
  if (t.max !== undefined) sides.push(t.max - value);
  return sides.length ? Math.min(...sides) : 0;
}

/** The tuner's loss: the weighted distance to the bounds, summed over the targets. It is 0 exactly when every target is met. */
export function lossOf(targets: readonly RaidTarget[], m: RaidMeasures): number {
  return targets.reduce((n, t) => n + t.weight * missOf(t, m[t.measure]), 0);
}

/**
 * How comfortably the targets are met, to tell apart candidates of the same loss (most of all, several with loss 0): the mean of
 * each target's margin inside its bounds, a margin counted at most 0.2 so that one very easy target does not decide.
 */
export function comfortOf(targets: readonly RaidTarget[], m: RaidMeasures): number {
  if (!targets.length) return 0;
  return (
    targets.reduce((n, t) => n + Math.min(0.2, marginInside(t, m[t.measure])), 0) / targets.length
  );
}
