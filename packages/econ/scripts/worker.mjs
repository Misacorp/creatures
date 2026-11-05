// A worker thread of the report pool (scripts/pool.mjs): loads the job runner (src/jobs.ts) the way report.mjs loads the CLI,
// then runs the scenario jobs it is sent, one at a time, and posts back each result (or the error).
import { parentPort } from 'node:worker_threads';
import { loadModule } from './load.mjs';

const errorText = (error) =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

try {
  const { mod } = await loadModule('/src/jobs.ts');
  parentPort.on('message', ({ job }) => {
    try {
      parentPort.postMessage({ ok: true, outcome: mod.runScenarioJob(job) });
    } catch (error) {
      parentPort.postMessage({ ok: false, error: `job ${job.id}: ${errorText(error)}` });
    }
  });
  parentPort.postMessage({ ready: true });
} catch (error) {
  parentPort.postMessage({ ready: false, error: errorText(error) });
}
