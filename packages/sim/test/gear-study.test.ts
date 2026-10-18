import { describe, expect, it } from 'vitest';
import {
  GEAR_SHARE_WEEKS,
  gearShareMarkdown,
  gearShareMetric,
  gearShareMetrics,
  runGearStudy,
} from '../src/gear-study';
import { PRESET_IDS } from '../src/profiles';
import { TARGETS, evaluateTargets } from '../src/targets';

describe('the gear share study', () => {
  const run = runGearStudy({ seed: 'gear-study-test', servers: 1 });
  const ranges: Record<string, readonly [number, number]> = {};
  for (const t of TARGETS) {
    if (t.metric.startsWith('gear.share.') && typeof t.value !== 'number')
      ranges[t.metric] = t.value;
  }

  it('reports every preset at the design weeks, as shares between 0 and 1', () => {
    expect(run.profiles.map((p) => p.id)).toEqual([...PRESET_IDS]);
    expect(run.weeks).toBe(30);
    for (const p of run.profiles) {
      expect(p.players).toBeGreaterThan(0);
      for (const week of GEAR_SHARE_WEEKS) {
        const share = p.share[String(week)];
        expect(share).not.toBeNull();
        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThan(1);
      }
    }
  });

  it('gear grows its share over the journey for a committed player', () => {
    const minmaxer = run.profiles.find((p) => p.id === 'min-maxer');
    expect(minmaxer?.share['30'] ?? 0).toBeGreaterThan(minmaxer?.share['2'] ?? 1);
  });

  it('feeds the 16 design targets (4 profiles x 4 weeks), each a range', () => {
    const shareTargets = TARGETS.filter((t) => t.metric.startsWith('gear.share.'));
    expect(shareTargets).toHaveLength(16);
    for (const id of PRESET_IDS) {
      for (const week of GEAR_SHARE_WEEKS) {
        const t = shareTargets.find((x) => x.metric === gearShareMetric(id, week));
        expect(t?.comparator, `${id} week ${String(week)}`).toBe('range');
      }
    }
    const results = evaluateTargets(shareTargets, gearShareMetrics(run));
    expect(results.every((r) => r.status !== 'not_measured')).toBe(true);
  });

  it('prints a table with the design ranges next to the measured shares', () => {
    const text = gearShareMarkdown(run, ranges);
    expect(text).toContain('| Profile | Players | Week 2 | Week 8 | Week 20 | Week 30 |');
    expect(text).toContain('Min-maxer');
    expect(text).toContain('5.0% to 10.0%');
    expect(text).toContain('33.0% to 40.0%');
  });
});
