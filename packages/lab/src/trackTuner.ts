/**
 * The track tuner: tunes each slot of the boss track (`track.ts`) for the roster that arrives there (`docs/design/combat/boss-track.md`).
 *
 * Slot k is fought by a dedicated server in the week the path says it usually arrives there (the median week, at the expected roster
 * speed). In that week the prepared line, the classic party and the mixed server get their creatures' levels from the roster profile
 * (`roster.ts`: daily players for the prepared line and the classic party, the mixed mapping `path.ts` uses), and the slot's cards
 * are at the slot's strength. The search moves the slot's HP, Attack and armour against Misa's targets (`slotTargetsFor`: the
 * `RAID_TARGETS` bounds, the tool's worth scaled by the strength of the cards, the classic limit dropped on the welcome boss of
 * slot 1): the prepared line usually beats the boss within two weekends, removes most of the HP with random legal talents, its tool
 * is worth what the cards ask with written and with random talents, and the classic party kills at most 5% of weekends.
 * The mixed server is information only. The lab tests' rules (`raidRules.ts`) belong to the three fixed ranks and are not applied here.
 * The track is tuned at the expected speed only: a slow server arrives later and keeps growing while a failed boss returns, so
 * the path (`path.ts`, at three speeds) is where the speed's effect shows, not a measure at the arrival week of the expected one.
 *
 * A later lap of a boss has cards that are never weaker (`rankStrengthBp`), and its HP, Attack and armour may be lower than an
 * earlier lap's when its stronger cards make up for it. The rule is on the kill rate: a later lap's prepared first-weekend kill rate
 * is not above the earlier lap's by more than noise (`lapKillViolations`); it should follow from the aim (`PREPARED_KILL_AIM`).
 *
 * Path and tuning alternate (`tuneLoop`): the path gives each slot's arrival week, the tuner proposes numbers for that week's roster,
 * the path runs again with them, until the arrival weeks equal the weeks the table was tuned for (at most `MAX_ROUNDS` tunings). A
 * tuning is a sweep up the track: a slot's arrival week depends only on the slots before it, so after slot k is tuned the path is run
 * again for the arrival of slot k + 1, and one sweep leaves the table tuned for the weeks its own path reports. The path and the
 * candidates run on the job pool (`jobs.ts`); a worker thread does not share memory, so the table travels in the job's arguments.
 */
import { createSeededRng } from '@creatures/game';
import { randomTalents } from './answerMeasure';
import { answerLine, BOSS_ANSWERS, withoutTool } from './bossAnswers';
import {
  RAID_SPECS,
  combineWeekends,
  raidBench,
  raidMode,
  weekendStatsOf,
  type WeekendStats,
} from './bosses';
import { runJobs, type JobSpec } from './jobs';
import { MIXED, planPath, serverWeekend } from './path';
import { columnOf } from './raidMeasure';
import {
  PLACEHOLDER_ROSTER,
  ROSTER_WEEKS,
  levelledColumn,
  rosterLevels,
  type RosterProfile,
  type RosterSpeed,
} from './roster';
import { classicFor, type Pick } from './search';
import {
  RAID_MEASURES,
  beatWithin,
  PREPARED_KILL_AIM,
  isMeasured,
  lossOf,
  metBy,
  missOf,
  slotTargetsFor,
  type RaidMeasure,
  type RaidMeasures,
  type RaidTarget,
} from './targets';
import {
  FIDELITY,
  describeTarget,
  findConflicts,
  searchPoints,
  type Axis,
  type BatchEvaluator,
  type Conflicts,
  type Fidelity,
  type Level,
  type Miss,
  type Numbers,
  type Point,
  type SearchPlan,
  type TuneRunner,
} from './tuner';
import {
  SLOT_NUMBERS,
  TRACK_ORDER,
  rankNumbers,
  slotBoss,
  slotNumbers,
  trackSlot,
  type SlotTable,
} from './track';
import type { BossDef, Placement } from './types';

/** Tunings at most (path, tune, path, tune ...) before the loop gives up on the arrival weeks settling. */
export const MAX_ROUNDS = 4;

/** Misa's targets for a slot (`slotTargetsFor`, by the strength of the slot's cards). */
export const slotTargets = (slot: number, order: readonly string[] = TRACK_ORDER): RaidTarget[] =>
  slotTargetsFor(slot, trackSlot(slot, order).strengthBp);

/** The speed the track is tuned at (the path's expected roster speed); the other speeds only check it. */
export const TUNE_SPEED: RosterSpeed = 'expected';

// ---------- one slot's weekend ----------

/** The measures a slot is judged on: what a measurement of a slot takes (the rest of `RaidMeasures` is NaN). */
export const SLOT_MEASURES: readonly RaidMeasure[] = [
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
];

