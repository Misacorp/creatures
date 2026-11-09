import { describe, expect, it } from 'vitest';
import type { ToolOutcome } from './dev-api';
import {
  PACE_MS,
  SPLIT_VISITS,
  endLine,
  playDays,
  reportRows,
  type PlayDaysEnv,
} from './play-days';

type Answer = ToolOutcome | ((body: Record<string, unknown>) => ToolOutcome);

/** A fake dev API: answers per tool from a queue (the last answer repeats), and remembers the calls. */
function fake(answers: Record<string, Answer[]>, stopAfterCalls = Infinity) {
  const calls: { tool: string; body: Record<string, unknown> }[] = [];
  const sleeps: number[] = [];
  const lines: string[] = [];
  const queues = new Map(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const env: PlayDaysEnv = {
    call: (tool, body) => {
      calls.push({ tool, body });
      const queue = queues.get(tool) ?? [];
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next === undefined) return Promise.resolve({ ok: false, error: 'no_answer' });
      return Promise.resolve(typeof next === 'function' ? next(body) : next);
    },
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    stopped: () => calls.length >= stopAfterCalls,
    onProgress: (p) => lines.push(p.line),
  };
  return { env, calls, sleeps, lines };
}

const day = (done: boolean, visits = 5): ToolOutcome => ({
  ok: true,
  result: { day: 0, done, visits, rows: { read: 1, written: 1 }, finished: false },
});
const fail = (error: string): ToolOutcome => ({ ok: false, error });

describe('playDays', () => {
  it('plays one call per day and shows "Day n of N"', async () => {
    const f = fake({ 'valley-sim-day': [day(true)] });
    expect(await playDays(3, f.env)).toEqual({ kind: 'finished', played: 3 });
    expect(f.calls.map((c) => c.tool)).toEqual(Array(3).fill('valley-sim-day'));
    expect(f.calls.every((c) => Object.keys(c.body).length === 0)).toBe(true);
    expect(f.lines).toContain('Day 1 of 3');
    expect(f.lines).toContain('Day 3 of 3');
    expect(f.lines.at(-1)).toBe('Played 3 days');
    expect(f.sleeps.every((ms) => ms === PACE_MS)).toBe(true);
  });

  it('keeps calling until a day says it is done', async () => {
    const f = fake({ 'valley-sim-day': [day(false), day(false), day(true)] });
    expect(await playDays(1, f.env)).toEqual({ kind: 'finished', played: 1 });
    expect(f.calls).toHaveLength(3);
  });

  it('clamps the days to 1..28', async () => {
    const f = fake({ 'valley-sim-day': [day(true)] });
    expect(await playDays(99, f.env)).toEqual({ kind: 'finished', played: 28 });
    expect((await playDays(0, fake({ 'valley-sim-day': [day(true)] }).env)).played).toBe(1);
  });

  it('makes the bots when there are none, then plays the day', async () => {
    const f = fake({
      'valley-sim-day': [fail('no_bots'), day(true)],
      'valley-bots': [{ ok: true, result: { bots: [] } }],
    });
    expect(await playDays(1, f.env)).toEqual({ kind: 'finished', played: 1 });
    expect(f.calls.map((c) => c.tool)).toEqual(['valley-sim-day', 'valley-bots', 'valley-sim-day']);
  });

  it('does not make the bots when they exist', async () => {
    const f = fake({ 'valley-sim-day': [day(true)] });
    await playDays(2, f.env);
    expect(f.calls.some((c) => c.tool === 'valley-bots')).toBe(false);
  });

  it('plays a failed day again in parts, once', async () => {
    let parts = 0;
    const f = fake({
      'valley-sim-day': [
        (body) => {
          if (body['maxVisits'] === undefined) return fail('http_500');
          parts += 1;
          return day(parts >= 2);
        },
      ],
    });
    expect(await playDays(1, f.env)).toEqual({ kind: 'finished', played: 1 });
    expect(f.calls.map((c) => c.body)).toEqual([
      {},
      { maxVisits: SPLIT_VISITS },
      { maxVisits: SPLIT_VISITS },
    ]);
  });

  it('stops with the error when a part fails too', async () => {
    const f = fake({ 'valley-sim-day': [fail('http_500')] });
    const end = await playDays(5, f.env);
    expect(end).toEqual({ kind: 'error', played: 0, error: 'valley-sim-day: http_500' });
    expect(f.calls).toHaveLength(2);
  });

  it('stops on a failed bot step', async () => {
    const f = fake({ 'valley-sim-day': [fail('no_bots')], 'valley-bots': [fail('not_found')] });
    expect(await playDays(2, f.env)).toEqual({
      kind: 'error',
      played: 0,
      error: 'valley-bots: not_found',
    });
  });

  it('waits and retries on a rate limit, without counting it as a failure', async () => {
    const f = fake({ 'valley-sim-day': [fail('rate_limited'), day(true)] });
    expect(await playDays(1, f.env)).toEqual({ kind: 'finished', played: 1 });
    expect(f.sleeps).toContain(2000);
    expect(f.calls.every((c) => Object.keys(c.body).length === 0)).toBe(true);
  });

  it('stops when asked, before the next call', async () => {
    const f = fake({ 'valley-sim-day': [day(true)] }, 2);
    expect(await playDays(10, f.env)).toEqual({ kind: 'stopped', played: 2 });
    expect(f.calls).toHaveLength(2);
  });

  it('ends quietly when the month is already over', async () => {
    const f = fake({
      'valley-sim-day': [{ ok: true, result: { day: 28, done: true, visits: 0, finished: true } }],
    });
    expect(await playDays(3, f.env)).toEqual({ kind: 'month-over', played: 0 });
  });

  it('refuses an answer it does not understand', async () => {
    const f = fake({ 'valley-sim-day': [{ ok: true, result: 'nope' }] });
    const end = await playDays(1, f.env);
    expect(end.kind).toBe('error');
  });
});

describe('reportRows and endLine', () => {
  const result = {
    report: { huge: true },
    month: {
      daysPlayed: 28,
      rowsTotal: { read: 12345, written: 678 },
      firstLevelUpDay: 3,
      placeDays: { Bonfire: 5, Forge: 2 },
      declined: { buy: 4, sell: 1 },
      players: [{ id: 'player-1', kind: 'human', metricsNow: { levelBest: 4, kindsOwned: 6 } }],
    },
  };

  it('reads the month numbers into rows', () => {
    const rows = reportRows(result);
    const get = (label: string) => rows?.find((r) => r.label === label)?.value;
    expect(get('Days played')).toBe('28');
    expect(get('Rows read')).toBe('12,345');
    expect(get('Rows written')).toBe('678');
    expect(get('First level-up')).toBe('day 3');
    expect(get('Places opened')).toBe('Forge day 2, Bonfire day 5');
    expect(get('Declined intents')).toBe('5 (buy 4, sell 1)');
    expect(get('Player 1 now')).toBe('best level 4, 6 kinds');
  });

  it('answers null for something else, and says none for a missing level-up', () => {
    expect(reportRows({})).toBeNull();
    expect(reportRows({ month: {} })?.find((r) => r.label === 'First level-up')?.value).toBe(
      'none',
    );
  });

  it('words each end', () => {
    expect(endLine({ kind: 'finished', played: 1 })).toBe('Played 1 day.');
    expect(endLine({ kind: 'stopped', played: 12 })).toBe('Stopped after 12 days.');
    expect(endLine({ kind: 'error', played: 2, error: 'x' })).toBe('Stopped after 2 days: x');
  });
});
