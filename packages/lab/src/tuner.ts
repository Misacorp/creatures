/**
 * The boss tuner: instead of "change the numbers, run the report, read, repeat", give it the targets (`targets.ts`) and it
 * searches a raid boss's HP, Attack and armour for the best fit, and says which targets cannot be met together. It PROPOSES
 * numbers; it never edits `bosses.ts`.
 *
 * Three layers, so that each can be tested alone:
 * 1. A search over integer points (`searchPoints`): a coarse grid, then local refinement around the best few, then a re-score of
 *    the finalists on more weekends. It knows nothing of bosses: an evaluator turns a batch of points into losses.
 * 2. Conflict analysis (`findConflicts`): over the candidates the search measured, which pairs of targets can each be met
 *    somewhere but never together.
 * 3. The raid boss (`tuneRank`, `tuneBoss`): a candidate is measured with the report's own functions (`robustnessOf`'s random talents,
 *    `withoutTool`, `classicFor`, `mixedSpread`), one job per candidate on the worker pool (`jobs.ts`); a batch is awaited, the
 *    next one is chosen from it.
 *
 * Every candidate of a batch is measured on the same seeds (the same salts), so differences between candidates are the numbers'
 * effect, not noise. The first passes use few weekends; the finalists and today's numbers are measured again on the report's own
 * number of weekends. When several candidates meet every target, the one with the most room inside its bounds wins (`comfortOf`).
 */
import { createSeededRng } from '@creatures/game';
import { BOSS_ANSWERS, answerLine, withoutTool } from './bossAnswers';
import {
  RAID_RANKS,
  RAID_SPECS,
  raidBossOf,
  raidMode,
  weekendPotential,
  weekendStats,
  type RaidBossSpec,
} from './bosses';
import { runJobs, type Executor, type JobSpec } from './jobs';
import { mixedSpread } from './raidMeasure';
import { randomTalents } from './answerMeasure';
import { randomTalentMeasure, ruleMeasures } from './raidRules';
import { classicFor, type Pick } from './search';
import {
  BOSS_ARMOUR_MIN,
  LADDER,
  INFO_MEASURES,
  REPORTED_MEASURES,
  RAID_MEASURES,
  TARGET_RANKS,
  beatWithin,
  comfortOf,
  isCrossMeasure,
  isMeasured,
  isShareMeasure,
  lossOf,
  metBy,
  missOf,
  skippedCross,
  targetsFor,
  weeksText,
  type RaidMeasure,
  type RaidMeasures,
  type RaidTarget,
  type TargetRank,
} from './targets';
import { illegalTalents } from './talents';
import type { BossDef } from './types';

export { randomTalentMeasure };

// ---------- 1. the search ----------

/** A point of the search space: one integer per axis. */
export type Point = readonly number[];

/** One searched number: its range (both ends inclusive) and its smallest step (every point is a multiple of it). */
export interface Axis {
  readonly name: string;
  readonly lo: number;
  readonly hi: number;
  readonly quantum: number;
}

/** What an evaluator says about one point: the loss (0 is best), how comfortably it fits (tie-break), and the data behind them. */
export interface Scored<D = unknown> {
  readonly loss: number;
  readonly comfort: number;
  readonly data: D;
}

/** How many weekends a measurement runs: the cheap passes, a second look at the best of them, and the report's own number. */
export type Level = 'search' | 'check' | 'final';

export interface Found<D = unknown> extends Scored<D> {
  readonly point: Point;
  readonly level: Level;
}

/** Measures a batch of points (the same seeds for all), cheap or in full; the results come in the order of the points. */
export type BatchEvaluator<D> = (points: readonly Point[], level: Level) => Promise<Scored<D>[]>;

export interface SearchPlan {
  /** Values per axis of the coarse grid (the grid has this many to the power of the number of axes). */
  readonly gridPoints: number;
  /** Refinement rounds, each around the best `keep` points so far, with half the step of the round before. */
  readonly rounds: number;
  readonly keep: number;
  /** How many of the best points of the cheap passes get a second look on more weekends (the cheap passes are noisy). */
  readonly checks: number;
  /** How many of the best of those are measured again in full. */
  readonly finalists: number;
}

const EPS = 1e-9;

/** How much better than today's numbers a point must be to be proposed: in loss (`missed` when today's numbers miss a target, so a boss that misses can move step by step), or (at a loss within `loss`) in comfort. */
export const MIN_GAIN = { loss: 0.01, comfort: 0.02, missed: 0.002 } as const;

/** Whether `a` fits better than `b`: a smaller loss, or the same loss with more room inside the bounds. */
export function fitsBetter(a: Scored, b: Scored): boolean {
  return a.loss < b.loss - EPS || (Math.abs(a.loss - b.loss) <= EPS && a.comfort > b.comfort + EPS);
}

const key = (p: Point): string => p.join(',');
const snap = (x: number, quantum: number): number => Math.round(x / quantum) * quantum;

/** `n` values from `lo` to `hi`, each a multiple of `quantum`, without repeats. */
function spread(axis: Axis, n: number): number[] {
  const values = Array.from({ length: n }, (_, i) =>
    snap(axis.lo + ((axis.hi - axis.lo) * i) / Math.max(1, n - 1), axis.quantum),
  );
  return [...new Set(values.map((v) => Math.min(axis.hi, Math.max(axis.lo, v))))];
}

const product = (lists: readonly (readonly number[])[]): number[][] =>
  lists.reduce<number[][]>((acc, list) => acc.flatMap((p) => list.map((v) => [...p, v])), [[]]);

export interface SearchResult<D> {
  /** The best of the finalists, by their full measurement. */
  readonly best: Found<D> | undefined;
  /** The start point, measured in full (today's numbers). */
  readonly start: Found<D>;
  /** Every point measured, in its best measurement (full where there is one). */
  readonly all: Found<D>[];
  /** Points measured on the cheap passes and in full. */
  readonly searched: number;
  readonly finals: number;
}

/**
 * Minimises the loss over the points of `axes` that are `feasible`. A coarse grid, `plan.rounds` of local refinement around the
 * best `plan.keep`, then the best `plan.finalists` and the start point measured again in full. A batch is awaited before the
 * next one is chosen. `start` (today's numbers) is always measured and may lie off the grid.
 */
