import { writeFileSync } from 'node:fs';
import { CARDS } from './cards';
import { RAID_BOSS_IDS } from './bosses';
import { planBosses } from './bossReport';
import { DETERMINATION, planPath, type PathSummary } from './path';
import { ownabilityMarkdown, ownabilityTable } from './ownability';
import { ROSTER_SPEEDS, type RosterSpeed } from './roster';
import { inProcessExecutor } from './jobRunners';
import { runJobs, timingLines, type Executor, type JobRun, type JobSpec, type Plan } from './jobs';
import { planReport, buildCatalogue, buildKeywords } from './report';
import { TARGET_RANKS, type TargetRank } from './targets';
import { planTalents, talentTeamId } from './talentReport';
import type { TeamShareSummary } from './teamShareReport';
import { trackSummary, tuneTrack } from './trackTuner';
import { SLOT_WEEKS, TRACK_ORDER } from './track';
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
  if (args.includes('--tune'))
    return args.includes('--track') ? tuneTrackCli(args, quick, run) : tune(args, quick, run);
  if (args.includes('--path')) return path(args, quick, run);
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

/**
 * `--path [--speed slow|expected|fast|all] [--determination] [--quick] [--out <file.md>]`: the path simulator (`path.ts`). It plays many seeded
 * servers (40, or 8 with `--quick`) of each kind through the boss track week by week and prints, per roster speed, the week each
 * slot is reached, the weekends spent on it and the share of servers stuck for more than four weeks on one boss. Nothing is tuned.
 * `--determination` plays the same servers again with Determination on (`DETERMINATION`: +5% damage and healing for each failed week
 * on the same boss, at most 10 stacks, reset by a kill) and prints that beside the path without it; it is off otherwise.
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
  // `--determination`: the same servers also with Determination on (`DETERMINATION`), reported beside the path without it.
  const withDetermination = args.includes('--determination');
  const plain = await runPlan(planPath({ quick, speeds }), run);
  const mds = [plain.value.md.join('\n')];
  let timings = plain.timings;
  if (withDetermination) {
    const on = await runPlan(planPath({ quick, speeds, determination: DETERMINATION }), run);
    mds.push(on.value.md.join('\n'));
    timings += '\n' + on.timings;
  }
  mds.push(ownabilityOfPath(plain.value.data).join('\n'));
  const md = mds.join('\n');
  console.log(md);
  if (out) writeFileSync(out, md + '\n');
  console.log(`path in ${secondsSince(t0)} s`);
  console.log(timings);
  return 0;
}

/**
 * The ownability table (`ownability.ts`) at the arrival weeks of this path: the median week a dedicated server arrives at each slot
 * 1 to 15 at the expected speed when the run has it, else the committed `SLOT_WEEKS` (the weeks the track was tuned for).
 */
function ownabilityOfPath(data: readonly PathSummary[]): string[] {
  const dedicated = data.find((d) => d.server === 'dedicated' && d.speed === 'expected');
  const weeks = SLOT_WEEKS.map((committed, i) => {
    const slot = dedicated?.slots[i];
    return slot && slot.reachedShare > 0 ? slot.week.median : committed;
  });
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

/**
 * `--tune --track [--slots 1-15] [--quick] [--out <file.md>]`: the track tuner (`trackTuner.ts`). The path (expected speed) gives each
 * slot's arrival week, each slot is tuned for the roster of that week against Misa's targets, the proposals go into the table in
 * memory and the path runs again, until no arrival week moves (at most four tunings). Prints the rounds, the numbers per slot and the
 * lines to paste into `SLOT_NUMBERS` (`track.ts`). Nothing is applied.
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
  const [first, last] = range;
  const result = await tuneTrack({
    first,
    last,
    quick,
    run,
  });
  const md = trackSummary(result, { quick, first, last }).join('\n');
  console.log(md);
  if (out) {
    writeFileSync(out, md + '\n');
    writeFileSync(out.replace(/(\.md)?$/, '.json'), JSON.stringify(result, null, 1) + '\n');
  }
  return 0;
}
