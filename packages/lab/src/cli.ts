import { writeFileSync } from 'node:fs';
import { CARDS } from './cards';
import { RAID_BOSS_IDS } from './bosses';
import { planBosses } from './bossReport';
import { inProcessExecutor } from './jobRunners';
import { runJobs, timingLines, type Executor, type JobRun, type JobSpec, type Plan } from './jobs';
import { planReport, buildCatalogue, buildKeywords } from './report';
import { planTalents, talentTeamId } from './talentReport';
import type { TeamShareSummary } from './teamShareReport';

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
 * (`--boss <id>` only one raid boss). `--jobs` is how many jobs run at a time (default: one per core; 1 is the serial path).
 * Every run ends with the seconds each section took.
 */
export async function main(args: readonly string[], run: JobRunner = serial): Promise<number> {
  const quick = args.includes('--quick');
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
