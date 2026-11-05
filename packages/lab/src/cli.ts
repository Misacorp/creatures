import { writeFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';
import { CARDS } from './cards';
import { RAID_BOSS_IDS } from './bosses';
import { planBosses } from './bossReport';
import { planDungeonDays } from './dungeonMeasure';
import { planUndercroftTools } from './undercroftTools';
import { planFourSlot } from './fourSlot';
import { planGate } from './gate';
import { planJourney } from './journey';
import { planPath, type PathSummary } from './path';
import { planRules } from './ruleCheck';
import { ownabilityMarkdown, ownabilityTable } from './ownability';
import { ROSTER_SPEEDS, type RosterSpeed } from './roster';
import { inProcessExecutor } from './jobRunners';
import { runJobs, timingLines, type Executor, type JobRun, type JobSpec, type Plan } from './jobs';
import { planReport, buildCatalogue, buildKeywords } from './report';
import { TARGET_RANKS, type TargetRank } from './targets';
import { planTalents, talentTeamId } from './talentReport';
import type { TeamShareSummary } from './teamShareReport';
import { writeTrackNumbers } from './trackFile';
import { journeyPass, journeyPassSummary } from './trackJourney';
import { planSlotInfo, slotInfoMarkdown, trackSummary, tuneTrack } from './trackTuner';
import { SLOT_NUMBERS, SLOT_WEEKS, TRACK_ORDER } from './track';
import { summaryAll, tuneBoss, type RankResult } from './tuner';

/** Where the jobs run: `exec` runs one job, `slots` of them at a time (`scripts/report.mjs` sets both from `--jobs`). */
export interface JobRunner {
  readonly exec: Executor;
  readonly slots: number;
}

const serial: JobRunner = { exec: inProcessExecutor, slots: 1 };

const secondsSince = (t0: number) => Math.round((Date.now() - t0) / 1000);

/** Runs the plan, prints the timing table and returns what the plan assembles. */
async function runPlan<T>(
  plan: Plan<T>,
  run: JobRunner,
): Promise<{ value: T; runs: JobRun[]; timings: string }> {
  const t0 = Date.now();
  const { results, runs } = await runJobs(plan.jobs, run.exec, run.slots);
  const value = plan.assemble(results);
  const wall = (Date.now() - t0) / 1000;
  return { value, runs, timings: timingLines(plan.jobs, runs, wall, run.slots).join('\n') };
}

/**
 * `pnpm --filter @creatures/lab report [-- --quick] [--out <file>] [--jobs <n>]`: writes the lab report; `--talents` prints
 * only the talent section, `--team` only its team share, `--bosses` only the real raid bosses and dungeon foes
 * (`--boss <id>` only one raid boss), `--tune` the boss tuner (below). `--jobs` is how many jobs run at a time (default: one per core; 1 is the serial path).
 * Every run ends with the seconds each section took.
 */
export async function main(args: readonly string[], run: JobRunner = serial): Promise<number> {
  const quick = args.includes('--quick');
  if (args.includes('--tune')) {
    if (args.includes('--track')) return tuneTrackCli(args, quick, run);
    if (args.includes('--write')) {
      console.error('--write is for the track tuner: use --tune --track --write');
      return 1;
    }
    return tune(args, quick, run);
  }
  if (args.includes('--path')) return path(args, quick, run);
  if (args.includes('--journey')) return journey(quick, run);
  if (args.includes('--dungeon-days')) return dungeonDays(args, quick, run);
  if (args.includes('--undercroft-tools')) return undercroftTools(args, quick, run);
  if (args.includes('--four-slot')) return fourSlot(quick, run);
  if (args.includes('--rules')) return rules(quick, run);
  if (args.includes('--gate')) return gate(quick, run);
  const bossAt = args.indexOf('--boss');
  if (args.includes('--bosses') || bossAt >= 0) {
    // Only the real raid bosses and dungeon foes, to the console (nothing is written).
    const only = bossAt >= 0 ? args[bossAt + 1] : undefined;
    if (bossAt >= 0 && (only === undefined || !RAID_BOSS_IDS.includes(only))) {
      console.error(
        `${only === undefined ? 'Missing boss id' : `Unknown raid boss "${only}"`}. Raid bosses: ${RAID_BOSS_IDS.join(', ')}`,
      );
      return 1;
    }
    const t0 = Date.now();
    const { value, timings } = await runPlan(planBosses({ quick, ...(only ? { only } : {}) }), run);
    console.log(value.md.join('\n'));
    console.log(`bosses in ${secondsSince(t0)} s`);
    console.log(timings);
    return 0;
  }
  if (args.includes('--team')) {
    // Tuning loop: only the talents' share of the team's result.
    const t0 = Date.now();
    const job: JobSpec = {
      id: talentTeamId,
      section: 'Talents: team share',
      kind: 'talent-team',
      args: { quick, fromJobs: false },
      needs: [],
    };
    const { value, timings } = await runPlan(
      {
        jobs: [job],
        assemble: (results) =>
          results.get(talentTeamId) as {
            md: string[];
            data: Record<string, unknown>;
            summary: TeamShareSummary;
          },
      },
      run,
    );
    console.log(value.md.join('\n'));
    if (args.includes('--json')) console.log(JSON.stringify(value.data));
    console.log(`team share in ${secondsSince(t0)} s`);
    console.log(timings);
    return 0;
  }
  if (args.includes('--talents')) {
    // Tuning loop: only the talent section, to the console (nothing is written).
    const t0 = Date.now();
    const { value: section, timings } = await runPlan(
      planTalents({ cards: CARDS.filter((c) => !c.raidOnly), quick }),
      run,
    );
    console.log(section.teamMd.join('\n'));
    console.log(section.md.slice(section.md.findIndex((l) => l.startsWith('| Role'))).join('\n'));
    console.log(`talent section in ${secondsSince(t0)} s`);
    console.log(timings);
    return 0;
  }
  const i = args.indexOf('--out');
  const out = i >= 0 ? args[i + 1] : '../../docs/design/combat/lab-report.md';
  const t = Date.now();
  const { value: report, timings } = await runPlan(planReport({ quick }), run);
  if (out) {
    writeFileSync(out, report.markdown + '\n');
    writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify(report.data, null, 1) + '\n');
    writeFileSync(out.replace(/lab-report\.md$/, 'knacks.md'), buildCatalogue() + '\n');
    writeFileSync(out.replace(/lab-report\.md$/, 'keywords.md'), buildKeywords() + '\n');
  }
  console.log(`lab report written to ${out} in ${secondsSince(t)} s`);
  console.log(timings);
  return 0;
}

