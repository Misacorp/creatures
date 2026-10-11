import { describe, expect, it } from 'vitest';
import { RULES } from '@creatures/game';
import { main as luckMain } from '../src/luck-cli';
import {
  buildCases,
  groupOf,
  luckIsOff,
  parseLuck,
  runLuckStudy,
  summarizeGroup,
  type CaseMeasure,
  type LuckStudySettings,
} from '../src/luck';

const TINY: LuckStudySettings = {
  seed: 'luck-test',
  economySims: 1,
  counts: [7],
  seeds: 8,
  searchSeeds: 2,
  passes: 1,
  maxCases: 2,
  luckStages: ['phase1', 'phase2', 'finale'],
};

function measure(over: Partial<CaseMeasure>): CaseMeasure {
  return {
    pDefault: 0.5,
    pSkilled: 0.5,
    pWeek: 0.5,
    pWeekSkilled: 0.5,
    ratioDefault: 1,
    ratioSkilled: 1,
    damageCv: 0,
    damageShift: 1,
    ...over,
  };
}

describe('luck settings', () => {
  it('reads a luck setting over the shipped (off) rules', () => {
    const s = parseLuck('critChanceBp=1500,swingRounds=4');
    expect(s.luck?.critChanceBp).toBe(1500);
    expect(s.luck?.swingRounds).toBe(4);
    expect(s.luck?.spreadBp).toBe(RULES.combat.luck.spreadBp);
  });

  it('refuses unknown keys and bad numbers', () => {
    expect(() => parseLuck('nope=1')).toThrow();
    expect(() => parseLuck('critBp=-1')).toThrow();
    expect(() => parseLuck('critBp=x')).toThrow();
    expect(() => parseLuck('critBp')).toThrow();
  });

  it('knows when no luck is on', () => {
    expect(luckIsOff(undefined)).toBe(true);
    expect(luckIsOff(RULES.combat.luck)).toBe(true);
    expect(luckIsOff(parseLuck('critBp=9000').luck)).toBe(true);
    expect(luckIsOff(parseLuck('critChanceBp=1').luck)).toBe(false);
    expect(luckIsOff(parseLuck('slumpChanceBp=1').luck)).toBe(false);
  });
});

describe('summaries', () => {
  it('groups by sign-ups', () => {
    expect(groupOf(3)).toBe('small');
    expect(groupOf(5)).toBe('typical');
    expect(groupOf(10)).toBe('typical');
    expect(groupOf(11)).toBe('large');
  });

  it('computes the decided share, the band, p(1-p) and the uplift', () => {
    const g = summarizeGroup('typical', [
      measure({ pDefault: 0, pSkilled: 1 }),
      measure({ pDefault: 1, pSkilled: 1 }),
      measure({ pDefault: 0.5, pSkilled: 0.7 }),
      measure({ pDefault: 0.25, pSkilled: 0.5 }),
    ]);
    expect(g.inputs).toBe(4);
    expect(g.decided).toBe(0.5);
    expect(g.inBand).toBe(0.5);
    expect(g.meanPQ).toBeCloseTo((0 + 0 + 0.25 + 0.1875) / 4);
    expect(g.uplift).toBeCloseTo((1 + 0 + 0.2 + 0.25) / 4);
    expect(g.upliftOpen).toBeCloseTo((0.2 + 0.25) / 2);
    expect(g.upliftOver10).toBe(0.75);
    expect(g.histogram.reduce((a, b) => a + b, 0)).toBe(4);
  });
});

describe('the study', () => {
  it('builds inputs from simulated rosters', () => {
    const cases = buildCases(TINY);
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.finale.phase).toBe('finale');
      expect(c.finale.bossHpPool.current).toBeGreaterThan(0);
      expect(c.signed.length).toBe(c.signedUp);
    }
  });

  it('shows the shipped rules are all or nothing and a luck setting opens them up', () => {
    const result = runLuckStudy(TINY, [
      parseLuck('surgeChanceBp=2500,slumpChanceBp=2500,swingBp=9000'),
    ]);
    const [off, luck] = result.rows;
    for (const g of off?.groups ?? []) {
      expect(g.decided).toBe(1);
      expect(g.meanPQ).toBe(0);
      expect(g.damageCv).toBe(0);
    }
    for (const g of luck?.groups ?? []) {
      expect(g.damageCv).toBeGreaterThan(0);
    }
  });
});

describe('the study CLI', () => {
  it('rejects bad arguments', () => {
    const err: string[] = [];
    const io = { out: () => undefined, err: (t: string) => err.push(t) };
    expect(luckMain(['--seeds', 'x'], io)).toBe(2);
    expect(luckMain(['--luck', 'nope=1'], io)).toBe(2);
    expect(luckMain(['--stages', 'some'], io)).toBe(2);
    expect(err).toHaveLength(3);
  });

  it('prints a report', () => {
    const out: string[] = [];
    const code = luckMain(
      ['--quick', '--cases', '1', '--seeds', '4', '--search', '1', '--passes', '1'],
      { out: (t) => out.push(t), err: () => undefined },
    );
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Luck study');
    expect(out.join('\n')).toContain('off (shipped rules)');
  });
});
