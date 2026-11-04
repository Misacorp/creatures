/**
 * The dungeon over days (phase 5, step 3, `docs/design/combat/balance.md` section 2 item 4): each player of a journey server runs the
 * daily dungeon on the v2 rooms over weeks 1 to 24, at the levels of the valley's roster profile for that week and roster kind.
 *
 * The rules are the game's, through `runMap` (`dungeon.ts`): the day's map, only HP carried between rooms, a knocked-out creature out until a
 * camp swaps it, the camp's choice, the Undercroft (from depth 8) with the worker's descent (the standing recover, a fallen creature stays
 * out: `descentBreathOf`) and a next level only where the keeper's floor is cracked. The progress is the worker's: one run a day at most,
 * plus a retry on the first day a player ever ran if it ended in a defeat; a **clear** (the floor boss beaten) locks in depth + 1, a defeat
 * leaves the depth where it is, and the Undercroft adds no depth (`dungeon-finish.ts`: `cleared ? depth + 1 : depth`).
 *
 * Players (`habits.ts`): who runs how often (daily players every day; weekly players 2 or 3 days a week, Misa 2026-11-04), whether they plan
 * (prepared players and builders pick rooms and bring a bench, casual players take the first exit), and how healthy a team is to descend.
 * A team is the journey's: prepared and builder players field the lab's all-round line (`ALL_ROUND_TEAM`, the board's best for the dungeon)
 * and its bench, builders roll their talents from the pool; a casual player's best three creatures, no Knack. Levels come from the roster
 * (`levelledColumn`), talents and Knacks from the habits' policies. Everything is seeded: the same server, speed and index repeat.
 *
 * What it leaves out: the loot, experience and gear (the valley's loop), and what `dungeon.ts` leaves out (room modifiers, doors, marks).
 */
import { createSeededRng, int } from '@creatures/game';
import { ALL_ROUND_BENCH, ALL_ROUND_TEAM, runMap, type RunOptions } from './dungeon';
import {
  DESCEND_ABOVE,
  HABITS,
  shuffled,
  talentSlotsFor,
  withKnackPolicy,
  withTalentPolicy,
  type Habits,
} from './habits';
import type { JobResults, JobSpec, Plan } from './jobs';
import { JOURNEY_SERVERS, presentIn, type JourneyServer } from './journey';
import type { PlayerRole } from './path';
import { casualColumn } from './raidMeasure';
import {
  ROSTER_SPEEDS,
  ROSTER_WEEKS,
  levelledColumn,
  rosterLevels,
  type RosterKind,
  type RosterProfile,
  type RosterSpeed,
} from './roster';
import { LEVEL, type Pick } from './search';
import { VALLEY_ROSTER } from './valley';

/** The creatures of a dungeon team (the row). */
export const TEAM_SIZE = 3;

/** One run of a player. */
export interface DayRun {
  /** The calendar week (1 to 24). */
  readonly week: number;
  /** The depth it ran at. */
  readonly depth: number;
  readonly cleared: boolean;
  /** The floor boss fell at a depth that opens the Undercroft (the descent was offered). */
  readonly offered: boolean;
  /** Undercroft levels entered, and keepers beaten. */
  readonly entered: number;
  readonly keepers: number;
  /** Fights played (a lost one included), creatures knocked out at the end. */
  readonly played: number;
  readonly knockouts: number;
  /** The player's first week (the runs of the first seven days of their time). */
  readonly firstWeek: boolean;
  /** Milliseconds the run took (a side note: the clock, so the one number that is not repeatable). */
  readonly ms: number;
}

export interface PlayerDays {
  readonly role: PlayerRole;
  readonly roster: RosterKind;
  /** The depth the next run fights at, at the end of each week (index 0: week 1; a player not there yet: 0). */
  readonly depthEnd: number[];
  readonly runs: DayRun[];
}

