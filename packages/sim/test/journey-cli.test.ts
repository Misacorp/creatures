import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main, parseJourneyCli, type Io } from '../src/journey-cli';
import { runJourneys, type JourneyReport } from '../src/journey-report';
import { PRESETS, DEFAULT_JOURNEY_MIX, SERVER_MIXES } from '../src/profiles';
import { milestoneCatalogue } from '../src/journey';

const dir = mkdtempSync(join(tmpdir(), 'sim-journey-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

describe('journey CLI arguments', () => {
  it('has the defaults: 12 weeks, 50 servers, the allowance, the default mix', () => {
    const o = parseJourneyCli([]);
    expect(o.settings.weeks).toBe(12);
    expect(o.settings.servers).toBe(50);
    expect(o.settings.income).toBe('allowance');
    expect(o.settings.mix).toEqual(DEFAULT_JOURNEY_MIX);
    expect(o.settings.mixName).toBe('default');
    expect(o.settings.noise).toBe(false);
    expect(o.settings.profiles.map((p) => p.id)).toEqual([
      'min-maxer',
      'engaged',
      'regular',
      'drop-in',
    ]);
  });

  it('reads every flag', () => {
    const o = parseJourneyCli([
      '--weeks',
      '8',
      '--servers',
      '3',
      '--seed',
      'abc',
      '--income',
      'current',
      '--server-mix',
      'casual-heavy',
      '--profiles',
      'regular,drop-in',
      '--noise',
      '--out',
      'x',
    ]);
    expect(o.settings).toMatchObject({
      weeks: 8,
      servers: 3,
      seed: 'abc',
      income: 'current',
      mixName: 'casual-heavy',
      noise: true,
    });
    expect(o.settings.profiles.map((p) => p.id)).toEqual(['regular', 'drop-in']);
    // The named mix, cut down to the profiles in use.
    expect(o.settings.mix).toEqual({
      regular: SERVER_MIXES['casual-heavy']?.regular,
      'drop-in': SERVER_MIXES['casual-heavy']?.['drop-in'],
    });
    expect(o.out).toBe('x');
  });

  it('takes a custom mix, which wins over a named one', () => {
    const o = parseJourneyCli(['--mix', 'min-maxer=2,regular=1', '--server-mix', 'casual-heavy']);
    expect(o.settings.mix).toEqual({ 'min-maxer': 2, regular: 1 });
    expect(o.settings.mixName).toBe('custom');
  });

  it('reads profiles from a file', () => {
    const file = join(dir, 'profiles.json');
    writeFileSync(
      file,
      JSON.stringify([{ ...PRESETS.regular, id: 'mine', label: 'Mine' }, PRESETS['drop-in']]),
    );
    const o = parseJourneyCli(['--profiles', file]);
    expect(o.settings.profiles.map((p) => p.id)).toEqual(['mine', 'drop-in']);
    expect(o.settings.mix).toEqual({ mine: 1, 'drop-in': 2 });
  });

  it('rejects bad input', () => {
    expect(() => parseJourneyCli(['--weeks', '0'])).toThrow(/--weeks/);
    expect(() => parseJourneyCli(['--weeks', 'x'])).toThrow(/--weeks/);
    expect(() => parseJourneyCli(['--weeks', '500'])).toThrow(/--weeks/);
    expect(() => parseJourneyCli(['--servers', '0'])).toThrow(/--servers/);
    expect(() => parseJourneyCli(['--income', 'free'])).toThrow(/--income/);
    expect(() => parseJourneyCli(['--server-mix', 'nope'])).toThrow(/--server-mix/);
    expect(() => parseJourneyCli(['--profiles', 'wizard'])).toThrow(/unknown profile/);
    expect(() => parseJourneyCli(['--mix', 'wizard=1'])).toThrow(/unknown/);
    expect(() =>
      parseJourneyCli(['--profiles', 'min-maxer', '--server-mix', 'casual-heavy']),
    ).toThrow(/empty/);
    expect(() => parseJourneyCli(['--seed', ''])).toThrow(/--seed/);
    expect(() => parseJourneyCli(['--bogus'])).toThrow();
  });
});

describe('journey CLI run on a tiny config', () => {
  it('writes the JSON report and the Markdown summary', () => {
    const out = join(dir, 'run');
    const { io, out: lines, err } = capture();
    const code = main(
      ['--weeks', '3', '--servers', '2', '--seed', 'tiny', '--income', 'allowance', '--out', out],
      io,
    );
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('Journey sim');
    const report = JSON.parse(
      readFileSync(join(out, 'report-journey.json'), 'utf8'),
    ) as JourneyReport;
    expect(report.settings).toMatchObject({
      weeks: 3,
      servers: 2,
      income: 'allowance',
      seed: 'tiny',
    });
    expect(Object.keys(report.presets)).toEqual(['min-maxer', 'engaged', 'regular', 'drop-in']);
    const engaged = report.presets['engaged'];
    expect(engaged?.players).toBe(6); // 3 per server, 2 servers
    expect(engaged?.weeks).toHaveLength(3);
    const first = engaged?.weeks[0];
    expect(first?.power?.median).toBeGreaterThan(0);
    expect(first?.power?.p25).toBeLessThanOrEqual(first?.power?.p75 ?? 0);
    // The fight-scored power sits next to the older score, for every week.
    for (const w of engaged?.weeks ?? []) {
      expect(w.fightPower?.median).toBeGreaterThan(0);
      expect(w.fightPower?.p25).toBeLessThanOrEqual(w.fightPower?.p75 ?? 0);
      expect(w.fightSurvivalBp?.median).toBeGreaterThan(0);
      expect(w.fightSurvivalBp?.median).toBeLessThanOrEqual(10_000);
    }
    for (const id of Object.keys(engaged?.milestones ?? {})) {
      expect(milestoneCatalogue()).toContain(id);
    }
    expect(report.servers).toHaveLength(3);
    expect(Object.keys(report.examples)).toHaveLength(4);
    const md = readFileSync(join(out, 'report-journey.md'), 'utf8');
    expect(md).toContain('# Player journey simulation');
    expect(md).toContain('## Raid team power by week');
    expect(md).toContain('## Raid team fight-scored power by week');
    expect(md).toContain('## When the milestones land');
    expect(md).toContain('## What holds players back');
    expect(md).toContain('Min-maxer');
  });

  it('reports a bad argument and exits with 2', () => {
    const { io, err } = capture();
    expect(main(['--income', 'free'], io)).toBe(2);
    expect(err.join('')).toContain('--income');
  });

  it('is reproducible, and the two income models differ for the same servers', () => {
    const base = parseJourneyCli(['--weeks', '4', '--servers', '3', '--seed', 'pair']).settings;
    const a = JSON.stringify(runJourneys(base));
    expect(JSON.stringify(runJourneys(base))).toBe(a);
    const current = runJourneys({ ...base, income: 'current' });
    const allowance = JSON.parse(a) as JourneyReport;
    // Drop-ins and regulars open the game more often than they leet: the allowance pays them more Bait,
    // so they end up stronger.
    const power = (r: JourneyReport, id: string): number =>
      r.presets[id]?.weeks.at(-1)?.power?.median ?? 0;
    expect(power(allowance, 'regular')).toBeGreaterThan(power(current, 'regular'));
  });
});
