/**
 * The track tuner: tunes each slot of the boss track (`track.ts`) for the roster that arrives there (`docs/design/combat/boss-track.md`).
 *
 * Slot k is fought by a dedicated server in the week the path says it first fights it (the median week, at the expected roster
 * speed; a Festival week fights nothing, so the first fight is never one). In that week the prepared line, the classic party and the mixed server get their creatures' levels from the roster profile
 * (`roster.ts`: daily players for the prepared line and the classic party, the mixed mapping `path.ts` uses), and the slot's cards
 * are at the slot's strength, and only the rules the young-server ramp gives it (`SLOT_CARDS`). The search moves the slot's HP, Attack
 * and armour against Misa's targets (`slotTargetsFor`: the `RAID_TARGETS` bounds, the tool's worth in points of potential by the strength of the cards (`toolPotentialMinAt`),
 * the classic limits and the tool dropped on the tutorial boss of slot 1): the prepared line (written talents) reaches a damage
 * potential of 125% or more and usually beats the boss within two weekends, removes most of the HP with random legal talents, its
 * tool is worth what the cards ask in points of potential (the HP-share tool measures are information only here), and the classic party reaches a potential of 70% to 90%
 * and kills at most 5% of weekends. Slot 1 also asks that the mixed server (the path's mapping) kills it in its first weekend in at
 * least 80% of weekends (`TUTORIAL_MIXED_KILL_MIN`); every other slot asks it to kill within three weekends in half of its runs
 * (`MIXED_KILL_MIN`, a weight below the dedicated targets, so a dedicated target wins where both cannot hold).
 * A creature under its form's evolution level fights as its stage 1 form (`gatedPick`, `roster.ts`) in every team here.
 * Information measures (`SlotInfo`, never targets) are taken in the full measurement: the classic party beside decent trios with
 * rotated elements, the prepared line at middling ranks and with random talents. Determination (`path.ts`) is never used here. The lab tests' rules (`raidRules.ts`) belong to the three fixed ranks and are not applied here.
 * The track is tuned at the expected speed only: a slow server arrives later and keeps growing while a failed boss returns, so
 * the path (`path.ts`, at three speeds) is where the speed's effect shows, not a measure at the arrival week of the expected one.
 *
 * A later lap of a boss has cards that are never weaker (`rankStrengthBp`), and its HP, Attack and armour may be lower than an
 * earlier lap's when its stronger cards make up for it. The rule is on the kill rate: a later lap's prepared first-weekend kill rate
 * is not above the earlier lap's by more than noise (`lapKillViolations`).
 *
 * Path and tuning alternate (`tuneLoop`): the path gives each slot's arrival week, the tuner proposes numbers for that week's roster,
 * the path runs again with them, until the arrival weeks equal the weeks the table was tuned for (at most `MAX_ROUNDS` tunings). A
 * tuning is a sweep up the track: a slot's arrival week depends only on the slots before it, so after slot k is tuned the path is run
 * again for the arrival of slot k + 1, and one sweep leaves the table tuned for the weeks its own path reports. The path and the
 * candidates run on the job pool (`jobs.ts`); a worker thread does not share memory, so the table travels in the job's arguments.
 */
import { createSeededRng } from '@creatures/game';
import { randomTalents } from './answerMeasure';
import { withoutTool } from './bossAnswers';
import {
  RAID_SPECS,
  combinePotential,
  combineWeekends,
  raidBench,
  raidMode,
  weekendPotentialOf,
  weekendStatsOf,
  type WeekendPotential,
  type WeekendStats,
} from './bosses';
import { runJobs, type JobSpec, type Plan } from './jobs';
import { MIXED, planPath, serverWeekend } from './path';
import { columnOf } from './raidMeasure';
import {
  ROSTER_WEEKS,
  levelledColumn,
  rosterLevels,
  rosterLevelsFrom,
  type RosterProfile,
  type RosterSpeed,
} from './roster';
import { VALLEY_ROSTER } from './valley';
import { OWN_KNACKS } from './knacks';
import { classicFor, type Mode, type Pick } from './search';
import {
  RAID_MEASURES,
  beatWithin,
  CLASSIC_POTENTIAL_AIM,
  PREPARED_POTENTIAL_AIM,
  isMeasured,
  lossOf,
  metBy,
  missOf,
  slotTargetsFor,
  weeksText,
  WALL_CLASSIC_POTENTIAL_AIM,
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
  slotPreparedOf,
  trackSlot,
  type SlotTable,
} from './track';
import type { BossDef, Placement } from './types';