/** The days of a week (0 to 6) a player runs on in `week`: a seeded count in the habit's range, on seeded days, in order. */
export function runDays(habits: Habits, roster: RosterKind, seed: string, week: number): number[] {
  const { min, max } = habits.dungeonRuns[roster];
  const rng = createSeededRng(`days:${seed}:w${week}`);
  const count = Math.min(7, min + int(rng, max - min + 1));
  return shuffled(rng, [0, 1, 2, 3, 4, 5, 6])
    .slice(0, count)
    .sort((a, b) => a - b);
}

/**
 * A player's team and bench in a week: the line (the all-round team and its bench, or a casual player's best three) at the roster's levels,
 * with the habits' Knack and talent policies. The bench is empty for a casual player (they do not swap).
 */
export function teamOf(
  who: { role: PlayerRole; roster: RosterKind; joinWeek?: number },
  c: number,
  week: number,
  speed: RosterSpeed,
  seed: string,
  profile: RosterProfile,
  habits: Habits,
): { team: Pick[]; bench: Pick[] } {
  const casual = who.role === 'casual';
  const line: Pick[] = casual
    ? casualColumn(createSeededRng(`dd:${seed}:casual:${c}`), TEAM_SIZE, 'top3', LEVEL)
    : [...ALL_ROUND_TEAM, ...ALL_ROUND_BENCH];
  const levels = rosterLevels(profile, who.roster, week, speed, line.length, who.joinWeek);
  const owner = `p${c + 1}`;
  const placed = levelledColumn(line, levels).map((p, i): Pick => {
    const level = p.level ?? 1;
    const base = withKnackPolicy(
      {
        owner,
        formId: p.formId,
        level,
        knack: p.knack,
        ...(p.talents ? { talents: p.talents } : {}),
        row: 0,
        col: i % TEAM_SIZE,
      },
      habits.knacks[who.role],
    );
    const slots = talentSlotsFor(profile, who.roster, week, who.joinWeek, p.formId, level);
    const pol = withTalentPolicy(
      base,
      habits.talents[who.role],
      slots,
      habits.golden,
      `${seed}:${owner}:${p.formId}:${i}`,
    );
    return {
      formId: pol.formId,
      knack: pol.knack ?? 'none',
      level: pol.level,
      ...(pol.talents ? { talents: pol.talents } : {}),
      ...(pol.goldenTalents ? { goldenTalents: pol.goldenTalents } : {}),
    };
  });
  return { team: placed.slice(0, TEAM_SIZE), bench: casual ? [] : placed.slice(TEAM_SIZE) };
}

/**
 * Every player's dungeon over `weeks` weeks (default 24). Each week a player's runs fall on their seeded days; a run is `runMap` at the
 * player's depth, the progress is the worker's (see the file comment).
 */
export function dungeonDaysOf(
  server: JourneyServer,
  speed: RosterSpeed,
  index: number,
  profile: RosterProfile = VALLEY_ROSTER,
  habits: Habits = HABITS,
  weeks: number = ROSTER_WEEKS,
): PlayerDays[] {
  const seed = `${server.id}:${speed}:${index}`;
  return server.players.map((who, c) => {
    const owner = `p${c + 1}`;
    const firstWeek = who.joinWeek ?? 1;
    const log: PlayerDays = { role: who.role, roster: who.roster, depthEnd: [], runs: [] };
    let depth = 1;
    let ran = false;
    for (let week = 1; week <= weeks; week++) {
      if (presentIn({ id: server.id, players: [who] }, week).players.length === 0) {
        log.depthEnd.push(0);
        continue;
      }
      const { team, bench } = teamOf(who, c, week, speed, seed, profile, habits);
      const options: RunOptions = {
        policy: habits.dungeonPolicy[who.role],
        bench,
        rest: true,
        levels: 3,
        standingOnlyDescent: true,
        followCrack: true,
        descendAbove: habits.descendAbove,
      };
      for (const day of runDays(habits, who.roster, `${seed}:${owner}`, week)) {
        // The first day a player ever ran: a defeat may be tried again that day.
        for (let attempt = 0; attempt < (ran ? 1 : 2); attempt++) {
          const t0 = Date.now();
          const r = runMap(
            team,
            depth,
            createSeededRng(`dd:${seed}:${owner}:w${week}:d${day}:a${attempt}`),
            options,
          );
          const ms = Date.now() - t0;
          ran = true;
          log.runs.push({
            week,
            depth,
            cleared: r.cleared,
            offered: r.cleared && depth >= 8,
            entered: r.entered,
            keepers: r.undercroft,
            played: r.played,
            knockouts: r.knockouts,
            firstWeek: week === firstWeek,
            ms,
          });
          if (r.cleared) {
            depth++;
            break;
          }
        }
      }
      log.depthEnd.push(depth);
    }
    return log;
  });
}

