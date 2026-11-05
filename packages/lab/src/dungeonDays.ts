/**
 * The dungeon over days (phase 5, step 3, `docs/design/combat/balance.md` section 2 item 4): each player of a journey server runs the
 * daily dungeon on the v2 rooms over weeks 1 to 24, at the levels of the valley's roster profile for that week and roster kind.
 *
 * The rules are the game's, through `runMap` (`dungeon.ts`): the day's map, only HP carried between rooms, a knocked-out creature out until a
 * camp swaps it, the camp's choice, the Undercroft (from depth 8) with the descent (the standing recover, and since Misa's choice of 2026-11-04 a fallen creature
 * gets back up at `reviveBp`: `descentBreathOf`; `DaysConfig.standingOnly` plays the earlier rule) and a next level only where the keeper's floor is cracked. The progress is the worker's: one run a day at most,
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
import {
  ALL_ROUND_BENCH,
  ALL_ROUND_TEAM,
  runMap,
  type LevelLog,
  type RunOptions,
  type RunResult,
} from './dungeon';
import type { FoeKnobs } from './dungeonKnobs';
import {
  HABITS,
  shuffled,
  talentSlotsFor,
  withKnackPolicy,
  withTalentPolicy,
  type Habits,
} from './habits';
import { presentIn, type JourneyServer } from './journey';
import type { PlayerRole } from './path';
import { casualColumn } from './raidMeasure';
import {
  ROSTER_WEEKS,
  levelledColumn,
  rosterGearLevel,
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
  /** A replay below the player's best depth (`DaysConfig.stepBack`): a clear gives no depth. */
  readonly replay: boolean;
  /** The day of the week (0 to 6) it ran on. */
  readonly day: number;
  /** The team when the floor boss fell (null: not cleared), and the units in the pack. */
  readonly floor: {
    readonly share: number;
    readonly knocked: number;
    readonly pack: number;
  } | null;
  /** The Undercroft levels played (with `probe`, all of them: see `LevelLog`). */
  readonly levels: readonly LevelLog[];
  /** What the run pays by the player's own rule (`RunResult.reward`: base experience, deepest level played, the pack as paid). */
  readonly reward: RunResult['reward'];
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

/**
 * How a report plays the dungeon days: the player's rule at the way down and the numbers moved.
 * - `habit`: the habits' own (`descendAbove`, the standing's share after the breath);
 * - `never`: a safe player who never goes down; `sure`: goes down only when the team's share of HP at the floor's end is above `sureShare`.
 * `standingOnly` plays the worker's earlier descent (a knocked-out creature stays out); the default is the reviving descent (Misa, 2026-11-04).
 * `probe` also plays the levels a rule would not (`RunOptions.probe`), to measure the choice.
 */
