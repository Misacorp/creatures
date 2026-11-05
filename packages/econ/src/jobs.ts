import { RULES } from './rules';
import {
  isStudyVariant,
  runScenario,
  studySeedsFor,
  type Results,
  type ScenarioResult,
} from './scenarios';
import { ALL_SERVERS, SERVERS } from './servers';

/**
 * The report's jobs: one scenario over its seeds. A job is plain data (it can be sent to a worker thread, `scripts/pool.mjs`); its
 * outcome is the scenario's result and the seconds it took. The same job gives the same result wherever it runs.
 */
export interface ScenarioJob {
  readonly id: string;
  readonly seeds: number;
}

export interface JobOutcome {
  readonly result: ScenarioResult;
  readonly seconds: number;
}

/** Runs a job in this process. */
export function runScenarioJob(job: ScenarioJob): JobOutcome {
  const config = ALL_SERVERS.find((s) => s.id === job.id);
  if (!config) throw new Error(`unknown scenario ${job.id}`);
  const t = Date.now();
  const result = runScenario(config, job.seeds, RULES);
  return { result, seconds: (Date.now() - t) / 1000 };
}

/** Runs a job somewhere (this process, or a worker thread). */
export type Executor = (job: ScenarioJob) => Promise<JobOutcome>;

export const inProcess: Executor = (job) => Promise.resolve(runScenarioJob(job));

/**
 * Runs the scenarios (all, or `only`) with `exec`, at most `slots` at a time, and returns their results in the order of
 * `ALL_SERVERS` (so the output does not depend on which job finished first) with the seconds each took. The five main servers run
 * `seeds` seeds and the variants `variantSeeds` (the seeds 1.. of the same draws, so a variant is a subset of a main server's runs).
 */
export async function runScenarios(
  seeds: number,
  exec: Executor,
  slots: number,
  only?: readonly string[],
  variantSeeds: number = seeds,
): Promise<{ results: Results; seconds: Record<string, number> }> {
  const ids = ALL_SERVERS.map((s) => s.id).filter((id) => !only || only.includes(id));
  const outcomes = new Map<string, JobOutcome>();
  // Biggest servers first, so the last jobs are small and the cores finish together.
  const size = (id: string): number => {
    const c = ALL_SERVERS.find((s) => s.id === id);
    return (c?.players.length ?? 0) * (c?.weeks ?? 0);
  };
  const order = [...ids].sort((a, b) => size(b) - size(a));
  let next = 0;
  const lane = async (): Promise<void> => {
    for (let i = next++; i < order.length; i = next++) {
      const id = order[i] as string;
      const main = SERVERS.some((s) => s.id === id);
      const n = main ? seeds : isStudyVariant(id) ? studySeedsFor(variantSeeds) : variantSeeds;
      outcomes.set(id, await exec({ id, seeds: n }));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(slots, ids.length)) }, lane));
  const results: Record<string, ScenarioResult> = {};
  const seconds: Record<string, number> = {};
  for (const id of ids) {
    const outcome = outcomes.get(id) as JobOutcome;
    results[id] = outcome.result;
    seconds[id] = outcome.seconds;
  }
  return { results, seconds };
}
