/**
 * The path simulator: where a server is at week N of the boss track, and how long it stays there (`docs/design/combat/boss-track.md`).
 *
 * A server is a mix of player kinds and a roster speed. Week by week from 1 to 24 its roster (`roster.ts`) fights the boss of its
 * current slot (`track.ts`) over one raid weekend: a kill moves it to the next slot, a loss keeps the slot and the boss returns next
 * week at full HP (Misa, 2026-10-30). Every `FESTIVAL_EVERY`-th week is a Festival (`docs/design/progression.md`, "The ladder rule"
 * and "Relief on a schedule"): the boss of the server's slot waits, nothing is fought, and the slot eases by `FESTIVAL_EASE` after
 * it (never below 1). The shipped Festival boss fights at rank - 3 and a win does not raise the rank, so it never moves the track.
 *
 * `walkPath` is the pure walk with an injected fight; `weekendKill` is the real fight; `planPath` runs many seeded servers on the job
 * pool (`jobs.ts`) and `summarisePath` turns them into the report's table.
 */
import { createSeededRng } from '@creatures/game';
import { preparedOf } from './tuner';
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
  PLACEHOLDER_ROSTER,
  ROSTER_WEEKS,
  levelledColumn,
  rosterLevels,
  type RosterKind,
  type RosterProfile,
  type RosterSpeed,
} from './roster';
import { LEVEL, type Pick } from './search';
import { TRACK_ORDER, slotBoss, trackSlot } from './track';
import type { BossDef, Placement } from './types';

/** The shipped Festival: every 5th week, the server's slot eases by 1 after it. */
export const FESTIVAL_EVERY = 5;
export const FESTIVAL_EASE = 1;
/** The shipped balance target: at most this share of servers is stuck for more than `STUCK_WEEKS` weeks (weekends to a first kill) on one boss. */
export const STUCK_WEEKS = 4;
export const STUCK_SHARE_MAX = 0.1;

// ---------- the walk ----------

/** One server's 24 weeks. */
export interface ServerPath {
  /** The slot the server fought in each week (index 0 is week 1); 0 for a Festival week. */
  readonly fought: readonly number[];
  /** Whether the weekend was a kill (false for a Festival week). */
  readonly won: readonly boolean[];
  /** The week each slot first became the server's slot (index 0 is slot 1: week 1); 0 for a slot it never reached. */
  readonly reached: readonly number[];
  /** The weekends fought against each slot (index 0 is slot 1), re-fights after a Festival's ease included. */
  readonly weekends: readonly number[];
  /**
   * The weekends it took to kill each slot's boss for the first time, counting the kill itself (index 0 is slot 1; 1 is a kill at the
   * first try); for a slot it never killed, the weekends fought so far. A Festival week in between is a week the boss waits and is not counted.
   */
  readonly attempts: readonly number[];
  /** The most of those: the longest run on one boss. */
  readonly longestRun: number;
}

export interface WalkOptions {
  readonly weeks?: number;
  readonly festivalEvery?: number;
  readonly festivalEase?: number;
}

/** A fight: whether the server killed the boss of `slot` in the weekend of `week`. */
export type Fight = (slot: number, week: number) => boolean;

/**
 * Plays one server: slot 1 in week 1, a kill moves on, a loss stays, a Festival week fights nothing and eases the slot after it.
 * "The longest run on one boss" is the most weekends it took to kill one boss for the first time (`attempts`): a server that lost
 * four weekends and won the fifth ran five.
 */