// ---------- measuring ----------

/** Today's dungeon targets: the simulator's (`packages/sim/targets.json`, measured by `dungeon-analysis.ts` on the v1 dungeon). */
export const DUNGEON_TARGETS = {
  firstWeekClear: { min: 0.8, id: 'dungeon-first-week-clear' },
  depthGrowth: { range: [1, 2] as const, id: 'dungeon-depth-growth' },
  runFights: { range: [3, 5.5] as const, id: 'dungeon-run-fights' },
  descentRate: { range: [0.2, 0.8] as const, id: 'dungeon-descent-rate' },
  eligibleRunFights: { max: 7, id: 'dungeon-eligible-run-fights' },
} as const;

const sortedOf = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b);
const quantile = (s: readonly number[], q: number): number =>
  s.length === 0 ? 0 : (s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))] ?? 0);
const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

export interface Spread {
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
}

/** The weeks whose depth the report tables. */
export const DEPTH_WEEKS = [1, 2, 4, 8, 12, 16, 24] as const;

/** What a group of players (one roster kind of a server at a speed, over all its replicates) did. */
export interface DaysSummary {
  readonly players: number;
  readonly runs: number;
  /** Depth at the end of each of `DEPTH_WEEKS`, over the players present then. */
  readonly depth: Readonly<Record<number, Spread>>;
  /** The median player's depth gain a week from the end of week 2 to the end of week 8 (null: nobody there for it). */
  readonly growth: number | null;
  /** Share of depth 1 runs in a player's first week that cleared. */
  readonly firstWeekClear: number | null;
  readonly wipeRate: number | null;
  /** Fights played per run (a lost one included), over the runs after a player's first week, and over the runs at depth 8 or more. */
  readonly fights: number | null;
  readonly eligibleFights: number | null;
  readonly knockouts: number | null;
  /** The runs that beat the floor boss at depth 8 or more, the share that went down, and of those that beat the first keeper. */
  readonly offered: number;
  readonly descentRate: number | null;
  readonly keeperRate: number | null;
  readonly msPerRun: number | null;
}

export function summariseDays(players: readonly PlayerDays[]): DaysSummary {
  const runs = players.flatMap((p) => p.runs);
  const depth: Record<number, Spread> = {};
  for (const w of DEPTH_WEEKS) {
    const s = sortedOf(players.map((p) => p.depthEnd[w - 1] ?? 0).filter((d) => d > 0));
    depth[w] = { median: quantile(s, 0.5), p25: quantile(s, 0.25), p75: quantile(s, 0.75) };
  }
  const gains = players
    .filter((p) => (p.depthEnd[1] ?? 0) > 0 && (p.depthEnd[7] ?? 0) > 0)
    .map((p) => ((p.depthEnd[7] as number) - (p.depthEnd[1] as number)) / 6);
  const first = runs.filter((r) => r.firstWeek && r.depth === 1);
  const later = runs.filter((r) => !r.firstWeek);
  const eligible = runs.filter((r) => r.depth >= 8);
  const offered = runs.filter((r) => r.offered);
  const down = offered.filter((r) => r.entered > 0);
  return {
    players: players.length,
    runs: runs.length,
    depth,
    growth: gains.length === 0 ? null : quantile(sortedOf(gains), 0.5),
    firstWeekClear: ratio(first.filter((r) => r.cleared).length, first.length),
    wipeRate: ratio(runs.filter((r) => !r.cleared).length, runs.length),
    fights: later.length === 0 ? null : mean(later.map((r) => r.played)),
    eligibleFights: eligible.length === 0 ? null : mean(eligible.map((r) => r.played)),
    knockouts: runs.length === 0 ? null : mean(runs.map((r) => r.knockouts)),
    offered: offered.length,
    descentRate: ratio(down.length, offered.length),
    keeperRate: ratio(down.filter((r) => r.keepers > 0).length, down.length),
    msPerRun: runs.length === 0 ? null : mean(runs.map((r) => r.ms)),
  };
}

