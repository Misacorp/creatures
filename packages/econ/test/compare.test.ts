import * as v from 'valibot';
import { describe, expect, it, vi } from 'vitest';
import {
  LiveReportSchema,
  SERVER_METRICS,
  compareReport,
  formatComparison,
  judgeMetric,
  labSamples,
  type LiveReport,
} from '../src/compare';
import { main } from '../src/compareCli';
import { RULES } from '../src/rules';
import { playersOf, runScenario } from '../src/scenarios';
import { ALL_SERVERS } from '../src/servers';
import { band } from '../src/stats';

describe('judging one number', () => {
  const samples = [90, 95, 100, 105, 110];

  it('an expected quantity agrees within 10% of the lab median, and not beyond', () => {
    expect(judgeMetric('expected', 100, samples).verdict).toBe('agree');
    expect(judgeMetric('expected', 110, samples).verdict).toBe('agree');
    expect(judgeMetric('expected', 90, samples).verdict).toBe('agree');
    expect(judgeMetric('expected', 110.5, samples).verdict).toBe('disagree');
    expect(judgeMetric('expected', 89, samples).verdict).toBe('disagree');
  });

  it('an expected quantity whose lab median is zero agrees only at zero', () => {
    expect(judgeMetric('expected', 0, [0, 0, 0]).verdict).toBe('agree');
    expect(judgeMetric('expected', 1, [0, 0, 0]).verdict).toBe('disagree');
  });

  it('a drawn quantity agrees inside the lab 10th to 90th percentile', () => {
    const lab = band(samples);
    expect(judgeMetric('drawn', lab.p10, samples).verdict).toBe('agree');
    expect(judgeMetric('drawn', lab.p90, samples).verdict).toBe('agree');
    expect(judgeMetric('drawn', lab.p90 + 1, samples).verdict).toBe('disagree');
    expect(judgeMetric('drawn', lab.p10 - 1, samples).verdict).toBe('disagree');
  });

  it('shows rows and judges nothing', () => {
    expect(judgeMetric('info', 1e9, samples).verdict).toBe('info');
  });
});

describe('a live report', () => {
  const config = ALL_SERVERS.find((s) => s.id === 'mixed8');
  if (!config) throw new Error('no mixed8 server');
  const result = runScenario({ ...config, weeks: 4 }, 4, RULES);
  const daily = playersOf(result, 'daily');
  const lookup = (profile: string) => playersOf(result, profile);
  const medianAt = (metric: Parameters<typeof labSamples>[1], week: number): number =>
    band(labSamples(daily, metric, week)).median;

  const report = (metrics: Record<string, number>, day = 7, profile = 'daily'): LiveReport =>
    v.parse(LiveReportSchema, {
      version: 1,
      scenario: 'mixed8',
      profiles: { [profile]: { days: [{ day, metrics }] } },
    });

  it('agrees with itself: the lab medians are inside the margin', () => {
    const judged = compareReport(
      report({
        levelBest: medianAt('levelBest', 1),
        scrapIn: medianAt('scrapIn', 1),
        piecesMade: medianAt('piecesMade', 1),
        kindsOwned: medianAt('kindsOwned', 1),
        rowsRead: 123456,
      }),
      lookup,
    );
    expect(judged.map((j) => j.verdict)).toEqual(['agree', 'agree', 'agree', 'agree', 'info']);
    expect(formatComparison(judged).ok).toBe(true);
  });

  it('disagrees per metric and says which, with the lab numbers beside the live one', () => {
    const scrap = medianAt('scrapIn', 2);
    const judged = compareReport(
      report({ scrapIn: scrap * 1.5, levelBest: medianAt('levelBest', 2), kindsOwned: 500 }, 14),
      lookup,
    );
    const by = Object.fromEntries(judged.map((j) => [j.metric, j.verdict]));
    expect(by).toEqual({ levelBest: 'agree', scrapIn: 'disagree', kindsOwned: 'disagree' });
    const { lines, ok } = formatComparison(judged);
    expect(ok).toBe(false);
    expect(lines.filter((l) => l.startsWith('DISAGREE'))).toHaveLength(2);
    expect(lines.some((l) => l.includes('daily day 14 scrapIn: live'))).toBe(true);
    expect(lines.at(-1)).toBe('1 agree, 2 disagree, 0 info, 0 skipped');
  });

  it('skips days the lab does not record and profiles it has no player of', () => {
    expect(compareReport(report({ levelBest: 3 }, 10), lookup)[0]?.verdict).toBe('skipped');
    expect(compareReport(report({ levelBest: 3 }, 7, 'nobody'), lookup)[0]?.verdict).toBe(
      'skipped',
    );
    expect(compareReport(report({ levelBest: 3 }, 35), lookup)[0]?.verdict).toBe('skipped');
  });

  it('rejects an unknown metric, an unknown key and a negative number', () => {
    const base = { version: 1, scenario: 'mixed8' };
    const days = (metrics: unknown) => ({ daily: { days: [{ day: 7, metrics }] } });
    const ok = (profiles: unknown) => v.safeParse(LiveReportSchema, { ...base, profiles }).success;
    expect(ok(days({ levelBest: 3 }))).toBe(true);
    expect(ok(days({ levelBestest: 3 }))).toBe(false);
    expect(ok(days({ levelBest: -1 }))).toBe(false);
    expect(v.safeParse(LiveReportSchema, { ...base, profiles: {}, extra: 1 }).success).toBe(false);
  });

  it('answers 2 for a file it cannot read, and reads the file named first even without --seeds', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(main(['/nonexistent/live-report.json'])).toBe(2);
    expect(main(['/nonexistent/live-report.json', '--seeds', '3'])).toBe(2);
    expect(error).toHaveBeenCalledWith('cannot read /nonexistent/live-report.json as JSON');
    expect(main([])).toBe(2);
    error.mockRestore();
  });

  it('judges the share of anvil time spent tinkering as an expected quantity', () => {
    const median = medianAt('tinkerShare', 1);
    expect(median).toBeGreaterThanOrEqual(0);
    expect(median).toBeLessThanOrEqual(1);
    const [agree] = compareReport(report({ tinkerShare: median }), lookup);
    expect(agree?.verdict).toBe('agree');
    const [off] = compareReport(report({ tinkerShare: Math.min(1, median + 0.3) }), lookup);
    expect(off?.verdict).toBe('disagree');
  });
});