export function walkPath(fight: Fight, options: WalkOptions = {}): ServerPath {
  const weeks = options.weeks ?? ROSTER_WEEKS;
  const every = options.festivalEvery ?? FESTIVAL_EVERY;
  const ease = options.festivalEase ?? FESTIVAL_EASE;
  const fought: number[] = [];
  const won: boolean[] = [];
  const reached: number[] = [1];
  const weekends: number[] = [0];
  const attempts: number[] = [0];
  const killed = new Set<number>();
  let slot = 1;
  let furthest = 1;
  for (let week = 1; week <= weeks; week++) {
    if (every > 0 && week % every === 0) {
      fought.push(0);
      won.push(false);
      slot = Math.max(1, slot - ease);
      continue;
    }
    const win = fight(slot, week);
    fought.push(slot);
    won.push(win);
    weekends[slot - 1] = (weekends[slot - 1] ?? 0) + 1;
    if (!killed.has(slot)) attempts[slot - 1] = (attempts[slot - 1] ?? 0) + 1;
    if (win) {
      killed.add(slot);
      slot++;
      // The new slot is the server's from the next week (a kill in the last week reaches nothing within the weeks).
      if (slot > furthest && week < weeks) {
        furthest = slot;
        reached[slot - 1] = week + 1;
      }
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
}

export interface PathServer {
  readonly id: 'dedicated' | 'mixed';
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

export const PATH_SERVERS: readonly PathServer[] = [DEDICATED, MIXED];

/** The placements, bench and boss of one server's weekend: everyone's creatures at their roster's levels in that week. */
export function serverWeekend(
  server: PathServer,
  slot: number,
  week: number,
  speed: RosterSpeed,
  seed: string,
  profile: RosterProfile = PLACEHOLDER_ROSTER,
): { boss: BossDef; placements: Placement[]; bench: Placement[] } {
  const base = slotBoss(slot);
  const rows = base.rows;
  const { line, core } = preparedOf(base.id);
  const boss = server.players.length === base.cols ? base : wideBoss(base, server.players.length);
  let m = 0;
  let b = 0;
  const placements: Placement[] = [];
  const bench: Placement[] = [];
  server.players.forEach((p, c) => {
    // One more creature than the column holds: the bench's.
    const levels = rosterLevels(profile, p.roster, week, speed, rows + 1, p.joinWeek);
    let column: Pick[];
    if (p.role === 'prepared')
      column = columnOf(
        line,
        base.cols,
        toolColumns(line, base.cols, core)[m++ % base.cols] as number,
      );
    else if (p.role === 'builder')
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
  profile: RosterProfile = PLACEHOLDER_ROSTER,
): boolean {
  const { boss, placements, bench } = serverWeekend(server, slot, week, speed, seed, profile);
  return weekendStatsOf(boss, placements, bench, 1, `path:${seed}:w${week}`).winRate === 1;
}

/** One server of the kind, seeded by its index (the same servers at every speed, so the speeds compare on equal luck). */
export function pathOf(
  server: PathServer,
  speed: RosterSpeed,
  index: number,
  profile: RosterProfile = PLACEHOLDER_ROSTER,
): ServerPath {
  const seed = `${server.id}:${index}`;
  return walkPath((slot, week) => weekendKill(server, slot, week, speed, seed, profile));
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
  /** The week the servers that reached it first had it as their slot. */
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

/** The markdown of one speed: a table of the week each slot is reached and the weekends spent on it, dedicated and mixed side by side, then the stuck share. */
export function pathMarkdown(speed: RosterSpeed, summaries: readonly PathSummary[]): string[] {
  const rows = Math.max(0, ...summaries.map((s) => s.slots.length));
  const lines = [
    `### Boss track at the ${speed} roster speed`,
    '',
    `| Slot | Boss | ${summaries.map((s) => `${s.server}: week reached | ${s.server}: weekends`).join(' | ')} |`,
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

export interface PathJobArgs {
  readonly server: PathServer['id'];
  readonly speed: RosterSpeed;
  readonly index: number;
}

export const pathJobId = (a: PathJobArgs): string => `path:${a.server}:${a.speed}:${a.index}`;

/** What a `path-server` job runs. */
export const runPathJob = (args: unknown): ServerPath => {
  const a = args as PathJobArgs;
  const server = PATH_SERVERS.find((s) => s.id === a.server);
  if (!server) throw new Error(`unknown path server ${a.server}`);
  return pathOf(server, a.speed, a.index);
};

export interface PathPlanOptions {
  readonly quick: boolean;
  readonly speeds?: readonly RosterSpeed[];
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
  const cells = speeds.flatMap((speed) => PATH_SERVERS.map((s) => ({ speed, server: s.id })));
  const jobs: JobSpec[] = cells.flatMap((c) =>
    Array.from({ length: n }, (_, index) => {
      const args: PathJobArgs = { ...c, index };
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
        ),
      );
      return { md, data };
    },
  };
}
