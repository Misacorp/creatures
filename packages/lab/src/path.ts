/**
 * The path simulator: where a server is at week N of the boss track, and how long it stays there (`docs/design/combat/boss-track.md`).
 *
 * A server is a mix of player kinds and a roster speed. Week by week from 1 to 24 its roster (`roster.ts`) fights the boss of its
 * current slot (`track.ts`) over one raid weekend: a kill moves it to the next slot, a loss keeps the slot and the boss returns next
 * week at full HP (Misa, 2026-10-30). Every `FESTIVAL_EVERY`-th week is a Festival (`docs/design/progression.md`, "The ladder rule"
 * and "Relief on a schedule"): the boss of the server's slot waits and nothing is fought. After it the server continues where it
 * was: the boss it failed the week before returns, or the next one in line if it had won (Misa, 2026-10-30: no rank ease after a
 * Festival; the shipped game's ease by one is dropped).
 *
 * `walkPath` is the pure walk with an injected fight; `weekendKill` is the real fight; `planPath` runs many seeded servers on the job
 * pool (`jobs.ts`) and `summarisePath` turns them into the report's table.
 */
import { createSeededRng } from '@creatures/game';
import { randomTalents } from './answerMeasure';
import {
  columnOf,
  casualColumn,
  limitCopies,
  toolColumns,
  wideBoss,
  BUILDER_MAX_COPIES,
  MIXED_ORDER,
  type PlayerKind,
} from './raidMeasure';
import { raidBench, weekendStatsOf } from './bosses';
import type { JobResults, JobSpec, Plan } from './jobs';
import {
  ROSTER_WEEKS,
  levelledColumn,
  rosterLevels,
  type RosterKind,
  type RosterProfile,
  type RosterSpeed,
} from './roster';
import { VALLEY_ROSTER } from './valley';
import { LEVEL, type Pick } from './search';
import { TRACK_ORDER, slotBoss, slotPreparedOf, trackSlot, type SlotTable } from './track';
import type { BossDef, Placement } from './types';

/**
 * A Festival every 5th week: no raid that week, the track waits. The Festival clock is the server's age in weeks, counted from week 1,
 * the server's first raid week: weeks 5, 10, 15 and 20 fight nothing, whatever slot the server is on. A server that wins slot 4 in
 * week 4 has slot 5 as its slot in the Festival week and fights it first in week 6.
 */
export const FESTIVAL_EVERY = 5;
/** The slots the track eases back after a Festival: none (Misa, 2026-10-30). `walkPath` can still be asked for more, for a comparison. */
export const FESTIVAL_EASE = 0;
/** The shipped balance target: at most this share of servers is stuck for more than `STUCK_WEEKS` weeks (weekends to a first kill) on one boss. */
export const STUCK_WEEKS = 4;
export const STUCK_SHARE_MAX = 0.1;

/**
 * Determination (Misa, 2026-10-30; after WoW's, +5% a wipe, at most 10 stacks): a dial of the path, OFF BY DEFAULT. Each failed
 * weekend on the same boss gives the server `stackBp` more damage and healing, at most `maxStacks` stacks, and a kill resets it.
 * A Festival week (no weekend) changes nothing. The track tuner never uses it (`trackTuner.ts`); `--path --determination` shows
 * the path with it beside the path without it.
 */
export interface Determination {
  /** Damage and healing, in bp, for each stack. */
  readonly stackBp: number;
  readonly maxStacks: number;
}

/** The default: +5% damage and healing a stack, at most 10 stacks (+50%). */
export const DETERMINATION: Determination = { stackBp: 500, maxStacks: 10 };

// ---------- the walk ----------

/** One server's 24 weeks. */
export interface ServerPath {
  /** The slot the server fought in each week (index 0 is week 1); 0 for a Festival week. */
  readonly fought: readonly number[];
  /** Whether the weekend was a kill (false for a Festival week). */
  readonly won: readonly boolean[];
  /**
   * The week each slot was first fought (index 0 is slot 1: week 1); 0 for a slot never fought. A slot won in the week before a
   * Festival is first fought after it (a server that reaches slot 5 in week 5 fights it in week 6), so this is the week of the
   * first fight, not the week the slot became the server's.
   */
  readonly reached: readonly number[];
  /** The weekends fought against each slot (index 0 is slot 1), re-fights included (a Festival moves nobody back). */
  readonly weekends: readonly number[];
  /**
   * The weekends it took to kill each slot's boss for the first time, counting the kill itself (index 0 is slot 1; 1 is a kill at the
   * first try); for a slot it never killed, the weekends fought so far. A Festival week in between is a week the boss waits and is not counted.
   */
  readonly attempts: readonly number[];
  /** The most of those: the longest run on one boss. */
  readonly longestRun: number;
}

