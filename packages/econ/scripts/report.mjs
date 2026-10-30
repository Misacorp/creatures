// Runs the economy lab report CLI (src/cli.ts) without a build step (see load.mjs for how the TypeScript is loaded).
//
// The report is split into one job per scenario (src/jobs.ts). `--jobs <n>` is how many run at a time: by default one per
// core, each on its own worker thread (pool.mjs, worker.mjs); `--jobs 1` runs them one after another in this process. The
// output is the same either way. A quick look at one server (`--scenario <id>`) runs in this process.
/* global console */
import { availableParallelism } from 'node:os';
import process from 'node:process';
import { loadModule } from './load.mjs';
import { createPool } from './pool.mjs';

const args = process.argv.slice(2);
const quick = args.includes('--scenario');
let jobs = availableParallelism();
const at = args.indexOf('--jobs');
if (at >= 0) {
  jobs = Number(args[at + 1]);
  if (!Number.isInteger(jobs) || jobs < 1) {
    console.error('--jobs needs a whole number of at least 1 (1 runs everything in this process)');
    process.exit(1);
  }
}

let loaded;
let code;
// The workers load the sources while this process loads them too.
const starting = jobs > 1 && !quick ? createPool(jobs) : undefined;
starting?.catch(() => {});
try {
  loaded = await loadModule('/src/cli.ts');
  const pool = await starting;
  code = await loaded.mod.main(args, pool ? { exec: pool.exec, slots: jobs } : undefined);
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  code = 1;
} finally {
  await (await starting?.catch(() => undefined))?.close();
  await loaded?.close();
}
process.exitCode = code;
