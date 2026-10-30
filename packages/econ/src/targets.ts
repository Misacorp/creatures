/**
 * The lab's targets as data, in one place: the numbers the report (`analysis.ts`), the quick run and the tuner (`tuner.ts`) all
 * read. Every threshold of `docs/design/valley/goals.md` (T-1 to T-6) and of `resources.md` (a "dead" and a "starved" resource) is
 * here and nowhere else. Changing one is a one-line edit; no test pins what the tuner proposes, only these numbers.
 *
 * A target is a bound (`lo`, `hi` or both) on a named measure (`measuresOf` in `analysis.ts` takes the measures from the runs).
 * Several targets can share a report line (`line`: T-2d has two). `needs` names the scenarios a measure is taken from, so a quick
 * run knows what it can judge and the tuner what it must run.
 */

/** The measures the targets are bounds on (each is a median over seeds and players). */
export const MEASURES = [
  'spread4',
  'spread8',
  'bench4',
  'bench8',
  'activeXpRatio',
  'activeOutputRatio',
  'weekendShare',
  'weeklyXpShare',
  'keptLevels',
  'returnDays',
  'firstLevelDay',
  'collections12',
  'levelUps12',
  'fire12All',
  'fire23All',
  'deadBefore12',
  'kinds4',
  'kinds12',
  'commons6',
  'rares24',
  'epics24',
  'waitingEvolve12',
  'scrapStall',
  'best10',
  'best12',
] as const;
export type MeasureName = (typeof MEASURES)[number];

/** Measures that could not be taken (a scenario that was not run, a horizon too short) are missing, not zero. */
export type Measures = Partial<Record<MeasureName, number>>;

export interface Target {
  readonly id: string;
  /** The report line it belongs to (T-1 ... T-6). */
  readonly line: string;
  readonly measure: MeasureName;
  /** The measure must be at least `lo` and at most `hi` (either may be missing). */
  readonly lo?: number;
  readonly hi?: number;
  /** What a miss is divided by to compare targets with each other (about the size of the number's own range). */
  readonly scale: number;
  /** The scenarios (ids in `servers.ts`) the measure comes from. */
  readonly needs: readonly string[];
  /** In words, for the quick run and the tuner. */
  readonly label: string;
}

/** The creature level cap, for the "still growing" targets (best creature below it). */
const STILL_GROWING = 29.99;
/** What the censored "days to the middle" shows when a returner never gets there in the run. */
export const NEVER_DAYS = 200;