export async function searchPoints<D>(
  axes: readonly Axis[],
  feasible: (p: Point) => boolean,
  start: Point,
  plan: SearchPlan,
  evaluate: BatchEvaluator<D>,
): Promise<SearchResult<D>> {
  const seen = new Map<string, Found<D>>();
  const measure = async (points: Point[], level: Level): Promise<Found<D>[]> => {
    const scored = await evaluate(points, level);
    return points.map((point, i) => ({ ...(scored[i] as Scored<D>), point, level }));
  };
  const first: Point[] = [];
  const queued = new Set<string>();
  const add = (p: Point, into: Point[]) => {
    if (queued.has(key(p)) || seen.has(key(p))) return;
    queued.add(key(p));
    into.push(p);
  };
  const grid = product(axes.map((a) => spread(a, plan.gridPoints))).filter(feasible);
  add(start, first);
  for (const p of grid) add(p, first);
  for (const f of await measure(first, 'search')) seen.set(key(f.point), f);

  const ranked = (): Found<D>[] =>
    [...seen.values()].sort((a, b) => (fitsBetter(a, b) ? -1 : fitsBetter(b, a) ? 1 : 0));
  for (let r = 1; r <= plan.rounds; r++) {
    const steps = axes.map((a) =>
      Math.max(
        a.quantum,
        snap((a.hi - a.lo) / Math.max(1, plan.gridPoints - 1) / 2 ** r, a.quantum),
      ),
    );
    const next: Point[] = [];
    queued.clear();
    for (const center of ranked().slice(0, plan.keep)) {
      const around = product(
        axes.map((a, i) =>
          [-1, 0, 1].map((d) => {
            const v = (center.point[i] as number) + d * (steps[i] as number);
            return Math.min(a.hi, Math.max(a.lo, snap(v, a.quantum)));
          }),
        ),
      );
      for (const p of around) if (feasible(p)) add(p, next);
    }
    if (!next.length) break;
    for (const f of await measure(next, 'search')) seen.set(key(f.point), f);
  }

  // Successive halving: the best points of the cheap passes get a second look on more weekends, the best of those and today's
  // numbers are measured in full, in one batch.
  const checks = ranked()
    .filter((f) => feasible(f.point))
    .slice(0, Math.max(plan.checks, plan.finalists))
    .map((f) => f.point);
  const checked = await measure(checks, 'check');
  for (const f of checked) seen.set(key(f.point), f);
  const finalists = [...checked]
    .sort((a, b) => (fitsBetter(a, b) ? -1 : fitsBetter(b, a) ? 1 : 0))
    .slice(0, plan.finalists)
    .map((f) => f.point);
  const last: Point[] = [];
  queued.clear();
  for (const p of [start, ...finalists]) {
    if (!queued.has(key(p))) {
      queued.add(key(p));
      last.push(p);
    }
  }
  const finals = await measure(last, 'final');
  for (const f of finals) seen.set(key(f.point), f);
  const startFound = finals.find((f) => key(f.point) === key(start)) as Found<D>;
  // Today's numbers compete too (when the ladder allows them), and win unless another point is clearly better: a gain within the
  // noise of a measurement is not a reason to change a boss.
  const allowed = finals
    .filter((f) => feasible(f.point))
    .sort((a, b) => (fitsBetter(a, b) ? -1 : fitsBetter(b, a) ? 1 : 0));
  const top = allowed[0];
  const kept = allowed.find((f) => key(f.point) === key(start));
  const clearer =
    top !== undefined &&
    kept !== undefined &&
    (top.loss < kept.loss - (kept.loss > EPS ? MIN_GAIN.missed : MIN_GAIN.loss) ||
      (Math.abs(top.loss - kept.loss) <= MIN_GAIN.loss &&
        top.comfort > kept.comfort + MIN_GAIN.comfort));
  const best = kept && !clearer ? kept : top;
  return {
    best,
    start: startFound,
    all: [...seen.values()],
    searched: seen.size,
    finals: finals.length,
  };
}

// ---------- 2. conflicts ----------

/** Two targets that can each be met somewhere in the searched space but never at the same point. */
export interface Conflict {
  readonly a: RaidTarget;
  readonly b: RaidTarget;
  /** Candidates that met `a`, met `b`, and met both (0), of all that were measured. */
  readonly metA: number;
  readonly metB: number;
  readonly both: number;
  readonly of: number;
}

export interface Conflicts {
  readonly conflicts: Conflict[];
  /** Targets no candidate met: not a clash with another target, the searched numbers cannot reach it at all. */
  readonly unreachable: RaidTarget[];
  /** Candidates that met every target, of those measured in full (`fullOf`: the final level, every rule at the tests' own weekends). */
  readonly allMet: number;
  /** Candidates measured in full. */
  readonly fullOf: number;
  readonly of: number;
}

/**
 * Which pairs of targets clash in the searched space: each is met by at least one measured candidate, but no candidate meets both.
 * A target no candidate meets is `unreachable` (listed apart). When no pair clashes yet no candidate meets everything, the tension
 * is between three or more targets (`allMet` is 0 and `conflicts` is empty). `full[k]` says candidate k was measured in full (the final
 * level); only those count towards `allMet`, since a cheaper pass shrinks the rules' weekends (default: every candidate counts).
 */
