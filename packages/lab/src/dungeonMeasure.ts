/**
 * The dungeon's measures for Misa's direction (2026-11-04, decision `2026-11-04-dungeon-direction-an-easy-base-dungeon`): the base dungeon is
 * fairly easy (a daily player who plays it safe gains about 5 to 7 depth a week), the Undercroft is the challenge and gets harder with depth,
 * and the choice at the end of the base floor (go down with the team as it stands, or not) is the interesting one. A baseline with meaningful
 * choices, not a strict target: the proposals are in `targets.ts` (`DUNGEON_SAFE_GAIN_WEEK` and the rest), no test asserts them.
 *
 * The runs are `dungeonDays.ts`'s (a safe player who goes down only when "sure", with `probe`: every cleared run at depth 8 or more also plays the
 * Undercroft levels, so each state of the team gets a clear chance whatever a player would have done). A clear locks in depth + 1 whatever
 * happens below, so a safe player's gain does not depend on the descent rule: the report reads "never goes down" and "sure" from the same runs
 * (a test holds that the rule changes nothing before the boss falls).
 */
import { combatV2 } from '@creatures/game/combat-v2';
import type { LevelLog } from './dungeon';
import {
  dungeonDaysOf,
  SURE_SHARE,
  type DayRun,
  type DaysConfig,
  type PlayerDays,
} from './dungeonDays';
import { OLD_FOES, type FoeKnobs } from './dungeonKnobs';
import type { JobResults, JobSpec, Plan } from './jobs';
import { rewardsMeasureMarkdown } from './dungeonRewards';
import { toolOf } from './undercroftToolSet';
import { JOURNEY_SERVERS } from './journey';
import { ROSTER_SPEEDS, type RosterSpeed } from './roster';
import {
  RULES,
  dungeonGearOddsBp,
  dungeonItemLevel,
  dungeonSupplyOddsBp,
  isLandmark,
} from '@creatures/game';

// ---------- the settings a report compares ----------

/** A named setting of the foe numbers (`dungeonKnobs.ts`). `shipped` is today's. */
export interface Scenario {
  readonly id: string;
  readonly note: string;
  readonly foes?: FoeKnobs;
}

/** The options' base floors: the content's HP at a share of the shipped engine's (a basis-point scale of 23000) and a nearly flat curve (+2% of the depth-1 HP for each depth, the game's). */
const flat = (hpBp: number) => ({ hpBp, curve: { hpStepBp: 200, hpCurveBp: 0 } }) as const;
/** The Undercroft of the options as numbers of their own: a scale and a steeper depth curve (HP: `step` bp a depth, `bend` bp a depth squared). */
const under = (hpBp: number, step: number, bend: number) =>
  ({ hpBp, curve: { hpStepBp: step, hpCurveBp: bend } }) as const;
/** The Undercroft of the game and of `base55-u1`: 90% HP, +3% a depth and +0.02% a depth squared. */
const U1 = under(20_700, 300, 2);

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'shipped',
    note: "the game's v2 foe numbers: base 55% HP, nearly flat (+2% a depth); Undercroft U1: 90% HP, +3% a depth and +0.02% a depth squared (what `base55-u1` was before it went into the data)",
  },
  {
    id: 'old-shipped',
    note: 'the numbers before 2026-11-04: HP 23000 bp, +16% a depth and +0.45% a depth squared; the Undercroft takes the same curve (a level adds one depth)',
    foes: OLD_FOES,
  },
  {
    id: 'flat-only',
    note: 'base 55% HP, nearly flat (+2% a depth); the Undercroft takes the base numbers (a level adds one depth)',
    foes: { undercroft: flat(12_650) },
  },
  {
    id: 'base45-u1',
    note: 'base 45% HP, nearly flat (+2% a depth); Undercroft U1: 90% HP, +3% a depth and +0.02% a depth squared',
    foes: { base: flat(10_350), undercroft: U1 },
  },
  {
    id: 'base55-u1',
    note: 'alias of shipped: the game’s base HP, nearly flat (+2% a depth); Undercroft U1: 90% HP, +3% a depth and +0.02% a depth squared',
    foes: { base: flat(combatV2.foeScale.hpBp), undercroft: U1 },
  },
  {
    id: 'base65-u1',
    note: 'base 65% HP, nearly flat (+2% a depth); Undercroft U1: 90% HP, +3% a depth and +0.02% a depth squared',
    foes: { base: flat(14_950), undercroft: U1 },
  },
  {
    id: 'base55-u2',
    note: 'base 55% HP, nearly flat; Undercroft U2: 110% HP, +4% a depth and +0.03% a depth squared',
    foes: { base: flat(12_650), undercroft: under(25_300, 400, 3) },
  },
  {
    id: 'base55-u3',
    note: 'base 55% HP, nearly flat; Undercroft U3: 90% HP, +5% a depth, no square',
    foes: { base: flat(12_650), undercroft: under(20_700, 500, 0) },
  },
];

