/**
 * The Undercroft's tools (Misa, 2026-11-05): past depth 40 a healthy team (over 80% HP at the floor's end) beats the keeper of level 1 only about
 * one time in five, so going down stops paying. What would make it easier? Each tool of `undercroftToolSet.ts` is played by the dungeon days
 * (`dungeonDays.ts`, the safe player with the probe, as `--dungeon-days` plays `shipped`) and read the same way: the level 1 clear chance by
 * the team's state at the floor's end and by depth band, what a descent wins and risks per attempt at over 80%, and the expected speed (the
 * depth a daily player gains a week). Nothing here is a gate or written to game data; the choice between the tools is Misa's.
 *
 * What a tool can change in the speed: a clear locks in depth + 1 whatever happens below, so the Undercroft tools (a camp in it, a softer
 * curve) leave a safe player's speed as it is; the ones that touch the base floors (a bigger bench, gear, four slots) change it.
 */
import { SURE_SHARE, type DayRun, type PlayerDays } from './dungeonDays';
import {
  gainByBand,
  descentTable,
  KEEPER_GEAR,
  STATE_BUCKETS,
  type DescentCell,
} from './dungeonMeasure';
import { dungeonDaysJobId, DUNGEON_DAYS_SERVERS, type DungeonDaysJobArgs } from './dungeonMeasure';
import type { JobResults, JobSpec, Plan } from './jobs';
import { ROSTER_SPEEDS, type RosterSpeed } from './roster';
import { TOOLS, type Tool } from './undercroftToolSet';

/** The bands of the report: the reference (8 to 12), the long middle and the wall. */
export const TOOL_BANDS: readonly (readonly [number, number])[] = [
  [8, 12],
  [21, 40],
  [41, Infinity],
];
const bandName = (b: readonly [number, number]): string =>
  b[1] === Infinity ? `${b[0]}+` : `${b[0]}-${b[1]}`;

/** Finer depth bands for the healthy team's clear chance: the 41+ band is wide (a daily player reaches depth 100 and more in 24 weeks), and the depth picker's step is small beside it. */
export const FINE_BANDS: readonly (readonly [number, number])[] = [
  [13, 20],
  [21, 30],
  [31, 40],
  [41, 50],
  [51, 70],
  [71, 100],
  [101, 140],
  [141, Infinity],
];

export interface UndercroftToolsOptions {
  readonly quick: boolean;
  readonly servers?: number;
  readonly speeds?: readonly RosterSpeed[];
  readonly kinds?: readonly (typeof DUNGEON_DAYS_SERVERS)[number][];
  /** Tool ids (default: all). `today` is always played. */
  readonly tools?: readonly string[];
  /** Everyone plays with the lab's gear model (`gear.ts`) at the roster's item level. Default off. */
  readonly gear?: boolean;
}

export interface UndercroftToolsReport {
  readonly md: string[];
}

const jobArgs = (
  tool: string,
  server: string,
  speed: RosterSpeed,
  index: number,
  gear = false,
): DungeonDaysJobArgs => ({
  server,
  speed,
  index,
  scenario: 'shipped',
  tool,
  ...(gear ? { gear: true } : {}),
});

/** The runs a tool's table reads: all of them, or for the depth picker the replays, filed under the best depth they stepped back from. */
export function runsFor(tool: Tool, runs: readonly DayRun[]): DayRun[] {
  const back = tool.config.stepBack ?? 0;
  if (back === 0) return [...runs];
  return runs.filter((r) => r.replay).map((r) => ({ ...r, depth: r.depth + back }));
}

const pct = (x: number | null): string => (x === null ? '-' : `${Math.round(100 * x)}%`);
const num = (x: number, d = 1): string => x.toFixed(d);
const withN = (c: DescentCell): string => (c.n < 5 ? `- (n ${c.n})` : `${pct(c.won)} (n ${c.n})`);
const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** Expected pack units per attempt: what a win puts in the pack minus what a defeat takes out of it. */
export const expectedUnits = (c: DescentCell): number => c.gain - c.loss;