export function findConflicts(
  targets: readonly RaidTarget[],
  measured: readonly RaidMeasures[],
  full?: readonly boolean[],
): Conflicts {
  // A measure a cheap pass did not take (NaN) is neither met nor missed: a pair is judged on the candidates that have both.
  const met = measured.map((m) => targets.map((t) => metBy(t, m[t.measure])));
  const taken = measured.map((m) => targets.map((t) => isMeasured(m[t.measure])));
  const count = (f: (row: boolean[]) => boolean) => met.filter(f).length;
  const unreachable = targets.filter(
    (_, i) => taken.some((row) => row[i] === true) && count((row) => row[i] === true) === 0,
  );
  const conflicts: Conflict[] = [];
  for (let i = 0; i < targets.length; i++)
    for (let j = i + 1; j < targets.length; j++) {
      const rows = met.filter((_, k) => taken[k]?.[i] === true && taken[k]?.[j] === true);
      const metA = rows.filter((row) => row[i] === true).length;
      const metB = rows.filter((row) => row[j] === true).length;
      const both = rows.filter((row) => row[i] === true && row[j] === true).length;
      if (metA > 0 && metB > 0 && both === 0)
        conflicts.push({
          a: targets[i] as RaidTarget,
          b: targets[j] as RaidTarget,
          metA,
          metB,
          both,
          of: rows.length,
        });
    }
  return {
    conflicts,
    unreachable,
    allMet: met.filter((row, k) => (full?.[k] ?? true) && row.every(Boolean)).length,
    fullOf: full ? full.filter(Boolean).length : measured.length,
    of: measured.length,
  };
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** A target in a few words: `prepared.share ≥ 80%`, `mixed.share 60% to 90%`. */
export function describeTarget(t: RaidTarget): string {
  const f = (x: number): string => (isShareMeasure(t.measure) ? pct(x) : String(x));
  if (t.min !== undefined && t.max !== undefined) return `${t.measure} ${f(t.min)} to ${f(t.max)}`;
  if (t.min !== undefined) return `${t.measure} ${t.strictMin ? '>' : '≥'} ${f(t.min)}`;
  return `${t.measure} ≤ ${f(t.max ?? 0)}`;
}

// ---------- 3. the raid boss ----------

/** The numbers the tuner searches, in the units the spec holds: absolute at the high rank, bp of the high rank's at the lower ones. */
export interface Numbers {
  readonly hp: number;
  readonly atk: number;
  readonly armour: number;
}

const NUMBER_NAMES = ['hp', 'atk', 'armour'] as const;
const toPoint = (n: Numbers): Point => NUMBER_NAMES.map((k) => n[k]);
const fromPoint = (p: Point): Numbers => ({
  hp: p[0] as number,
  atk: p[1] as number,
  armour: p[2] as number,
});

function specOf(id: string): RaidBossSpec {
  const spec = RAID_SPECS.find((s) => s.id === id);
  if (!spec) throw new Error(`unknown raid boss ${id}`);
  return spec;
}

const rankOf = (rank: TargetRank) =>
  RAID_RANKS.find((r) => r.id === rank) as (typeof RAID_RANKS)[number];

/** The boss's numbers at a rank as the spec holds them (the high rank's absolute, the lower ranks' bp; armour bp is the card's share when the spec has none). */
export function nativeOf(id: string, rank: TargetRank): Numbers {
  const spec = specOf(id);
  if (rank === 'high') return { hp: spec.hp, atk: spec.atk, armour: spec.armour };
  const [hp, atk, armour] = spec.ranks?.[rank] ?? [
    rankOf(rank).hpBp,
    rankOf(rank).atkBp,
    undefined,
  ];
  return { hp, atk, armour: armour ?? 5_000 + Math.floor(rankOf(rank).strengthBp / 2) };
}

/** The same numbers as the boss has them: HP, Attack and armour of the boss at the rank (`raidBossOf` rounds a bp share the same way). */
export function absoluteOf(id: string, rank: TargetRank, n: Numbers): Numbers {
  if (rank === 'high') return n;
  const spec = specOf(id);
  const share = (x: number, bp: number) => Math.round((x * bp) / 10_000);
  return {
    hp: share(spec.hp, n.hp),
    atk: share(spec.atk, n.atk),
    armour: share(spec.armour, n.armour),
  };
}

/** Today's numbers of every rank, absolute. */
export function todayAbsolute(id: string): Record<TargetRank, Numbers> {
  return Object.fromEntries(
    TARGET_RANKS.map((r) => [r, absoluteOf(id, r, nativeOf(id, r))]),
  ) as Record<TargetRank, Numbers>;
}

/** The inclusive range each number may take at a rank, given the numbers of the other ranks (the ladder, `strength.test.ts`). */
export type Box = Record<keyof Numbers, readonly [lo: number, hi: number]>;

export function ladderBox(
  id: string,
  rank: TargetRank,
  others: Partial<Record<TargetRank, Numbers>>,
): Box {
  const { low, mid, high } = others;
  const hide = Math.round(specOf(id).armour / 2);
  const inf = Number.POSITIVE_INFINITY;
  const box = (k: 'hp' | 'atk'): readonly [number, number] => {
    if (rank === 'high') {
      const lo = Math.max(
        1,
        mid ? Math.max(mid[k] + 1, Math.ceil(mid[k] / LADDER.midOfHigh)) : 1,
        low ? Math.max(low[k] + 1, Math.ceil(low[k] / LADDER.lowOfHigh)) : 1,
      );
      return [lo, inf];
    }
    if (rank === 'mid')
      return [
        Math.max(1, low ? low[k] + 1 : 1),
        high ? Math.min(high[k] - 1, Math.floor(high[k] * LADDER.midOfHigh)) : inf,
      ];
    return [
      1,
      Math.min(mid ? mid[k] - 1 : inf, high ? Math.floor(high[k] * LADDER.lowOfHigh) : inf),
    ];
  };
  const armour: readonly [number, number] =
    rank === 'high'
      ? [Math.max(hide, mid?.armour ?? 0, low?.armour ?? 0), inf]
      : rank === 'mid'
        ? [Math.max(hide, low?.armour ?? 0), high?.armour ?? inf]
        : [hide, Math.min(mid?.armour ?? inf, high?.armour ?? inf)];
  // A floor the content test sets (`BOSS_ARMOUR_MIN`, the high rank): Forge Heat is not freed by skipping reactions.
  const floor = rank === 'high' ? (BOSS_ARMOUR_MIN[id] ?? 0) : 0;
  return { hp: box('hp'), atk: box('atk'), armour: [Math.max(armour[0], floor), armour[1]] };
}

/** How far a search may move each number from today's, as factors of it. */
const RANGE: Record<keyof Numbers, readonly [number, number]> = {
  hp: [0.6, 1.5],
  atk: [0.7, 1.3],
  armour: [0.6, 1.4],
};

/** The smallest step of each number: whole HP in hundreds, Attack and armour whole at the high rank, a bp share in hundredths. */
const quantumOf = (rank: TargetRank): Numbers =>
  rank === 'high' ? { hp: 100, atk: 1, armour: 1 } : { hp: 100, atk: 100, armour: 100 };

/** The fights of one measurement: how many weekends each measure runs. */
export interface Fidelity {
  /** Weekends of the prepared line (split over `draws` draws of random legal talents), and again for the same line without its tool. */
  readonly weekends: number;
  readonly draws: number;
  readonly classicWeekends: number;
  /** Draws of the mixed server (ten players) and weekends of each. */
  readonly mixedDraws: number;
  readonly mixedWeekends: number;
  /**
   * The weekends of the lab tests' rules (`raidRules.ts`) as a share of the tests' own: 1 is exactly what the tests fight, 0 or no
   * value leaves the rules out (their measures are NaN, so no target counts them). A proposal is only ever judged at 1 (`final`).
   */
  readonly rules?: number;
  /** Whether the heavy rules (the high rank's many fights) are taken too, or only the light ones (the rank rules, the casual server, the cross-rank rules). Default: both. */
  readonly heavyRules?: boolean;
  /**
   * Whether the information measures are taken too (`INFO_MEASURES`: the prepared line's potential with random talents, the tool's
   * worth in potential points): more fights, so only the full measurement of a proposal. Default: no (NaN).
   */
  readonly info?: boolean;
}

/**
 * The cheap passes use few weekends, the second look more. The full measurement is the report's own Boss Rank study (`BOSS_SETTINGS`: 60 weekends over
 * 10 talent draws, 30 classic weekends, 40 mixed draws of 2 weekends; quick: 20 over 4, 10, 8 of 2), and the tests' rules at exactly the tests' weekends.
 */
export const FIDELITY = (
  quick: boolean,
): { search: Fidelity; check: Fidelity; final: Fidelity; plan: SearchPlan } =>
  quick
    ? {
        search: {
          weekends: 8,
          draws: 4,
          classicWeekends: 6,
          mixedDraws: 4,
          mixedWeekends: 1,
          rules: 0.25,
          heavyRules: false,
        },
        check: {
          weekends: 12,
          draws: 4,
          classicWeekends: 8,
          mixedDraws: 6,
          mixedWeekends: 2,
          rules: 0.25,
        },
        final: {
          weekends: 20,
          draws: 4,
          classicWeekends: 10,
          mixedDraws: 8,
          mixedWeekends: 2,
          rules: 1,
          info: true,
        },
        plan: { gridPoints: 4, rounds: 1, keep: 3, checks: 12, finalists: 4 },
      }
    : {
        search: {
          weekends: 20,
          draws: 4,
          classicWeekends: 12,
          mixedDraws: 10,
          mixedWeekends: 1,
          rules: 0.25,
          heavyRules: false,
        },
        check: {
          weekends: 40,
          draws: 8,
          classicWeekends: 20,
          mixedDraws: 20,
          mixedWeekends: 2,
          rules: 0.5,
        },
        final: {
          weekends: 60,
          draws: 10,
          classicWeekends: 30,
          mixedDraws: 40,
          mixedWeekends: 2,
          rules: 1,
          info: true,
        },
        plan: { gridPoints: 6, rounds: 3, keep: 4, checks: 40, finalists: 8 },
      };

/**
 * The damage potential of a line with random legal talents: the mean over the same draws and seeds as `randomTalentMeasure`
 * (`weekends` split over `draws`), so it fights the same weekends until the boss would have died.
 */
export function randomTalentPotential(
  boss: BossDef,
  line: readonly Pick[],
  weekends: number,
  draws: number,
  salt: string,
): number {
  const per = Math.max(1, Math.floor(weekends / draws));
  let sum = 0;
  for (let d = 0; d < draws; d++) {
    const rng = createSeededRng(`talents:${salt}:${d}`);
    sum += weekendPotential(boss, randomTalents(rng, line), per, `${salt}:r${d}`).mean;
  }
  return sum / draws;
}

/** The prepared line of a boss: its first written answer (and its tool). */
export function preparedOf(id: string): { line: Pick[]; core: readonly string[] } {
  const first = BOSS_ANSWERS[id]?.[0];
  if (!first) throw new Error(`${id} has no written answer`);
  const line = answerLine(first.line);
  if (illegalTalents(line).length) throw new Error(`${id}: the prepared line is not legal`);
  return { line, core: first.core ?? [] };
}

/**
 * One candidate to measure: a boss at a rank with these absolute numbers, how many weekends, and the salt every candidate shares.
 * `other` is the boss's absolute numbers at the other rank a cross-rank rule compares (the low rank's for the high, the high's for the
 * low): given only when the ranks are tuned together.
 */
export interface TuneEvalArgs {
  readonly boss: string;
  readonly rank: TargetRank;
  readonly numbers: Numbers;
  readonly fidelity: Fidelity;
  readonly salt: string;
  readonly other?: { readonly rank: TargetRank; readonly numbers: Numbers };
}

export interface TuneEvalResult {
  readonly measures: RaidMeasures;
  /** Weekends fought (a mixed server's weekends are ten players wide). */
  readonly weekends: number;
}

/** Measures one candidate (what a `tune-eval` job runs): the measures of `targets.ts` for the boss with these numbers. */
export function evalCandidate(a: TuneEvalArgs): TuneEvalResult {
  const { line, core } = preparedOf(a.boss);
  const boss = raidBossOf(a.boss, { rank: a.rank, ...a.numbers });
  const f = a.fidelity;
  const withTool = randomTalentMeasure(boss, line, f.weekends, f.draws, `${a.salt}:p`);
  const without = randomTalentMeasure(
    boss,
    withoutTool(line, core),
    f.weekends,
    f.draws,
    `${a.salt}:n`,
  );
  // The line with its written talents: a server facing a returning boss can re-pick them from its Talent Book.
  const written = weekendStats(boss, line, f.weekends, `${a.salt}:w`);
  // The tool's worth with them, on the same seeds (`toolCost`, as `test/bossAnswers.test.ts` measures it).
  const writtenWithout = weekendStats(boss, withoutTool(line, core), f.weekends, `${a.salt}:w`);
  const classic = weekendStats(boss, classicFor(raidMode(boss)), f.classicWeekends, `${a.salt}:c`);
  // Damage potential (written talents; the same seeds as the kill measures above).
  const writtenPot = weekendPotential(boss, line, f.weekends, `${a.salt}:w`).mean;
  const classicPot = weekendPotential(
    boss,
    classicFor(raidMode(boss)),
    f.classicWeekends,
    `${a.salt}:c`,
  ).mean;
  const info = f.info
    ? {
        'prepared.potentialRandom': randomTalentPotential(
          boss,
          line,
          f.weekends,
          f.draws,
          `${a.salt}:p`,
        ),
        'tool.potential':
          writtenPot -
          weekendPotential(boss, withoutTool(line, core), f.weekends, `${a.salt}:w`).mean,
      }
    : {};
  const mixed = mixedSpread(
    boss,
    line,
    [line],
    f.mixedDraws,
    1,
    f.mixedWeekends,
    `${a.salt}:m`,
    core,
    [core],
    { players: 10, casual: 'top3' },
  );
  // The lab tests' rules, measured as the tests measure them (the cheap passes leave them out or shrink them).
  const rules = f.rules
    ? ruleMeasures(
        a.boss,
        a.rank,
        boss,
        f.rules,
        a.other
          ? {
              rank: a.other.rank,
              boss: raidBossOf(a.boss, { rank: a.other.rank, ...a.other.numbers }),
            }
          : undefined,
        f.heavyRules ?? true,
      )
    : undefined;
  return {
    measures: {
      ...(Object.fromEntries(RAID_MEASURES.map((m) => [m, Number.NaN])) as Record<
        (typeof RAID_MEASURES)[number],
        number
      >),
      ...rules?.values,
      'prepared.share': withTool.share,
      'prepared.kill': withTool.kill,
      'prepared.written': written.tiers.kill,
      'prepared.beat2': beatWithin(written.tiers.kill, 2),
      'tool.share': withTool.share - without.share,
      'tool.written': written.damageShare - writtenWithout.damageShare,
      'classic.share': classic.damageShare,
      'classic.kill': classic.tiers.kill,
      'mixed.share': mixed.weekend.damageShare,
      'mixed.kill': mixed.winRate,
      'prepared.potential': writtenPot,
      'classic.potential': classicPot,
      ...info,
    },
    weekends:
      2 * Math.max(1, Math.floor(f.weekends / f.draws)) * f.draws +
      2 * f.weekends +
      f.classicWeekends +
      f.weekends +
      f.classicWeekends +
      (f.info ? f.weekends + f.weekends : 0) +
      f.mixedDraws * f.mixedWeekends +
      (rules?.weekends ?? 0),
  };
}

export interface Miss {
  readonly target: string;
  readonly value: number;
  /** 0 when met. */
  readonly miss: number;
}

/** One set of numbers, measured: how it stands against the targets. */
export interface Row {
  /** In the spec's units (the high rank's absolute, a lower rank's bp). */
  readonly numbers: Numbers;
  /** The boss's own HP, Attack and armour. */
  readonly absolute: Numbers;
  readonly measures: RaidMeasures;
  readonly loss: number;
  readonly misses: Miss[];
  /** How many of the targets' measures were not taken (NaN): the loss does not count them, so a loss of 0 is "every target met" only at 0 here. */
  readonly unmeasured: number;
}

/** Whether a row meets every target: no loss, and nothing left unmeasured. */
export const meetsEveryTarget = (row: Row | undefined): boolean =>
  row !== undefined && row.loss === 0 && row.unmeasured === 0;

export interface RankResult {
  readonly boss: string;
  readonly rank: TargetRank;
  readonly targets: readonly RaidTarget[];
  readonly today: Row;
  /** Undefined when the ladder leaves no numbers to search. */
  readonly best: Row | undefined;
  readonly conflicts: Conflicts;
  /** Every candidate measured, in its best measurement (the conflicts are read from these). */
  readonly searched: readonly { numbers: Numbers; measures: RaidMeasures; level: Level }[];
  /** Numbers whose best value sits at the edge of what was allowed, and what set that edge (the ladder or the range around today's number). */
  readonly atEdge: string[];
  readonly candidates: number;
  readonly weekends: number;
  /** Seconds of work added up over all cores. */
  readonly seconds: number;
  /** The lines to paste into `bosses.ts`. */
  readonly paste: string;
  /** Set when a lower rank's paste is expressed against a proposed high rank other than today's (`rebaseOn`). */
  readonly rebasedOn?: Numbers;
  /** Rules that compare ranks and were not checked, because the ranks were not tuned together (they need `--rank all`). */
  readonly skipped: readonly RaidTarget[];
}

/** Where the candidates run: `exec` runs one job, `slots` at a time (the same shape as the report's `JobRunner`). */
export interface TuneRunner {
  readonly exec: Executor;
  readonly slots: number;
}

const grouped = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '_');

