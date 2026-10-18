import { describe, expect, it } from 'vitest';
import { creaturesMetrics } from '../src/creatures-study';
import { gearShareMetrics } from '../src/gear-study';
import { buildReportJson, buildReportMarkdown } from '../src/report';
import { SETUPS, SETUP_RANK_OFFSETS } from '../src/setup-study';
import { suppliesMetrics } from '../src/supplies-study';
import { TARGETS } from '../src/targets';
import { tinyRun } from './helpers';

/**
 * What the whole pipeline hands on, read from ONE shared run of the tiny settings (a nine-week
 * run with the gear and creatures studies on, at the tiny horizons). These checks used to sit in
 * `setups.test.ts`, `targets.test.ts` and `dungeon.test.ts`, each with a full run of its own.
 */
let cached: ReturnType<typeof tinyRun> | undefined;
const run = (): ReturnType<typeof tinyRun> => {
  cached ??= tinyRun({ weeks: 9, gearServers: 1, creaturesServers: 1 });
  return cached;
};

describe('the setup study in the report', () => {
  it('lands in the report, as markdown sections and JSON keys', () => {
    const out = run();
    const md = buildReportMarkdown(out);
    expect(md).toContain('## Setups (greedy and protected rows)');
    expect(md).toContain('## High Boss Ranks');
    const json = JSON.parse(buildReportJson(out)) as { setups: unknown[]; ranks: unknown[] };
    expect(json.setups.length).toBe(SETUPS.length * SETUP_RANK_OFFSETS.length);
    expect(json.ranks.length).toBeGreaterThan(0);
  });
});

describe('the targets and the analysis', () => {
  it('only uses metrics the analysis produces', () => {
    const { analysis, curve, supplies, gear, creatures } = run();
    const produced = {
      ...analysis.metrics,
      ...curve.metrics,
      ...suppliesMetrics(supplies),
      ...(gear === null ? {} : gearShareMetrics(gear)),
      ...(creatures === null ? {} : creaturesMetrics(creatures)),
    };
    for (const t of TARGETS) {
      expect(produced, t.metric).toHaveProperty(t.metric);
    }
  });
});

describe('the daily dungeon in a run', () => {
  it('is measured by a run, and the report has a dungeon section', () => {
    const out = run();
    for (const id of [
      'dungeon-first-week-clear',
      'dungeon-depth-growth',
      'dungeon-essence-share',
      'dungeon-gear-share-week8',
      'dungeon-home-rate',
      'dungeon-run-fights',
      'dungeon-eligible-run-fights',
    ]) {
      expect(out.evaluation.find((t) => t.id === id)?.status, id).not.toBe('not_measured');
    }
    expect(out.analysis.dungeon.winRates.casual).toHaveLength(24);
  });
});