export const scenarioOf = (id: string): Scenario => {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown dungeon scenario ${id}`);
  return s;
};

// ---------- bands and buckets ----------

/** The week bands of the safe gain. */
export const WEEK_BANDS: readonly (readonly [number, number])[] = [
  [1, 2],
  [3, 4],
  [5, 8],
  [9, 16],
  [17, 24],
];
/** Depth bands: the base floor's clear rate, and (from depth 8, where the Undercroft opens) the descent's. */
export const BASE_BANDS: readonly (readonly [number, number])[] = [
  [1, 4],
  [5, 7],
  [8, 12],
  [13, 20],
  [21, 40],
  [41, Infinity],
];
export const DESCENT_BANDS: readonly (readonly [number, number])[] = BASE_BANDS.filter(
  (b) => b[0] >= 8,
);

/** The team's share of HP at the floor's end, in buckets. */
export const STATE_BUCKETS = ['<40%', '40-60%', '60-80%', '>80%'] as const;
export type StateBucket = (typeof STATE_BUCKETS)[number];
export const bucketOf = (share: number): StateBucket =>
  share < 0.4 ? '<40%' : share < 0.6 ? '40-60%' : share < 0.8 ? '60-80%' : '>80%';
/** Creatures knocked out at the floor's end (before the way down revives them). */
export const KNOCK_BUCKETS = ['0', '1', '2+'] as const;
export const knockBucketOf = (n: number): (typeof KNOCK_BUCKETS)[number] =>
  n <= 0 ? '0' : n === 1 ? '1' : '2+';

const inBand = (b: readonly [number, number], x: number): boolean => x >= b[0] && x <= b[1];
const bandName = (b: readonly [number, number]): string =>
  b[1] === Infinity ? `${b[0]}+` : b[0] === b[1] ? `${b[0]}` : `${b[0]}-${b[1]}`;
const sorted = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b);
const quantile = (s: readonly number[], q: number): number =>
  s.length === 0 ? 0 : (s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))] ?? 0);
const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

// ---------- the safe player's gain ----------

/** One player-week of progress: the depth gained and whether the player was there. */
export interface WeekGain {
  readonly week: number;
  readonly gain: number;
  readonly present: boolean;
}

/** The depth a player gained in each week (index 0: week 1; the start is depth 1). */
export function weekGains(p: PlayerDays): WeekGain[] {
  const out: WeekGain[] = [];
  let prev = 1;
  p.depthEnd.forEach((d, i) => {
    if (d === 0) out.push({ week: i + 1, gain: 0, present: false });
    else {
      out.push({ week: i + 1, gain: d - prev, present: true });
      prev = d;
    }
  });
  return out;
}

export interface GainBand {
  readonly players: number;
  /** The median (and quartiles) of each player's mean gain a week over the band, and the mean of all player-weeks. */
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly mean: number;
  /** The share of player-weeks with no depth gained (no gain for a week or more: the player is stuck). */
  readonly stuckWeeks: number;
  /** The share of players that were stuck in at least one week of the band. */
  readonly stuckPlayers: number;
}

export function gainByBand(
  players: readonly PlayerDays[],
  band: readonly [number, number],
): GainBand {
  const per: number[] = [];
  const all: number[] = [];
  let stuckWeeks = 0;
  let stuckPlayers = 0;
  for (const p of players) {
    const weeks = weekGains(p).filter((w) => w.present && inBand(band, w.week));
    if (weeks.length === 0) continue;
    per.push(mean(weeks.map((w) => w.gain)));
    for (const w of weeks) {
      all.push(w.gain);
      if (w.gain === 0) stuckWeeks++;
    }
    if (weeks.some((w) => w.gain === 0)) stuckPlayers++;
  }
  const s = sorted(per);
  return {
    players: per.length,
    median: quantile(s, 0.5),
    p25: quantile(s, 0.25),
    p75: quantile(s, 0.75),
    mean: mean(all),
    stuckWeeks: all.length === 0 ? 0 : stuckWeeks / all.length,
    stuckPlayers: per.length === 0 ? 0 : stuckPlayers / per.length,
  };
}

// ---------- the base floor and the descent ----------

export interface ClearBand {
  readonly runs: number;
  readonly clear: number | null;
}

/** The share of runs that beat the floor boss, by depth band (runs that were retries on the first day included: they are runs). */
export function baseClear(runs: readonly DayRun[], band: readonly [number, number]): ClearBand {
  const of = runs.filter((r) => inBand(band, r.depth));
  return {
    runs: of.length,
    clear: of.length === 0 ? null : of.filter((r) => r.cleared).length / of.length,
  };
}

/** What going down is worth at one state of the team: the clear chance and the pack units won and at risk (per attempt). */
export interface DescentCell {
  readonly n: number;
  readonly won: number | null;
  /** Units (Bait, Essence, scrap) the level puts in the pack, per attempt, and what a defeat there takes from the pack, per attempt. */
  readonly gain: number;
  readonly loss: number;
  /** The share of attempts (of all floor-ends in the depth band). */
  readonly share: number;
}

const cell = (logs: readonly LevelLog[], total: number): DescentCell => ({
  n: logs.length,
  won: logs.length === 0 ? null : logs.filter((l) => l.won).length / logs.length,
  gain: mean(logs.map((l) => l.gain)),
  loss: mean(logs.map((l) => l.lost)),
  share: total === 0 ? 0 : logs.length / total,
});

/** The cleared runs of depth 8 or more of a depth band, with their level logs. */
const floorEnds = (runs: readonly DayRun[], band: readonly [number, number]): DayRun[] =>
  runs.filter((r) => r.floor !== null && r.depth >= 8 && inBand(band, r.depth));

/** The descent choice for one depth band and level: a cell for each state bucket and each knocked-out count. */
export function descentTable(
  runs: readonly DayRun[],
  band: readonly [number, number],
  level: number,
): {
  total: number;
  byShare: Record<StateBucket, DescentCell>;
  byKnocked: Record<string, DescentCell>;
  all: DescentCell;
} {
  const logs = floorEnds(runs, band).flatMap((r) => r.levels.filter((l) => l.level === level));
  const byShare = Object.fromEntries(
    STATE_BUCKETS.map((b) => [
      b,
      cell(
        logs.filter((l) => bucketOf(l.share) === b),
        logs.length,
      ),
    ]),
  ) as Record<StateBucket, DescentCell>;
  const byKnocked = Object.fromEntries(
    KNOCK_BUCKETS.map((b) => [
      b,
      cell(
        logs.filter((l) => knockBucketOf(l.knocked) === b),
        logs.length,
      ),
    ]),
  );
  return { total: logs.length, byShare, byKnocked, all: cell(logs, logs.length) };
}

/** The gear chance of an Undercroft keeper's chest (`RULES.dungeon.undercroft.chest.gearBp`): banked at once when the keeper falls. */
export const KEEPER_GEAR = RULES.dungeon.undercroft.chest.gearBp / 10_000;

// ---------- what a cleared run pays by depth ----------

/** The depths of the reward table. */
export const REWARD_DEPTHS: readonly number[] = [1, 2, 4, 7, 8, 14, 21, 30, 60];

/**
 * What a cleared run pays at a depth, from the game's own rules (read, not changed): experience (`RULES.xp.dungeon`: "Depth adds nothing"), the
 * pack (flat per room, a landmark adds Essence and scrap), and the gear and supply the depth improves (item level, rare and epic odds, the
 * shares of good and great supplies). Each as a multiple of depth 1.
 */
export function rewardsMarkdown(): string[] {
  const row = (d: number) => {
    const landmark = isLandmark(d);
    const gearOdds = dungeonGearOddsBp(d, landmark);
    const sup = dungeonSupplyOddsBp(d);
    return {
      d,
      ilvl: dungeonItemLevel(d, landmark),
      rareEpic: (gearOdds.rare + gearOdds.epic) / 10_000,
      epic: gearOdds.epic / 10_000,
      goodGreat: ((sup.good ?? 0) + (sup.great ?? 0)) / 10_000,
      landmark,
    };
  };
  const one = row(1);
  const x = (v: number, base: number): string => `${(v / base).toFixed(1)}x`;
  const md = [
    "#### What a cleared run pays by depth (the game's rules, as a multiple of depth 1)",
    '',
    'Experience does not grow with depth (`RULES.xp.dungeon`: "Depth adds nothing"), and the pack (Bait, Essence, scrap) is flat per room; only a landmark depth (every 7th) adds Essence and scrap on top. What depth improves is the gear (item level, rare and epic odds) and the supply tier. So the picker\'s "XP" scalar would be 1.0x at every depth today, and the "loot" scalar has to come from gear and supply quality.',
    '',
    '| Depth | XP | Pack units | Gear item level | Rare + epic odds | Epic odds | Good + great supply odds |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  const pack = (landmark: boolean): number =>
    1 + (landmark ? RULES.dungeon.landmark.essence + RULES.dungeon.landmark.scrap : 0) / 14;
  for (const d of REWARD_DEPTHS) {
    const r = row(d);
    md.push(
      `| ${d}${r.landmark ? ' (landmark)' : ''} | 1.0x | ${pack(r.landmark).toFixed(2)}x | ${r.ilvl} (${x(r.ilvl, one.ilvl)}) | ${pct(r.rareEpic)} (${x(r.rareEpic, one.rareEpic)}) | ${pct(r.epic)} (${x(r.epic, one.epic)}) | ${pct(r.goodGreat)} |`,
    );
  }
  md.push(
    '',
    "Pack units at a landmark use a rough 14 units for a map's rooms (a run of about 8 cleared rooms pays Bait, scrap and Essence at 1 to 4 each).",
    '',
  );
  return md;
}

// ---------- the plan ----------

/** The servers of the report: the dedicated and the mixed ones and Misa's. */
export const DUNGEON_DAYS_SERVERS = ['dedicated', 'mixed', 'live10'] as const;

export interface DungeonDaysJobArgs {
  readonly server: string;
  readonly speed: RosterSpeed;
  readonly index: number;
  readonly scenario: string;
  readonly stepBack?: number;
  /** A tool of the Undercroft report (`undercroftToolSet.ts`), played on top of the scenario. */
  readonly tool?: string;
  /** Play with gear (`gear.ts`). Absent: no gear; the job id is then what it always was. */
  readonly gear?: boolean;
}

export const dungeonDaysJobId = (a: DungeonDaysJobArgs): string =>
  `dungeon-days:${a.scenario}:${a.server}:${a.speed}:${a.index}${a.stepBack ? `:back${a.stepBack}` : ''}${a.tool ? `:tool-${a.tool}` : ''}${a.gear ? ':gear' : ''}`;

/** The play of the report: the safe player who goes down only when sure (and the probe), at a scenario's foe numbers. */
export const configOf = (
  a: Pick<DungeonDaysJobArgs, 'scenario' | 'stepBack' | 'tool' | 'gear'>,
): DaysConfig => {
  const s = scenarioOf(a.scenario);
  return {
    descent: 'sure',
    sureShare: SURE_SHARE,
    probe: true,
    ...(s.foes ? { foes: s.foes } : {}),
    ...(a.stepBack ? { stepBack: a.stepBack } : {}),
    ...(a.tool ? toolOf(a.tool).config : {}),
    ...(a.gear ? { gear: true } : {}),
  };
};

/** What a `dungeon-days` job runs: one server's players over 24 weeks. */
export function runDungeonDaysJob(args: unknown): PlayerDays[] {
  const a = args as DungeonDaysJobArgs;
  const server = JOURNEY_SERVERS.find((s) => s.id === a.server);
  if (!server) throw new Error(`unknown journey server ${a.server}`);
  return dungeonDaysOf(server, a.speed, a.index, undefined, undefined, undefined, configOf(a));
}

export interface DungeonDaysOptions {
  readonly quick: boolean;
  /** Servers (replicates) of each kind (default 2 quick, 8 full). */
  readonly servers?: number;
  readonly speeds?: readonly RosterSpeed[];
  readonly kinds?: readonly (typeof DUNGEON_DAYS_SERVERS)[number][];
  readonly scenarios?: readonly string[];
  /** Add the rewards section (`dungeonRewards.ts`: gear, resources and XP by depth). */
  readonly rewards?: boolean;
  /** Also play a safe player who steps back this many depths after a wipe (a reward-only replay). */
  readonly stepBack?: number;
  /** Everyone plays with gear at the roster's item level (`gear.ts`). Default off. */
  readonly gear?: boolean;
}

export interface DungeonDaysReport {
  readonly md: string[];
  readonly data: { readonly scenarios: readonly string[] };
}

export function planDungeonDays(options: DungeonDaysOptions): Plan<DungeonDaysReport> {
  const n = options.servers ?? (options.quick ? 2 : 8);
  const speeds = options.speeds ?? ROSTER_SPEEDS;
  const kinds = options.kinds ?? DUNGEON_DAYS_SERVERS;
  const scenarios = options.scenarios ?? ['shipped'];
  const args: DungeonDaysJobArgs[] = scenarios.flatMap((scenario) =>
    kinds.flatMap((server) =>
      speeds.flatMap((speed) =>
        Array.from({ length: n }, (_, index) => ({
          server,
          speed,
          index,
          scenario,
          ...(options.stepBack ? { stepBack: options.stepBack } : {}),
          ...(options.gear ? { gear: true } : {}),
        })),
      ),
    ),
  );
  const jobs: JobSpec[] = args.map((a) => ({
    id: dungeonDaysJobId(a),
    section: `Dungeon days: ${a.scenario}`,
    kind: 'dungeon-days',
    args: a,
    needs: [],
  }));
  return {
    jobs,
    assemble: (results: JobResults): DungeonDaysReport => {
      const md: string[] = [
        '## The dungeon over days',
        '',
        `Misa's direction (2026-11-04): the base dungeon fairly easy, the Undercroft the challenge, the way down the choice. Each player of a server runs the daily dungeon on the v2 rooms over weeks 1 to 24 (\`dungeonDays.ts\`): the day's map, HP carried, the camp, the Undercroft with the reviving descent. A clear locks in depth + 1. ${n} servers of each of ${kinds.join(', ')} at ${speeds.join(', ')} speeds, levels from the valley's roster profile. The safe player goes down only when the team's HP share at the floor's end is above ${Math.round(100 * SURE_SHARE)}% (the other safe player never goes down: the same gain, see below). Every cleared run at depth 8 or more also plays the Undercroft levels (a probe), so each state of the team gets a clear chance. Not a gate: the proposals are in \`targets.ts\`.`,
        '',
      ];
      for (const scenario of scenarios) {
        const players = kinds.flatMap((server) =>
          speeds.flatMap((speed) =>
            Array.from(
              { length: n },
              (_, index) =>
                results.get(
                  dungeonDaysJobId({
                    server,
                    speed,
                    index,
                    scenario,
                    ...(options.stepBack ? { stepBack: options.stepBack } : {}),
                    ...(options.gear ? { gear: true } : {}),
                  }),
                ) as PlayerDays[],
            ).flat(),
          ),
        );
        md.push(...scenarioMarkdown(scenario, players));
        if (options.rewards === true) md.push(...rewardsMeasureMarkdown(players));
      }
      md.push(...rewardsMarkdown());
      return { md, data: { scenarios } };
    },
  };
}

