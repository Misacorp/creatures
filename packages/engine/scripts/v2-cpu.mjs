// Measures the CPU a combat v2 fight costs (docs/design/combat/integration.md, section 8): one raid stage at 4, 10 and 15 columns
// (3 rows, the log on and off), one dungeon room, and the live finale replayed to round 6 and to its last round. The worker's Free plan
// allows 10 ms of CPU per request. Nothing is optimised here: it only times the engine with performance.now and prints the median and the
// 95th percentile of each case.
//
//   node scripts/v2-cpu.mjs [--runs 40] [--warmup 8]
//   node scripts/v2-cpu.mjs --runs 1 --warmup 0   one cold call of each case (the first case is the coldest: nothing is warm yet)
//
// The creatures come from the lab (it resolves a line of picks into the engine's fighters with the game's content), so the measure itself
// lives in `packages/lab/src/cpuMeasure.ts` and is loaded the way the lab's own scripts load TypeScript (its `load.mjs`, through Vite).
/* global console */
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { URL } from 'node:url';

const { loadModule } = await import(new URL('../../lab/scripts/load.mjs', import.meta.url).href);

const arg = (name, fallback, min = 1) => {
  const at = process.argv.indexOf(`--${name}`);
  const value = at >= 0 ? Number(process.argv[at + 1]) : fallback;
  if (!Number.isInteger(value) || value < min) {
    console.error(`--${name} takes a whole number from ${min}`);
    process.exit(1);
  }
  return value;
};

const { mod, close } = await loadModule('/src/cpuMeasure.ts');
try {
  const rows = mod.cpuReport({
    now: () => performance.now(),
    runs: arg('runs', 40),
    warmup: arg('warmup', 8, 0),
  });
  console.log(mod.cpuTable(rows));
} finally {
  await close();
}