function pasteOf(id: string, rank: TargetRank, n: Numbers): string {
  if (rank === 'high')
    return `${id} (RAID_SPECS, high rank): hp: ${grouped(n.hp)}, atk: ${n.atk}, armour: ${n.armour}`;
  return `${id} (RAID_SPECS, ranks.${rank}): [${grouped(n.hp)}, ${grouped(n.atk)}, ${grouped(n.armour)}]  // [hpBp, atkBp, armourBp]`;
}

/**
 * The numbers of a lower rank as bp of a high rank (the spec's units), such that `raidBossOf` rebuilds `absolute` from them
 * (`Math.round(high * bp / 10_000) === absolute`). The tidiest bp that does: a multiple of 100 when one works, else of 10, else
 * the nearest whole bp (which always works while the high rank's number is below 10,000).
 */
export function rebaseOn(absolute: Numbers, high: Numbers): Numbers {
  const one = (abs: number, hi: number): number => {
    const exact = (abs * 10_000) / hi;
    for (const step of [100, 10, 1]) {
      const bp = Math.round(exact / step) * step;
      if (Math.round((hi * bp) / 10_000) === abs) return bp;
    }
    return Math.round(exact);
  };
  return {
    hp: one(absolute.hp, high.hp),
    atk: one(absolute.atk, high.atk),
    armour: one(absolute.armour, high.armour),
  };
}

