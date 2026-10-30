/** The path simulator: the walk with fake fights, the Festival weeks, the summary, the servers and determinism across job counts. */
import { describe, expect, it } from 'vitest';
import { inProcessExecutor } from '../src/jobRunners';
import { runJobs, type Executor } from '../src/jobs';
import {
  DEDICATED,
  FESTIVAL_EVERY,
  MIXED,
  STUCK_WEEKS,
  pathOf,
  planPath,
  serverWeekend,
  spreadOf,
  summarisePath,
  walkPath,
  weekendKill,
} from '../src/path';
import { PLACEHOLDER_ROSTER, rosterLevels } from '../src/roster';
import { MIXED_ORDER } from '../src/raidMeasure';
import { TRACK_ORDER } from '../src/track';

describe('walkPath with a fake fight', () => {
  it('always winning: one slot a week, a Festival week pays one slot back', () => {
    const fights: number[][] = [];
    const path = walkPath((slot, week) => {
      fights.push([slot, week]);
      return true;
    });
    expect(path.fought.slice(0, 9)).toEqual([1, 2, 3, 4, 0, 4, 5, 6, 7]);
    expect(path.reached.slice(0, 6)).toEqual([1, 2, 3, 4, 5, 8]);
    expect(path.attempts.every((a) => a === 1)).toBe(true);
    expect(path.longestRun).toBe(1);
    // Four Festival weeks in 24: twenty fights.
    expect(fights).toHaveLength(20);
  });

  it('always losing: slot 1 for ever, every weekend counted, stuck', () => {
    const path = walkPath(() => false);
    expect(path.reached).toEqual([1]);
    expect(path.weekends).toEqual([20]);
    expect(path.attempts).toEqual([20]);
    expect(path.longestRun).toBe(20);
    expect(path.fought.filter((s) => s === 0)).toHaveLength(4);
    expect(summarisePath('x', 'expected', [path]).stuckShare).toBe(1);
  });

  it('winning every second weekend: two tries a boss, Festival detours not counted', () => {
    let n = 0;
    const path = walkPath(() => ++n % 2 === 0);
    expect(path.fought.slice(0, 9)).toEqual([1, 1, 2, 2, 0, 2, 2, 3, 3]);
    expect(path.reached.slice(0, 4)).toEqual([1, 3, 5, 10]);
    expect(path.attempts.slice(0, 3)).toEqual([2, 2, 2]);
    // Slot 2 was fought four times in all (the re-fight after the Festival's ease), but beaten at the second try.
    expect(path.weekends[1]).toBe(4);
    expect(path.longestRun).toBe(2);
    expect(summarisePath('x', 'expected', [path]).stuckShare).toBe(0);
  });

  it('keeps the Festival rule: the boss waits and the slot eases by 1 after it, never below 1', () => {
    const calls: number[] = [];
    walkPath((slot, week) => {
      calls.push(week);
      return slot < 3;
    });
    for (let w = FESTIVAL_EVERY; w <= 24; w += FESTIVAL_EVERY) expect(calls).not.toContain(w);
    // Lost at slot 3 from week 3: weeks 3 and 4, then the Festival eases to slot 2 (a win), back to slot 3.
    const path = walkPath((slot) => slot < 3);
    expect(path.fought.slice(0, 8)).toEqual([1, 2, 3, 3, 0, 2, 3, 3]);
    // Slot 1 has nothing to ease to.
    const stuck = walkPath(() => false);
    expect(stuck.fought.slice(4, 7)).toEqual([0, 1, 1]);
  });

  it('can turn the Festival off or ease by more', () => {
    const none = walkPath(() => true, { festivalEvery: 0 });
    expect(none.fought.every((s) => s > 0)).toBe(true);
    expect(none.reached).toHaveLength(24);
    const two = walkPath(() => true, { festivalEase: 2 });
    expect(two.fought.slice(0, 7)).toEqual([1, 2, 3, 4, 0, 3, 4]);
  });

  it('counts a boss beaten in the last week as beaten but not reached', () => {
    const late = walkPath((_, week) => week === 3, { weeks: 3 });
    expect(late.reached).toEqual([1]);
    expect(late.attempts).toEqual([3]);
    const win = walkPath(() => true, { weeks: 2 });
    expect(win.reached).toEqual([1, 2]);
  });
});

describe('the summary', () => {
  it('takes the median and spread of the weeks, and the stuck share', () => {
    expect(spreadOf([5, 1, 3, 2, 4])).toEqual({ median: 3, p25: 2, p75: 4 });
    // Two servers breeze through, two lose to slot 2 until week 9.
    const free = walkPath(() => true);
    const late = walkPath((slot, week) => slot === 1 || week >= 9);
    expect(late.attempts[1]).toBeGreaterThan(STUCK_WEEKS);
    const s = summarisePath('dedicated', 'slow', [free, free, late, late]);
    expect(s.servers).toBe(4);
    expect(s.stuckShare).toBe(0.5);
    expect(s.slots[0]).toMatchObject({ slot: 1, bossId: TRACK_ORDER[0], reachedShare: 1 });
    expect(s.slots[1]?.week.median).toBeGreaterThanOrEqual(2);
    expect(s.longestRun.max).toBe(late.longestRun);
    // A slot only some servers reach shows its share.
    const deep = s.slots[s.slots.length - 1];
    expect(deep?.reachedShare).toBeLessThan(1);
    expect(s.slots.every((x) => x.weekends.median >= 0)).toBe(true);
  });
});