// ---------- markdown ----------

const pct = (x: number | null): string => (x === null ? '-' : `${Math.round(100 * x)}%`);
const num = (x: number | null, d = 1): string => (x === null ? '-' : x.toFixed(d));
const withN = (c: DescentCell): string => (c.n < 5 ? `- (n ${c.n})` : `${pct(c.won)} (n ${c.n})`);

export function scenarioMarkdown(scenario: string, players: readonly PlayerDays[]): string[] {
  const s = scenarioOf(scenario);
  const md: string[] = [`### Scenario \`${scenario}\`: ${s.note}`, ''];
  const groups: [string, (p: PlayerDays) => boolean][] = [
    ['daily', (p) => p.roster === 'daily'],
    ['daily, planners', (p) => p.roster === 'daily' && p.role !== 'casual'],
    ['daily, casual', (p) => p.roster === 'daily' && p.role === 'casual'],
    ['new', (p) => p.roster === 'new'],
    ['weekly', (p) => p.roster === 'weekly'],
  ];
  md.push(
    "#### Depth gained a week by week band (a safe player: mean of the players' weekly gain; median and quartiles of each player's band average)",
    '',
    `| Players | ${WEEK_BANDS.map((b) => `Wk ${bandName(b)}`).join(' | ')} |`,
    `| --- | ${WEEK_BANDS.map(() => '---:').join(' | ')} |`,
  );
  for (const [name, test] of groups) {
    const of = players.filter(test);
    if (of.length === 0) continue;
    md.push(
      `| ${name} (${of.length}) | ${WEEK_BANDS.map((b) => {
        const g = gainByBand(of, b);
        return g.players === 0
          ? '-'
          : `${num(g.mean, 1)} (${num(g.median, 1)}; ${num(g.p25, 1)}-${num(g.p75, 1)})`;
      }).join(' | ')} |`,
    );
  }
  md.push(
    '',
    `Proposal: a safe daily player gains ${num(5, 0)} to ${num(7, 0)} a week. A player who never goes down and one who goes down only when sure gain the same depth: the depth is locked in when the floor boss falls and nothing below can take it back.`,
    '',
    '#### Stuck: player-weeks with no depth gained, and players stuck at least once in the band',
    '',
    `| Players | ${WEEK_BANDS.map((b) => `Wk ${bandName(b)}`).join(' | ')} |`,
    `| --- | ${WEEK_BANDS.map(() => '---:').join(' | ')} |`,
  );
  for (const [name, test] of groups) {
    const of = players.filter(test);
    if (of.length === 0) continue;
    md.push(
      `| ${name} | ${WEEK_BANDS.map((b) => {
        const g = gainByBand(of, b);
        return g.players === 0 ? '-' : `${pct(g.stuckWeeks)} / ${pct(g.stuckPlayers)}`;
      }).join(' | ')} |`,
    );
  }
  const runsOf = (test: (p: PlayerDays) => boolean) => players.filter(test).flatMap((p) => p.runs);
  md.push(
    '',
    '#### The base floor: the share of runs that beat the floor boss, by depth',
    '',
    `| Players | ${BASE_BANDS.map((b) => `Depth ${bandName(b)}`).join(' | ')} |`,
    `| --- | ${BASE_BANDS.map(() => '---:').join(' | ')} |`,
  );
  for (const [name, test] of groups) {
    const runs = runsOf(test);
    if (runs.length === 0) continue;
    md.push(
      `| ${name} | ${BASE_BANDS.map((b) => {
        const c = baseClear(runs, b);
        return c.runs < 10 ? '-' : `${pct(c.clear)} (n ${c.runs})`;
      }).join(' | ')} |`,
    );
  }
  const allRuns = players.flatMap((p) => p.runs);
  md.push(
    '',
    `Runs: ${allRuns.length}; fights a run ${num(mean(allRuns.map((r) => r.played)), 2)}; creatures knocked out at the end ${num(mean(allRuns.map((r) => r.knockouts)), 2)}.`,
    '',
    "#### The descent choice: the chance to beat the keeper of Undercroft level 1 by the team's state at the end of the base floor",
    '',
    'State: the team\'s mean share of max HP when the floor boss fell, a knocked-out creature counting 0 (before the way down revives it). "Floor-ends" is the share of cleared runs in that depth band in each state.',
    '',
    `| Depth | | ${STATE_BUCKETS.join(' | ')} | all |`,
    `| --- | --- | ${STATE_BUCKETS.map(() => '---:').join(' | ')} | ---: |`,
  );
  const tables = DESCENT_BANDS.map((b) => ({
    b,
    t1: descentTable(allRuns, b, 1),
    t2: descentTable(allRuns, b, 2),
  }));
  for (const { b, t1 } of tables) {
    if (t1.total === 0) continue;
    md.push(
      `| ${bandName(b)} | floor-ends | ${STATE_BUCKETS.map((k) => pct(t1.byShare[k].share)).join(' | ')} | ${t1.total} |`,
      `| | level 1 clear | ${STATE_BUCKETS.map((k) => withN(t1.byShare[k])).join(' | ')} | ${withN(t1.all)} |`,
    );
  }
  md.push(
    '',
    "#### Level 1 by creatures knocked out at the floor's end",
    '',
    `| Depth | | ${KNOCK_BUCKETS.join(' | ')} |`,
    `| --- | --- | ${KNOCK_BUCKETS.map(() => '---:').join(' | ')} |`,
  );
  for (const { b, t1 } of tables) {
    if (t1.total === 0) continue;
    md.push(
      `| ${bandName(b)} | floor-ends | ${KNOCK_BUCKETS.map((k) => pct(t1.byKnocked[k]?.share ?? 0)).join(' | ')} |`,
      `| | level 1 clear | ${KNOCK_BUCKETS.map((k) => (t1.byKnocked[k] ? withN(t1.byKnocked[k]) : '-')).join(' | ')} |`,
    );
  }
  md.push(
    '',
    "#### The Undercroft gets harder: levels 1 and 2 at the same state of the team (level 2 is played as if the keeper's floor were cracked; its state is the team's when level 1's keeper fell)",
    '',
    `| Depth | | ${STATE_BUCKETS.join(' | ')} | all |`,
    `| --- | --- | ${STATE_BUCKETS.map(() => '---:').join(' | ')} | ---: |`,
  );
  for (const { b, t1, t2 } of tables) {
    if (t1.total === 0) continue;
    md.push(
      `| ${bandName(b)} | level 1 | ${STATE_BUCKETS.map((k) => withN(t1.byShare[k])).join(' | ')} | ${withN(t1.all)} |`,
      `| | level 2 | ${STATE_BUCKETS.map((k) => withN(t2.byShare[k])).join(' | ')} | ${withN(t2.all)} |`,
    );
  }
  md.push(
    '',
    `#### What going down is worth (level 1, per attempt, in pack units: Bait + Essence + scrap)`,
    '',
    `Going down locks in nothing more (the depth and the main chest are already paid at the floor boss). A win puts the level's loot in the pack and banks the keeper's chest (a ${pct(KEEPER_GEAR)} chance of a gear piece, rare and epic odds raised). A defeat there takes ${pct(1 - RULES.dungeon.defeatKeepBp / 10_000)} of the whole pack (the floor's loot too, rounded up each) and a rare room's treasure not yet won; the depth, the main chest and the creatures' experience stay.`,
    '',
    `| Depth | | ${STATE_BUCKETS.join(' | ')} |`,
    `| --- | --- | ${STATE_BUCKETS.map(() => '---:').join(' | ')} |`,
  );
  for (const { b, t1 } of tables) {
    if (t1.total === 0) continue;
    const f = (c: DescentCell, g: (x: DescentCell) => string): string => (c.n < 5 ? '-' : g(c));
    md.push(
      `| ${bandName(b)} | gain | ${STATE_BUCKETS.map((k) => f(t1.byShare[k], (c) => `${num(c.gain)} units + ${num((c.won ?? 0) * KEEPER_GEAR, 2)} gear`)).join(' | ')} |`,
      `| | loss | ${STATE_BUCKETS.map((k) => f(t1.byShare[k], (c) => `${num(c.loss)} units`)).join(' | ')} |`,
    );
  }
  md.push('');
  return md;
}
