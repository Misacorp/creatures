/**
 * The lab's speed budget (also in `docs/design/testing.md`): the full report under 30 seconds, the package's tests under 15. The
 * report CLI and `scripts/speed.mjs` print a warning when a run goes over; going over is a finding to fix (speed the model up, run
 * more of it on the cores, or move a check down a layer), not a number to raise quietly.
 */
export const BUDGET = { reportSeconds: 30, testSeconds: 15 } as const;

/** One line for a timing: within budget, or a warning. */
export function budgetLine(what: string, seconds: number, budget: number): string {
  const s = Math.round(seconds * 10) / 10;
  return seconds <= budget
    ? `${what}: ${s} s (budget ${budget} s)`
    : `WARNING: ${what} took ${s} s, over the budget of ${budget} s (docs/design/testing.md)`;
}