describe('the servers', () => {
  it('map the mixed server onto the roster kinds', () => {
    expect(DEDICATED.players).toHaveLength(4);
    expect(DEDICATED.players.every((p) => p.role === 'prepared' && p.roster === 'daily')).toBe(
      true,
    );
    expect(MIXED.players).toHaveLength(MIXED_ORDER.length);
    MIXED_ORDER.forEach((k, i) => {
      const p = MIXED.players[i];
      if (k === 'm') expect(p).toEqual({ role: 'prepared', roster: 'daily' });
      if (k === 'b') expect(p).toEqual({ role: 'builder', roster: 'daily' });
      if (k === 'c') expect(p).toEqual({ role: 'casual', roster: 'weekly' });
    });
    expect(MIXED.players.filter((p) => p.role === 'prepared')).toHaveLength(2);
    expect(MIXED.players.filter((p) => p.role === 'builder')).toHaveLength(3);
    expect(MIXED.players.filter((p) => p.role === 'casual')).toHaveLength(5);
  });

  it('put each player at the roster levels of the week', () => {
    for (const [server, players] of [
      [DEDICATED, 4],
      [MIXED, 10],
    ] as const) {
      const w = serverWeekend(server, 2, 8, 'expected', 'test');
      expect(w.boss.cols).toBe(players);
      expect(new Set(w.placements.map((p) => p.owner)).size).toBe(players);
      expect(w.bench).toHaveLength(players);
      server.players.forEach((p, c) => {
        const levels = rosterLevels(PLACEHOLDER_ROSTER, p.roster, 8, 'expected', 4);
        const mine = w.placements.filter((x) => x.col === c).sort((a, b) => a.row - b.row);
        expect(mine).toHaveLength(w.boss.rows);
        // At the roster's level (a form with a lower cap sits below it).
        mine.forEach((x, r) => expect(x.level).toBeLessThanOrEqual(levels[r] as number));
        expect(mine[0]?.level).toBeGreaterThanOrEqual(1);
      });
    }
  });

  it('are the same at every speed except for the levels', () => {
    const slow = serverWeekend(MIXED, 3, 6, 'slow', 'same');
    const fast = serverWeekend(MIXED, 3, 6, 'fast', 'same');
    expect(slow.placements.map((p) => p.formId)).toEqual(fast.placements.map((p) => p.formId));
    expect(slow.placements.some((p, i) => p.level !== fast.placements[i]?.level)).toBe(true);
  });

  it('fight reproducibly: same server, same weekend, same result', () => {
    const a = pathOf(DEDICATED, 'expected', 3);
    expect(pathOf(DEDICATED, 'expected', 3)).toEqual(a);
    expect(weekendKill(MIXED, 1, 12, 'fast', 's1')).toBe(weekendKill(MIXED, 1, 12, 'fast', 's1'));
    expect(a.fought).toHaveLength(24);
    expect(a.reached[0]).toBe(1);
  });

  it('get further when the roster is faster', () => {
    const reach = (speed: 'slow' | 'fast') =>
      [0, 1].map((i) => pathOf(DEDICATED, speed, i).reached.length).reduce((a, b) => a + b, 0);
    expect(reach('fast')).toBeGreaterThanOrEqual(reach('slow'));
  });
});

describe('the plan', () => {
  it('gives the same report on one slot and on several, whatever order the jobs finish in', async () => {
    const plan = planPath({ quick: true, speeds: ['slow', 'fast'], servers: 2 });
    expect(plan.jobs).toHaveLength(2 * 2 * 2);
    // Later jobs finish first.
    const backwards: Executor = async (job, deps) => {
      const k = plan.jobs.findIndex((j) => j.id === job.id);
      for (let i = 0; i < (plan.jobs.length - k) * 5; i++) await Promise.resolve();
      return inProcessExecutor(job, deps);
    };
    const one = await runJobs(plan.jobs, inProcessExecutor, 1);
    const many = await runJobs(plan.jobs, backwards, 4);
    const a = plan.assemble(one.results);
    const b = plan.assemble(many.results);
    expect(b).toEqual(a);
    expect(a.data).toHaveLength(4);
    expect(a.md.join('\n')).toContain('at the slow roster speed');
    expect(a.md.join('\n')).toContain('at the fast roster speed');
    expect(a.md.join('\n')).toContain('target at most 10%');
  }, 60_000);
});
