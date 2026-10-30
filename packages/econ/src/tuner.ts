/**
 * The tuner: instead of "change the numbers, run the report, read, repeat", give it the targets (`targets.ts`) and the dials it may
 * move (`dials.ts`, each with bounds) and it searches for the values that meet the most targets with the smallest change from
 * today's, and says which targets cannot be met together within the bounds. It PROPOSES values; it never edits `rules.ts`.
 *
 * The search knows nothing of the valley: it takes an `evaluate` function that turns dial values into measures (the lab's own
 * `measuresOf`, or a tiny fake model in the tests). It is pure and deterministic: no randomness, no clock; the same inputs give
 * the same proposal.
 *
 * Passes: a coarse grid when there are one or two dials, then coordinate descent (one dial at a time, around the best so far,
 * the step halving each round), all on the cheap level (few seeds). The best few of those and today's values are then measured
 * again at the final level (the report's own number of seeds); the winner is chosen on those. A candidate fits better with fewer
 * missed targets, then a smaller total miss, then a smaller change from today.
 */
import { judge, type Judged, type Measures, type Target } from './targets';

/** A searched dial: its values run from `min` to `max` in multiples of `step`; `start` is today's value. */
export interface Axis {
  readonly id: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly start: number;
}

export type Values = Readonly<Record<string, number>>;
export type Level = 'search' | 'final';
/** Turns dial values into measures; the cheap level may run fewer seeds. */
export type Evaluate = (values: Values, level: Level) => Measures;

export interface Plan {
  /** Values per dial of the coarse grid (used for one or two dials). */
  readonly gridPoints: number;
  /** Coordinate descent rounds. */
  readonly rounds: number;
  /** How many of the best cheap candidates are measured again at the final level. */
  readonly finalists: number;
}

export const DEFAULT_PLAN: Plan = { gridPoints: 5, rounds: 3, finalists: 3 };

export interface Candidate {
  readonly values: Values;
  readonly level: Level;
  readonly judged: Judged[];
  /** Targets measured and missed. */
  readonly failed: number;
  /** The total miss, in each target's own scale. */
  readonly miss: number;
  /** How far the values are from today's, as a share of each dial's range (summed). */
  readonly change: number;
}

const EPS = 1e-9;

/** Whether `a` fits better than `b`: fewer missed targets, then a smaller miss, then a smaller change from today. */
export function fitsBetter(a: Candidate, b: Candidate): boolean {
  if (a.failed !== b.failed) return a.failed < b.failed;
  if (Math.abs(a.miss - b.miss) > EPS) return a.miss < b.miss;
  return a.change < b.change - EPS;
}

const snap = (x: number, step: number): number => Math.round(x / step) * step;
const clean = (x: number): number => Math.round(x * 1e9) / 1e9;
const clampTo = (axis: Axis, x: number): number =>
  clean(Math.min(axis.max, Math.max(axis.min, snap(x, axis.step))));
const keyOf = (values: Values, axes: readonly Axis[]): string =>
  axes.map((a) => values[a.id]).join(',');

/** `n` values from min to max, each a multiple of the step, without repeats; today's value is always among them. */
export function gridOf(axis: Axis, n: number): number[] {
  const out = Array.from({ length: n }, (_, i) =>
    clampTo(axis, axis.min + ((axis.max - axis.min) * i) / Math.max(1, n - 1)),
  );
  return [...new Set([...out, clampTo(axis, axis.start)])].sort((a, b) => a - b);
}

/** The values to try for one dial around `current` in a descent round: a step of a quarter of the range, halving each round. */
export function neighboursOf(axis: Axis, current: number, round: number): number[] {
  const span = (axis.max - axis.min) / 4 / 2 ** round;
  const step = Math.max(axis.step, snap(span, axis.step));
  const values = [-2, -1, 1, 2].map((k) => clampTo(axis, current + k * step));
  return [...new Set(values)].filter((v) => Math.abs(v - current) > EPS);
}

export function candidateOf(
  axes: readonly Axis[],
  targets: readonly Target[],
  values: Values,
  measures: Measures,
  level: Level,
): Candidate {
  const judged = judge(targets, measures);
  const change = axes.reduce(
    (sum, a) => sum + Math.abs((values[a.id] ?? a.start) - a.start) / Math.max(EPS, a.max - a.min),
    0,
  );
  return {
    values,
    level,
    judged,
    failed: judged.filter((j) => j.met === false).length,
    miss: judged.reduce((sum, j) => sum + j.miss, 0),
    change,
  };
}