/** The value after a flag, or undefined. */
const flagValue = (args: readonly string[], flag: string): string | undefined => {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
};

/**
 * `--tune [--boss <id>] [--rank low|mid|high|all] [--quick] [--out <file.md>]`: the boss tuner (`tuner.ts`). It searches each
 * boss's HP, Attack and armour against the targets (`targets.ts`) and prints a short markdown summary: today's numbers, the best
 * found (ready to paste) and the targets that conflict. Nothing is applied. With `--out` the summary is also written to the file
 * and the full result next to it as JSON. Without `--boss` every boss is tuned (the bosses side by side on the same cores).
 */
async function tune(args: readonly string[], quick: boolean, run: JobRunner): Promise<number> {
  const boss = args.includes('--boss') ? flagValue(args, '--boss') : undefined;
  if (args.includes('--boss') && (boss === undefined || !RAID_BOSS_IDS.includes(boss))) {
    console.error(
      `${boss === undefined ? 'Missing boss id' : `Unknown raid boss "${boss}"`}. Raid bosses: ${RAID_BOSS_IDS.join(', ')}`,
    );
    return 1;
  }
  const rankArg = flagValue(args, '--rank') ?? 'high';
  const ranks: readonly TargetRank[] | undefined =
    rankArg === 'all'
      ? TARGET_RANKS
      : TARGET_RANKS.find((r) => r === rankArg)
        ? [rankArg as TargetRank]
        : undefined;
  if (!ranks) {
    console.error(`Unknown rank "${rankArg}". Ranks: ${[...TARGET_RANKS, 'all'].join(', ')}`);
    return 1;
  }
  const out = args.includes('--out') ? flagValue(args, '--out') : undefined;
  if (args.includes('--out') && !out) {
    console.error('--out needs a file name');
    return 1;
  }
  const t0 = Date.now();
  const results: RankResult[] = (
    await Promise.all((boss ? [boss] : RAID_BOSS_IDS).map((id) => tuneBoss(id, ranks, quick, run)))
  ).flat();
  const summary = summaryAll(results, (Date.now() - t0) / 1000, quick);
  console.log(summary.join('\n'));
  if (out) {
    writeFileSync(out, summary.join('\n') + '\n');
    writeFileSync(out.replace(/(\.md)?$/, '.json'), JSON.stringify(results, null, 1) + '\n');
  }
  return 0;
}