/**
 * The dedicated server's weekend with `line` as its raid line: a daily player a column, each creature at the level of the player's
 * creature of that row at the week, and each player's bench creature. Player `c` brings the line's column `c`, as the path's
 * dedicated server does (`serverWeekend`) and as the rank measures place the line.
 */
export function dedicatedTeam(
  boss: BossDef,
  line: readonly Pick[],
  week: number,
  speed: RosterSpeed,
  profile: RosterProfile = PLACEHOLDER_ROSTER,
): { placements: Placement[]; bench: Placement[] } {
  const placements: Placement[] = [];
  const bench: Placement[] = [];
  for (let c = 0; c < boss.cols; c++) {
    // One more creature than the column holds: the bench's.
    const levels = rosterLevels(profile, 'daily', week, speed, boss.rows + 1);
    levelledColumn(columnOf(line, boss.cols, c), levels).forEach((pick, r) =>
      placements.push({
        owner: `p${c + 1}`,
        formId: pick.formId,
        level: pick.level ?? 1,
        knack: pick.knack,
        ...(pick.talents ? { talents: pick.talents } : {}),
        row: r,
        col: c,
      }),
    );
    bench.push(
      ...raidBench(1, levels[boss.rows] ?? levels[levels.length - 1] ?? 1).map((x) => ({
        ...x,
        owner: `p${c + 1}`,
      })),
    );
  }
  return { placements, bench };
}

/** What a slot measurement takes: how many weekends of each (`Fidelity`; its rules are not used). */
export interface SlotEvalArgs {
  readonly slot: number;
  readonly week: number;
  readonly speed: RosterSpeed;
  readonly numbers: Numbers;
  readonly fidelity: Fidelity;
  readonly salt: string;
}

export interface SlotEvalResult {
  /** The measures at the speed of the arguments (the expected one in the tuner). */
  readonly measures: RaidMeasures;
  /** Weekends fought (a mixed server's weekends are ten players wide). */
  readonly weekends: number;
}

const unmeasured = (): Record<RaidMeasure, number> =>
  Object.fromEntries(RAID_MEASURES.map((m) => [m, Number.NaN])) as Record<RaidMeasure, number>;

/** The first written answer of a boss: its line and its tool (`core`). */
function preparedOf(id: string): { line: Pick[]; core: readonly string[] } {
  const first = BOSS_ANSWERS[id]?.[0];
  if (!first) throw new Error(`${id} has no written answer`);
  return { line: answerLine(first.line), core: first.core ?? [] };
}

/** One speed of a slot's measurement: the weekends of the fidelity, the mixed server only when the fidelity asks for it. */
function measureSpeed(
  a: SlotEvalArgs,
  table: SlotTable,
  speed: RosterSpeed,
  f: Fidelity,
  profile: RosterProfile,
): { measures: RaidMeasures; weekends: number } {
  const boss = slotBoss(a.slot, { table });
  const { line, core } = preparedOf(boss.id);
  const prepared = (picks: readonly Pick[], runs: number, salt: string): WeekendStats => {
    const { placements, bench } = dedicatedTeam(boss, picks, a.week, speed, profile);
    return weekendStatsOf(boss, placements, bench, runs, salt);
  };
  // The prepared line with random legal talents, with its tool and without it, over `draws` draws.
  const per = Math.max(1, Math.floor(f.weekends / f.draws));
  const random = (picks: readonly Pick[], salt: string): { share: number; kill: number } => {
    let share = 0,
      kill = 0;
    for (let d = 0; d < f.draws; d++) {
      const rng = createSeededRng(`talents:${salt}:${d}`);
      const w = prepared(randomTalents(rng, picks), per, `${salt}:r${d}`);
      share += w.damageShare;
      kill += w.tiers.kill;
    }
    return { share: share / f.draws, kill: kill / f.draws };
  };
  const withTool = random(line, `${a.salt}:p`);
  const without = random(withoutTool(line, core), `${a.salt}:n`);
  // The line with its written talents (a server facing a returning boss re-picks them from its Talent Book).
  const written = prepared(line, f.weekends, `${a.salt}:w`);
  const writtenWithout = prepared(withoutTool(line, core), f.weekends, `${a.salt}:w`);
  const classic = prepared(classicFor(raidMode(boss)), f.classicWeekends, `${a.salt}:c`);
  // The mixed server of ten at the path's mapping: information only.
  const mixed: WeekendStats | undefined = f.mixedDraws
    ? combineWeekends(
        Array.from({ length: f.mixedDraws }, (_, d) => {
          const w = serverWeekend(MIXED, a.slot, a.week, speed, `${a.salt}:m${d}`, profile, {
            table,
          });
          return weekendStatsOf(w.boss, w.placements, w.bench, f.mixedWeekends, `${a.salt}:m${d}`);
        }),
      )
    : undefined;
  return {
    measures: {
      ...unmeasured(),
      'prepared.share': withTool.share,
      'prepared.kill': withTool.kill,
      'prepared.written': written.tiers.kill,
      'prepared.beat2': beatWithin(written.tiers.kill, 2),
      'tool.share': withTool.share - without.share,
      'tool.written': written.damageShare - writtenWithout.damageShare,
      'classic.share': classic.damageShare,
      'classic.kill': classic.tiers.kill,
      ...(mixed ? { 'mixed.share': mixed.damageShare, 'mixed.kill': mixed.winRate } : {}),
    },
    weekends:
      2 * per * f.draws + 2 * f.weekends + f.classicWeekends + f.mixedDraws * f.mixedWeekends,
  };
}