// ---------- the plan ----------

/** The servers of the report: the dedicated and the mixed ones and Misa's. */
export const DUNGEON_DAYS_SERVERS = ['dedicated', 'mixed', 'live10'] as const;

export interface DungeonDaysJobArgs {
  readonly server: string;
  readonly speed: RosterSpeed;
  readonly index: number;
}

export const dungeonDaysJobId = (a: DungeonDaysJobArgs): string =>
  `dungeon-days:${a.server}:${a.speed}:${a.index}`;

/** What a `dungeon-days` job runs: one server's players over 24 weeks. */
export function runDungeonDaysJob(args: unknown): PlayerDays[] {
  const a = args as DungeonDaysJobArgs;
  const server = JOURNEY_SERVERS.find((s) => s.id === a.server);
  if (!server) throw new Error(`unknown journey server ${a.server}`);
  return dungeonDaysOf(server, a.speed, a.index);
}

export interface DungeonDaysOptions {
  readonly quick: boolean;
  /** Servers (replicates) of each kind (default 2 quick, 8 full). */
  readonly servers?: number;
  readonly speeds?: readonly RosterSpeed[];
  readonly kinds?: readonly (typeof DUNGEON_DAYS_SERVERS)[number][];
}

export interface DungeonDaysCell {
  readonly server: string;
  readonly speed: RosterSpeed;
  readonly roster: RosterKind;
  readonly summary: DaysSummary;
}

export interface DungeonDaysReport {
  readonly md: string[];
  readonly data: { readonly cells: readonly DungeonDaysCell[] };
}

export function planDungeonDays(options: DungeonDaysOptions): Plan<DungeonDaysReport> {
  const n = options.servers ?? (options.quick ? 2 : 8);
  const speeds = options.speeds ?? ROSTER_SPEEDS;
  const kinds = options.kinds ?? DUNGEON_DAYS_SERVERS;
  const args: DungeonDaysJobArgs[] = kinds.flatMap((server) =>
    speeds.flatMap((speed) => Array.from({ length: n }, (_, index) => ({ server, speed, index }))),
  );
  const jobs: JobSpec[] = args.map((a) => ({
    id: dungeonDaysJobId(a),
    section: `Dungeon days: ${a.server}`,
    kind: 'dungeon-days',
    args: a,
    needs: [],
  }));
  return {
    jobs,
    assemble: (results: JobResults): DungeonDaysReport => {
      const cells: DungeonDaysCell[] = [];
      for (const server of kinds)
        for (const speed of speeds) {
          const players = Array.from(
            { length: n },
            (_, index) => results.get(dungeonDaysJobId({ server, speed, index })) as PlayerDays[],
          ).flat();
          for (const roster of ['daily', 'weekly', 'new'] as const) {
            const of = players.filter((p) => p.roster === roster);
            if (of.length > 0) cells.push({ server, speed, roster, summary: summariseDays(of) });
          }
        }
      return { md: dungeonDaysMarkdown(cells, n), data: { cells } };
    },
  };
}

const pct = (x: number | null): string => (x === null ? '-' : `${Math.round(100 * x)}%`);
const num = (x: number | null, d = 1): string => (x === null ? '-' : x.toFixed(d));
const spread = (s: Spread | undefined): string =>
  s === undefined || s.median === 0 ? '-' : `${s.median} (${s.p25}-${s.p75})`;

