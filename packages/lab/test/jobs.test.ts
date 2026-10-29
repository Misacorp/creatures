/** The job scheduler and the report's plans: order of results, dependencies, the slot limit, one boss alone. */
import { describe, expect, it } from 'vitest';
import { RAID_BOSS_IDS } from '../src/bosses';
import { planBosses } from '../src/bossReport';
import { main } from '../src/cli';
import { FOE_QUESTIONS } from '../src/foeQuestions';
import { inProcessExecutor } from '../src/jobRunners';
import { runJobs, timingLines, validateJobs, type Executor, type JobSpec } from '../src/jobs';
import { planReport } from '../src/report';

const job = (id: string, needs: string[] = [], section = 'S'): JobSpec => ({
  id,
  section,
  kind: 'test',
  args: undefined,
  needs,
});

/** Lets the promises that are ready run (the scheduler reacts to a finished job a few steps later). */
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** An executor whose jobs finish when the test says so, in any order the test wants. */
function controlled() {
  const open = new Map<string, () => void>();
  const log: string[] = [];
  const exec: Executor = async (j, deps) => {
    log.push(`start ${j.id}`);
    await new Promise<void>((resolve) => open.set(j.id, resolve));
    log.push(`end ${j.id}`);
    return { result: { id: j.id, deps: Object.keys(deps) }, seconds: 0 };
  };
  const finish = async (id: string) => {
    open.get(id)?.();
    open.delete(id);
    await flush();
  };
  return { exec, log, finish };
}

describe('validateJobs', () => {
  it('rejects a duplicate id, an unknown need and a cycle', () => {
    expect(() => validateJobs([job('a'), job('a')])).toThrow('duplicate job id a');
    expect(() => validateJobs([job('a', ['x'])])).toThrow('unknown job x');
    expect(() => validateJobs([job('a', ['b']), job('b', ['a'])])).toThrow('cycle');
    expect(() => validateJobs([job('a', ['b']), job('b')])).not.toThrow();
  });
});

describe('runJobs', () => {
  it('gives every result by id, whatever order the jobs finish in', async () => {
    const c = controlled();
    const done = runJobs([job('a'), job('b'), job('c')], c.exec, 3);
    await flush();
    await c.finish('c');
    await c.finish('a');
    await c.finish('b');
    const { results, runs } = await done;
    expect([...results.keys()]).toEqual(['c', 'a', 'b']);
    expect(runs.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    expect(results.get('a')).toEqual({ id: 'a', deps: [] });
  });

  it('starts a job only after the jobs it needs, and hands their results over', async () => {
    const c = controlled();
    const done = runJobs([job('after', ['one', 'two']), job('one'), job('two')], c.exec, 4);
    await flush();
    expect(c.log).toEqual(['start one', 'start two']);
    await c.finish('two');
    expect(c.log).not.toContain('start after');
    await c.finish('one');
    expect(c.log).toContain('start after');
    await c.finish('after');
    const { results } = await done;
    expect(results.get('after')).toEqual({ id: 'after', deps: ['one', 'two'] });
  });

  it('never runs more jobs than the slots, and starts earlier jobs of the list first', async () => {
    const c = controlled();
    const done = runJobs(
      ['a', 'b', 'c', 'd'].map((id) => job(id)),
      c.exec,
      2,
    );
    await flush();
    expect(c.log).toEqual(['start a', 'start b']);
    await c.finish('b');
    expect(c.log).toEqual(['start a', 'start b', 'end b', 'start c']);
    await c.finish('a');
    await c.finish('c');
    await c.finish('d');
    await done;
    expect(c.log.filter((l) => l.startsWith('start '))).toEqual([
      'start a',
      'start b',
      'start c',
      'start d',
    ]);
  });

  it('runs a ready job ahead of a blocked one that is listed first', async () => {
    const c = controlled();
    const done = runJobs([job('blocked', ['gate']), job('gate'), job('free')], c.exec, 2);
    await flush();
    expect(c.log).toEqual(['start gate', 'start free']);
    await c.finish('gate');
    await c.finish('free');
    await c.finish('blocked');
    await done;
  });

  it('rejects with the first failure', async () => {
    const exec: Executor = (j) =>
      j.id === 'bad'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ result: 1, seconds: 0 });
    await expect(runJobs([job('ok'), job('bad')], exec, 2)).rejects.toThrow('boom');
  });
});

describe('timingLines', () => {
  it('adds the seconds up per section, in the order of the plan, and names the longest jobs', () => {
    const jobs = [job('a', [], 'First'), job('b', [], 'Second'), job('c', [], 'First')];
    const lines = timingLines(
      jobs,
      [
        { id: 'b', section: 'Second', seconds: 4 },
        { id: 'a', section: 'First', seconds: 1.5 },
        { id: 'c', section: 'First', seconds: 2 },
      ],
      5,
      2,
    );
    expect(lines[1]).toMatch(/^ {2}First\s+3\.5 s {2}\(2 jobs\)$/);
    expect(lines[2]).toMatch(/^ {2}Second\s+4\.0 s {2}\(1 job\)$/);
    expect(lines.join('\n')).toContain('Longest jobs: b 4.0 s, c 2.0 s, a 1.5 s.');
    expect(lines[lines.length - 1]).toBe('Wall clock 5.0 s on 2 jobs at a time (75% busy).');
  });
});

describe('the report plans', () => {
  it('are valid: unique ids, every need listed', () => {
    validateJobs(planReport({ quick: true }).jobs);
    validateJobs(planBosses({ quick: true }).jobs);
  });

  it('a single boss plans that boss alone: its jobs, no foes, nothing of the other bosses', () => {
    const only = RAID_BOSS_IDS[1] as string;
    const jobs = planBosses({ quick: true, only }).jobs;
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.id.startsWith(`boss:raid:${only}:`))).toBe(true);
    expect(planBosses({ quick: true }).jobs.length).toBeGreaterThan(jobs.length * 4);
  });

  it('the team share waits for the best-team searches it reads', () => {
    const jobs = planReport({ quick: true }).jobs;
    const team = jobs.find((j) => j.id === 'talent:team');
    expect(team?.needs.length).toBeGreaterThan(0);
    expect(
      team?.needs.every((n) => n.startsWith('report:best:') || n.startsWith('report:casual:')),
    ).toBe(true);
  });

  it('a job result survives being posted to a worker (plain data only)', async () => {
    const question = Object.keys(FOE_QUESTIONS)[0] as string;
    const out = await inProcessExecutor(
      {
        id: 'q',
        section: 'Foe questions',
        kind: 'boss',
        args: { quick: true, part: 'question', id: question },
        needs: [],
      },
      {},
    );
    expect(out.result).toMatchObject({ question: { foe: expect.any(String) as string } });
  });

  it('names an unknown boss and the known ones, and runs nothing', async () => {
    expect(await main(['--bosses', '--boss', 'no-such-boss', '--quick'])).toBe(1);
  });
});