/**
 * Measures one slot at one set of numbers (what a `slot-eval` job runs). The boss is the slot's at the numbers, the creatures are the
 * roster's at the week and the speed of the arguments. The same seeds for every candidate of a level, so a difference between
 * candidates is the numbers' effect.
 */
export function evalSlot(
  a: SlotEvalArgs,
  profile: RosterProfile = PLACEHOLDER_ROSTER,
): SlotEvalResult {
  const table: SlotTable = { [a.slot]: a.numbers };
  return measureSpeed(a, table, a.speed, a.fidelity, profile);
}

/** What a `slot-eval` job runs (`jobRunners.ts`). */
export const runSlotJob = (args: unknown): SlotEvalResult => evalSlot(args as SlotEvalArgs);

// ---------- the search space of a slot ----------

/** How far a slot's numbers may lie from the high rank's (the spec's), as factors of it: wide, since a slot's roster may be far from the rank's. */
const SLOT_RANGE: Record<keyof Numbers, readonly [number, number]> = {
  hp: [0.2, 2],
  atk: [0.3, 2],
  armour: [0, 1.4],
};
const QUANTUM: Numbers = { hp: 100, atk: 1, armour: 1 };
const NAMES = ['hp', 'atk', 'armour'] as const;
const toPoint = (n: Numbers): Point => NAMES.map((k) => n[k]);
const fromPoint = (p: Point): Numbers => ({
  hp: p[0] as number,
  atk: p[1] as number,
  armour: p[2] as number,
});
const snap = (x: number, q: number): number => Math.round(x / q) * q;

function specOf(id: string) {
  const spec = RAID_SPECS.find((s) => s.id === id);
  if (!spec) throw new Error(`unknown raid boss ${id}`);
  return spec;
}

/** The inclusive range of each number of a slot: wide around the spec's, armour never below the boss's hide. */
export function slotAxes(slot: number, order: readonly string[] = TRACK_ORDER): Axis[] {
  const id = trackSlot(slot, order).bossId;
  const spec = specOf(id);
  const hide = Math.round(spec.armour / 2);
  const base: Numbers = { hp: spec.hp, atk: spec.atk, armour: spec.armour };
  return NAMES.map((name) => {
    const q = QUANTUM[name];
    const [flo, fhi] = SLOT_RANGE[name];
    const lo = Math.ceil(Math.max(name === 'armour' ? hide : q, snap(base[name] * flo, q)) / q) * q;
    const hi = Math.max(lo, Math.floor((base[name] * fhi) / q) * q);
    return { name, lo, hi, quantum: q };
  });
}

// ---------- tuning one slot ----------

/** The slot's fidelity: the tuner's (`FIDELITY`), without the lab tests' rules, and the mixed server (information) only in the full measurement. */
export const SLOT_FIDELITY = (
  quick: boolean,
): { search: Fidelity; check: Fidelity; final: Fidelity; plan: SearchPlan } => {
  const f = FIDELITY(quick);
  const noRules = (x: Fidelity): Fidelity => ({
    weekends: x.weekends,
    draws: x.draws,
    classicWeekends: x.classicWeekends,
    mixedDraws: x.mixedDraws,
    mixedWeekends: x.mixedWeekends,
  });
  return {
    search: { ...noRules(f.search), mixedDraws: 0 },
    check: { ...noRules(f.check), mixedDraws: 0 },
    final: noRules(f.final),
    plan: quick ? f.plan : { gridPoints: 5, rounds: 3, keep: 3, checks: 24, finalists: 6 },
  };
};

/** One set of numbers of a slot, measured: how it stands against Misa's targets at the expected speed. */
export interface SlotRow {
  readonly numbers: Numbers;
  readonly measures: RaidMeasures;
  readonly loss: number;
  readonly misses: Miss[];
}

