/**
 * `--path` and the Determination flags: the command line's plumbing only. The executor plays one server a kind for real and hands
 * its result to the others, and answers the slot information jobs (a measurement of their own, tested in `trackTuner.test.ts`)
 * with nothing, so the three runs cost a fraction of a second instead of a quarter of the suite.
 */
import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/cli';
import { inProcessExecutor } from '../src/jobRunners';
import type { Executor } from '../src/jobs';

/** Real result of the first server of each cell and Determination setting, reused for the rest of the cell. */
function thinExecutor(): Executor {
  const first = new Map<string, ReturnType<Executor>>();
  return (job, deps) => {
    if (job.kind === 'slot-eval') return Promise.resolve({ result: {}, seconds: 0 });
    if (job.kind !== 'path-server') return inProcessExecutor(job, deps);
    const key = JSON.stringify({ ...(job.args as object), index: 0 });
    const real =
      first.get(key) ?? inProcessExecutor({ ...job, args: JSON.parse(key) as object }, deps);
    first.set(key, real);
    return real;
  };
}

describe('--path and Determination', () => {
  it('plays with it by default, `--determination` adds the path without it as a comparison, `--no-determination` plays without it only', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const text = () => log.mock.calls.map((c) => String(c[0])).join('\n');
    const withDial = 'with Determination (+15% a failed weekend from slot 6, at most 5 stacks)';
    const run = () => ({ exec: thinExecutor(), slots: 4 });
    try {
      expect(await main(['--path', '--quick'], run())).toBe(0);
      expect(text()).toContain('### Boss track at the expected roster speed' + ' ' + withDial);
      expect(text()).not.toContain('without Determination');
      log.mockClear();
      expect(await main(['--path', '--quick', '--determination'], run())).toBe(0);
      const both = text();
      const on = both.indexOf(withDial);
      const off = both.indexOf('without Determination');
      expect(on).toBeGreaterThanOrEqual(0);
      expect(off).toBeGreaterThan(on);
      log.mockClear();
      expect(await main(['--path', '--quick', '--no-determination'], run())).toBe(0);
      expect(text()).toContain('without Determination');
      expect(text()).not.toContain(withDial);
    } finally {
      log.mockRestore();
    }
  }, 60_000);
});
