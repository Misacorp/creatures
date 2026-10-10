import { describe, expect, it } from 'vitest';
import { buildReportJson, buildReportMarkdown } from '../src/report';
import { SWEEP_COUNTS, snapshotWeeks } from '../src/run';
import { tinyRun } from './helpers';

describe('simulation run', () => {
  it('gives an identical report.json for the same seed', () => {
    const a = buildReportJson(tinyRun());
    const b = buildReportJson(tinyRun());
    expect(a).toBe(b);
    expect(buildReportMarkdown(tinyRun())).toBe(buildReportMarkdown(tinyRun()));
  });

  it('gives a different report for a different seed', () => {
    expect(buildReportJson(tinyRun({ seed: 'other' }))).not.toBe(buildReportJson(tinyRun()));
  });

  it('writes a report with the required sections and valid JSON', () => {
    const out = tinyRun();
    const md = buildReportMarkdown(out);
    for (const heading of [
      '# Balance simulator report',
      '## Summary',
      '## Bosses',
      '## Archetype progression',
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
    expect(json.targets).toHaveLength(21);
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