const rowOf = (targets: readonly RaidTarget[], numbers: Numbers, r: SlotEvalResult): SlotRow => ({
  numbers,
  measures: r.measures,
  loss: lossOf(targets, r.measures),
  misses: targets.map((t) => ({
    target: describeTarget(t),
    value: r.measures[t.measure],
    miss: missOf(t, r.measures[t.measure]),
  })),
});

export interface SlotResult {
  readonly slot: number;
  readonly bossId: string;
  /** The targets of the slot (`slotTargetsFor`). */
  readonly targets: readonly RaidTarget[];
  /** The week the roster is taken at (the arrival week). */
  readonly week: number;
  /** The numbers the search started from, measured. */
  readonly start: SlotRow;
  /** The proposal (the start's own numbers when nothing fits better). */
  readonly best: SlotRow;
  readonly conflicts: Conflicts;
  /** Numbers at the edge of what was searched, and what set the edge. */
  readonly atEdge: string[];
  readonly candidates: number;
  readonly weekends: number;
  readonly seconds: number;
}

/**
 * Among numbers that meet every target (a loss within `LOSS_STEP` of none), the search takes the boss whose prepared
 * first-weekend kill rate is closest to `PREPARED_KILL_AIM` (`aimComfort`: minus the distance), and between about equal ones the nearer to
 * the ranks' line. `distanceOf` is the mean of the numbers' log ratios to the reference and counts `NEAR_WEIGHT` against the comfort: a
 * last tie-break within a step of `AIM_STEP` of the aim (the HP-for-Attack trade lies along a ridge of equal kill rate, and the pull keeps the
 * boss near the ranks' line on it instead of at a glass cannon or a wall).
 */
export const NEAR_WEIGHT = 0.1;
/** The distance of the kill rate to the aim counts in steps of this: within a step the kill rate is noise, and the pull to the ranks' line decides. */
export const AIM_STEP = 0.05;
/** Losses are compared in steps of this: below it a loss is noise (a measurement of 20 to 60 weekends), so the aim decides. */
export const LOSS_STEP = 0.03;
export const quantised = (loss: number): number => Math.round(loss / LOSS_STEP) * LOSS_STEP;
/** The aim as a comfort: how near the prepared line's first-weekend kill rate is to `PREPARED_KILL_AIM`, negated (0 at the aim). */
export const aimComfort = (m: RaidMeasures): number =>
  isMeasured(m['prepared.written'])
    ? -Math.round(Math.abs(m['prepared.written'] - PREPARED_KILL_AIM) / AIM_STEP) * AIM_STEP
    : 0;
export const distanceOf = (n: Numbers, ref: Numbers): number =>
  NAMES.reduce((sum, k) => sum + Math.abs(Math.log(Math.max(1, n[k]) / Math.max(1, ref[k]))), 0) /
  NAMES.length;

/** What a measurement is cached under: the slot, the week, the level and the numbers. */
const cacheKey = (slot: number, week: number, level: Level, n: Numbers): string =>
  `${slot}:${week}:${level}:${toPoint(n).join(',')}`;

export interface TuneSlotOptions {
  readonly slot: number;
  readonly week: number;
  /** The table so far: the search starts from the slot's entry (or the ranks' line). */
  readonly table: SlotTable;
  readonly quick: boolean;
  readonly run: TuneRunner;
  readonly cache: Map<string, SlotEvalResult>;
  readonly order?: readonly string[];
}

