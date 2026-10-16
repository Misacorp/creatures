import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULES, expeditionContent } from '@creatures/game';
import { main, parseSuppliesCli } from '../src/supplies-cli';
import {
  runSuppliesStudy,
  suppliesMarkdown,
  suppliesMetrics,
  type SuppliesRun,
} from '../src/supplies-study';
import { applyOverrides } from '../src/tune';
import { TARGETS } from '../src/targets';

const STUDY = { seed: 'supplies-test', seeds: 1, servers: 2, weeks: 4 } as const;

describe('the supplies study', () => {
  const run = runSuppliesStudy('test', '', STUDY);

  it('reports every preset by week, with the supplies by source adding up to the use and the stock', () => {
    expect(run.profiles.map((p) => p.id)).toEqual(['min-maxer', 'engaged', 'regular', 'drop-in']);
    for (const p of run.profiles) {
      expect(p.weeks).toHaveLength(STUDY.weeks);
      expect(p.players).toBeGreaterThan(0);
      for (const w of p.weeks) {
        for (const x of [w.used, w.found, w.dungeon, w.crafted, w.gift, w.stock, w.scrap]) {
          expect(x).toBeGreaterThanOrEqual(0);
        }
        // The good and great ones are part of the crafted ones.
        expect(w.craftedGood + w.craftedGreat).toBeLessThanOrEqual(w.crafted + 1e-9);
      }
      // What came in minus what was used is what is in stock at the end (the study holds none at the start).
      const sum = (f: (w: (typeof p.weeks)[number]) => number): number =>
        p.weeks.reduce((n, w) => n + f(w), 0);
      const inflow = sum((w) => w.found + w.dungeon + w.crafted + w.gift);
      const last = p.weeks.at(-1);
      expect(Math.abs(inflow - sum((w) => w.used) - (last?.stock ?? 0))).toBeLessThan(0.3);
    }
  });

  it('shows nothing bought and a dungeon supply for every profile that runs the dungeon', () => {
    for (const p of run.profiles) {
      for (const w of p.weeks) expect(w).not.toHaveProperty('bought');
    }
    const regular = run.profiles.find((p) => p.id === 'regular');
    expect(regular?.weeks.reduce((n, w) => n + w.dungeon, 0)).toBeGreaterThan(0);
    // The min-maxer makes supplies in the workshop.
    const minmaxer = run.profiles.find((p) => p.id === 'min-maxer');
    expect(minmaxer?.weeks.reduce((n, w) => n + w.crafted, 0)).toBeGreaterThan(0);
  });

  it('is deterministic for a seed', () => {
    expect(runSuppliesStudy('test', '', STUDY)).toEqual(run);
  });

  it('answers a tuning override: no supply from the dungeon when no room drops one', () => {
    const restore = applyOverrides('dungeon.perRoom.0.supply=0');
    try {
      const without = runSuppliesStudy('none', 'dungeon.perRoom.0.supply=0', STUDY);
      for (const p of without.profiles) {
        for (const w of p.weeks) expect(w.dungeon).toBe(0);
      }
    } finally {
      restore();
    }
    // Restored: the shipped rule drops one again.
    expect(RULES.dungeon.perRoom[0]?.supply).toBe(1);
  });

  it('takes a supply recipe override from the content, and puts it back', () => {
    const before = expeditionContent.supplies.find((s) => s.id === 'lure-basic')?.blueprint.parts
      .scrap;
    const restore = applyOverrides('supply.lure-basic.blueprint.parts.scrap=9');
    expect(
      expeditionContent.supplies.find((s) => s.id === 'lure-basic')?.blueprint.parts.scrap,
    ).toBe(9);
    restore();
    expect(
      expeditionContent.supplies.find((s) => s.id === 'lure-basic')?.blueprint.parts.scrap,
    ).toBe(before);
    expect(() => applyOverrides('supply.no-such-supply.blueprint.parts.scrap=1')).toThrow(
      /no such setting/,
    );
  });

  it('lays variants side by side in Markdown, one table per profile and measure', () => {
    const md = suppliesMarkdown([run, { ...run, label: 'second' }], [1, 4]);
    expect(md).toContain('# Supplies study');
    expect(md).toContain('## Min-maxer');
    expect(md).toContain('## Drop-in');
    expect(md).toContain('Supplies used per week');
    expect(md).toContain('good tier / great tier');
    expect(md).toMatch(/\| second \|/);
  });

  it('reads the balance metrics of a run: used a week, crafted share, and the gear at the end', () => {
    const metrics = suppliesMetrics(run, 2);
    for (const id of ['min-maxer', 'engaged', 'regular', 'drop-in']) {
      expect(metrics[`supplies.${id}.usedPerWeek`]).toBeGreaterThanOrEqual(0);
      const share = metrics[`supplies.${id}.craftedShare`] ?? -1;
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(1);
    }
    expect(metrics['supplies.min-maxer.gearLevelsEnd']).toBeGreaterThanOrEqual(0);
    // Every metric the supplies targets read is one the study makes.
    for (const t of TARGETS.filter((x) => x.id.startsWith('supplies-'))) {
      expect(Object.keys(suppliesMetrics(run)), t.id).toContain(t.metric);
    }
  });
});

describe('the supplies CLI', () => {
  it('reads its options with defaults, and refuses odd ones', () => {
    const options = parseSuppliesCli(['--label', 'run', '--servers', '3', '--out', 'x.json']);
    expect(options).toMatchObject({
      label: 'run',
      set: '',
      out: 'x.json',
      study: { seeds: 3, servers: 3, weeks: 30 },
    });
    expect(() => parseSuppliesCli(['--servers', '0'])).toThrow(/--servers/);
    expect(() => parseSuppliesCli(['--weeks', 'many'])).toThrow(/whole number/);
    expect(() => parseSuppliesCli(['--label', '../x'])).toThrow(/--label/);
    expect(() => parseSuppliesCli(['--unknown'])).toThrow();
  });

  it('writes one variant as JSON and compares several as Markdown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'supplies-'));
    try {
      const out: string[] = [];
      const io = {
        out: (t: string) => out.push(t),
        err: (t: string) => out.push(`ERR ${t}`),
      };
      const a = join(dir, 'a.json');
      const b = join(dir, 'b.json');
      expect(
        main(['--label', 'a', '--servers', '1', '--seeds', '1', '--weeks', '2', '--out', a], io),
      ).toBe(0);
      expect(
        main(
          [
            '--label',
            'b',
            '--set',
            'dungeon.perRoom.0.supply=0',
            '--servers',
            '1',
            '--seeds',
            '1',
            '--weeks',
            '2',
            '--out',
            b,
          ],
          io,
        ),
      ).toBe(0);
      const first = JSON.parse(readFileSync(a, 'utf8')) as SuppliesRun;
      expect(first.label).toBe('a');
      expect(first.profiles).toHaveLength(4);
      // The override was put back after the run.
      expect(RULES.dungeon.perRoom[0]?.supply).toBe(1);
      const md = join(dir, 'c.md');
      expect(main(['--compare', `${a},${b}`, '--out', md], io)).toBe(0);
      expect(readFileSync(md, 'utf8')).toContain('| b |');
      // A bad override is an error, and a run needs somewhere to write.
      expect(main(['--set', 'nothing.here=1', '--out', join(dir, 'x.json')], io)).toBe(2);
      expect(main([], io)).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
