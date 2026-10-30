/**
 * Runs one job of a plan (`jobs.ts`). The worker threads of `scripts/pool.mjs` load this module and call `runTimed`;
 * with `--jobs 1` the CLI calls the same function in its own process (`inProcessExecutor`), so both paths run the same code.
 */
import { CARDS } from './cards';
import { runBossJob, type BossJobArgs } from './bossReport';
import { runPathJob } from './path';
import type { Executor, JobOutcome, JobSpec } from './jobs';
import {
  reportAnswers,
  reportBest,
  reportCasual,
  reportScenarios,
  reportWeekend,
  teamInputsOf,
} from './report';
import {
  calibrateTalents,
  measureForm,
  talentCalibrationId,
  type TalentCalibration,
} from './talentReport';
import { TEAM_BOSS_WIN_RATE } from './teamShare';
import { buildTeamShareSection } from './teamShareReport';
import { runTuneJob } from './tuner';

/** Runs the job and returns its result: plain data, so that it can be posted between threads. */
export function runJob(job: JobSpec, deps: Readonly<Record<string, unknown>>): unknown {
  const cards = CARDS.filter((c) => !c.raidOnly);
  switch (job.kind) {
    case 'report-scenarios': {
      const a = job.args as { card: string; quick: boolean };
      return reportScenarios(a.card, a.quick);
    }
    case 'report-answers': {
      const a = job.args as { card: string; quick: boolean };
      return reportAnswers(a.card, a.quick);
    }
    case 'report-best': {
      const a = job.args as { mode: 'gauntlet' | 'raid'; card: string; quick: boolean };
      return reportBest(a.mode, a.card, a.quick);
    }
    case 'report-casual': {
      const a = job.args as { roster: number; card: string; quick: boolean };
      return reportCasual(a.roster, a.card, a.quick);
    }
    case 'report-weekend':
      return reportWeekend((job.args as { quick: boolean }).quick);
    case 'talent-calibration':
      return calibrateTalents((job.args as { quick: boolean }).quick);
    case 'talent-form': {
      const a = job.args as { form: string; quick: boolean };
      return measureForm(a.form, a.quick, cards, deps[talentCalibrationId] as TalentCalibration);
    }
    case 'talent-team': {
      const a = job.args as { quick: boolean; fromJobs: boolean };
      return buildTeamShareSection({
        cards,
        quick: a.quick,
        winRate: TEAM_BOSS_WIN_RATE,
        ...(a.fromJobs ? { teams: teamInputsOf((id) => deps[id], a.quick) } : {}),
      });
    }
    case 'boss':
      return runBossJob(job.args as BossJobArgs, deps);
    case 'path-server':
      return runPathJob(job.args);
    case 'tune-eval':
      return runTuneJob(job.args);
    default:
      throw new Error(`unknown job kind ${job.kind}`);
  }
}

/** Runs the job and times it (seconds of work, not of waiting). */
export function runTimed(job: JobSpec, deps: Readonly<Record<string, unknown>>): JobOutcome {
  const t0 = Date.now();
  const result = runJob(job, deps);
  return { result, seconds: (Date.now() - t0) / 1000 };
}

/**
 * Runs the job in this process. The result is copied the way a message to a worker is, so a result that could not be
 * posted (a function in it, say) fails on one core too.
 */
export const inProcessExecutor: Executor = (job, deps) => {
  const out = runTimed(job, deps);
  return Promise.resolve({ result: structuredClone(out.result), seconds: out.seconds });
};