/**
 * What a path run may change besides the roster: the per-slot numbers it fights (default `SLOT_NUMBERS`; the tuner passes its
 * proposals this way, also to worker threads, which do not share memory).
 */
export interface PathRun {
  readonly table?: SlotTable;
  /** Play the path with Determination (off by default). */
  readonly determination?: Determination;
}

export interface WalkOptions {
  readonly weeks?: number;
  readonly festivalEvery?: number;
  readonly festivalEase?: number;
  /** Determination's cap: the fight is told its stacks (failed weekends on this boss since the last kill, at most this many). Absent: always 0. */
  readonly determinationStacks?: number;
}

/**
 * A fight: whether the server killed the boss of `slot` in the weekend of `week`, with `stacks` Determination stacks (0 unless the
 * walk is given `determinationStacks`; the fight turns the stacks into damage and healing).
 */
export type Fight = (slot: number, week: number, stacks: number) => boolean;

/**
 * Plays one server: slot 1 in week 1, a kill moves on, a loss stays, a Festival week fights nothing (and eases the slot after it by `festivalEase`, none by default).
 * "The longest run on one boss" is the most weekends it took to kill one boss for the first time (`attempts`): a server that lost
 * four lost weekends and won the fifth ran five.
 * With `determinationStacks` each lost weekend on the boss of the slot adds a stack for the next fight there (up to the cap), and a
 * kill clears them; a Festival week keeps them.
 */
export function walkPath(fight: Fight, options: WalkOptions = {}): ServerPath {
  const weeks = options.weeks ?? ROSTER_WEEKS;
  const every = options.festivalEvery ?? FESTIVAL_EVERY;
  const ease = options.festivalEase ?? FESTIVAL_EASE;
  const fought: number[] = [];
  const won: boolean[] = [];
  const reached: number[] = [];
  const weekends: number[] = [0];
  const attempts: number[] = [0];
  const killed = new Set<number>();
  const cap = options.determinationStacks ?? 0;
  let failed = 0;
  let slot = 1;
  let furthest = 1;
  for (let week = 1; week <= weeks; week++) {
    if (every > 0 && week % every === 0) {
      fought.push(0);
      won.push(false);
      slot = Math.max(1, slot - ease);
      continue;
    }
    // The arrival week of a slot is the first week it is fought: a slot won in the week before a Festival is fought after it.
    if (!reached[slot - 1]) reached[slot - 1] = week;
    furthest = Math.max(furthest, slot);
    const win = fight(slot, week, Math.min(cap, failed));
    fought.push(slot);
    won.push(win);
    weekends[slot - 1] = (weekends[slot - 1] ?? 0) + 1;
    if (!killed.has(slot)) attempts[slot - 1] = (attempts[slot - 1] ?? 0) + 1;
    failed = win ? 0 : failed + 1;
    if (win) {
      killed.add(slot);
      slot++;
    }
  }
  const out = Array.from({ length: furthest }, (_, i) => reached[i] ?? 0);
  const tries = Array.from({ length: furthest }, (_, i) => attempts[i] ?? 0);
  return {
    fought,
    won,
    reached: out,
    weekends: Array.from({ length: furthest }, (_, i) => weekends[i] ?? 0),
    attempts: tries,
    longestRun: Math.max(0, ...tries),
  };
}

// ---------- the servers ----------

/** What a player of a path server does with the boss: brings its prepared line, builds an answer, or brings their best creatures. */
export type PlayerRole = 'prepared' | 'builder' | 'casual';

export interface PathPlayer {
  readonly role: PlayerRole;
  /** Whose roster it is (`roster.ts`). */
  readonly roster: RosterKind;
  readonly joinWeek?: number;
  /**
   * A prepared player's talents: the line's written ones (the solved puzzle: default), or random legal ones, drawn for the player
   * and the slot (a player who builds the line from what they rolled).
   */
  readonly talents?: 'written' | 'random';
}