function dungeonDaysMarkdown(cells: readonly DungeonDaysCell[], n: number): string[] {
  const T = DUNGEON_TARGETS;
  const md: string[] = [
    '## The dungeon over days',
    '',
    `Each player of a server runs the daily dungeon on the v2 rooms over weeks 1 to 24 (\`dungeonDays.ts\`): the day's map, HP carried, a knocked-out creature out until the camp swaps it, the worker's descent (only the standing recover), a next Undercroft level only on a cracked floor. A clear locks in depth + 1. Daily players run every day, weekly players 2 or 3 days a week (Misa, 2026-11-04). ${n} servers of each kind, levels from the valley's roster profile, habits as \`HABITS\`; players plan (prepared, builder) or take the first exit (casual), and descend while the team's HP share is above ${pct(DESCEND_ABOVE)}.`,
    '',
    `Targets are today's (\`packages/sim/targets.json\`, measured on the v1 dungeon by \`dungeon-analysis.ts\`; design \`docs/design/daily-dungeon.md\`): first-week depth 1 clears at least ${pct(T.firstWeekClear.min)} (\`${T.firstWeekClear.id}\`), a median daily player gains ${T.depthGrowth.range[0]} to ${T.depthGrowth.range[1]} depth a week from the end of week 2 to week 8 (\`${T.depthGrowth.id}\`), ${T.runFights.range[0]} to ${T.runFights.range[1]} fights a run after the first week (\`${T.runFights.id}\`), ${pct(T.descentRate.range[0])} to ${pct(T.descentRate.range[1])} of the runs that beat the boss at depth 8 or more go down (\`${T.descentRate.id}\`), at most ${T.eligibleRunFights.max} fights a run at depth 8 or more (\`${T.eligibleRunFights.id}\`). The lab's players never head home, so \`dungeon-home-rate\` has no counterpart.`,
    '',
    '### Depth at the end of a week: median (p25 to p75)',
    '',
    `| Server | Speed | Kind | Players | ${DEPTH_WEEKS.map((w) => `Wk ${w}`).join(' | ')} |`,
    `| --- | --- | --- | ---: | ${DEPTH_WEEKS.map(() => '---:').join(' | ')} |`,
  ];
  for (const c of cells)
    md.push(
      `| ${c.server} | ${c.speed} | ${c.roster} | ${c.summary.players} | ${DEPTH_WEEKS.map((w) => spread(c.summary.depth[w])).join(' | ')} |`,
    );
  md.push(
    '',
    '### Clears, growth, descent and run length against the targets',
    '',
    '| Server | Speed | Kind | Runs | First-week clear | Growth a week (wk 2 to 8) | Wipes | Fights a run | Fights, depth 8+ | KOs a run | Offered | Descent rate | Keeper beaten | ms a run |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  const flag = (ok: boolean | null): string => (ok === null || ok ? '' : ' (off)');
  const inR = (x: number | null, r: readonly [number, number]): boolean | null =>
    x === null ? null : x >= r[0] && x <= r[1];
  for (const c of cells) {
    const s = c.summary;
    md.push(
      `| ${c.server} | ${c.speed} | ${c.roster} | ${s.runs} | ${pct(s.firstWeekClear)}${flag(s.firstWeekClear === null ? null : s.firstWeekClear >= T.firstWeekClear.min)} | ${num(s.growth, 2)}${flag(inR(s.growth, T.depthGrowth.range))} | ${pct(s.wipeRate)} | ${num(s.fights, 2)}${flag(inR(s.fights, T.runFights.range))} | ${num(s.eligibleFights, 2)}${flag(s.eligibleFights === null ? null : s.eligibleFights <= T.eligibleRunFights.max)} | ${num(s.knockouts, 2)} | ${s.offered} | ${pct(s.descentRate)}${flag(inR(s.descentRate, T.descentRate.range))} | ${pct(s.keeperRate)} | ${num(s.msPerRun, 0)} |`,
    );
  }
  md.push(
    '',
    '"(off)" marks a number outside its target. The targets are for daily players; weekly and new players are shown for the spread.',
    '',
  );
  return md;
}