export function planUndercroftTools(options: UndercroftToolsOptions): Plan<UndercroftToolsReport> {
  const n = options.servers ?? (options.quick ? 2 : 8);
  const speeds = options.speeds ?? ROSTER_SPEEDS;
  const kinds = options.kinds ?? DUNGEON_DAYS_SERVERS;
  const tools = TOOLS.filter(
    (t) => t.id === 'today' || !options.tools || options.tools.includes(t.id),
  );
  const each = <T>(tool: Tool, f: (a: DungeonDaysJobArgs) => T): T[] =>
    kinds.flatMap((server) =>
      speeds.flatMap((speed) =>
        Array.from({ length: n }, (_, index) =>
          f(jobArgs(tool.id, server, speed, index, options.gear)),
        ),
      ),
    );
  const jobs: JobSpec[] = tools.flatMap((tool) =>
    each(tool, (a) => ({
      id: dungeonDaysJobId(a),
      section: `Undercroft tools: ${tool.id}`,
      kind: 'dungeon-days',
      args: a,
      needs: [],
    })),
  );
  return {
    jobs,
    assemble: (results: JobResults): UndercroftToolsReport => {
      const playersOf = (tool: Tool): PlayerDays[] =>
        each(tool, (a) => results.get(dungeonDaysJobId(a)) as PlayerDays[]).flat();
      const data = tools.map((tool) => {
        const players = playersOf(tool);
        const runs = runsFor(
          tool,
          players.flatMap((p) => p.runs),
        );
        return { tool, players, runs };
      });
      return { md: toolsMarkdown(data, n, kinds, speeds) };
    },
  };
}

export interface ToolData {
  readonly tool: Tool;
  readonly players: readonly PlayerDays[];
  readonly runs: readonly DayRun[];
}