export interface PathServer {
  readonly id: 'dedicated' | 'mixed' | 'builders';
  readonly players: readonly PathPlayer[];
}

/** A dedicated server: 4 daily players, each on a column of the boss's prepared line. */
export const DEDICATED: PathServer = {
  id: 'dedicated',
  players: Array.from({ length: 4 }, () => ({ role: 'prepared', roster: 'daily' }) as const),
};

/**
 * The mapping from the mixed server's kinds (`MIXED_ORDER`: 2 min-maxers, 3 builders, 5 casual players) to the roster's: the
 * min-maxers and builders read the boss and play every day (daily players: prepared columns, builders with at most two copies
 * of a form); the casual players play about once a week (weekly players: their best creatures by level, random forms, no Knack).
 */
export const MIXED: PathServer = {
  id: 'mixed',
  players: MIXED_ORDER.map((k: PlayerKind): PathPlayer => {
    if (k === 'm') return { role: 'prepared', roster: 'daily' };
    if (k === 'b') return { role: 'builder', roster: 'daily' };
    return { role: 'casual', roster: 'weekly' };
  }),
};

/**
 * A builder server (information, design panel 6): four daily players who field the slot's prepared line, each creature with a random
 * legal talent instead of the written one. It shows whether a wall, such as Thornmother's at slot 5, stops anyone who has the line's
 * forms and Knacks but not its talents. The path report prints it with the other servers (`--path`); the track tuner never plays it.
 */
export const BUILDERS: PathServer = {
  id: 'builders',
  players: Array.from({ length: 4 }, (): PathPlayer => ({
    role: 'prepared',
    roster: 'daily',
    talents: 'random',
  })),
};

export const PATH_SERVERS: readonly PathServer[] = [DEDICATED, MIXED, BUILDERS];
/** The kinds of server a path plan plays unless told otherwise (the builder server is asked for: `--path` does). */
export const DEFAULT_PATH_KINDS: readonly PathServer['id'][] = ['dedicated', 'mixed'];

/** The placements, bench and boss of one server's weekend: everyone's creatures at their roster's levels in that week. */
export function serverWeekend(
  server: PathServer,
  slot: number,
  week: number,
  speed: RosterSpeed,
  seed: string,
  profile: RosterProfile = VALLEY_ROSTER,
  run: PathRun = {},
): { boss: BossDef; placements: Placement[]; bench: Placement[] } {
  const base = slotBoss(slot, run.table ? { table: run.table } : {});
  const rows = base.rows;
  const { line, core } = slotPreparedOf(slot);
  const boss = server.players.length === base.cols ? base : wideBoss(base, server.players.length);
  const whole = server.players.length === base.cols;
  let m = 0;
  let b = 0;
  const placements: Placement[] = [];
  const bench: Placement[] = [];
  server.players.forEach((p, c) => {
    // One more creature than the column holds: the bench's.
    const levels = rosterLevels(profile, p.roster, week, speed, rows + 1, p.joinWeek);
    let column: Pick[];
    if (p.role === 'prepared') {
      // A server with a player for every column fields the line as written; a wider or narrower one takes the tool's columns first.
      column = columnOf(
        line,
        base.cols,
        whole ? c : (toolColumns(line, base.cols, core)[m++ % base.cols] as number),
      );
      if (p.talents === 'random')
        column = randomTalents(createSeededRng(`path:${seed}:talents:${slot}:${c}`), column);
    } else if (p.role === 'builder')
      column = limitCopies(
        columnOf(line, base.cols, toolColumns(line, base.cols, core)[b++ % base.cols] as number),
        BUILDER_MAX_COPIES,
        line,
      );
    else column = casualColumn(createSeededRng(`path:${seed}:casual:${c}`), rows, 'top3', LEVEL);
    levelledColumn(column, levels).forEach((pick, r) =>
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
      ...raidBench(1, levels[rows] ?? levels[levels.length - 1] ?? 1).map((x) => ({
        ...x,
        owner: `p${c + 1}`,
      })),
    );
  });
  return { boss, placements, bench };
}