/** Tunes one slot for the roster of its arrival week: the search starts from the slot's numbers in the table (or the ranks' line). */
export async function tuneSlot(o: TuneSlotOptions): Promise<SlotResult> {
  const order = o.order ?? TRACK_ORDER;
  const fidelity = SLOT_FIDELITY(o.quick);
  const targets = slotTargets(o.slot, order);
  const axes = slotAxes(o.slot, order);
  const clamp = (n: Numbers): Numbers =>
    fromPoint(
      toPoint(n).map((v, i) => {
        const a = axes[i] as Axis;
        return Math.min(a.hi, Math.max(a.lo, snap(v, a.quantum)));
      }),
    );
  const start = clamp(slotNumbers(o.slot, o.table, order));
  const feasible = (p: Point): boolean => p.every((v, i) => v >= (axes[i] as Axis).lo);
  // The ranks' own line for the slot (`rankNumbers`): where candidates that meet every target are pulled towards (`NEAR_WEIGHT`).
  const reference = rankNumbers(trackSlot(o.slot, order).bossId, o.slot);
  let seconds = 0,
    weekends = 0,
    batch = 0;
  const evaluate: BatchEvaluator<SlotEvalResult> = async (points, level) => {
    const n = batch++;
    const pending = new Set<string>();
    const jobs: JobSpec[] = points.flatMap((p, i) => {
      const k = cacheKey(o.slot, o.week, level, fromPoint(p));
      if (o.cache.has(k) || pending.has(k)) return [];
      pending.add(k);
      return [
        {
          id: `slot:${o.slot}:${n}:${i}`,
          section: 'Track tuner',
          kind: 'slot-eval',
          args: {
            slot: o.slot,
            week: o.week,
            speed: TUNE_SPEED,
            numbers: fromPoint(p),
            fidelity: fidelity[level],
            // The same seeds for every candidate of a level (and for a slot across runs).
            salt: `slot:${o.slot}:${level}`,
          } satisfies SlotEvalArgs,
          needs: [],
        },
      ];
    });
    const { results, runs } = await runJobs(jobs, o.run.exec, o.run.slots);
    seconds += runs.reduce((s, r) => s + r.seconds, 0);
    for (const j of jobs) {
      const r = results.get(j.id) as SlotEvalResult;
      weekends += r.weekends;
      o.cache.set(cacheKey(o.slot, o.week, level, (j.args as SlotEvalArgs).numbers), r);
    }
    return points.map((p) => {
      const r = o.cache.get(cacheKey(o.slot, o.week, level, fromPoint(p))) as SlotEvalResult;
      return {
        loss: quantised(lossOf(targets, r.measures)),
        comfort: aimComfort(r.measures) - NEAR_WEIGHT * distanceOf(fromPoint(p), reference),
        data: r,
      };
    });
  };
  const found = await searchPoints(axes, feasible, toPoint(start), fidelity.plan, evaluate);
  const row = (p: Point, r: SlotEvalResult): SlotRow => rowOf(targets, fromPoint(p), r);
  const best = found.best ?? found.start;
  const bestRow = row(best.point, best.data);
  return {
    slot: o.slot,
    bossId: trackSlot(o.slot, order).bossId,
    targets,
    week: o.week,
    start: row(found.start.point, found.start.data),
    best: bestRow,
    conflicts: findConflicts(
      targets,
      found.all.map((f) => f.data.measures),
      found.all.map((f) => f.level === 'final'),
    ),
    atEdge: axes.flatMap((a, i) => {
      const v = toPoint(bestRow.numbers)[i] as number;
      if (a.lo === a.hi) return [];
      if (v === a.lo) return [`${a.name} at its lower limit`];
      if (v === a.hi) return [`${a.name} at its upper limit`];
      return [];
    }),
    candidates: found.searched,
    weekends,
    seconds,
  };
}

// ---------- the loop ----------

/** What the loop needs from the outside: the path's arrival weeks, and the tuner (both faked in the tests). */
export interface LoopOps {
  /** The median week a dedicated server arrives at each slot (index 0 is slot 1), at the expected speed, with this table. */
  readonly arrivals: (table: SlotTable) => Promise<readonly number[]>;
  /**
   * Tunes every slot of the loop for these arrival weeks (the path's, with the table as it stands) and returns the table with the
   * proposals (slots outside the range are kept) and the weeks it tuned each slot for (a sweep up the track tunes a slot for the
   * arrival the path reports once the slots before it are tuned, so these can differ from the weeks it was given).
   */
  readonly tune: (
    weeks: readonly number[],
    table: SlotTable,
  ) => Promise<{ table: SlotTable; weeks: readonly number[] }>;
}

export interface LoopRound {
  readonly round: number;
  /** The arrival weeks of the path run with the table the round started from. */
  readonly arrivals: readonly number[];
  /** The slots whose arrival week differs from the weeks the table was last tuned for (all of them in the first round). */
  readonly moved: readonly number[];
  /** Whether the round tuned (the last entry of a loop that stopped only checks). */
  readonly tuned: boolean;
  /** The weeks the round tuned for. */
  readonly tunedFor?: readonly number[];
}

export interface LoopResult {
  readonly table: SlotTable;
  readonly rounds: readonly LoopRound[];
  /** Whether the arrival weeks equal the weeks the table was tuned for (false: `maxRounds` tunings were not enough). */
  readonly converged: boolean;
  /** The weeks the final table was last tuned for. */
  readonly weeks: readonly number[];
}

/**
 * Path, then tune for its arrival weeks, then path again, until no slot's median arrival week differs from the week it was tuned
 * for, or `maxRounds` tunings have been made. The path that finds nothing moved is the last entry of `rounds` (it checks the final table).
 */
