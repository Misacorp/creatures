/** Targets as data, the dials table, the scenario scheduler, timings and the budget. */
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { measuresOf } from '../src/analysis';
import { BUDGET, budgetLine } from '../src/budget';
import { DIALS, applyDial, applyDials, axisOf, dialById } from '../src/dials';
import { runScenarios, type JobOutcome } from '../src/jobs';
import { buildReportData, type Timings } from '../src/report';
import { RULES } from '../src/rules';
import { runAll, runScenario } from '../src/scenarios';
import { RulesSchema } from '../src/schema';
import { ALL_SERVERS } from '../src/servers';
import {
  MEASURES,
  TARGETS,
  THRESHOLDS,
  boundsText,
  judge,
  metBy,
  missOf,
  scenariosFor,
} from '../src/targets';

describe('the targets as data', () => {
  it('have unique ids, known measures and scenarios that exist', () => {
    expect(new Set(TARGETS.map((t) => t.id)).size).toBe(TARGETS.length);
    const scenarios = new Set(ALL_SERVERS.map((s) => s.id));
    for (const t of TARGETS) {
      expect(MEASURES).toContain(t.measure);
      expect(t.lo !== undefined || t.hi !== undefined).toBe(true);
      expect(t.scale).toBeGreaterThan(0);
      for (const id of t.needs) expect(scenarios.has(id)).toBe(true);
    }
    expect(scenariosFor(TARGETS).sort()).toEqual(['mixed8', 'mixed8-all', 'mixed8-opt']);
  });

  it('hold every threshold of goals.md in one file', () => {
    const value = (id: string): [number | undefined, number | undefined] => {
      const t = TARGETS.find((x) => x.id === id);
      return [t?.lo, t?.hi];
    };
    expect(value('T-1a')).toEqual([0.9, undefined]);
    expect(value('T-1o')).toEqual([undefined, 5]);
    expect(value('T-4b')).toEqual([undefined, 0.25]);
    expect(value('T-7')).toEqual([undefined, 0]);
    expect(value('T-7b')).toEqual([undefined, 0]);
    expect(value('T-8a')).toEqual([9, 12]);
    expect(value('T-8b')).toEqual([20, 28]);
    expect(value('T-2b')).toEqual([0.95, undefined]);
    expect(value('T-2c')).toEqual([0.72, 0.85]);
    expect(value('T-2d2')).toEqual([undefined, 15]);
    expect(value('T-3a')).toEqual([undefined, 14]);
    expect(value('T-4')).toEqual([undefined, 0.1]);
    expect(THRESHOLDS.deadWeeks).toBe(4);
    expect(THRESHOLDS.starvedZeroShare).toBe(0.25);
  });

  it('judge a value: met, missed by how much, or skipped', () => {
    const t = TARGETS.find((x) => x.id === 'T-2c')!;
    expect(metBy(t, 0.78)).toBe(true);
    expect(metBy(t, 0.5)).toBe(false);
    expect(metBy(t, 0.9)).toBe(false);
    expect(missOf(t, 0.78)).toBe(0);
    expect(missOf(t, 0.6)).toBeCloseTo(1.2, 9);
    expect(boundsText(t)).toBe('0.72 to 0.85');
    const judged = judge(TARGETS, { bench4: 0.5 });
    expect(judged.find((j) => j.target.id === 'T-1a')?.met).toBe(false);
    expect(judged.find((j) => j.target.id === 'T-2c')?.met).toBeNull();
  });

  it('are measured by the report from the same data (a short run takes what it can)', () => {
    const config = ALL_SERVERS.find((s) => s.id === 'mixed8')!;
    const long = measuresOf({ mixed8: runScenario({ ...config, weeks: 12 }, 1) });
    for (const name of [
      'spread4',
      'spread8',
      'bench4',
      'bench8',
      'weeklyXpShare',
      'returnDays',
      'firstLevelDay',
      'collections12',
      'best12',
      'scrapStall',
    ] as const)
      expect(long[name]).toBeTypeOf('number');
    expect(long.activeXpRatio).toBeUndefined();
    const short = measuresOf({ mixed8: runScenario({ ...config, weeks: 6 }, 1) });
    expect(short.bench4).toBeTypeOf('number');
    expect(short.best12).toBeUndefined();
    expect(short.collections12).toBeUndefined();
  });
});

