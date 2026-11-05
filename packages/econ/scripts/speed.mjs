// Checks the lab's speed budget (docs/design/testing.md): runs the package's tests and warns when they take longer than the
// budget (src/budget.ts: 15 s). The full report prints its own budget line. Exit code 1 when over budget, so CI can fail on it.
/* global console */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const budgetSeconds = 15;
const t = Date.now();
const run = spawnSync('pnpm', ['exec', 'vitest', 'run'], { stdio: 'inherit' });
const seconds = (Date.now() - t) / 1000;
if (run.status !== 0) process.exit(run.status ?? 1);
if (seconds > budgetSeconds) {
  console.error(
    `WARNING: econ tests took ${seconds.toFixed(1)} s, over the budget of ${budgetSeconds} s (docs/design/testing.md)`,
  );
  process.exit(1);
}
console.log(`econ tests: ${seconds.toFixed(1)} s (budget ${budgetSeconds} s)`);