/** Whether the server killed the boss of `slot` in one weekend of `week` (seeded by the server and the week). */
export function weekendKill(
  server: PathServer,
  slot: number,
  week: number,
  speed: RosterSpeed,
  seed: string,
  profile: RosterProfile = VALLEY_ROSTER,
  run: PathRun = {},
  stacks = 0,
): boolean {
  const { boss, placements, bench } = serverWeekend(server, slot, week, speed, seed, profile, run);
  const determinationBp = run.determination ? stacks * run.determination.stackBp : 0;
  return (
    weekendStatsOf(boss, placements, bench, 1, `path:${seed}:w${week}`, { determinationBp })
      .winRate === 1
  );
}

/** One server of the kind, seeded by its index (the same servers at every speed, so the speeds compare on equal luck). */
export function pathOf(
  server: PathServer,
  speed: RosterSpeed,
  index: number,
  profile: RosterProfile = VALLEY_ROSTER,
  run: PathRun = {},
): ServerPath {
  const seed = `${server.id}:${index}`;
  return walkPath(
    (slot, week, stacks) => weekendKill(server, slot, week, speed, seed, profile, run, stacks),
    run.determination ? { determinationStacks: run.determination.maxStacks } : {},
  );
}

// ---------- the summary ----------

export interface Spread {
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
}

/** A quantile of a sorted list (nearest rank). */
const quantile = (sorted: readonly number[], q: number): number =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? 0;

export const spreadOf = (xs: readonly number[]): Spread => {
  const s = [...xs].sort((a, b) => a - b);
  return { median: quantile(s, 0.5), p25: quantile(s, 0.25), p75: quantile(s, 0.75) };
};

export interface SlotSummary {
  readonly slot: number;
  readonly bossId: string;
  /** The share of servers that reached the slot within the weeks. */
  readonly reachedShare: number;
  /** The week the servers that reached it first fought it (a Festival week is never one). */
  readonly week: Spread;
  /** The weekends fought against it, over the servers that reached it. */
  readonly weekends: Spread;
  /** The mean of the same. */
  readonly weekendsMean: number;
}

export interface PathSummary {
  readonly server: string;
  readonly speed: RosterSpeed;
  readonly servers: number;
  readonly slots: readonly SlotSummary[];
  /** The longest run on one boss, in weekends to a first kill: median and worst over the servers. */
  readonly longestRun: { readonly median: number; readonly max: number };
  /** The share of servers whose longest run is more than `STUCK_WEEKS` weekends. */
  readonly stuckShare: number;
}

/** The report's numbers for one kind of server at one speed. */
export function summarisePath(
  server: string,
  speed: RosterSpeed,
  paths: readonly ServerPath[],
  order: readonly string[] = TRACK_ORDER,
): PathSummary {
  const top = Math.max(0, ...paths.map((p) => p.reached.length));
  const slots: SlotSummary[] = Array.from({ length: top }, (_, i) => {
    const who = paths.filter((p) => (p.reached[i] ?? 0) > 0);
    const weekends = who.map((p) => p.weekends[i] ?? 0);
    return {
      slot: i + 1,
      bossId: trackSlot(i + 1, order).bossId,
      reachedShare: who.length / paths.length,
      week: spreadOf(who.map((p) => p.reached[i] as number)),
      weekends: spreadOf(weekends),
      weekendsMean: weekends.reduce((a, b) => a + b, 0) / Math.max(1, weekends.length),
    };
  });
  const runs = paths.map((p) => p.longestRun);
  return {
    server,
    speed,
    servers: paths.length,
    slots,
    longestRun: { median: spreadOf(runs).median, max: Math.max(0, ...runs) },
    stuckShare: paths.filter((p) => p.longestRun > STUCK_WEEKS).length / paths.length,
  };
}

const pct = (x: number): string => `${Math.round(100 * x)}%`;
const weekCell = (s: SlotSummary): string =>
  s.reachedShare === 0
    ? '-'
    : `${s.week.median} (${s.week.p25}-${s.week.p75})${s.reachedShare < 1 ? `, ${pct(s.reachedShare)} reach` : ''}`;