/** Tunings at most (path, tune, path, tune ...) before the loop gives up on the arrival weeks settling. */
export const MAX_ROUNDS = 4;

/** Misa's targets for a slot (`slotTargetsFor`, by the strength of the slot's cards). */
export const slotTargets = (slot: number, order: readonly string[] = TRACK_ORDER): RaidTarget[] =>
  slotTargetsFor(slot, trackSlot(slot, order).strengthBp, trackSlot(slot, order).wall);

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
  'prepared.potential',
  'classic.potential',
  'prepared.potentialRandom',
  'tool.potential',
  'mixed.potential',
];

/**
 * The dedicated server's weekend with `line` as its raid line: a daily player a column, each creature at the level of the player's
 * creature of that row at the week, and each player's bench creature. Player `c` brings the line's column `c`, as the path's
 * dedicated server does (`serverWeekend`) and as the rank measures place the line. A creature under its form's evolution level
 * fights as its stage 1 form (`levelledColumn`). `from` is the rank of the creature that fills the front row: 1 (each player's best)
 * by default, 8 for the answer at middling ranks (their 8th to 11th best).
 */
export function dedicatedTeam(
  boss: BossDef,
  line: readonly Pick[],
  week: number,
  speed: RosterSpeed,
  profile: RosterProfile = VALLEY_ROSTER,
  from = 1,
): { placements: Placement[]; bench: Placement[] } {
  const placements: Placement[] = [];
  const bench: Placement[] = [];
  for (let c = 0; c < boss.cols; c++) {
    // One more creature than the column holds: the bench's.
    const levels =
      from === 1
        ? rosterLevels(profile, 'daily', week, speed, boss.rows + 1)
        : rosterLevelsFrom(profile, 'daily', week, speed, from, boss.rows + 1);
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

/**
 * Decent but unprepared trios with rotated elements (design panel 6; information only). The classic party (`CLASSIC_LINE`) is one
 * element mix, so it is element-lucky or element-unlucky against each boss; these four give the spread. How they were chosen: from the
 * common lines only, each trio one Setter, one Payoff and one Guard (a decent party), each form with its first own Knack
 * (`OWN_KNACKS`), no boss reading, and the element mixes all different from each other and from the classic party's (tide, spark,
 * grove): tide, ember and grove; spark, tide and ember; ember, tide and mire; spark, ember and mire. Placed as the classic party is
 * (`classicFor`: the trio in turn, twelve creatures, a player a column).
 */
export const ROTATED_TRIOS: readonly { readonly id: string; readonly forms: readonly string[] }[] =
  [
    { id: 'tide-ember-grove', forms: ['tidewing', 'pyrelynx', 'thornbuck'] },
    { id: 'spark-tide-ember', forms: ['voltaro', 'geyserpup', 'kilnmole'] },
    { id: 'ember-tide-mire', forms: ['wickat', 'geyserpup', 'bogwarden'] },
    { id: 'spark-ember-mire', forms: ['voltaro', 'pyrelynx', 'bogwarden'] },
  ];

/** A trio as the raid line the classic party is: each form with its first own Knack, in turn across the arena. */
export function trioLine(forms: readonly string[], mode: Mode): Pick[] {
  const picks = forms.map((formId): Pick => ({ formId, knack: OWN_KNACKS[formId]?.[0] ?? 'none' }));
  return Array.from({ length: mode.rows * mode.cols }, (_, i) => picks[i % picks.length] as Pick);
}

/** The rank of the creature that fills the front row in the answer at middling ranks: each player's 8th to 11th best. */
export const MIDDLING_FROM = 8;

/**
 * Information measures of a slot (the full measurement only; never targets). Potentials are shares of the boss's HP (1.3 is 130%).
 * `classic` is the classic party; `trios` the mean and the range of the rotated trios (`ROTATED_TRIOS`, each measured, listed in
 * `each`), so the classic party can be read as lucky or unlucky; `prepared` is the prepared line at each player's best creatures
 * (written talents); `middling` the same line with each player's creatures at their 8th to 11th best levels (`MIDDLING_FROM`; a
 * player with fewer creatures fields their weakest); `random` the prepared line with random legal talents.
 */
export interface SlotInfo {
  readonly classic: number;
  readonly trios: {
    readonly mean: number;
    readonly min: number;
    readonly max: number;
    readonly each: readonly number[];
  };
  readonly prepared: number;
  readonly middling: number;
  readonly random: number;
}

export interface SlotEvalResult {
  /** The measures at the speed of the arguments (the expected one in the tuner). */
  readonly measures: RaidMeasures;
  /** Weekends fought (a mixed server's weekends are ten players wide). */
  readonly weekends: number;
  /** The information measures, in the full measurement (`Fidelity.info`) only. */
  readonly info?: SlotInfo;
}

const unmeasured = (): Record<RaidMeasure, number> =>
  Object.fromEntries(RAID_MEASURES.map((m) => [m, Number.NaN])) as Record<RaidMeasure, number>;

/** One speed of a slot's measurement: the weekends of the fidelity, the mixed server only when the fidelity asks for it. */
function measureSpeed(
  a: SlotEvalArgs,
  table: SlotTable,
  speed: RosterSpeed,
  f: Fidelity,
  profile: RosterProfile,
): SlotEvalResult {
  const boss = slotBoss(a.slot, { table });
  const { line, core } = slotPreparedOf(a.slot);
  const prepared = (picks: readonly Pick[], runs: number, salt: string): WeekendStats => {
    const { placements, bench } = dedicatedTeam(boss, picks, a.week, speed, profile);
    return weekendStatsOf(boss, placements, bench, runs, salt);
  };
  // The same team and seeds, played as damage potential (the boss cannot die).
  const potential = (
    picks: readonly Pick[],
    runs: number,
    salt: string,
    from = 1,
  ): WeekendPotential => {
    const { placements, bench } = dedicatedTeam(boss, picks, a.week, speed, profile, from);
    return weekendPotentialOf(boss, placements, bench, runs, salt);
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
  const randomPotential = (picks: readonly Pick[], salt: string): number => {
    let sum = 0;
    for (let d = 0; d < f.draws; d++) {
      const rng = createSeededRng(`talents:${salt}:${d}`);
      sum += potential(randomTalents(rng, picks), per, `${salt}:r${d}`).mean;
    }
    return sum / f.draws;
  };
  const withTool = random(line, `${a.salt}:p`);
  const without = random(withoutTool(line, core), `${a.salt}:n`);
  // The line with its written talents (a server facing a returning boss re-picks them from its Talent Book).
  const written = prepared(line, f.weekends, `${a.salt}:w`);
  const writtenWithout = prepared(withoutTool(line, core), f.weekends, `${a.salt}:w`);
  const classic = prepared(classicFor(raidMode(boss)), f.classicWeekends, `${a.salt}:c`);
  // Damage potential, written talents: the prepared line and the classic party (the main targets).
  const writtenPot = potential(line, f.weekends, `${a.salt}:w`).mean;
  const classicPot = potential(classicFor(raidMode(boss)), f.classicWeekends, `${a.salt}:c`).mean;
  // The tool's worth in potential points (written talents): a target on the track (`toolPotentialMinAt`), so taken in every pass.
  const toolPot = writtenPot - potential(withoutTool(line, core), f.weekends, `${a.salt}:w`).mean;
  // Information, in the full measurement only: the prepared line with random talents, and the rest of `SlotInfo`.
  const randomPot = f.info ? randomPotential(line, `${a.salt}:p`) : Number.NaN;
  const info = f.info ? { 'prepared.potentialRandom': randomPot } : {};
  const slotInfo: SlotInfo | undefined = f.info
    ? (() => {
        const each = ROTATED_TRIOS.map(
          (t, i) =>
            potential(trioLine(t.forms, raidMode(boss)), f.classicWeekends, `${a.salt}:t${i}`).mean,
        );
        return {
          classic: classicPot,
          trios: {
            mean: each.reduce((n, x) => n + x, 0) / each.length,
            min: Math.min(...each),
            max: Math.max(...each),
            each,
          },
          prepared: writtenPot,
          middling: potential(line, f.weekends, `${a.salt}:w`, MIDDLING_FROM).mean,
          random: randomPot,
        };
      })()
    : undefined;
  // The mixed server of ten at the path's mapping: its kill rate is a target (`MIXED_KILL_MIN`, slot 1's `TUTORIAL_MIXED_KILL_MIN`);
  // its potential is information, taken in the full measurement only.
  const mixedDraws = Array.from({ length: f.mixedDraws }, (_, d) => {
    const w = serverWeekend(MIXED, a.slot, a.week, speed, `${a.salt}:m${d}`, profile, { table });
    return {
      stats: weekendStatsOf(w.boss, w.placements, w.bench, f.mixedWeekends, `${a.salt}:m${d}`),
      potential: f.info
        ? weekendPotentialOf(w.boss, w.placements, w.bench, f.mixedWeekends, `${a.salt}:m${d}`)
        : undefined,
    };
  });
  const mixed: WeekendStats | undefined = f.mixedDraws
    ? combineWeekends(mixedDraws.map((d) => d.stats))
    : undefined;
  const mixedPot =
    f.mixedDraws && f.info
      ? combinePotential(mixedDraws.flatMap((d) => (d.potential ? [d.potential] : []))).mean
      : Number.NaN;
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
      'prepared.potential': writtenPot,
      'classic.potential': classicPot,
      'tool.potential': toolPot,
      ...info,
      ...(mixed
        ? {
            'mixed.share': mixed.damageShare,
            'mixed.kill': mixed.winRate,
            'mixed.potential': mixedPot,
          }
        : {}),
    },
    weekends:
      2 * per * f.draws +
      2 * f.weekends +
      f.classicWeekends +
      f.mixedDraws * f.mixedWeekends +
      // The potential weekends: written, classic and the line without its tool; the information ones (random draws, the mixed server's).
      f.weekends +
      f.classicWeekends +
      (f.info ? f.mixedDraws * f.mixedWeekends : 0) +
      f.weekends +
      (f.info ? per * f.draws + ROTATED_TRIOS.length * f.classicWeekends + f.weekends : 0),
    ...(slotInfo ? { info: slotInfo } : {}),
  };
}

/**
 * Measures one slot at one set of numbers (what a `slot-eval` job runs). The boss is the slot's at the numbers, the creatures are the
 * roster's at the week and the speed of the arguments. The same seeds for every candidate of a level, so a difference between
 * candidates is the numbers' effect.
 */
export function evalSlot(a: SlotEvalArgs, profile: RosterProfile = VALLEY_ROSTER): SlotEvalResult {
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
    ...(x.info ? { info: true } : {}),
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
  /** The information measures (the full measurement of the proposal only). */
  readonly info?: SlotInfo;
  readonly loss: number;
  readonly misses: Miss[];
}

const rowOf = (targets: readonly RaidTarget[], numbers: Numbers, r: SlotEvalResult): SlotRow => ({
  numbers,
  measures: r.measures,
  ...(r.info ? { info: r.info } : {}),
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
 * Among numbers that meet every target (a loss within `LOSS_STEP` of none), the search takes the boss whose prepared damage potential
 * is closest to `PREPARED_POTENTIAL_AIM` and whose classic potential is closest to `CLASSIC_POTENTIAL_AIM` (`aimComfort`: minus the
 * two distances, each in steps of `AIM_STEP`), and between about equal ones the nearer to the ranks' line. `distanceOf` is the mean of
 * the numbers' log ratios to the reference and counts `NEAR_WEIGHT` against the comfort: a last tie-break within a step of `AIM_STEP`
 * of the aim (the HP-for-Attack trade lies along a ridge of equal potential, and the pull keeps the boss near the ranks' line on it
 * instead of at a glass cannon or a wall). The slot 1 tutorial has no classic target, so it aims at the prepared potential alone;
 * a wall slot (`TrackSlot.wall`) aims its classic potential at `WALL_CLASSIC_POTENTIAL_AIM` (45%) instead.
 */
export const NEAR_WEIGHT = 0.1;
/** The distance of a potential to its aim counts in steps of this: within a step the measure is noise, and the pull to the ranks' line decides. */
export const AIM_STEP = 0.05;
/** Losses are compared in steps of this: below it a loss is noise (a measurement of 20 to 60 weekends), so the aim decides. */
export const LOSS_STEP = 0.03;
export const quantised = (loss: number): number => Math.round(loss / LOSS_STEP) * LOSS_STEP;
/**
 * The aim as a comfort: how near the prepared potential is to `PREPARED_POTENTIAL_AIM` and the classic potential to
 * `CLASSIC_POTENTIAL_AIM`, each distance in whole steps of `AIM_STEP`, summed and negated (0 at both aims). A measure not taken counts 0;
 * `withClassic` false (the tutorial slot, no limit on the classic party) leaves the classic one out; `classicAim` is a wall slot's
 * 45% instead of 80%.
 */
export const aimComfort = (
  m: RaidMeasures,
  withClassic = true,
  classicAim = CLASSIC_POTENTIAL_AIM,
): number => {
  const steps = (v: number, aim: number): number =>
    isMeasured(v) ? Math.round(Math.abs(v - aim) / AIM_STEP) * AIM_STEP : 0;
  return -(
    steps(m['prepared.potential'], PREPARED_POTENTIAL_AIM) +
    (withClassic ? steps(m['classic.potential'], classicAim) : 0)
  );
};
export const distanceOf = (n: Numbers, ref: Numbers): number =>
  NAMES.reduce((sum, k) => sum + Math.abs(Math.log(Math.max(1, n[k]) / Math.max(1, ref[k]))), 0) /
  NAMES.length;

/**
 * The fidelity a slot is measured at. The mixed server is a target on every slot (slot 1: `TUTORIAL_MIXED_KILL_MIN`, the others:
 * `MIXED_KILL_MIN`), so every pass takes it, with the draws the boss tuner's own pass of that level takes (`FIDELITY`).
 */
export function slotFidelity(_slot: number, quick: boolean, level: Level): Fidelity {
  const f = SLOT_FIDELITY(quick)[level];
  const own = FIDELITY(quick)[level];
  return { ...f, mixedDraws: own.mixedDraws, mixedWeekends: own.mixedWeekends };
}

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
            fidelity: slotFidelity(o.slot, o.quick, level),
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
        comfort:
          aimComfort(
            r.measures,
            targets.some((t) => t.measure === 'classic.potential'),
            trackSlot(o.slot, order).wall ? WALL_CLASSIC_POTENTIAL_AIM : CLASSIC_POTENTIAL_AIM,
          ) -
          NEAR_WEIGHT * distanceOf(fromPoint(p), reference),
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
    const plan = planPath({
      quick: o.quick,
      speeds: [TUNE_SPEED],
      kinds: ['dedicated'],
      table,
      determination: 'off',
    });
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

/** One slot's information measures as a row of the markdown table (`slotInfoMarkdown`). */
export interface SlotInfoRow {
  readonly slot: number;
  readonly bossId: string;
  readonly week: number;
  readonly info: SlotInfo;
}

/**
 * The information measures per slot (never targets): the classic party beside the mean and range of the rotated trios, the prepared
 * line at best levels, at middling ranks and with random talents, all as damage potential.
 */
export function slotInfoMarkdown(rows: readonly SlotInfoRow[]): string[] {
  const p = (x: number): string => `${Math.round(x * 100)}%`;
  const out = [
    '| Slot | Boss | Week | classic potential | rotated trios: mean (range) | prepared (best levels) | prepared at ranks 8-11 | prepared, random talents |',
    `| ${Array.from({ length: 8 }, () => '---').join(' | ')} |`,
  ];
  for (const r of rows) {
    const i = r.info;
    out.push(
      `| ${r.slot} | ${r.bossId} | ${r.week} | ${p(i.classic)} | ${p(i.trios.mean)} (${p(i.trios.min)} to ${p(i.trios.max)}) | ${p(i.prepared)} | ${p(i.middling)} | ${p(i.random)} |`,
    );
  }
  out.push(
    '',
    `(Potentials are damage over the boss's HP when it cannot die, at the expected speed. The rotated trios (${ROTATED_TRIOS.map((t) => t.id).join(', ')}) are decent unprepared parties of common forms with their first Knack; the classic party is one element mix. At ranks 8-11 each player fields their ${MIDDLING_FROM}th to ${MIDDLING_FROM + 3}th best creatures. Under a form's evolution level a creature fights as its stage 1 form.)`,
    '',
  );
  return out;
}

/** What a `slot-info` run needs: the slots to measure and the week of each (the path's arrival weeks), at the numbers of `table`. */
export interface SlotInfoPlanOptions {
  readonly weeks: readonly number[];
  readonly quick: boolean;
  readonly table?: SlotTable;
}

/**
 * The information measures at the slots' arrival weeks as a plan of `slot-eval` jobs (the full measurement of each slot at `table`'s
 * numbers, default `SLOT_NUMBERS`), for `--path`: slot `i + 1` is measured in week `weeks[i]`.
 */
export function planSlotInfo(o: SlotInfoPlanOptions): Plan<SlotInfoRow[]> {
  const table = o.table ?? SLOT_NUMBERS;
  const id = (slot: number): string => `slot-info:${slot}`;
  const jobs: JobSpec[] = o.weeks.map((week, i) => ({
    id: id(i + 1),
    section: 'Path: information measures',
    kind: 'slot-eval',
    args: {
      slot: i + 1,
      week,
      speed: TUNE_SPEED,
      numbers: slotNumbers(i + 1, table),
      fidelity: SLOT_FIDELITY(o.quick).final,
      salt: `slot:${i + 1}:final`,
    } satisfies SlotEvalArgs,
    needs: [],
  }));
  return {
    jobs,
    assemble: (results) =>
      o.weeks.flatMap((week, i) => {
        const info = (results.get(id(i + 1)) as SlotEvalResult | undefined)?.info;
        return info
          ? [{ slot: i + 1, bossId: trackSlot(i + 1).bossId, week, info } satisfies SlotInfoRow]
          : [];
      }),
  };
}

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

/** The `SLOT_WEEKS` line (`track.ts`) for the weeks the final table was tuned for, slots `first` to `last` (a full run, from slot 1, is the whole line). */
export function weeksPasteOf(weeks: readonly number[]): string {
  return `export const SLOT_WEEKS: readonly number[] = [${weeks.join(', ')}];`;
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
    '| Slot | Boss | Week | Rules | Cards | HP | Attack | Armour | prepared potential (written) | prepared potential (random) | prepared.share | first-weekend kill | prepared.beat2 | tool.share (info) | tool.written (info) | tool potential | tool target | classic potential | classic.kill | mixed potential / kill (target) / share / weekends to a kill | Misses | At the edge of the search |',
    `| ${Array.from({ length: 22 }, () => '---').join(' | ')} |`,
  );
  for (const s of r.slots) {
    const m = s.best.measures;
    const t = s.targets;
    const missed = s.best.misses.filter((x) => x.miss > 0).map((x) => x.target);
    const tool = t.find((x) => x.measure === 'tool.potential')?.min;
    const rules = trackSlot(s.slot).rules;
    out.push(
      `| ${s.slot} | ${s.bossId} | ${s.week} | ${rules.cards === 0 ? 'none' : rules.cards === undefined ? 'full' : `${rules.cards} card${rules.cards === 1 ? '' : 's'}`} | ${Math.round(trackSlot(s.slot).strengthBp / 100)}% | ${grouped(s.best.numbers.hp)} | ${s.best.numbers.atk} | ${s.best.numbers.armour} | ${(
        [
          'prepared.potential',
          'prepared.potentialRandom',
          'prepared.share',
          'prepared.written',
          'prepared.beat2',
          'tool.share',
          'tool.written',
        ] as const
      )
        .map((k) => cell(t, k, m))
        .join(
          ' | ',
        )} | ${cell(t, 'tool.potential', m)} | ${tool === undefined ? 'none' : `≥ ${pct(tool)}`} | ${cell(t, 'classic.potential', m)} | ${cell(t, 'classic.kill', m)} | ${pct(m['mixed.potential'])} / ${cell(t, 'mixed.kill', m)} / ${pct(m['mixed.share'])} / ${weeksText(m['mixed.kill'])} | ${missed.length ? missed.join('; ') : 'none'} | ${s.atEdge.length ? s.atEdge.join(', ') : '-'} |`,
    );
  }
  out.push(
    '',
    '(A value in bold misses its target, as measured at the expected speed. Slot 1 is the tutorial boss: no rule cards, no limit on the classic party, no tool target and one more target, that the mixed server kills it in 80% of weekends or more (every other slot asks the mixed server to kill within three weekends in half of its runs, a kill rate of 21% or more, with a weight below the rest; the tool target is in points of potential, `toolPotentialMinAt`; the HP-share tool measures are information only on the track); slot 2 has one card. Potentials are the mean damage dealt over the boss’s HP when the boss cannot die; the written talents are the solved puzzle. The values are from the full measurement of the proposal.)',
    '',
  );
  const infoRows = r.slots.flatMap((x) =>
    x.best.info
      ? [{ slot: x.slot, bossId: x.bossId, week: x.week, info: x.best.info } satisfies SlotInfoRow]
      : [],
  );
  if (infoRows.length)
    out.push('### Information measures (not targets)', '', ...slotInfoMarkdown(infoRows));
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
    '### Paste into `SLOT_NUMBERS` and `SLOT_WEEKS` (`track.ts`)',
    '',
    '```ts',
    ...pasteOf(r.loop.table, o.first, o.last),
    '',
    weeksPasteOf(r.loop.weeks),
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
  profile: RosterProfile = VALLEY_ROSTER,
): KillPoint[] {
  const out: KillPoint[] = [];
  const count = Math.round((o.to - o.from) / o.step);
  for (let i = 0; i <= count; i++) {
    const factor = o.from + i * o.step;
    const hp = Math.round((numbers.hp * factor) / 100) * 100;
    const boss = slotBoss(slot, { table: { [slot]: { ...numbers, hp } } });
    const { line } = slotPreparedOf(slot);
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