export async function tuneLoop(
  ops: LoopOps,
  start: SlotTable,
  maxRounds: number = MAX_ROUNDS,
): Promise<LoopResult> {
  let table = start;
  let tunedFor: readonly number[] | undefined;
  const rounds: LoopRound[] = [];
  for (let round = 1; ; round++) {
    const arrivals = await ops.arrivals(table);
    const moved = arrivals.flatMap((w, i) =>
      tunedFor === undefined || tunedFor[i] !== w ? [i + 1] : [],
    );
    if (tunedFor !== undefined && moved.length === 0) {
      rounds.push({ round, arrivals, moved, tuned: false });
      return { table, rounds, converged: true, weeks: tunedFor };
    }
    if (round > maxRounds) {
      rounds.push({ round, arrivals, moved, tuned: false });
      return { table, rounds, converged: false, weeks: tunedFor ?? arrivals };
    }
    const tuned = await ops.tune(arrivals, table);
    rounds.push({ round, arrivals, moved, tuned: true, tunedFor: tuned.weeks });
    table = tuned.table;
    tunedFor = tuned.weeks;
  }
}

/** The median arrival week of each slot from a path summary (a slot nobody reached: the last week, when the roster has stopped growing). */
export function arrivalWeeks(
  slots: readonly {
    readonly slot: number;
    readonly reachedShare: number;
    readonly week: { readonly median: number };
  }[],
  first: number,
  last: number,
): number[] {
  return Array.from({ length: last - first + 1 }, (_, i) => {
    const s = slots.find((x) => x.slot === first + i);
    return s && s.reachedShare > 0 ? s.week.median : ROSTER_WEEKS;
  });
}

// ---------- the whole run ----------

export interface TrackTuneOptions {
  readonly first: number;
  readonly last: number;
  readonly quick: boolean;
  readonly run: TuneRunner;
  /** The table the loop starts from (default `SLOT_NUMBERS`). */
  readonly table?: SlotTable;
}

export interface TrackTuneResult {
  readonly loop: LoopResult;
  /** The last tuning of each slot. */
  readonly slots: readonly SlotResult[];
  readonly seconds: { readonly path: number; readonly tune: number; readonly wall: number };
}

/** The real loop: the path on the job pool; a tuning is a sweep up the track, slot by slot (each slot's candidates side by side on the pool). */
export async function tuneTrack(o: TrackTuneOptions): Promise<TrackTuneResult> {
  const t0 = Date.now();
  const caches = new Map<number, Map<string, SlotEvalResult>>();
  const cacheOf = (slot: number): Map<string, SlotEvalResult> => {
    const c = caches.get(slot) ?? new Map<string, SlotEvalResult>();
    caches.set(slot, c);
    return c;
  };
  let last: SlotResult[] = [];
  let pathSeconds = 0;
  let tuneSeconds = 0;
  const arrivals = async (table: SlotTable): Promise<number[]> => {
    const p0 = Date.now();
    const plan = planPath({ quick: o.quick, speeds: [TUNE_SPEED], kinds: ['dedicated'], table });
    const { results } = await runJobs(plan.jobs, o.run.exec, o.run.slots);
    pathSeconds += (Date.now() - p0) / 1000;
    const dedicated = plan.assemble(results).data.find((d) => d.server === 'dedicated');
    return arrivalWeeks(dedicated?.slots ?? [], o.first, o.last);
  };
  const ops: LoopOps = {
    arrivals,
    tune: async (weeks, table) => {
      const t1 = Date.now();
      let next: Record<number, Numbers> = { ...table } as Record<number, Numbers>;
      const results: SlotResult[] = [];
      const tunedFor: number[] = [];
      // A slot's arrival depends only on the slots before it: tune in order and ask the path again for the next slot's week.
      for (let slot = o.first; slot <= o.last; slot++) {
        const week =
          slot === o.first
            ? (weeks[0] as number)
            : ((await arrivals(next))[slot - o.first] as number);
        const r = await tuneSlot({
          slot,
          week,
          table: next,
          quick: o.quick,
          run: o.run,
          cache: cacheOf(slot),
        });
        next = { ...next, [slot]: r.best.numbers };
        results.push(r);
        tunedFor.push(week);
      }
      last = results;
      tuneSeconds += (Date.now() - t1) / 1000;
      return { table: next, weeks: tunedFor };
    },
  };
  const loop = await tuneLoop(ops, o.table ?? SLOT_NUMBERS);
  return {
    loop,
    slots: last,
    seconds: { path: pathSeconds, tune: tuneSeconds, wall: (Date.now() - t0) / 1000 },
  };
}

// ---------- the summary ----------

const pct = (x: number): string => (isMeasured(x) ? `${Math.round(x * 100)}%` : '-');
/** A measure's value, in bold when the slot's targets bound it and it misses. */
const cell = (targets: readonly RaidTarget[], measure: RaidMeasure, m: RaidMeasures): string => {
  const t = targets.find((x) => x.measure === measure);
  return `${pct(m[measure])}${t && !metBy(t, m[measure]) ? '**' : ''}`;
};
const grouped = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '_');

/** A later lap's first-weekend kill rate may be above the lap before's by this much (a measurement of 60 weekends) before it is a violation. */
export const LAP_KILL_NOISE = 0.1;