/** The markdown of one speed: a table of the week each slot is first fought and the weekends spent on it, dedicated and mixed side by side, then the stuck share. */
export function pathMarkdown(
  speed: RosterSpeed,
  summaries: readonly PathSummary[],
  label = '',
): string[] {
  const rows = Math.max(0, ...summaries.map((s) => s.slots.length));
  const lines = [
    `### Boss track at the ${speed} roster speed${label}`,
    '',
    `| Slot | Boss | ${summaries.map((s) => `${s.server}: week first fought | ${s.server}: weekends`).join(' | ')} |`,
    `| --- | --- | ${summaries.map(() => '--- | ---').join(' | ')} |`,
  ];
  for (let i = 0; i < rows; i++) {
    const first = summaries.find((s) => s.slots[i])?.slots[i] as SlotSummary;
    const cells = summaries.map((s) => {
      const x = s.slots[i];
      return x
        ? `${weekCell(x)} | ${x.weekends.median} (mean ${x.weekendsMean.toFixed(1)})`
        : '- | -';
    });
    lines.push(`| ${first.slot} | ${first.bossId} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  for (const s of summaries)
    lines.push(
      `- ${s.server} (${s.servers} servers): longest run on one boss ${s.longestRun.median} weekends (worst ${s.longestRun.max}); stuck more than ${STUCK_WEEKS} weekends on one boss: ${pct(s.stuckShare)} (target at most ${pct(STUCK_SHARE_MAX)}).`,
    );
  lines.push('');
  return lines;
}

// ---------- the plan: servers as jobs ----------

export interface PathJobArgs extends PathRun {
  readonly server: PathServer['id'];
  readonly speed: RosterSpeed;
  readonly index: number;
}

export const pathJobId = (a: PathJobArgs): string => `path:${a.server}:${a.speed}:${a.index}`;

/** The run options of job args or plan options (the table, when given). */
const runOf = (a: PathRun): PathRun => ({
  ...(a.table ? { table: a.table } : {}),
  ...(a.determination ? { determination: a.determination } : {}),
});

/** What a `path-server` job runs. */
export const runPathJob = (args: unknown): ServerPath => {
  const a = args as PathJobArgs;
  const server = PATH_SERVERS.find((s) => s.id === a.server);
  if (!server) throw new Error(`unknown path server ${a.server}`);
  return pathOf(server, a.speed, a.index, VALLEY_ROSTER, runOf(a));
};

export interface PathPlanOptions extends PathRun {
  readonly quick: boolean;
  readonly speeds?: readonly RosterSpeed[];
  /** Only these kinds of server (default: the dedicated and the mixed server, `DEFAULT_PATH_KINDS`). */
  readonly kinds?: readonly PathServer['id'][];
  /** Servers of each kind, instead of `pathServers(quick)` (the tests use a few). */
  readonly servers?: number;
}

/** Servers of each kind: 40 for the full report, 8 for the quick one. */
export const pathServers = (quick: boolean): number => (quick ? 8 : 40);

export interface PathReport {
  readonly md: string[];
  readonly data: readonly PathSummary[];
}

/** One job per server (kind, speed, index), so every core stays busy; the markdown is assembled from the results in a fixed order. */
export function planPath(options: PathPlanOptions): Plan<PathReport> {
  const speeds = options.speeds ?? ['expected'];
  const n = options.servers ?? pathServers(options.quick);
  const wanted = options.kinds ?? DEFAULT_PATH_KINDS;
  const kinds = PATH_SERVERS.filter((s) => wanted.includes(s.id));
  const cells = speeds.flatMap((speed) => kinds.map((s) => ({ speed, server: s.id })));
  const jobs: JobSpec[] = cells.flatMap((c) =>
    Array.from({ length: n }, (_, index) => {
      const args: PathJobArgs = { ...c, index, ...runOf(options) };
      return {
        id: pathJobId(args),
        section: `Path: ${c.server}, ${c.speed}`,
        kind: 'path-server',
        args,
        needs: [],
      };
    }),
  );
  return {
    jobs,
    assemble: (results: JobResults): PathReport => {
      const data = cells.map((c) =>
        summarisePath(
          c.server,
          c.speed,
          Array.from(
            { length: n },
            (_, index) => results.get(pathJobId({ ...c, index })) as ServerPath,
          ),
        ),
      );
      const md = speeds.flatMap((speed) =>
        pathMarkdown(
          speed,
          data.filter((d) => d.speed === speed),
          options.determination
            ? ` with Determination (+${options.determination.stackBp / 100}% a failed week, at most ${options.determination.maxStacks} stacks)`
            : '',
        ),
      );
      return { md, data };
    },
  };
}