function rowOf(
  id: string,
  rank: TargetRank,
  targets: readonly RaidTarget[],
  numbers: Numbers,
  measures: RaidMeasures,
): Row {
  return {
    numbers,
    absolute: absoluteOf(id, rank, numbers),
    measures,
    loss: lossOf(targets, measures),
    unmeasured: targets.filter((t) => !isMeasured(measures[t.measure])).length,
    misses: targets.map((t) => ({
      target: describeTarget(t),
      value: measures[t.measure],
      miss: missOf(t, measures[t.measure]),
    })),
  };
}

/** What a measurement is cached under: the level, the boss's absolute numbers and, for a cross-rank rule, the other rank's. */
function candidateKey(level: Level, n: Numbers, other?: TuneEvalArgs['other']): string {
  return `${level}:${toPoint(n).join(',')}${other ? `|${other.rank}:${toPoint(other.numbers).join(',')}` : ''}`;
}

/**
 * Tunes one boss at one rank: today's numbers against the best found, and the conflicts among the targets. `others` are the
 * absolute numbers of the other ranks the ladder holds this one to (default: today's).
 */
export async function tuneRank(
  id: string,
  rank: TargetRank,
  others: Partial<Record<TargetRank, Numbers>>,
  quick: boolean,
  run: TuneRunner,
  targets: readonly RaidTarget[] = targetsFor(id, rank),
  incumbent?: Numbers,
  cache: Map<string, TuneEvalResult> = new Map(),
): Promise<RankResult> {
  const fidelity = FIDELITY(quick);
  const today = nativeOf(id, rank);
  const box = ladderBox(id, rank, others);
  const quantum = toPoint(quantumOf(rank));
  // Where each number's range ends, and whether the ladder (the other ranks' numbers) or the range around today's number set it.
  const limits = NUMBER_NAMES.map((name, i) => {
    const q = quantum[i] as number;
    const spec = specOf(id);
    // The box is in the boss's own numbers; a bp share converts back.
    const scale =
      rank === 'high'
        ? 1
        : 10_000 / (name === 'hp' ? spec.hp : name === 'atk' ? spec.atk : spec.armour);
    const [blo, bhi] = box[name];
    const rangeLo = Math.max(q, snap(today[name] * RANGE[name][0], q));
    const rangeHi = snap(today[name] * RANGE[name][1], q);
    const ladderLo = Number.isFinite(blo) ? Math.ceil(blo * scale) : 0;
    const ladderHi = Number.isFinite(bhi) ? Math.floor(bhi * scale) : Number.POSITIVE_INFINITY;
    return {
      // Whole steps only (a share of 8_400 bp, not 8_499), cut inwards so that both ends stay inside the ladder.
      axis: {
        name,
        lo: Math.ceil(Math.max(rangeLo, ladderLo) / q) * q,
        hi: Math.floor(Math.min(rangeHi, ladderHi) / q) * q,
        quantum: q,
      },
      loBy: ladderLo >= rangeLo ? 'ladder' : 'range',
      hiBy: ladderHi <= rangeHi ? 'ladder' : 'range',
    };
  });
  const axes: Axis[] = limits.map((l) => l.axis);
  const feasible = (p: Point): boolean => {
    const a = absoluteOf(id, rank, fromPoint(p));
    return NUMBER_NAMES.every((k) => a[k] >= box[k][0] && a[k] <= box[k][1]);
  };
  // A rule that compares two ranks reads the other rank's numbers as they stand (low for high, high for low); only when asked for.
  const crossOn = targets.some((t) => isCrossMeasure(t.measure));
  const otherRank: TargetRank | undefined =
    rank === 'high' ? 'low' : rank === 'low' ? 'high' : undefined;
  const otherNumbers = otherRank ? others[otherRank] : undefined;
  const other =
    crossOn && otherRank && otherNumbers ? { rank: otherRank, numbers: otherNumbers } : undefined;
  let seconds = 0,
    weekends = 0,
    batch = 0;
  const evaluate: BatchEvaluator<TuneEvalResult> = async (points, level) => {
    const n = batch++;
    const fid = fidelity[level];
    // A candidate already measured at this level (by an earlier pass of the ranks) is not fought again: the seeds are the same
    // (unless the other rank moved, which a cross-rank rule reads).
    const keyOf = (p: Point): string =>
      candidateKey(level, absoluteOf(id, rank, fromPoint(p)), other);
    // Two shares that round to the same boss are one candidate.
    const pending = new Set<string>();
    const jobs: JobSpec[] = points.flatMap((p, i) =>
      cache.has(keyOf(p)) || pending.has(keyOf(p)) || !pending.add(keyOf(p))
        ? []
        : [
            {
              id: `tune:${id}:${rank}:${n}:${i}`,
              section: 'Boss tuner',
              kind: 'tune-eval',
              args: {
                boss: id,
                rank,
                numbers: absoluteOf(id, rank, fromPoint(p)),
                fidelity: fid,
                // The same seeds for every candidate of a level (and for a boss and rank across runs).
                salt: `tune:${id}:${rank}:${level}`,
                ...(other ? { other } : {}),
              } satisfies TuneEvalArgs,
              needs: [],
            },
          ],
    );
    const { results, runs } = await runJobs(jobs, run.exec, run.slots);
    seconds += runs.reduce((s, r) => s + r.seconds, 0);
    for (const j of jobs) {
      const r = results.get(j.id) as TuneEvalResult;
      weekends += r.weekends;
      const p = points[Number(j.id.split(':').at(-1))] as Point;
      cache.set(keyOf(p), r);
    }
    return points.map((p) => {
      const r = cache.get(keyOf(p)) as TuneEvalResult;
      return {
        loss: lossOf(targets, r.measures),
        comfort: comfortOf(targets, r.measures),
        data: r,
      };
    });
  };

  // The range is around today's numbers; the search starts from the incumbent (today's, or what an earlier pass of the ranks found).
  const startPoint = toPoint(incumbent ?? today);
  const found = await searchPoints(axes, feasible, startPoint, fidelity.plan, evaluate);
  const row = (f: Found<TuneEvalResult>) =>
    rowOf(id, rank, targets, fromPoint(f.point), f.data.measures);
  const best = found.best ? row(found.best) : undefined;
  return {
    boss: id,
    rank,
    targets,
    today: row(found.start),
    best,
    conflicts: findConflicts(
      targets,
      found.all.map((f) => f.data.measures),
      found.all.map((f) => f.level === 'final'),
    ),
    searched: found.all.map((f) => ({
      numbers: fromPoint(f.point),
      measures: f.data.measures,
      level: f.level,
    })),
    atEdge: best
      ? limits.flatMap((l, i) => {
          const v = toPoint(best.numbers)[i] as number;
          if (l.axis.lo === l.axis.hi) return [];
          if (v === l.axis.lo) return [`${l.axis.name} at its lower limit, set by the ${l.loBy}`];
          if (v === l.axis.hi) return [`${l.axis.name} at its upper limit, set by the ${l.hiBy}`];
          return [];
        })
      : [],
    candidates: found.searched,
    weekends,
    seconds,
    paste: best ? pasteOf(id, rank, best.numbers) : '',
    skipped: crossOn ? [] : skippedCross(id, rank),
  };
}

