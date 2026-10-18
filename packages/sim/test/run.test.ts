import { describe, expect, it } from 'vitest';
import { buildReportJson, buildReportMarkdown } from '../src/report';
import { LONG_RUN_WEEKS } from '../src/ladder';
import {
  PITY_WEEKS,
  SWEEP_COUNTS,
  TRIP_LONG_WEEKS,
  defaultSettings,
  horizonsOf,
  snapshotWeeks,
} from '../src/run';
import { sharedTinyRun, tinyRun } from './helpers';

describe('simulation run', () => {
  it('gives an identical report.json and report.md for the same seed', () => {
    // The only test that builds two independent runs: the shared run and one more.
    const first = sharedTinyRun();
    const second = tinyRun();
    expect(buildReportJson(first)).toBe(buildReportJson(second));
    expect(buildReportMarkdown(first)).toBe(buildReportMarkdown(second));
  });

  it('gives a different report for a different seed', () => {
    expect(buildReportJson(tinyRun({ seed: 'other' }))).not.toBe(buildReportJson(sharedTinyRun()));
  });

  it('plays the shipped horizons unless a test shortens them', () => {
    // `pnpm sim` and `pnpm sim:quick` carry no override, so their numbers cannot move.
    for (const mode of ['full', 'quick'] as const) {
      const settings = defaultSettings(mode);
      expect(settings.pityWeeks).toBeUndefined();
      expect(settings.longRunWeeks).toBeUndefined();
      expect(settings.tripLongWeeks).toBeUndefined();
      expect(settings.studyWeeks).toBeUndefined();
      expect(horizonsOf(settings)).toEqual({
        pityWeeks: 20,
        longRunWeeks: 30,
        tripLongWeeks: 60,
        gearWeeks: 30,
        creaturesWeeks: 30,
      });
    }
    expect([PITY_WEEKS, LONG_RUN_WEEKS, TRIP_LONG_WEEKS]).toEqual([20, 30, 60]);
    expect(horizonsOf({ ...defaultSettings('quick'), pityWeeks: 6, studyWeeks: 7 })).toMatchObject({
      pityWeeks: 6,
      longRunWeeks: 30,
      gearWeeks: 7,
      creaturesWeeks: 7,
    });
  });

  it('writes a report with the required sections and valid JSON', () => {
    const out = sharedTinyRun();
    const md = buildReportMarkdown(out);
    for (const heading of [
      '# Balance simulator report',
      '## Summary',
      '## Bosses',
      '## Raid curve by Boss Rank (journey servers)',
      '## Gear share of fight-scored power (journey servers)',
      '## Archetype progression',
      '## Long-running servers',
      '## Daily dungeon',
      '## Elements',
      '## Creatures',
      '## Outliers',
      '## Example fight',
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain('`test`');
    expect(md).toMatch(/[✅❌—]/u);
    const json = JSON.parse(buildReportJson(out)) as {
      settings: { seed: string };
      targets: unknown[];
    };
    expect(json.settings.seed).toBe('test');
    expect(json.targets).toHaveLength(96);
  });

  it('marks metrics it did not measure as not measured', () => {
    // 3 weeks: no week-4 or week-6 data, so those economy targets cannot be measured.
    const out = tinyRun({ weeks: 3 });
    const byId = new Map(out.evaluation.map((t) => [t.id, t]));
    expect(byId.get('econ-casual-level-15')?.status).toBe('not_measured');
    expect(byId.get('econ-daily-species')?.status).toBe('not_measured');
    expect(byId.get('econ-power-ratio')?.status).toBe('not_measured');
    expect(byId.get('raid-finale-15')?.status).toBe('not_measured');
  });

  it('rejects a bad week count', () => {
    expect(() => tinyRun({ weeks: 0 })).toThrow(RangeError);
  });

  it('snapshots at weeks 4 and 8, or the last week for short runs', () => {
    expect(snapshotWeeks(12)).toEqual([4, 8]);
    expect(snapshotWeeks(5)).toEqual([4]);
    expect(snapshotWeeks(3)).toEqual([3]);
    expect(SWEEP_COUNTS).toEqual([1, 5, 10, 15]);
  });
});