/** `--journey [--quick]`: the journey on the game's rules (`journey.ts`), beside the lab's, to the console (nothing is written). */
async function journey(quick: boolean, run: JobRunner): Promise<number> {
  const t0 = Date.now();
  const { value, timings } = await runPlan(planJourney({ quick }), run);
  console.log(value.md.join('\n'));
  console.log(`journey in ${secondsSince(t0)} s`);
  console.log(timings);
  return 0;
}

/** `--undercroft-tools [--quick] [--tools a,b] [--servers n]`: the tools that make the Undercroft past depth 40 easier (`undercroftTools.ts`), to the console (nothing is written). */
async function undercroftTools(
  args: readonly string[],
  quick: boolean,
  run: JobRunner,
): Promise<number> {
  const t0 = Date.now();
  const tools = flagValue(args, '--tools')?.split(',');
  const servers = flagValue(args, '--servers');
  const { value, timings } = await runPlan(
    planUndercroftTools({
      quick,
      ...(tools ? { tools } : {}),
      ...(servers ? { servers: Number(servers) } : {}),
    }),
    run,
  );
  console.log(value.md.join('\n'));
  console.log(`undercroft tools in ${secondsSince(t0)} s`);
  console.log(timings);
  return 0;
}

/** `--gate [--quick]`: the phase 5 gate table (`gate.ts`), to the console (nothing is written). */
async function gate(quick: boolean, run: JobRunner): Promise<number> {
  const t0 = Date.now();
  // The boss rules (`ruleCheck.ts`) run in the same pool, after the gate table.
  const g = planGate({ quick });
  const r = planRules({ quick });
  const { value, timings } = await runPlan(
    {
      jobs: [...g.jobs, ...r.jobs],
      assemble: (results) => [...g.assemble(results).md, ...r.assemble(results).md],
    },
    run,
  );
  console.log(value.join('\n'));
  console.log(`gate in ${secondsSince(t0)} s`);
  console.log(timings);
  return 0;
}

/** `--rules [--quick]`: the boss rules the lab tests used to assert (`ruleCheck.ts`), to the console (nothing is written). */
async function rules(quick: boolean, run: JobRunner): Promise<number> {
  const t0 = Date.now();
  const { value, timings } = await runPlan(planRules({ quick }), run);
  console.log(value.md.join('\n'));
  console.log(`rules in ${secondsSince(t0)} s`);
  console.log(timings);
  return 0;
}

/** `--four-slot [--quick]`: the team search on a row of four, to the console (`fourSlot.ts`; nothing is written). */
async function fourSlot(quick: boolean, run: JobRunner): Promise<number> {
  const t0 = Date.now();
  const { value, timings } = await runPlan(planFourSlot({ quick }), run);
  console.log(value.md.join('\n'));
  console.log(`four-slot in ${secondsSince(t0)} s`);
  console.log(timings);
  return 0;
}

/** `--dungeon-days [--quick] [--rewards] [--scenarios a,b] [--step-back n] [--servers n]`: each player's daily dungeon runs over 24 weeks (`dungeonDays.ts`), to the console (nothing is written). */
async function dungeonDays(
  args: readonly string[],
  quick: boolean,
  run: JobRunner,
): Promise<number> {
  const t0 = Date.now();
  const scenarios = flagValue(args, '--scenarios')?.split(',');
  const stepBack = Number(flagValue(args, '--step-back') ?? 0);
  const servers = flagValue(args, '--servers');
  const { value, timings } = await runPlan(
    planDungeonDays({
      quick,
      ...(scenarios ? { scenarios } : {}),
      ...(stepBack > 0 ? { stepBack } : {}),
      ...(args.includes('--rewards') ? { rewards: true } : {}),
      ...(servers ? { servers: Number(servers) } : {}),
    }),
    run,
  );
  console.log(value.md.join('\n'));
  console.log(`dungeon days in ${secondsSince(t0)} s`);
  console.log(timings);
  return 0;
}