/**
 * The numbers measured once more in full against the other rank as it finally stands (`other`), reusing the measurement if the
 * search already took it. The coordinate descent leaves a rank's cross-rank rules measured against the other rank as it was then.
 */
async function measureFinal(
  id: string,
  rank: TargetRank,
  numbers: Numbers,
  other: NonNullable<TuneEvalArgs['other']>,
  quick: boolean,
  run: TuneRunner,
  cache: Map<string, TuneEvalResult>,
): Promise<{ result: TuneEvalResult; seconds: number; fought: number }> {
  const key = candidateKey('final', numbers, other);
  const hit = cache.get(key);
  if (hit) return { result: hit, seconds: 0, fought: 0 };
  const job: JobSpec = {
    id: `tune:${id}:${rank}:verify`,
    section: 'Boss tuner',
    kind: 'tune-eval',
    args: {
      boss: id,
      rank,
      numbers,
      fidelity: FIDELITY(quick).final,
      salt: `tune:${id}:${rank}:final`,
      other,
    } satisfies TuneEvalArgs,
    needs: [],
  };
  const { results, runs } = await runJobs([job], run.exec, run.slots);
  const result = results.get(job.id) as TuneEvalResult;
  cache.set(key, result);
  return {
    result,
    seconds: runs.reduce((s, r) => s + r.seconds, 0),
    fought: result.weekends,
  };
}

