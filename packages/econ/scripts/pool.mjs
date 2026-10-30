// A pool of worker threads for the report's scenario jobs (src/jobs.ts): `exec` is the executor the scheduler calls, one job
// on one idle worker. The scheduler never runs more jobs at once than there are workers.
import { URL } from 'node:url';
import { Worker } from 'node:worker_threads';

/** Starts `size` workers (each loads the lab sources) and resolves when all are ready. */
export async function createPool(size) {
  const url = new URL('./worker.mjs', import.meta.url);
  const workers = [];
  const idle = [];
  const queue = [];

  const release = (worker) => {
    const next = queue.shift();
    if (next) next(worker);
    else idle.push(worker);
  };
  const acquire = () => {
    const worker = idle.pop();
    return worker ? Promise.resolve(worker) : new Promise((resolve) => queue.push(resolve));
  };

  const started = Promise.all(
    Array.from(
      { length: size },
      () =>
        new Promise((resolve, reject) => {
          const worker = new Worker(url);
          worker.current = undefined;
          workers.push(worker);
          worker.on('message', (message) => {
            if ('ready' in message) {
              if (message.ready) resolve(undefined);
              else reject(new Error(`worker failed to start: ${message.error}`));
              return;
            }
            const job = worker.current;
            worker.current = undefined;
            if (!job) return;
            if (message.ok) job.resolve(message.outcome);
            else job.reject(new Error(message.error));
          });
          worker.on('error', (error) => {
            reject(error);
            worker.current?.reject(error);
          });
          worker.on('exit', (code) => {
            worker.current?.reject(new Error(`worker exited with code ${code}`));
          });
          idle.push(worker);
        }),
    ),
  );
  try {
    await started;
  } catch (error) {
    await Promise.all(workers.map((worker) => worker.terminate()));
    throw error;
  }

  return {
    exec: async (job) => {
      const worker = await acquire();
      try {
        return await new Promise((resolve, reject) => {
          worker.current = { resolve, reject };
          worker.postMessage({ job });
        });
      } finally {
        release(worker);
      }
    },
    close: () => Promise.all(workers.map((worker) => worker.terminate())),
  };
}