describe('the dials', () => {
  it("leave today's rules alone at 1, and never edit RULES", () => {
    const before = JSON.stringify(RULES);
    for (const d of DIALS) expect(applyDial(RULES, d, 1)).toEqual(RULES);
    for (const d of DIALS) applyDial(RULES, d, 2);
    expect(JSON.stringify(RULES)).toBe(before);
  });

  it('give rules that still pass the schema at the ends of their ranges', () => {
    for (const d of DIALS)
      for (const m of [d.min, d.max]) {
        const rules = applyDial(RULES, d, m);
        expect(v.safeParse(RulesSchema, rules).success, `${d.id} x${m}`).toBe(true);
      }
  });

  it('multiply the numbers they name: a number, a list, whole prices', () => {
    expect(applyDial(RULES, dialById('projectSize'), 2).commons.baseSize).toBe(
      RULES.commons.baseSize * 2,
    );
    const seats = applyDial(RULES, dialById('seatPrices'), 0.5);
    expect(seats.seats.scoutPrices).toEqual(
      RULES.seats.scoutPrices.map((p) => Math.round(p * 0.5)),
    );
    expect(seats.seats.anvilScrap).toEqual(RULES.seats.anvilScrap);
    expect(applyDial(RULES, dialById('anvilScrap'), 0.5).seats.anvilScrap).toEqual(
      RULES.seats.anvilScrap.map((p) => Math.round(p * 0.5)),
    );
    expect(applyDials(RULES, { dupScrap: 2 }).scouts.duplicateCreatureScrap).toBe(
      RULES.scouts.duplicateCreatureScrap * 2,
    );
    expect(applyDials(RULES, { scoutScrap: 0.5, kitPrice: 2 }).scouts.perHour.scrap).toBe(
      RULES.scouts.perHour.scrap * 0.5,
    );
    expect(applyDials(RULES, { kitPrice: 2 }).kit.price).toBe(RULES.kit.price * 2);
  });

  it('move the share of a project paid in materials and keep the shares at 1', () => {
    const split = (m: number) => applyDials(RULES, { materialShare: m }).commons.costSplit;
    const more = split(1.25);
    expect(more.scrap).toBeCloseTo(RULES.commons.costSplit.scrap * 1.25, 6);
    expect(more.acorns + more.scrap + more.shards).toBeCloseTo(1, 9);
    expect(more.acorns).toBeGreaterThan(0);
    const dial = dialById('materialShare');
    const top = applyDial(RULES, dial, dial.max).commons.costSplit;
    expect(top.acorns).toBeGreaterThanOrEqual(0.09);
  });

  it('keep the scrap of a Forge piece under about 60', () => {
    const dial = dialById('pieceCost');
    expect(applyDial(RULES, dial, dial.max).forge.scrap).toBeLessThanOrEqual(60);
  });

  it('move what dismantling gives back together with the price of a piece', () => {
    const dial = dialById('pieceCost');
    const more = applyDial(RULES, dial, 1.5).forge;
    expect(more.dismantle[0]!.scrap).toBe(Math.round(RULES.forge.dismantle[0]!.scrap * 1.5));
    expect(more.dismantle[2]!.scrap).toBe(Math.round(RULES.forge.dismantle[2]!.scrap * 1.5));
    // Shards and Essence stay.
    expect(more.dismantle[1]!.essence).toBe(RULES.forge.dismantle[1]!.essence);
  });

  it('have sane bounds, today (1) inside them, and a known id', () => {
    for (const d of DIALS) {
      expect(d.min).toBeLessThan(1);
      expect(d.max).toBeGreaterThan(1);
      expect(d.step).toBeGreaterThan(0);
      expect(axisOf(d).start).toBe(1);
    }
    expect(new Set(DIALS.map((d) => d.id)).size).toBe(DIALS.length);
    expect(() => dialById('nope')).toThrow(/unknown dial/);
  });
});

describe('the scenario scheduler', () => {
  const fake = (id: string): JobOutcome => ({
    result: { config: ALL_SERVERS.find((s) => s.id === id)!, runs: [] },
    seconds: 0,
  });

  it('runs at most `slots` at a time and returns results in the order of the servers, whatever finishes first', async () => {
    let running = 0;
    let peak = 0;
    const delays = new Map<string, number>();
    const only = ['lone', 'mixed5', 'mixed8', 'mixed15', 'hoarder'];
    only.forEach((id, i) => delays.set(id, (only.length - i) * 3));
    const exec = async (job: { id: string }): Promise<JobOutcome> => {
      running += 1;
      peak = Math.max(peak, running);
      for (let i = 0; i < (delays.get(job.id) ?? 1); i++) await Promise.resolve();
      running -= 1;
      return fake(job.id);
    };
    const { results, seconds } = await runScenarios(1, exec, 2, only);
    expect(peak).toBeLessThanOrEqual(2);
    expect(Object.keys(results)).toEqual(
      ALL_SERVERS.map((s) => s.id).filter((id) => only.includes(id)),
    );
    expect(Object.keys(seconds)).toEqual(Object.keys(results));
  });

  it('gives the same results run one at a time or several at a time', async () => {
    const exec = (job: { id: string; seeds: number }): Promise<JobOutcome> =>
      Promise.resolve({
        result: runScenario(
          ALL_SERVERS.find((s) => s.id === job.id)!,
          job.seeds,
        ),
        seconds: 0,
      });
    const only = ['lone', 'mixed5'];
    const one = await runScenarios(1, exec, 1, only);
    const two = await runScenarios(1, exec, 2, only);
    expect(JSON.stringify(two.results)).toBe(JSON.stringify(one.results));
    expect(JSON.stringify(one.results)).toBe(JSON.stringify(runAll(1, RULES, only)));
  });
});

describe('timings and the budget', () => {
  it('prints seconds per section without putting them in the data', () => {
    const results = runAll(1, RULES);
    const timings: Timings = {};
    const data = buildReportData(results, 1, RULES, timings);
    expect(Object.keys(timings)).toEqual(
      expect.arrayContaining(['targets', 'servers', 'variants', 'cost']),
    );
    for (const s of Object.values(timings)) expect(s).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(data)).not.toContain('timings');
    expect(JSON.stringify(buildReportData(results, 1, RULES))).toBe(JSON.stringify(data));
  });

  it('warns when a run goes over its budget and says nothing alarming when it does not', () => {
    expect(BUDGET).toEqual({ reportSeconds: 30, testSeconds: 15 });
    expect(budgetLine('full report', 17.3, 30)).toBe('full report: 17.3 s (budget 30 s)');
    expect(budgetLine('full report', 45.2, 30)).toMatch(
      /^WARNING: full report took 45\.2 s, over the budget of 30 s/,
    );
  });
});
