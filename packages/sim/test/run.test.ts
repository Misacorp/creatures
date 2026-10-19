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

  it('keeps the headline numbers of the shipped income at tiny size', () => {
    // A "did the sim move" alarm, in readable numbers rather than a hash: seed `test`, TINY settings, the
    // shipped `allowance` income. Any rule, content or simulator change that touches the economy, the
    // raid or the dungeon will move some of these. If this fails, work out why the numbers moved, and
    // say so in the PR description (and in `docs/balance/log.md` for a balance change) before you
    // update them. They are never updated just to get green.
    // 2026-10-19: Lantern Light lengthens basic abilities too, and a Festival win gives a Lantern Night
    // piece the player lacks (a Hat or Scarf carries stats where the Charm did not): the long run wins
    // more finales (0.67 to 0.83, final rank 3 to 4), a dungeon run lasts a little longer (4.44 to 4.47
    // fights) and the creature ratio barely moves (1.2754 to 1.2781).
    const m = sharedTinyRun().analysis.metrics;
    const headline: Record<string, number> = {
      'raid.typical.phase1ClearRate': 0.75,
      'raid.typical.finaleWinRate': 0.75,
      'raid.typical.finaleStartShare': 0.4772,
      'fair.topShareMedian': 0.2583,
      'choice.creatureRatioMax': 1.2781,
      'econ.casualTopLevelWeek4': 10,
      'exp.rate.long': 75.4138,
      'dungeon.meanFights': 4.4732,
      'dungeon.dailyHomeRate': 0.1339,
      'longrun.typical.finaleWinRate': 0.8333,
      'longrun.typicalFinalRank': 4,
    };
    for (const [id, expected] of Object.entries(headline)) {
      expect(m[id], id).toBeCloseTo(expected, 3);
    }
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