describe('the valley own numbers of a live report', () => {
  const config = ALL_SERVERS.find((s) => s.id === 'mixed8');
  if (!config) throw new Error('no mixed8 server');
  const result = runScenario({ ...config, weeks: 4 }, 4, RULES);
  const lookup = (profile: string) => playersOf(result, profile);
  const server = (metrics: Record<string, number>, day = 28): LiveReport =>
    v.parse(LiveReportSchema, {
      version: 1,
      scenario: 'mixed8',
      profiles: {},
      server: { days: [{ day, metrics }] },
    });
  const labFire = result.runs.map((r) => r.log[3]?.fire ?? 0);

  it('judges the fire as expected (10% of the median) and a count of finds as drawn', () => {
    const mid = SERVER_METRICS.fire.lab(result.runs[0] as never, 4);
    expect(mid).toBe(labFire[0]);
    const median = band(labFire).median;
    const judged = compareReport(server({ fire: median, keystones: 0 }), lookup, result.runs);
    expect(judged.map((j) => [j.profile, j.metric])).toEqual([
      ['server', 'fire'],
      ['server', 'keystones'],
    ]);
    expect(judged[0]?.verdict).toBe('agree');
    expect(compareReport(server({ fire: median * 2 }), lookup, result.runs)[0]?.verdict).toBe(
      'disagree',
    );
    expect(compareReport(server({ keystones: 999 }), lookup, result.runs)[0]?.verdict).toBe(
      'disagree',
    );
  });

  it('skips a day the lab does not record, and a metric of which the lab has nothing', () => {
    expect(compareReport(server({ fire: 12 }, 10), lookup, result.runs)[0]?.verdict).toBe(
      'skipped',
    );
    expect(compareReport(server({ fire: 12 }), lookup, [])[0]?.verdict).toBe('skipped');
  });

  it('the first level-up day is the lab first place level-up within the weeks, as a day', () => {
    const lab = result.runs.flatMap((r) => {
      const value = SERVER_METRICS.firstLevelUpDay.lab(r, 4);
      return value === null ? [] : [value];
    });
    expect(lab.length).toBeGreaterThan(0);
    for (const day of lab) expect(day).toBeLessThan(28);
    const inside = band(lab).median;
    expect(
      compareReport(server({ firstLevelUpDay: inside }), lookup, result.runs)[0]?.verdict,
    ).toBe('agree');
  });

  it('rejects an unknown server metric', () => {
    expect(
      v.safeParse(LiveReportSchema, {
        version: 1,
        scenario: 'mixed8',
        profiles: {},
        server: { days: [{ day: 7, metrics: { fires: 1 } }] },
      }).success,
    ).toBe(false);
  });
});