const LEVELS: readonly Level[] = ['search', 'check', 'final'];

/** Two lists of measured candidates as one: a candidate in both is kept once, in the better of its measurements. */
function mergeSearched(
  a: RankResult['searched'],
  b: RankResult['searched'],
): RankResult['searched'] {
  const by = new Map<string, RankResult['searched'][number]>();
  for (const c of [...a, ...b]) {
    const k = `${c.numbers.hp},${c.numbers.atk},${c.numbers.armour}`;
    const old = by.get(k);
    if (!old || LEVELS.indexOf(c.level) >= LEVELS.indexOf(old.level)) by.set(k, c);
  }
  return [...by.values()];
}

/**
 * Tunes one boss at the given ranks. The ranks hold each other to the ladder, so several are tuned together by coordinate descent:
 * each rank in turn, from the highest down, searches under the ladder with the others' numbers held; two passes, so that the high
 * rank can move down once the ranks below it have. Every step starts from the numbers so far (today's, at first), which satisfy
 * the ladder, so a step never ends worse than it began. One rank alone is held to today's numbers of the others.
 */
export async function tuneBoss(
  id: string,
  ranks: readonly TargetRank[],
  quick: boolean,
  run: TuneRunner,
): Promise<RankResult[]> {
  const today = todayAbsolute(id);
  const current: Record<TargetRank, Numbers> = { ...today };
  const native: Partial<Record<TargetRank, Numbers>> = {};
  const order = [...ranks].sort((a, b) => TARGET_RANKS.indexOf(b) - TARGET_RANKS.indexOf(a));
  const results = new Map<TargetRank, RankResult>();
  const caches = new Map<TargetRank, Map<string, TuneEvalResult>>(
    TARGET_RANKS.map((r) => [r, new Map()]),
  );
  // The rules that compare two ranks are checked only when every rank is tuned together (`--rank all`).
  const crossOn = TARGET_RANKS.every((r) => ranks.includes(r));
  // Up to three passes (the ranks pull on each other, so a pass can open a move for the next); it stops after a pass that leaves every rank meeting every target.
  for (let pass = 0; pass < (ranks.length > 1 ? 3 : 1); pass++) {
    for (const rank of order) {
      const rest = Object.fromEntries(Object.entries(current).filter(([r]) => r !== rank));
      const r = await tuneRank(
        id,
        rank,
        rest,
        quick,
        run,
        targetsFor(id, rank, crossOn),
        native[rank],
        caches.get(rank),
      );
      const before = results.get(rank);
      const merged = before ? mergeSearched(before.searched, r.searched) : r.searched;
      // Later passes add to the first: today's numbers are the first pass's start, and the conflicts read every candidate measured.
      results.set(
        rank,
        before
          ? {
              ...r,
              today: before.today,
              searched: merged,
              conflicts: findConflicts(
                r.targets,
                merged.map((c) => c.measures),
                merged.map((c) => c.level === 'final'),
              ),
              candidates: merged.length,
              weekends: before.weekends + r.weekends,
              seconds: before.seconds + r.seconds,
            }
          : r,
      );
      if (r.best) {
        current[rank] = r.best.absolute;
        native[rank] = r.best.numbers;
      }
    }
    if (
      order.every((rank) => meetsEveryTarget(results.get(rank)?.best ?? results.get(rank)?.today))
    )
      break;
  }
  // The rules that compare ranks were measured against the other rank as it stood then; the second pass may have moved it. Measure
  // the final numbers of the high and the low rank once more against each other's final numbers, and report that.
  if (crossOn)
    for (const rank of ['high', 'low'] as const) {
      const r = results.get(rank);
      if (!r) continue;
      // A rank with no search space (no `best`) keeps today's numbers: its `today` row is the one to re-measure.
      const row = r.best ?? r.today;
      const otherRank = rank === 'high' ? 'low' : 'high';
      const m = await measureFinal(
        id,
        rank,
        row.absolute,
        { rank: otherRank, numbers: current[otherRank] },
        quick,
        run,
        caches.get(rank) as Map<string, TuneEvalResult>,
      );
      const again = rowOf(id, rank, r.targets, row.numbers, m.result.measures);
      results.set(rank, {
        ...r,
        ...(r.best ? { best: again } : { today: again }),
        weekends: r.weekends + m.fought,
        seconds: r.seconds + m.seconds,
      });
    }
  // A lower rank's numbers are a share of the high rank's. The ranks were measured as absolute numbers, so when the high rank is
  // proposed to change, the paste for the lower ranks is expressed against the new high rank, and the boss rebuilds as measured.
  const high = results.get('high')?.best?.absolute;
  const todayHigh = today.high;
  if (
    high &&
    (high.hp !== todayHigh.hp || high.atk !== todayHigh.atk || high.armour !== todayHigh.armour)
  )
    for (const rank of order) {
      const r = results.get(rank) as RankResult;
      if (rank !== 'high' && r.best)
        results.set(rank, {
          ...r,
          paste: pasteOf(id, rank, rebaseOn(r.best.absolute, high)),
          rebasedOn: high,
        });
    }
  return order.map((rank) => results.get(rank) as RankResult);
}

// ---------- the summary ----------

const NAMES: Readonly<Record<string, string>> = {
  'tidal-colossus': 'Tidal Colossus',
  'cinder-wyrm': 'Cinder Wyrm',
  thornmother: 'Thornmother',
  'storm-sovereign': 'Storm Sovereign',
  'old-bogback': 'Old Bogback',
};