/**
 * `--path [--speed slow|expected|fast|all] [--determination] [--quick] [--out <file.md>]`: the path simulator (`path.ts`). It plays many seeded
 * servers (40, or 8 with `--quick`) of each kind through the boss track week by week and prints, per roster speed, the week each
 * slot is reached, the weekends spent on it and the share of servers stuck for more than four weeks on one boss. Nothing is tuned.
 * The path plays with Determination, which is on by default from the second lap (`DETERMINATION`: +15% damage and healing for each failed
 * weekend on the same boss, at most 5 stacks, from slot 6, reset by a kill). `--determination` also plays the same servers without it and
 * prints that beside it, as a comparison; `--no-determination` prints only the path without it.
 */
async function path(args: readonly string[], quick: boolean, run: JobRunner): Promise<number> {
  const speedArg = flagValue(args, '--speed') ?? 'expected';
  const speeds: readonly RosterSpeed[] | undefined =
    speedArg === 'all'
      ? ROSTER_SPEEDS
      : ROSTER_SPEEDS.find((s) => s === speedArg)
        ? [speedArg as RosterSpeed]
        : undefined;
  if (!speeds) {
    console.error(`Unknown speed "${speedArg}". Speeds: ${[...ROSTER_SPEEDS, 'all'].join(', ')}`);
    return 1;
  }
  const out = args.includes('--out') ? flagValue(args, '--out') : undefined;
  if (args.includes('--out') && !out) {
    console.error('--out needs a file name');
    return 1;
  }
  const t0 = Date.now();
  // The path has Determination on (`DETERMINATION`). `--determination` adds the same servers without it as a comparison;
  // `--no-determination` plays only without it.
  const comparison = args.includes('--determination');
  const dial = args.includes('--no-determination') ? ('off' as const) : undefined;
  // The builder server (four daily players with random legal talents) is shown beside the dedicated and the mixed server.
  const plain = await runPlan(
    planPath({
      quick,
      speeds,
      kinds: ['dedicated', 'mixed', 'builders'],
      ...(dial ? { determination: dial } : {}),
    }),
    run,
  );
  const mds = [plain.value.md.join('\n')];
  let timings = plain.timings;
  if (comparison && !dial) {
    const off = await runPlan(
      planPath({
        quick,
        speeds,
        kinds: ['dedicated', 'mixed', 'builders'],
        determination: 'off',
      }),
      run,
    );
    mds.push(off.value.md.join('\n'));
    timings += '\n' + off.timings;
  }
  mds.push(ownabilityOfPath(plain.value.data).join('\n'));
  // The information measures at the arrival weeks of this path (slots 1 to 24, the committed `SLOT_NUMBERS`).
  const info = await runPlan(planSlotInfo({ quick, weeks: arrivalWeeksOf(plain.value.data) }), run);
  mds.push(
    [
      '### Information measures at the arrival weeks (not targets)',
      '',
      ...slotInfoMarkdown(info.value),
    ].join('\n'),
  );
  timings += '\n' + info.timings;
  const md = mds.join('\n');
  console.log(md);
  if (out) writeFileSync(out, md + '\n');
  console.log(`path in ${secondsSince(t0)} s`);
  console.log(timings);
  return 0;
}

/**
 * The ownability table (`ownability.ts`) at the arrival weeks of this path: the median week a dedicated server arrives at each slot
 * 1 to 24 at the expected speed when the run has it, else the committed `SLOT_WEEKS` (the weeks the track was tuned for).
 */
function arrivalWeeksOf(data: readonly PathSummary[]): number[] {
  const dedicated = data.find((d) => d.server === 'dedicated' && d.speed === 'expected');
  return SLOT_WEEKS.map((committed, i) => {
    const slot = dedicated?.slots[i];
    return slot && slot.reachedShare > 0 ? slot.week.median : committed;
  });
}