/**
 * The later laps whose prepared first-weekend kill rate is above the lap before's by more than `LAP_KILL_NOISE` (a later lap is not
 * easier than the one before for the roster it meets). `kills` maps a slot to its kill rate; slots without the lap before are not checked.
 */
export function lapKillViolations(
  kills: ReadonlyMap<number, number>,
  laps: number = TRACK_ORDER.length,
): { slot: number; kill: number; before: number }[] {
  const out: { slot: number; kill: number; before: number }[] = [];
  for (const [slot, kill] of kills) {
    const before = kills.get(slot - laps);
    if (before !== undefined && kill > before + LAP_KILL_NOISE) out.push({ slot, kill, before });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

/** The `SLOT_NUMBERS` table as TypeScript, ready to paste into `track.ts`. */
export function pasteOf(table: SlotTable, first: number, last: number): string[] {
  const lines = ['export const SLOT_NUMBERS: SlotTable = {'];
  for (let s = first; s <= last; s++) {
    const n = table[s];
    if (!n) continue;
    lines.push(
      `  ${s}: { hp: ${grouped(n.hp ?? 0)}, atk: ${n.atk}, armour: ${n.armour} }, // ${trackSlot(s).bossId}`,
    );
  }
  lines.push('};');
  return lines;
}

/** The markdown of a run: the rounds, one table of the slots (numbers, targets, misses) and the paste. */
export function trackSummary(
  r: TrackTuneResult,
  o: { quick: boolean; first: number; last: number },
): string[] {
  const out = [`## Track tuner${o.quick ? ' (quick)' : ''}`, ''];
  out.push(
    `Proposals only: nothing was applied to \`track.ts\`. Each slot is tuned for the roster a dedicated server has in its arrival week at the ${TUNE_SPEED} speed, against Misa’s targets (\`targets.ts\`, 2026-10-30), with the lap rule that a later lap's first-weekend kill rate is not above the lap before's by more than noise. The mixed server is information only.`,
    '',
    '### Rounds (path, then tune for its arrival weeks)',
    '',
  );
  for (const x of r.loop.rounds)
    out.push(
      `- Round ${x.round}: path arrival weeks per slot ${o.first}-${o.last}: ${x.arrivals.join(' ')}. ${
        x.tuned
          ? `Differs from the weeks tuned for: ${x.moved.length === x.arrivals.length ? 'all (first path)' : x.moved.join(', ')}. Tuned slot by slot up the track, for weeks ${(x.tunedFor ?? []).join(' ')}.`
          : x.moved.length
            ? `Differs from the weeks tuned for: ${x.moved.join(', ')}. Stopped (the limit of ${MAX_ROUNDS} tunings).`
            : 'Equal to the weeks tuned for: the table is tuned for the weeks the path now reports.'
      }`,
    );
  out.push(
    '',
    r.loop.converged
      ? `Converged after ${r.loop.rounds.length - 1} tuning${r.loop.rounds.length === 2 ? '' : 's'}.`
      : `**Did not converge** within ${MAX_ROUNDS} tunings: the arrival weeks still differ from the weeks tuned for.`,
    '',
    '### Slots',
    '',
    '| Slot | Boss | Week | Cards | HP | Attack | Armour | prepared.share | first-weekend kill | prepared.beat2 | tool.share | tool.written | tool target | classic.kill | mixed kill / share (info) | Misses | At the edge of the search |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const s of r.slots) {
    const m = s.best.measures;
    const t = s.targets;
    const missed = s.best.misses.filter((x) => x.miss > 0).map((x) => x.target);
    const tool = t.find((x) => x.measure === 'tool.share')?.min ?? 0;
    out.push(
      `| ${s.slot} | ${s.bossId} | ${s.week} | ${Math.round(trackSlot(s.slot).strengthBp / 100)}% | ${grouped(s.best.numbers.hp)} | ${s.best.numbers.atk} | ${s.best.numbers.armour} | ${(['prepared.share', 'prepared.written', 'prepared.beat2', 'tool.share', 'tool.written', 'classic.kill'] as const).map((k, i) => `${cell(t, k, m)}${i === 4 ? ` | ≥ ${pct(tool)}` : ''}`).join(' | ')} | ${pct(m['mixed.kill'])} / ${pct(m['mixed.share'])} | ${missed.length ? missed.join('; ') : 'none'} | ${s.atEdge.length ? s.atEdge.join(', ') : '-'} |`,
    );
  }
  out.push(
    '',
    '(A value in bold misses its target, as measured at the expected speed. Slot 1 has no limit on the classic party. The shares are from the full measurement of the proposal.)',
    '',
  );
  const lapKills = new Map(r.slots.map((x) => [x.slot, x.best.measures['prepared.written']]));
  const lapBad = lapKillViolations(lapKills);
  out.push(
    lapBad.length
      ? `Lap check: **${lapBad.map((x) => `slot ${x.slot} (${pct(x.kill)}, the lap before ${pct(x.before)})`).join('; ')}** have a first-weekend kill rate above the lap before's by more than ${pct(LAP_KILL_NOISE)}.`
      : `Lap check: no later lap has a first-weekend kill rate above the lap before's by more than ${pct(LAP_KILL_NOISE)}.`,
    '',
  );
  const missing = r.slots.filter((s) => s.best.misses.some((x) => x.miss > 0));
  if (missing.length) {
    out.push('### Misses the numbers cannot fix', '');
    for (const s of missing) {
      const c = s.conflicts;
      const notes = [
        ...c.unreachable.map(
          (u) => `${describeTarget(u)} is met nowhere in the ${c.of} candidates searched`,
        ),
        ...c.conflicts.map(
          (k) => `${describeTarget(k.a)} and ${describeTarget(k.b)} are never met together`,
        ),
      ];
      out.push(
        `- Slot ${s.slot} (${s.bossId}, week ${s.week}): misses ${s.best.misses
          .filter((x) => x.miss > 0)
          .map((x) => `${x.target} (${pct(x.value)})`)
          .join(
            '; ',
          )}.${notes.length ? ` ${notes.join('; ')}: a content problem, not a numbers problem.` : ' Each target is met somewhere in the search, but no candidate met all of them.'}${s.atEdge.length ? ` At the edge: ${s.atEdge.join(', ')}.` : ''}`,
      );
    }
    out.push('');
  }
  out.push(
    '### Paste into `SLOT_NUMBERS` (`track.ts`)',
    '',
    '```ts',
    ...pasteOf(r.loop.table, o.first, o.last),
    '```',
    '',
  );
  const work = r.slots.reduce((n, s) => n + s.seconds, 0);
  out.push(
    `${r.slots.reduce((n, s) => n + s.candidates, 0)} candidates in the last tuning, ${work.toFixed(1)} s of work then; the whole run took ${r.seconds.wall.toFixed(1)} s on the clock (path ${r.seconds.path.toFixed(1)} s, tuning ${r.seconds.tune.toFixed(1)} s).`,
    '',
  );
  return out;
}

// ---------- how sharp the kill rate falls with the boss's HP ----------

export interface KillPoint {
  readonly factor: number;
  readonly hp: number;
  readonly kill: number;
}

/**
 * The prepared line's first-weekend kill rate (written talents) of slot `slot` at the roster of `week`, as the boss's HP moves from
 * `from` to `to` times `numbers.hp` in steps of `step` (Attack and armour as given): the same seeds at every point.
 */
export function killByHp(
  slot: number,
  week: number,
  numbers: Numbers,
  o: { from: number; to: number; step: number; weekends: number; speed?: RosterSpeed },
  profile: RosterProfile = PLACEHOLDER_ROSTER,
): KillPoint[] {
  const out: KillPoint[] = [];
  const count = Math.round((o.to - o.from) / o.step);
  for (let i = 0; i <= count; i++) {
    const factor = o.from + i * o.step;
    const hp = Math.round((numbers.hp * factor) / 100) * 100;
    const boss = slotBoss(slot, { table: { [slot]: { ...numbers, hp } } });
    const { line } = preparedOf(boss.id);
    const { placements, bench } = dedicatedTeam(boss, line, week, o.speed ?? TUNE_SPEED, profile);
    const kill = weekendStatsOf(boss, placements, bench, o.weekends, `cliff:${slot}`).tiers.kill;
    out.push({ factor, hp, kill });
  }
  return out;
}

/**
 * How wide the cliff is: the HP at which the kill rate (falling with HP) crosses `high` (default 90%) and `low` (10%), and the width
 * between them as a share of the HP at 50%. Undefined when the curve does not cross both.
 */
export function cliffWidth(
  curve: readonly KillPoint[],
  high = 0.9,
  low = 0.1,
): { hpHigh: number; hpLow: number; hpHalf: number; widthShare: number } | undefined {
  const cross = (level: number): number | undefined => {
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1] as KillPoint;
      const b = curve[i] as KillPoint;
      if (a.kill >= level && b.kill < level)
        return a.hp + ((a.kill - level) / (a.kill - b.kill)) * (b.hp - a.hp);
    }
    return undefined;
  };
  const hpHigh = cross(high);
  const hpLow = cross(low);
  const hpHalf = cross(0.5);
  if (hpHigh === undefined || hpLow === undefined || hpHalf === undefined) return undefined;
  return { hpHigh, hpLow, hpHalf, widthShare: (hpLow - hpHigh) / hpHalf };
}