const value = (m: RaidMeasure, v: number): string =>
  !isMeasured(v) ? '-' : isShareMeasure(m) ? pct(v) : String(Math.round(v * 100) / 100);
const numbersText = (rank: TargetRank, n: Numbers): string =>
  rank === 'high'
    ? `HP ${grouped(n.hp)}, Attack ${n.atk}, armour ${n.armour}`
    : `HP ${n.hp} bp, Attack ${n.atk} bp, armour ${n.armour} bp of the high rank's`;

/** A short markdown summary of one boss and rank. */
export function summaryOf(r: RankResult): string[] {
  const name = NAMES[r.boss] ?? r.boss;
  const lines = [
    `### ${name}, ${r.rank} rank`,
    '',
    `Loss ${r.today.loss.toFixed(3)} today${r.best ? `, ${r.best.loss.toFixed(3)} best found` : ''} (0 is every target met).${[
      ['today', r.today] as const,
      ['best found', r.best] as const,
    ]
      .filter(([, row]) => row && row.unmeasured > 0)
      .map(
        ([label, row]) =>
          ` ${String(row?.unmeasured)} targets not measured for ${label}: its loss counts only the measured ones.`,
      )
      .join('')}`,
    '',
    '| Target | Today | Best found |',
    '| --- | --- | --- |',
  ];
  r.targets.forEach((t, i) => {
    const cell = (row: Row | undefined) => {
      const m = row?.misses[i];
      if (!m) return '-';
      if (!isMeasured(m.value)) return 'not measured';
      return `${value(t.measure, m.value)} ${m.miss === 0 ? 'met' : '**missed**'}`;
    };
    lines.push(`| ${describeTarget(t)} | ${cell(r.today)} | ${cell(r.best)} |`);
  });
  // Rules that compare ranks cannot be checked from one rank on its own: say so, so that "met" is never read as "all rules met".
  for (const t of r.skipped)
    lines.push(`| ${describeTarget(t)} | needs --rank all | needs --rank all |`);
  // Information without a target: the measures no target reads, and the weeks to beat (the expected number of weekends to the
  // first kill, 1 / p, for a fixed track where a failed boss returns at full HP).
  const info = [...REPORTED_MEASURES, ...INFO_MEASURES].filter(
    (m) => !r.targets.some((t) => t.measure === m),
  );
  const weeks: [string, string][] = [
    ['prepared line (written talents)', 'prepared.written'],
    ['classic party', 'classic.kill'],
    ['mixed server', 'mixed.kill'],
  ];
  lines.push(
    '',
    'Information (no target):',
    '',
    '| Measure | Today | Best found |',
    '| --- | --- | --- |',
  );
  const cells = (f: (row: Row) => string) => `${f(r.today)} | ${r.best ? f(r.best) : '-'}`;
  for (const m of info) lines.push(`| ${m} | ${cells((row) => value(m, row.measures[m]))} |`);
  for (const [label, m] of weeks)
    lines.push(
      `| weeks to beat, ${label} | ${cells((row) => weeksText(row.measures[m as keyof RaidMeasures]))} |`,
    );
  lines.push('', `Today: ${numbersText(r.rank, r.today.numbers)}.`);
  if (r.best) {
    lines.push(`Best: ${numbersText(r.rank, r.best.numbers)}.`, '', `Paste: \`${r.paste}\``);
    if (r.rebasedOn)
      lines.push(
        '',
        `The paste is a share of the proposed high rank (${numbersText('high', r.rebasedOn)}), so that the boss has the numbers measured here (${numbersText('high', r.best.absolute)}); apply the high rank's paste with it.`,
      );
    if (r.atEdge.length)
      lines.push(
        '',
        `The best sits at the edge of the numbers allowed (${r.atEdge.join('; ')}). The ladder is the other ranks' numbers (\`--rank all\` tunes them together); the range is 60% to 150% of today's HP, 70% to 130% of Attack, 60% to 140% of armour, and a better fit may lie beyond it.`,
      );
  } else lines.push('', 'The ladder leaves no numbers to search at this rank.');
  const c = r.conflicts;
  lines.push('');
  for (const u of c.unreachable)
    lines.push(
      `- **${describeTarget(u)} is met nowhere** in the ${c.of} candidates searched: no HP, Attack or armour reaches it. That is a content problem (the boss's moves, cards or the answer), not a numbers problem.`,
    );
  for (const k of c.conflicts)
    lines.push(
      `- **Conflict:** ${describeTarget(k.a)} and ${describeTarget(k.b)} are never met together (met alone by ${k.metA} and ${k.metB} of ${k.of} candidates). That is a content problem, not a numbers problem.`,
    );
  if (c.allMet === 0 && !c.conflicts.length && !c.unreachable.length)
    lines.push(
      `- No pair of targets clashes, but none of the ${c.fullOf} candidates measured in full meets all of them: the tension is among three or more (a content problem too).`,
    );
  if (c.allMet > 0)
    lines.push(
      `- ${c.allMet} of the ${c.fullOf} candidates measured in full (the final level) meet every target.`,
    );
  lines.push(
    '',
    `${r.candidates} candidates, ${r.weekends} weekends fought, ${r.seconds.toFixed(1)} s of work.`,
    '',
  );
  return lines;
}

/** The whole run as markdown: a heading, the summaries, a closing line with the totals. */
export function summaryAll(
  results: readonly RankResult[],
  wallSeconds: number,
  quick: boolean,
): string[] {
  const out = [`## Boss tuner${quick ? ' (quick)' : ''}`, ''];
  out.push(
    'Proposals only: nothing was applied to `bosses.ts`. The targets are Misa’s, 2026-10-30 (`targets.ts`). Weeks to beat is the expected number of weekends to the first kill, 1 / p (a failed boss returns at full HP, attempts assumed alike; "20+" beyond 20).',
    '',
  );
  for (const r of results) out.push(...summaryOf(r));
  const work = results.reduce((s, r) => s + r.seconds, 0);
  out.push(
    `Total: ${results.reduce((s, r) => s + r.candidates, 0)} candidates, ${results.reduce((s, r) => s + r.weekends, 0)} weekends fought, ${work.toFixed(1)} s of work, ${wallSeconds.toFixed(1)} s on the clock.`,
  );
  return out;
}

/** The job a `tune-eval` runs (`jobRunners.ts`). */
export const runTuneJob = (args: unknown): TuneEvalResult => evalCandidate(args as TuneEvalArgs);