export interface DaysConfig {
  readonly descent: 'habit' | 'never' | 'sure';
  readonly sureShare?: number;
  readonly standingOnly?: boolean;
  readonly probe?: boolean;
  readonly foes?: FoeKnobs;
  /**
   * The depth picker (Misa, 2026-11-04): after a wipe at the player's best depth, the next run is a replay this many depths below it. A replay
   * that clears gives no depth (the depth is already unlocked) and the run after it tries the best depth again.
   */
  readonly stepBack?: number;
  /**
   * Tools for the Undercroft report (`undercroftTools.ts`), each a hypothetical the game does not have: `runOptions` are merged into each run
   * (`levelCamp`, `teamBumpBp`, `mode`), `extraBench` creatures more on the bench of a planner (`EXTRA_BENCH`), and `slots` 4 puts a fourth creature
   * in the row (the first of the bench; a casual player's fourth best), the arena `runOptions.mode`.
   */
  readonly runOptions?: Partial<RunOptions>;
  readonly extraBench?: number;
  readonly slots?: number;
  /** Everyone plays with gear at the roster's item level of the week (`gear.ts`). Default off: no gear, as before. */
  readonly gear?: boolean;
}
/** The creatures a bigger bench adds, in order (a planner only: a casual player brings no bench). */
export const EXTRA_BENCH: readonly Pick[] = [
  { formId: 'tidewing', knack: 'none' },
  { formId: 'thornbuck', knack: 'none' },
];
export const SURE_SHARE = 0.8;
export const DEFAULT_DAYS: DaysConfig = { descent: 'habit' };

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
  tools: { readonly extraBench?: number; readonly slots?: number; readonly gear?: boolean } = {},
): { team: Pick[]; bench: Pick[] } {
  const casual = who.role === 'casual';
  const size = tools.slots ?? TEAM_SIZE;
  const line: Pick[] = casual
    ? casualColumn(createSeededRng(`dd:${seed}:casual:${c}`), size, 'top3', LEVEL)
    : [...ALL_ROUND_TEAM, ...ALL_ROUND_BENCH, ...EXTRA_BENCH.slice(0, tools.extraBench ?? 0)];
  const levels = rosterLevels(profile, who.roster, week, speed, line.length, who.joinWeek);
  const owner = `p${c + 1}`;
  const itemLevel = tools.gear
    ? rosterGearLevel(profile, who.roster, week, speed, who.joinWeek)
    : undefined;
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
        col: i % size,
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
      ...(itemLevel === undefined ? {} : { itemLevel }),
    };
  });
  return { team: placed.slice(0, size), bench: casual ? [] : placed.slice(size) };
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
  config: DaysConfig = DEFAULT_DAYS,
): PlayerDays[] {
  const seed = `${server.id}:${speed}:${index}`;
  return server.players.map((who, c) => {
    const owner = `p${c + 1}`;
    const firstWeek = who.joinWeek ?? 1;
    const log: PlayerDays = { role: who.role, roster: who.roster, depthEnd: [], runs: [] };
    let depth = 1;
    let ran = false;
    let replayNext: boolean = false;
    for (let week = 1; week <= weeks; week++) {
      if (presentIn({ id: server.id, players: [who] }, week).players.length === 0) {
        log.depthEnd.push(0);
        continue;
      }
      const { team, bench } = teamOf(who, c, week, speed, seed, profile, habits, {
        ...(config.extraBench ? { extraBench: config.extraBench } : {}),
        ...(config.slots ? { slots: config.slots } : {}),
        ...(config.gear ? { gear: true } : {}),
      });
      const options: RunOptions = {
        policy: habits.dungeonPolicy[who.role],
        bench,
        rest: true,
        levels: 3,
        standingOnlyDescent: config.standingOnly === true,
        followCrack: true,
        // The habit's rule looks at the standing after the breath; a safe player looks at the team's bars at the floor's end.
        descendAbove: config.descent === 'habit' ? habits.descendAbove : -1,
        ...(config.descent === 'never'
          ? { descendShare: 2 }
          : config.descent === 'sure'
            ? { descendShare: config.sureShare ?? SURE_SHARE }
            : {}),
        ...(config.probe ? { probe: true } : {}),
        ...(config.foes ? { foes: config.foes } : {}),
        ...config.runOptions,
      };
      for (const day of runDays(habits, who.roster, `${seed}:${owner}`, week)) {
        // The first day a player ever ran: a defeat may be tried again that day.
        for (let attempt = 0; attempt < (ran ? 1 : 2); attempt++) {
          const t0 = Date.now();
          const replay: boolean = replayNext && attempt === 0;
          const at = replay ? Math.max(1, depth - (config.stepBack ?? 0)) : depth;
          const r = runMap(
            team,
            at,
            createSeededRng(`dd:${seed}:${owner}:w${week}:d${day}:a${attempt}`),
            options,
          );
          const ms = Date.now() - t0;
          ran = true;
          log.runs.push({
            week,
            depth: at,
            cleared: r.cleared,
            offered: r.cleared && at >= 8,
            replay,
            entered: r.entered,
            keepers: r.undercroft,
            played: r.played,
            knockouts: r.knockouts,
            firstWeek: week === firstWeek,
            day,
            floor: r.floorEnd,
            levels: r.levelLog,
            reward: r.reward,
            ms,
          });
          replayNext = !replay && !r.cleared && (config.stepBack ?? 0) > 0;
          if (r.cleared && !replay) {
            depth++;
            break;
          }
          if (replay) break;
        }
      }
      log.depthEnd.push(depth);
    }
    return log;
  });
}
