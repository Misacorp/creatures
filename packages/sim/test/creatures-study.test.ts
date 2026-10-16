import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULES, expeditionContent } from '@creatures/game';
import { main, parseCreaturesCli } from '../src/creatures-cli';
import {
  catalogueWeekOf,
  creaturesMarkdown,
  creaturesMetrics,
  runCreaturesStudy,
  type CreaturesRun,
} from '../src/creatures-study';
import { GEAR_POLICY } from '../src/gear';
import { applyOverrides } from '../src/tune';
import { TARGETS } from '../src/targets';

const STUDY = { seed: 'creatures-test', seeds: 1, servers: 2, weeks: 6 } as const;

describe('the creatures study', () => {
  const run = runCreaturesStudy('test', '', STUDY);

  it('reports every preset by week, with the answers to the duplicates adding up to the duplicates', () => {
    expect(run.profiles.map((p) => p.id)).toEqual(['min-maxer', 'engaged', 'regular', 'drop-in']);
    for (const p of run.profiles) {
      expect(p.weeks).toHaveLength(STUDY.weeks);
      expect(p.players).toBeGreaterThan(0);
      for (const w of p.weeks) {
        for (const x of [w.rolls, w.catches, w.empty, w.dupes, w.taught, w.fused, w.released]) {
          expect(x).toBeGreaterThanOrEqual(0);
        }
        // Every creature that came is either a new species or a duplicate, and every roll is a creature or none
        // (a Festival win adds a creature without a roll, and one that is not a base species).
        expect(Math.abs(w.catches - w.newSpecies - w.dupes)).toBeLessThanOrEqual(2);
        expect(Math.abs(w.rolls - w.catches - w.empty)).toBeLessThanOrEqual(2);
        expect(Math.abs(w.taught + w.fused + w.released - w.dupes)).toBeLessThan(0.5);
      }
    }
  });

  it('catches fewer creatures than rolls, and the committed player catches more than the drop-in', () => {
    const total = (
      id: string,
      f: (w: CreaturesRun['profiles'][number]['weeks'][number]) => number,
    ) => (run.profiles.find((p) => p.id === id)?.weeks ?? []).reduce((n, w) => n + f(w), 0);
    expect(total('min-maxer', (w) => w.catches)).toBeLessThan(total('min-maxer', (w) => w.rolls));
    expect(total('min-maxer', (w) => w.empty)).toBeGreaterThan(0);
    expect(total('min-maxer', (w) => w.catches)).toBeGreaterThan(
      total('drop-in', (w) => w.catches),
    );
  });

  it('spends Bait on lures within the share of the Bait earned that the policy allows', () => {
    for (const p of run.profiles) {
      for (const w of p.weeks) {
        expect(w.baitLures).toBeGreaterThanOrEqual(0);
        // The budget is checked for every lure (per player, per week), so the mean never passes it.
        expect(w.baitLures).toBeLessThanOrEqual(
          (w.baitEarned * GEAR_POLICY.lureBaitShareBp) / 10_000 + 0.01,
        );
      }
    }
    const minmaxer = run.profiles.find((p) => p.id === 'min-maxer');
    expect(minmaxer?.weeks.reduce((n, w) => n + w.baitLures, 0)).toBeGreaterThan(0);
    expect(minmaxer?.weeks.reduce((n, w) => n + w.luresCrafted, 0)).toBeGreaterThan(0);
  });

  it('gives a share of the fight power to the talents in the weeks that were scored', () => {
    const shares = run.profiles.flatMap((p) => p.weeks.map((w) => w.talentShare));
    const scored = shares.filter((x): x is number => x !== null);
    expect(scored.length).toBeGreaterThan(0);
    for (const s of scored) {
      expect(s).toBeGreaterThan(-0.2);
      expect(s).toBeLessThan(0.6);
    }
    // At least one profile gets something from them.
    expect(scored.some((s) => s > 0)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    expect(runCreaturesStudy('test', '', STUDY)).toEqual(run);
  });

  it('answers a tuning override: nothing caught when no roll brings a creature', () => {
    const set =
      'expeditions.lengths.short.catchBp=0,expeditions.lengths.medium.catchBp=0,expeditions.lengths.long.catchBp=0,expeditions.lengths.day.catchBp=0';
    const restore = applyOverrides(set);
    try {
      const none = runCreaturesStudy('none', set, STUDY);
      const total = (r: CreaturesRun): number =>
        r.profiles.reduce((n, p) => n + p.weeks.reduce((m, w) => m + w.catches, 0), 0);
      // A lure's own chance may still bring a creature, and a Festival win brings one without a roll, so
      // the catches are far fewer rather than none.
      expect(total(none)).toBeLessThan(total(run) / 2);
      for (const p of none.profiles) {
        for (const w of p.weeks) expect(w.empty).toBeGreaterThanOrEqual(0);
      }
    } finally {
      restore();
    }
    expect(RULES.expeditions.lengths.short.catchBp).toBeGreaterThan(0);
  });

  it('takes a lure override from the content, and puts it back', () => {
    const lure = () => expeditionContent.supplies.find((s) => s.id === 'lure-basic');
    const before = lure()?.blueprint.bait;
    const restore = applyOverrides('supply.lure-basic.blueprint.bait=9');
    expect(lure()?.blueprint.bait).toBe(9);
    restore();
    expect(lure()?.blueprint.bait).toBe(before);
  });

  it('lays variants side by side in Markdown, one table per profile and measure', () => {
    const md = creaturesMarkdown([run, { ...run, label: 'second' }], [1, 4]);
    expect(md).toContain('# Creatures study');
    expect(md).toContain('## Min-maxer');
    expect(md).toContain('## Drop-in');
    expect(md).toContain('Weeks to complete the base catalogue');
    expect(md).toContain('Bait per week: earned / levels / lures / talent slots');
    expect(md).toContain("Talents' share of fight power");
    expect(md).toMatch(/\| second \|/);
  });

  it('reads the balance metrics of a run, and the shipped targets that name them exist', () => {
    const metrics = creaturesMetrics(run, 2);
    for (const id of ['min-maxer', 'engaged', 'regular', 'drop-in']) {
      expect(metrics[`creatures.${id}.catchesPerWeek`]).toBeGreaterThanOrEqual(0);
      expect(metrics[`creatures.${id}.dupesPerWeek`]).toBeGreaterThanOrEqual(0);
      expect(metrics[`creatures.${id}.catalogueWeeks`]).toBeGreaterThan(0);
      expect(metrics[`creatures.${id}.lureBaitShare`]).toBeGreaterThanOrEqual(0);
    }
    // A catalogue nobody finished counts as the run's length plus one.
    expect(metrics['creatures.drop-in.catalogueWeeks']).toBe(STUDY.weeks + 1);
    const named = TARGETS.filter((t) => t.metric.startsWith('creatures.'));
    expect(named.length).toBeGreaterThan(0);
  });
});

describe('the catalogue milestone', () => {
  it('turns the day the last species was owned into a week since joining', () => {
    const journey = (day: number | undefined) =>
      ({
        playerId: 'p01',
        profile: 'x',
        label: 'x',
        joinDay: 0,
        days: [],
        milestones: day === undefined ? {} : { catalogue_complete: day },
        waits: [],
      }) as Parameters<typeof catalogueWeekOf>[0];
    expect(catalogueWeekOf(journey(1))).toBe(1);
    expect(catalogueWeekOf(journey(7))).toBe(1);
    expect(catalogueWeekOf(journey(8))).toBe(2);
    expect(catalogueWeekOf(journey(undefined))).toBeNull();
  });
});

describe('the creatures study CLI', () => {
  it('parses its options and refuses odd ones', () => {
    const opts = parseCreaturesCli(['--label', 'try', '--seeds', '2', '--weeks', '10']);
    expect(opts.label).toBe('try');
    expect(opts.study.seeds).toBe(2);
    expect(opts.study.weeks).toBe(10);
    expect(() => parseCreaturesCli(['--seeds', 'x'])).toThrow();
    expect(() => parseCreaturesCli(['--label', 'no/slashes'])).toThrow();
    expect(() => parseCreaturesCli(['--nope'])).toThrow();
  });

  it('writes one variant and lays variants side by side', () => {
    const dir = mkdtempSync(join(tmpdir(), 'creatures-'));
    try {
      const out: string[] = [];
      const io = { out: (t: string) => out.push(t), err: (t: string) => out.push(t) };
      const file = join(dir, 'a.json');
      expect(
        main(['--label', 'a', '--seeds', '1', '--servers', '1', '--weeks', '3', '--out', file], io),
      ).toBe(0);
      const written = JSON.parse(readFileSync(file, 'utf8')) as CreaturesRun;
      expect(written.label).toBe('a');
      expect(written.profiles).toHaveLength(4);
      const md = join(dir, 'out.md');
      expect(main(['--compare', file, '--out', md], io)).toBe(0);
      expect(readFileSync(md, 'utf8')).toContain('# Creatures study');
      // No --out without --compare: usage, exit code 2.
      expect(main(['--label', 'a'], io)).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