/** A pair of targets that are each met by some measured candidate but never both. */
export interface Conflict {
  readonly a: string;
  readonly b: string;
}

/**
 * Targets that cannot be met together, from what was measured: `unreachable` are never met by any candidate, `conflicts` are
 * pairs that are each met somewhere and never together. It is only as wide as the search (the candidates it measured).
 */
export function findConflicts(candidates: readonly Candidate[]): {
  unreachable: string[];
  conflicts: Conflict[];
} {
  const ids = candidates[0]?.judged.filter((j) => j.met !== null).map((j) => j.target.id) ?? [];
  const metIn = (id: string): Set<number> =>
    new Set(
      candidates.flatMap((c, i) =>
        c.judged.find((j) => j.target.id === id)?.met === true ? [i] : [],
      ),
    );
  const sets = new Map(ids.map((id) => [id, metIn(id)] as const));
  const unreachable = ids.filter((id) => sets.get(id)?.size === 0);
  const reachable = ids.filter((id) => (sets.get(id)?.size ?? 0) > 0);
  const conflicts: Conflict[] = [];
  reachable.forEach((a, i) => {
    for (const b of reachable.slice(i + 1)) {
      const both = [...(sets.get(a) ?? [])].some((k) => sets.get(b)?.has(k));
      if (!both) conflicts.push({ a, b });
    }
  });
  return { unreachable, conflicts };
}

export interface TuneResult {
  readonly start: Candidate;
  readonly best: Candidate;
  /** Whether `best` is a proposal (it fits better than today's values at the final level). */
  readonly improved: boolean;
  readonly unreachable: string[];
  readonly conflicts: Conflict[];
  /** Candidates measured on the cheap level, and at the final level. */
  readonly searched: number;
  readonly finals: number;
}

/** Searches the dials for the values that fit the targets best, and finds the targets that conflict. */
export function tune(
  axes: readonly Axis[],
  targets: readonly Target[],
  evaluate: Evaluate,
  plan: Plan = DEFAULT_PLAN,
): TuneResult {
  const seen = new Map<string, Candidate>();
  const measure = (values: Values): Candidate => {
    const key = keyOf(values, axes);
    const known = seen.get(key);
    if (known) return known;
    const c = candidateOf(axes, targets, values, evaluate(values, 'search'), 'search');
    seen.set(key, c);
    return c;
  };
  const startValues: Values = Object.fromEntries(axes.map((a) => [a.id, a.start]));
  let best = measure(startValues);

  // 1. A coarse grid when the space is small enough to look at whole.
  if (axes.length > 0 && axes.length <= 2) {
    const grids = axes.map((a) => gridOf(a, plan.gridPoints));
    const points = grids.reduce<number[][]>(
      (acc, g) => acc.flatMap((p) => g.map((v) => [...p, v])),
      [[]],
    );
    for (const point of points) {
      const c = measure(Object.fromEntries(axes.map((a, i) => [a.id, point[i] as number])));
      if (fitsBetter(c, best)) best = c;
    }
  }
  // 2. Coordinate descent around the best: one dial at a time, a smaller step each round.
  for (let round = 0; round < plan.rounds; round++) {
    let moved = false;
    for (const axis of axes) {
      for (const v of neighboursOf(axis, best.values[axis.id] ?? axis.start, round)) {
        const c = measure({ ...best.values, [axis.id]: v });
        if (fitsBetter(c, best)) {
          best = c;
          moved = true;
        }
      }
    }
    if (!moved && round > 0) break;
  }

  // 3. The best few, and today's values, measured again at the final level.
  const ranked = [...seen.values()].sort((a, b) =>
    fitsBetter(a, b) ? -1 : fitsBetter(b, a) ? 1 : 0,
  );
  const finalValues = [startValues, ...ranked.slice(0, plan.finalists).map((c) => c.values)];
  const unique = new Map(finalValues.map((v) => [keyOf(v, axes), v] as const));
  const finals = [...unique.values()].map((v) =>
    candidateOf(axes, targets, v, evaluate(v, 'final'), 'final'),
  );
  const start = finals.find((c) => keyOf(c.values, axes) === keyOf(startValues, axes)) as Candidate;
  const winner = finals.reduce((x, y) => (fitsBetter(y, x) ? y : x));
  const { unreachable, conflicts } = findConflicts([...seen.values()]);
  return {
    start,
    best: winner,
    improved: winner !== start && fitsBetter(winner, start),
    unreachable,
    conflicts,
    searched: seen.size,
    finals: finals.length,
  };
}
