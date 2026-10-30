/** The journey export: one entry per visit of a traced player, and recording never changes the run. */
import { describe, expect, it } from 'vitest';
import { journeyFiles } from '../src/cli';
import { RULES } from '../src/rules';
import { ALL_SERVERS } from '../src/servers';
import { runServer } from '../src/sim';

const config = ALL_SERVERS.find((s) => s.id === 'mixed8')!;
const run = runServer({ ...config, weeks: 4 }, 1, RULES, {
  profiles: ['daily', 'weekly'],
  weeks: 4,
});

describe('the journey export', () => {
  it('has one entry per visit: a daily player every day, a weekly player on Sundays', () => {
    const daily = run.journeys!.daily!;
    const weekly = run.journeys!.weekly!;
    expect(daily).toHaveLength(28);
    expect(daily.map((e) => e.day)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    expect(weekly.map((e) => e.weekday)).toEqual(['Sunday', 'Sunday', 'Sunday', 'Sunday']);
    for (const e of [...daily, ...weekly]) {
      expect(e.hour).toBeGreaterThanOrEqual(0);
      expect(e.hour).toBeLessThan(24);
      expect(e.top5.length).toBeLessThanOrEqual(5);
      expect([...e.top5].sort((a, b) => b - a)).toEqual(e.top5);
    }
  });

  it('says what came home and what happened', () => {
    const daily = run.journeys!.daily!;
    expect(daily[0]!.cameHome.acorns).toBeGreaterThan(0);
    expect(daily.some((e) => e.cameHome.creatures.length > 0)).toBe(true);
    expect(daily.some((e) => e.events.some((x) => x.startsWith('new line')))).toBe(true);
    // He is met on Thursday to Sunday visits only.
    for (const e of daily) {
      const met = e.events.some((x) => x.startsWith('visitor: he is in the valley'));
      if (met) expect(['Thursday']).toContain(e.weekday);
    }
    expect(
      daily
        .filter((e) => e.weekday === 'Thursday')
        .every((e) => e.events.some((x) => x.startsWith('visitor: he is'))),
    ).toBe(true);
  });

  it('records without changing the run', () => {
    const plain = runServer({ ...config, weeks: 4 }, 1, RULES);
    expect(JSON.stringify(plain.players)).toBe(JSON.stringify(run.players));
    expect(plain.journeys).toBeUndefined();
  });

  it('is written for the daily and the weekly player with the run it comes from', () => {
    const files = journeyFiles();
    expect(Object.keys(files).sort()).toEqual(['daily', 'weekly']);
    expect(files.daily).toMatchObject({ server: 'mixed8', seed: 1, weeks: 4 });
    expect(files.weekly!.visits).toHaveLength(4);
  });
});
