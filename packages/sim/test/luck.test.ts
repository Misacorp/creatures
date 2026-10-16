import { describe, expect, it } from 'vitest';
import { NO_LUCK, RULES } from '@creatures/game';
import { main as luckMain } from '../src/luck-cli';
import {
  buildCases,
  calibrateKnockouts,
  groupOf,
  luckIsOff,
  parseLuck,
  runLuckStudy,
  scaleFight,
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
    snapshotWeek: 4,
    rowSize: 20,
    guards: 2,
    shields: 2,
    pDefault: 0.5,
    pSkilled: 0.5,
    pGuardTimed: 0.5,
    pNoShield: 0.5,
    looShield: 0,
    pNoGuard: 0.5,
    looGuard: 0,
    pWeek: 0.5,
    pWeekSkilled: 0.5,
    pWeekGuardTimed: 0.5,
    pWeekNoShield: 0.5,
    pWeekNoGuard: 0.5,
    knockouts: 2,
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

  it('reads the study keys: boss Attack and a knockout target', () => {
    const s = parseLuck('critChanceBp=500,bossCritChanceBp=500,bossAtkBp=25000');
    expect(s.bossAtkBp).toBe(25_000);
    expect(s.luck?.bossCritChanceBp).toBe(500);
    expect(parseLuck('ko=4').koTarget).toBe(4);
    expect(parseLuck('bossRandomTargetBp=5000').luck?.bossRandomTargetBp).toBe(5_000);
    expect(() => parseLuck('ko=0')).toThrow();
    expect(() => parseLuck('bossAtkBp=5')).toThrow();
  });

  it('knows a boss crit is luck too', () => {
    expect(luckIsOff(parseLuck('bossCritChanceBp=500').luck)).toBe(false);
  });

  it('knows when no luck is on', () => {
    expect(luckIsOff(undefined)).toBe(true);
    expect(luckIsOff(NO_LUCK)).toBe(true);
    // The shipped rules have crits on.
    expect(luckIsOff(RULES.combat.luck)).toBe(false);
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

  it('computes knockouts and what guards and shields are worth', () => {
    const g = summarizeGroup(
      'typical',
      [
        measure({ knockouts: 4, rowSize: 20, pDefault: 0.6, pNoShield: 0.4, looShield: 0.1 }),
        measure({ knockouts: 2, rowSize: 10, shields: 0, guards: 0, pDefault: 0.5 }),
        measure({
          pDefault: 0.5,
          pGuardTimed: 0.7,
          pNoGuard: 0.3,
          looGuard: 0.05,
          pWeek: 0.5,
          pWeekNoGuard: 0.4,
        }),
      ],
      4,
    );
    expect(g.week).toBe(4);
    expect(g.knockouts).toBeCloseTo((4 + 2 + 2) / 3);
    expect(g.knockoutShare).toBeCloseTo((0.2 + 0.2 + 0.1) / 3);
    expect(g.withShield).toBeCloseTo(2 / 3);
    expect(g.withGuard).toBeCloseTo(2 / 3);
    expect(g.guardUplift).toBeCloseTo((-0.1 + 0 + 0.2) / 3);
    // Only inputs that have a shield (the first and third) count for the loss of shields.
    expect(g.noShieldLoss).toBeCloseTo((0.2 + 0) / 2);
    expect(g.looShield).toBeCloseTo(0.05);
    expect(g.noGuardLoss).toBeCloseTo((0.1 + 0.2) / 2);
    expect(g.noGuardLossWeek).toBeCloseTo((0 + 0.1) / 2);
    expect(g.looGuard).toBeCloseTo(0.025);
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

  it('scales boss Attack and the HP pool of a finale input, keeping 1 <= current <= max', () => {
    const c = buildCases(TINY)[0];
    if (c === undefined) throw new Error('no case');
    const same = scaleFight(c.finale, { bossAtkBp: 10_000, hpScaleBp: 10_000 });
    expect(same.bossAtk).toBe(c.finale.bossAtk);
    expect(same.bossHpPool).toEqual(c.finale.bossHpPool);
    const scaled = scaleFight(c.finale, { bossAtkBp: 30_000, hpScaleBp: 11_000 });
    expect(scaled.bossAtk).toBe(Math.floor(c.finale.bossAtk * 3));
    expect(scaled.bossHpPool.max).toBe(Math.floor((c.finale.bossHpPool.max * 11) / 10));
    expect(scaled.bossHpPool.current).toBeLessThanOrEqual(scaled.bossHpPool.max);
    expect(scaled.row).toEqual(c.finale.row);
  });

  it('calibrates boss Attack so that more knockouts need a harder boss', () => {
    const cases = buildCases({ ...TINY, maxCases: 0, counts: [7] });
    const luck = parseLuck('critChanceBp=500').luck;
    // The shipped Attack knocks out fewer than 5 of the 21 creatures on average, and with armored
    // Guards taking the reflects even a much harder boss rarely passes 9: the targets sit between.
    const low = calibrateKnockouts(cases, luck, 5, TINY);
    const high = calibrateKnockouts(cases, luck, 8, TINY);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThanOrEqual(10_000);
  });

  it('reports knockouts and guard values for lethality with luck, and keeps the shipped row all or nothing', () => {
    const result = runLuckStudy(TINY, [parseLuck('critChanceBp=500,bossAtkBp=40000')], {
      retune: true,
    });
    const [off, hard] = result.rows;
    expect(off?.bossAtkBp).toBe(10_000);
    expect(hard?.bossAtkBp).toBe(40_000);
    const knocked = (r: typeof off) =>
      r?.groups.find((g) => g.week === null && g.boss === null)?.knockouts ?? 0;
    expect(knocked(hard)).toBeGreaterThan(knocked(off));
    // The retune keeps the mean damage: boss HP follows the damage shift of the group.
    for (const g of hard?.groups.filter((x) => x.week === null && x.boss === null) ?? []) {
      expect(hard?.hpScaleBp[g.group]).toBe(Math.round(g.damageShift * 10_000));
    }
    expect(off?.hpScaleBp['typical']).toBe(10_000);
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