function ownabilityOfPath(data: readonly PathSummary[]): string[] {
  const dedicated = data.find((d) => d.server === 'dedicated' && d.speed === 'expected');
  const weeks = arrivalWeeksOf(data);
  return ownabilityMarkdown(
    ownabilityTable(weeks),
    dedicated
      ? 'the median of a dedicated server at the expected speed, from this path'
      : 'the committed `SLOT_WEEKS` (this run has no expected-speed path)',
  );
}

/** `1-12` or `5` as a first and last slot; undefined when it is neither. */
function slotRange(text: string): readonly [number, number] | undefined {
  const m = /^(\d+)(?:-(\d+))?$/.exec(text);
  if (!m) return undefined;
  const first = Number(m[1]);
  const last = m[2] === undefined ? first : Number(m[2]);
  return first >= 1 && last >= first ? [first, last] : undefined;
}

/** The track's data file, which `--tune --track --write` writes (`packages/game/src/combat-v2/data/raid-track.json`). */
const TRACK_FILE = fileURLToPath(
  new URL('../../game/src/combat-v2/data/raid-track.json', import.meta.url),
);

/**
 * `--tune --track [--slots 1-15] [--quick] [--write] [--out <file.md>]`: the track tuner (`trackTuner.ts`). The path (expected speed)
 * gives each slot's arrival week, each slot is tuned for the roster of that week against Misa's targets, the proposals go into the
 * table in memory and the path runs again, until no arrival week moves (at most four tunings). Prints the rounds, the numbers per slot
 * and the lines to paste into `SLOT_WEEKS` and `SLOT_MIXED_ANSWER` (`track.ts`). With `--write` the tuned HP, Attack and armour of the
 * slots in range are written into `raid-track.json` (not with `--quick`: a quick run is a sketch); without it nothing is applied.
 */
async function tuneTrackCli(
  args: readonly string[],
  quick: boolean,
  run: JobRunner,
): Promise<number> {
  const slotsArg = flagValue(args, '--slots') ?? `1-${3 * TRACK_ORDER.length}`;
  const range = slotRange(slotsArg);
  if (!range) {
    console.error(`--slots needs a slot or a range such as 1-12, not "${slotsArg}"`);
    return 1;
  }
  const out = args.includes('--out') ? flagValue(args, '--out') : undefined;
  if (args.includes('--out') && !out) {
    console.error('--out needs a file name');
    return 1;
  }
  const write = args.includes('--write');
  if (write && quick) {
    console.error(
      '--write needs a full run: a --quick run is a sketch and is never written to the data',
    );
    return 1;
  }
  const [first, last] = range;
  // The journey pass (`trackJourney.ts`) eases the slots where the mixed server gets stuck on the v2 journey. By default it follows the
  // slot tuner; `--journey-only` runs it alone on the committed table; `--no-journey` skips it.
  const journeyOnly = args.includes('--journey-only');
  const result = journeyOnly
    ? undefined
    : await tuneTrack({
        first,
        last,
        quick,
        run,
      });
  const tuned = result?.loop.table ?? SLOT_NUMBERS;
  const pass = args.includes('--no-journey')
    ? undefined
    : journeyPass(tuned, { first, last, quick });
  const table = pass?.table ?? tuned;
  const written = write ? writeTrackNumbers(TRACK_FILE, table, first, last) : undefined;
  const md = [
    ...(result
      ? trackSummary(result, {
          quick,
          first,
          last,
          ...(written ? { write: written } : {}),
        })
      : []),
    ...(pass ? ['', ...journeyPassSummary(pass, first, last)] : []),
    ...(!result && written
      ? [
          '',
          `Written: slots ${written.written.join(', ')} (changed: ${written.changed.join(', ') || 'none'}).`,
        ]
      : []),
  ].join('\n');
  console.log(md);
  if (out) {
    writeFileSync(out, md + '\n');
    writeFileSync(
      out.replace(/(\.md)?$/, '.json'),
      JSON.stringify(result ?? { journeyPass: pass }, null, 1) + '\n',
    );
  }
  return 0;
}