export function toolsMarkdown(
  data: readonly ToolData[],
  n: number,
  kinds: readonly string[],
  speeds: readonly string[],
): string[] {
  const md: string[] = [
    '## The Undercroft past depth 40: what makes going down pay',
    '',
    `Misa's question (2026-11-05): a healthy team beats the keeper of level 1 only about one time in five at depth 41 and deeper, so going down stops paying. Each tool below is played on top of \`shipped\` (the game's data) by the dungeon days of ${n} servers of each of ${kinds.join(', ')} at ${speeds.join(', ')} speeds over 24 weeks, a safe player who goes down only above ${Math.round(100 * SURE_SHARE)}% (the probe plays level 1 whatever the player would do, so every state has a clear chance). Level 1 is read, from every cleared run at the depth band. Nothing is written to game data.`,
    '',
    "What the game's camp does (`applyCamp`, `RULES.dungeon.camp`): one choice, Swap a knocked-out creature for a bench one, take one of two keepsakes, or Rest (standing creatures recover 40% of max HP; a knocked-out one stays out). The lab's planner swaps a knocked-out or nearly-out creature when it has a bench one, else takes the keepsake when healthy, else rests; a casual player has no bench and rests. The game has no camp in the Undercroft today except a carved door's camp mark (15% of the marks, a room before the keeper); the lab's runs carry no marks. A skill tree camp node is a hypothetical that adds that camp. The camp is placed on level 1 only. The bench is what the lab's policy brings: planners (prepared players and builders) bring two creatures, casual players none, so a bench or a swap only helps the planners. A run has one camp (two with the new one), and a swap uses one bench creature, so a bench of two already covers every swap: one more creature changes nothing unless there are more camps.",
    '',
  ];
  // The caveats per tool.
  md.push('| Tool | What it is | Caveat |', '| --- | --- | --- |');
  for (const { tool } of data) md.push(`| \`${tool.id}\` | ${tool.note} | ${tool.caveat ?? '-'} |`);
  md.push('');
  for (const band of TOOL_BANDS) {
    md.push(
      `### Level 1 clear chance by the team's state at the floor's end, depth ${bandName(band)}`,
      '',
      `| Tool | floor-ends >80% | ${STATE_BUCKETS.join(' | ')} | all |`,
      `| --- | ---: | ${STATE_BUCKETS.map(() => '---:').join(' | ')} | ---: |`,
    );
    for (const { tool, runs } of data) {
      const t = descentTable(runs, band, 1);
      if (t.total === 0) {
        md.push(`| \`${tool.id}\` | - | ${STATE_BUCKETS.map(() => '-').join(' | ')} | - |`);
        continue;
      }
      md.push(
        `| \`${tool.id}\` | ${pct(t.byShare['>80%'].share)} | ${STATE_BUCKETS.map((k) => withN(t.byShare[k])).join(' | ')} | ${withN(t.all)} |`,
      );
    }
    md.push('');
  }
  md.push(
    "### A healthy team's (over 80%) level 1 clear chance by finer depth band",
    '',
    "The 41+ band above is wide, so its number is a mix of depths. This is the same chance by narrower bands; the depth picker's `back-5` and `back-10` rows are the replays, filed under the best depth they stepped back from.",
    '',
    `| Tool | ${FINE_BANDS.map(bandName).join(' | ')} |`,
    `| --- | ${FINE_BANDS.map(() => '---:').join(' | ')} |`,
  );
  for (const { tool, runs } of data) {
    md.push(
      `| \`${tool.id}\` | ${FINE_BANDS.map((b) => withN(descentTable(runs, b, 1).byShare['>80%'])).join(' | ')} |`,
    );
  }
  md.push(
    '',
    `### What a descent is worth for a healthy team (over 80% at the floor's end), per attempt`,
    '',
    `Pack units (Bait + Essence + scrap): "win" is the units a won level puts in the pack, "risk" what a defeat takes out of the pack (half, rounded up), "net" win minus risk per attempt, and the keeper's gear piece (a ${pct(KEEPER_GEAR)} chance) on a win. The picker's rows are the replays: the depth is the best depth stepped back from, the level is played at the lower one.`,
    '',
    `| Tool | ${TOOL_BANDS.map((b) => `${bandName(b)}: clear / win / risk / net / gear`).join(' | ')} |`,
    `| --- | ${TOOL_BANDS.map(() => '---:').join(' | ')} |`,
  );
  for (const { tool, runs } of data) {
    const cells = TOOL_BANDS.map((b) => {
      const c = descentTable(runs, b, 1).byShare['>80%'];
      return c.n < 5
        ? `- (n ${c.n})`
        : `${pct(c.won)} / ${num(c.gain)} / ${num(c.loss)} / ${num(expectedUnits(c))} / ${num((c.won ?? 0) * KEEPER_GEAR, 2)}`;
    });
    md.push(`| \`${tool.id}\` | ${cells.join(' | ')} |`);
  }
  md.push(
    '',
    '### Expected speed: depth a daily player gains a week (mean of the player-weeks)',
    '',
    "Daily players of all the servers. The Undercroft tools cannot change a safe player's speed (the depth is locked in when the floor boss falls); a bigger bench, gear and four slots change the base floors too. The picker's speed is the step-back's cost: a replay below the best depth gives no depth.",
    '',
    '| Tool | Wk 5-8 | Wk 9-16 | Wk 17-24 |',
    '| --- | ---: | ---: | ---: |',
  );
  for (const { tool, players } of data) {
    const daily = players.filter((p) => p.roster === 'daily');
    const g = (b: readonly [number, number]): string => num(gainByBand(daily, b).mean, 2);
    md.push(`| \`${tool.id}\` | ${g([5, 8])} | ${g([9, 16])} | ${g([17, 24])} |`);
  }
  const base = data.find((d) => d.tool.id === 'today');
  if (base) {
    const all = base.runs.filter((r) => r.floor !== null && r.depth >= 41);
    md.push(
      '',
      `Baseline at 41+: ${all.length} floor-ends, ${pct(mean(all.map((r) => (r.floor && r.floor.share > 0.8 ? 1 : 0))))} of them over 80%.`,
    );
  }
  md.push('');
  return md;
}
