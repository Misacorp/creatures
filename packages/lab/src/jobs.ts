/**
 * Jobs: the report split into independent pieces that can run on several cores.
 *
 * A report is a `Plan`: a list of jobs (plain data: a kind, its arguments and the jobs whose results it needs) and a
 * function that assembles the markdown and data from the results by job id, in the original order. The fights are pure
 * and seeded, so a job gives the same result wherever it runs and the report is the same on one core or many.
 * `runJobs` is the scheduler (the executor decides where a job runs: in this process or on a worker thread).
 */

export interface JobSpec {
  readonly id: string;
  /** The report section the job's time is counted under (the timing table at the end of a run). */
  readonly section: string;
  /** Which runner (`jobRunners.ts`) runs it. */
  readonly kind: string;
  /** Plain data (it is posted to a worker). */
  readonly args: unknown;
  /** Jobs whose results this one reads (its runner gets them by id). */
  readonly needs: readonly string[];
}

export type JobResults = ReadonlyMap<string, unknown>;

export interface Plan<T> {
  /** In priority order: when several jobs are ready, the earlier one starts first. */
  readonly jobs: readonly JobSpec[];
  readonly assemble: (results: JobResults) => T;
}

/** What an executor gives back for one job: the result and the seconds it took to run (not the time it waited). */
export interface JobOutcome {
  readonly result: unknown;
  readonly seconds: number;
}

export type Executor = (
  job: JobSpec,
  deps: Readonly<Record<string, unknown>>,
) => Promise<JobOutcome>;

export interface JobRun {
  readonly id: string;
  readonly section: string;
  readonly seconds: number;
}

/** Ids must be unique and every need must be an earlier or later job of the list (no unknown ids, no cycles). */
export function validateJobs(jobs: readonly JobSpec[]): void {
  const ids = new Set<string>();
  for (const j of jobs) {
    if (ids.has(j.id)) throw new Error(`duplicate job id ${j.id}`);
    ids.add(j.id);
  }
  for (const j of jobs)
    for (const n of j.needs) if (!ids.has(n)) throw new Error(`job ${j.id} needs unknown job ${n}`);
  // A job that can never become ready is a cycle.
  const done = new Set<string>();
  let progress = true;
  while (progress && done.size < jobs.length) {
    progress = false;
    for (const j of jobs)
      if (!done.has(j.id) && j.needs.every((n) => done.has(n))) {
        done.add(j.id);
        progress = true;
      }
  }
  if (done.size < jobs.length)
    throw new Error(
      `jobs in a cycle: ${jobs
        .filter((j) => !done.has(j.id))
        .map((j) => j.id)
        .join(', ')}`,
    );
}

/**
 * Runs the jobs, at most `slots` at a time, each as soon as the jobs it needs are done (earlier jobs of the list first).
 * Resolves with every result by id and the run of each job (in the order they finished); rejects on the first failure.
 */
export function runJobs(
  jobs: readonly JobSpec[],
  exec: Executor,
  slots: number,
): Promise<{ results: Map<string, unknown>; runs: JobRun[] }> {
  validateJobs(jobs);
  return new Promise((resolve, reject) => {
    const results = new Map<string, unknown>();
    const runs: JobRun[] = [];
    const pending = [...jobs];
    let running = 0;
    let failed = false;
    const pump = (): void => {
      if (failed) return;
      for (let i = 0; i < pending.length && running < slots;) {
        const job = pending[i];
        if (job && job.needs.every((n) => results.has(n))) {
          pending.splice(i, 1);
          running++;
          const deps = Object.fromEntries(job.needs.map((n) => [n, results.get(n)]));
          Promise.resolve()
            .then(() => exec(job, deps))
            .then(
              (out) => {
                results.set(job.id, out.result);
                runs.push({ id: job.id, section: job.section, seconds: out.seconds });
                running--;
                pump();
              },
              (error: unknown) => {
                failed = true;
                reject(error instanceof Error ? error : new Error(String(error)));
              },
            );
        } else i++;
      }
      if (!failed && pending.length === 0 && running === 0) resolve({ results, runs });
    };
    pump();
  });
}

/**
 * The timing table, one line per section (in the order the plan lists them): the seconds its jobs took (added up over
 * all cores) and how many jobs, then the wall-clock time of the whole run and how much of the cores it kept busy.
 */
export function timingLines(
  jobs: readonly JobSpec[],
  runs: readonly JobRun[],
  wallSeconds: number,
  slots: number,
): string[] {
  const sections: string[] = [];
  for (const j of jobs) if (!sections.includes(j.section)) sections.push(j.section);
  const total = runs.reduce((a, r) => a + r.seconds, 0);
  const width = Math.max(0, ...sections.map((s) => s.length));
  const lines = ['Timings (seconds of work added up over all jobs of the section):'];
  for (const s of sections) {
    const mine = runs.filter((r) => r.section === s);
    const secs = mine.reduce((a, r) => a + r.seconds, 0);
    lines.push(
      `  ${s.padEnd(width)}  ${secs.toFixed(1).padStart(7)} s  (${mine.length} job${mine.length === 1 ? '' : 's'})`,
    );
  }
  const busy = wallSeconds > 0 ? (100 * total) / (wallSeconds * slots) : 0;
  // The longest single jobs bound how short the wall clock can get: split these first.
  const longest = [...runs].sort((a, b) => b.seconds - a.seconds).slice(0, 5);
  lines.push(
    `  ${'total work'.padEnd(width)}  ${total.toFixed(1).padStart(7)} s`,
    `Longest jobs: ${longest.map((r) => `${r.id} ${r.seconds.toFixed(1)} s`).join(', ')}.`,
    `Wall clock ${wallSeconds.toFixed(1)} s on ${slots} ${slots === 1 ? 'job at a time' : 'jobs at a time'} (${Math.round(busy)}% busy).`,
  );
  return lines;
}