export const TARGETS: readonly Target[] = [
  {
    id: 'T-1a',
    line: 'T-1',
    measure: 'bench4',
    hi: 5,
    scale: 5,
    needs: ['mixed8'],
    label:
      'a new catch becomes useful within days: at week 4 every creature owned a week or more is within 5 levels of the 3rd best',
  },
  {
    id: 'T-1c',
    line: 'T-1',
    measure: 'bench8',
    hi: 5,
    scale: 5,
    needs: ['mixed8'],
    label: 'the same at week 8 (creatures owned a week or more within 5 levels of the 3rd best)',
  },
  {
    id: 'T-1b',
    line: 'T-1',
    measure: 'spread8',
    hi: 5,
    scale: 5,
    needs: ['mixed8'],
    label: 'two strong teams at week 8 (the 6th within 5 levels of the 3rd)',
  },
  {
    id: 'T-2a1',
    line: 'T-2a',
    measure: 'activeXpRatio',
    hi: 1.1,
    scale: 0.1,
    needs: ['mixed8-opt'],
    label: "an active player gets under 110% of a daily player's XP",
  },
  {
    id: 'T-2a2',
    line: 'T-2a',
    measure: 'activeOutputRatio',
    hi: 1.1,
    scale: 0.1,
    needs: ['mixed8-opt'],
    label: "an active player gets under 110% of a daily player's output",
  },
  {
    id: 'T-2b',
    line: 'T-2b',
    measure: 'weekendShare',
    lo: 0.95,
    scale: 0.1,
    needs: ['mixed8'],
    label: "a weekend off costs almost nothing (at least 95% of a daily player's idle growth)",
  },
  {
    id: 'T-2c',
    line: 'T-2c',
    measure: 'weeklyXpShare',
    lo: 0.7,
    hi: 0.85,
    scale: 0.1,
    needs: ['mixed8'],
    label:
      "a weekly player's XP per creature, catch-up included, is 70% to 85% of a daily player's",
  },
  {
    id: 'T-2d1',
    line: 'T-2d',
    measure: 'keptLevels',
    lo: 0,
    scale: 3,
    needs: ['mixed8'],
    label: 'a returner keeps every level',
  },
  {
    id: 'T-2d2',
    line: 'T-2d',
    measure: 'returnDays',
    hi: 14,
    scale: 14,
    needs: ['mixed8'],
    label: "a returner's 3rd-best creature is within 2 levels of the server's middle in 14 days",
  },
  {
    id: 'T-3a',
    line: 'T-3',
    measure: 'firstLevelDay',
    hi: 14,
    scale: 14,
    needs: ['mixed8'],
    label: 'a server of 8 lifts a place a level within 14 days',
  },
  {
    id: 'T-3b',
    line: 'T-3',
    measure: 'collections12',
    lo: 1,
    scale: 2,
    needs: ['mixed8'],
    label: 'at least one collection done by week 12',
  },
  {
    id: 'T-3c',
    line: 'T-3p',
    measure: 'levelUps12',
    lo: 5,
    hi: 6,
    scale: 3,
    needs: ['mixed8'],
    label: 'about 5 to 6 place level-ups across the valley by week 12 (commons.md)',
  },
  {
    id: 'T-3d',
    line: 'T-3p',
    measure: 'fire12All',
    lo: 45,
    hi: 55,
    scale: 25,
    needs: ['mixed8-all'],
    label: 'the fire is about 50 at week 12 for a server that kills its bosses (commons.md)',
  },
  {
    id: 'T-3e',
    line: 'T-3p',
    measure: 'fire23All',
    hi: 100,
    scale: 25,
    needs: ['mixed8-all'],
    label: "the fire never passes the gear ladder's top (about 100) before week 24",
  },
  {
    id: 'T-4',
    line: 'T-4',
    measure: 'scrapStall',
    hi: 0.1,
    scale: 0.1,
    needs: ['mixed8'],
    label:
      "a typical player's anvils tinker for want of scrap at most 10% of the time, in any week",
  },
  {
    id: 'T-6a',
    line: 'T-6',
    measure: 'best10',
    hi: STILL_GROWING,
    scale: 3,
    needs: ['mixed8'],
    label: "a daily player's best creature is not capped at week 10",
  },
  {
    id: 'T-6b',
    line: 'T-6',
    measure: 'best12',
    hi: STILL_GROWING,
    scale: 3,
    needs: ['mixed8'],
    label: "a daily player's best creature is still growing at week 12",
  },
  {
    id: 'T-7',
    line: 'T-7',
    measure: 'deadBefore12',
    hi: 0,
    scale: 2,
    needs: ['mixed8'],
    label:
      'no resource of a daily player is dead before week 12 (resources.md: a pile growing 4 weeks to 4 weeks of income)',
  },
  {
    id: 'T-8a',
    line: 'T-8',
    measure: 'kinds4',
    lo: 9,
    hi: 12,
    scale: 3,
    needs: ['mixed8'],
    label: 'a daily player owns about 9 to 12 lines at week 4, mostly commons (Q38)',
  },
  {
    id: 'T-8b',
    line: 'T-8',
    measure: 'kinds12',
    lo: 20,
    hi: 28,
    scale: 8,
    needs: ['mixed8'],
    label: 'a daily player owns roughly 20 to 28 lines at week 12',
  },
  {
    id: 'T-8c',
    line: 'T-8',
    measure: 'commons6',
    lo: 0.7,
    scale: 0.3,
    needs: ['mixed8'],
    label: "most of the starting pool's commons (at least 70%) are owned by week 6",
  },
  {
    id: 'T-8d',
    line: 'T-8',
    measure: 'rares24',
    lo: 0.15,
    hi: 0.6,
    scale: 0.3,
    needs: ['mixed8'],
    label: 'rares come over months: 15% to 60% of the rares released are owned at week 24',
  },
  {
    id: 'T-8e',
    line: 'T-8',
    measure: 'epics24',
    hi: 0.35,
    scale: 0.3,
    needs: ['mixed8'],
    label: 'epics come rarely: at most 35% of the epics released are owned at week 24',
  },
  {
    id: 'T-9',
    line: 'T-9',
    measure: 'waitingEvolve12',
    hi: 3,
    scale: 6,
    needs: ['mixed8'],
    label:
      'at most 3 creatures of a daily player wait at their evolution level for Essence at week 12 (no starving the evolutions to empty the pile)',
  },
];

/** Thresholds that are not bounds on a measure: the report's flags (resources.md) and a window. */
export const THRESHOLDS = {
  /** A resource is "dead" when its stock rises for `deadWeeks` weeks running and the pile is `deadPileWeeks` weeks of that week's income. */
  deadWeeks: 4,
  deadPileWeeks: 4,
  /** A resource is "starved" when it sits at zero on more than this share of days. */
  starvedZeroShare: 0.25,
  /** "Within 2 levels of the server's middle" (V-BON-2). */
  agreeWithin: 2,
  /** The shard stall shown beside T-4 is compared with the same share as scrap's. */
  tinkerSmallShare: 0.1,
} as const;

/** Whether a value meets a target. */
export function metBy(t: Target, value: number): boolean {
  return (t.lo === undefined || value >= t.lo) && (t.hi === undefined || value <= t.hi);
}

/** How far a value is from meeting a target, in units of the target's `scale` (0 when it is met). */
export function missOf(t: Target, value: number): number {
  const below = t.lo === undefined ? 0 : Math.max(0, t.lo - value);
  const above = t.hi === undefined ? 0 : Math.max(0, value - t.hi);
  return (below + above) / t.scale;
}

/** A target with the value measured for it; `value` is undefined (and `met` null) when the measure could not be taken. */
export interface Judged {
  readonly target: Target;
  readonly value: number | undefined;
  readonly met: boolean | null;
  readonly miss: number;
}

export function judge(targets: readonly Target[], measures: Measures): Judged[] {
  return targets.map((target) => {
    const value = measures[target.measure];
    if (value === undefined || !Number.isFinite(value))
      return { target, value: undefined, met: null, miss: 0 };
    return { target, value, met: metBy(target, value), miss: missOf(target, value) };
  });
}

/** The target as text: "at most 5", "at least 0.7 and at most 0.85". */
export function boundsText(t: Target): string {
  if (t.lo !== undefined && t.hi !== undefined) return `${t.lo} to ${t.hi}`;
  if (t.lo !== undefined) return `at least ${t.lo}`;
  return `at most ${t.hi}`;
}

/** The scenarios the given targets are measured on. */
export const scenariosFor = (targets: readonly Target[]): string[] => [
  ...new Set(targets.flatMap((t) => t.needs)),
];
