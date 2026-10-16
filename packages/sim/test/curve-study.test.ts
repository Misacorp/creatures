import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { RULES } from '@creatures/game';
import {
  CURVE_BANDS,
  CURVE_MIXES,
  MIN_RANK_SAMPLE,
  curveMarkdown,
  curveMetrics,
  namedCurveMixes,
  runCurveMix,
  runCurveStudy,
  statsOf,
  type CurveMixResult,
  type CurveRaid,
} from '../src/curve-study';
import { TARGETS } from '../src/targets';
import { SERVER_MIXES, scaleProfileMix, journeyRoster } from '../src/profiles';
import { main, parseCurveCli } from '../src/curve-cli';

const raid = (over: Partial<CurveRaid> = {}): CurveRaid => ({
  week: 1,
  rank: 1,
  effectiveRank: 1,
  festival: false,
  signedUp: 8,
  phase1: true,
  phase2: false,
  finaleWon: true,
  koShare: 0.1,
  overtime: false,
  startShare: 0.3,
  ...over,
});

describe('statsOf', () => {
  it('counts rates, the knock-out mean and the overtime wins of a group of raid weeks', () => {
    const s = statsOf([
      raid(),
      raid({ phase1: false, finaleWon: false, koShare: 0.9, overtime: true }),
      raid({ phase2: true, overtime: true, koShare: 0.5 }),
      raid({ phase1: true, koShare: 0.2 }),
    ]);
    expect(s.raids).toBe(4);
    expect(s.phase1).toBeCloseTo(0.75);
    expect(s.phase2).toBeCloseTo(0.25);
    expect(s.finale).toBeCloseTo(0.75);
    expect(s.ko).toBeCloseTo(0.425);
    expect(s.overtime).toBeCloseTo(0.5);
    expect(s.overtimeWon).toBeCloseTo(0.25);
    expect(s.startShare).toBeCloseTo(0.3);
  });

  it('is null, not zero, for an empty group', () => {
    const s = statsOf([]);
    expect(s.raids).toBe(0);
    expect(s.finale).toBeNull();
    expect(s.ko).toBeNull();
  });
});

describe('the curve study on a few small servers', () => {
  const settings = { seed: 'curve-test', weeks: 4, servers: 3, income: 'allowance' as const };
  const mixResult = runCurveMix(settings, 'default', SERVER_MIXES['default'] ?? {});

  it('groups every raid week by week, rank and band, and is the same twice', () => {
    expect(mixResult.servers).toBe(3);
    expect(mixResult.players).toBe(9);
    expect(mixResult.weeks).toHaveLength(4);
    // A new server's first raid is always at rank 1.
    expect(mixResult.week1.raids).toBeGreaterThan(0);
    expect(mixResult.ranks[0]?.rank).toBe(1);
    const inRanks = mixResult.ranks.reduce((n, r) => n + r.raids, 0);
    const inBands = CURVE_BANDS.reduce((n, b) => n + mixResult.bands[b.id].raids, 0);
    expect(inBands).toBe(inRanks);
    expect(mixResult.normal.raids).toBe(inRanks);
    expect(runCurveMix(settings, 'default', SERVER_MIXES['default'] ?? {})).toEqual(mixResult);
  });

  it('writes the numbers the targets read, and the markdown has a table per mix', () => {
    const study = runCurveStudy({ ...settings, servers: 1, mixes: namedCurveMixes() });
    expect(study.mixes.map((m) => m.id)).toEqual([...CURVE_MIXES]);
    for (const t of TARGETS.filter((x) => x.id.startsWith('curve-'))) {
      expect(Object.keys(study.metrics), `${t.id} reads ${t.metric}`).toContain(t.metric);
    }
    const md = curveMarkdown(study);
    for (const id of CURVE_MIXES) expect(md).toContain(`## ${id}`);
    expect(md).toContain('Per Boss Rank');
  });
});

describe('the worst-rank metric', () => {
  it("passes the study's worst rank on, and is null when no rank had enough weeks", () => {
    const worst = { ...emptyMix('committed'), worstRank: { rank: 7, finale: 0.7 } };
    expect(curveMetrics([worst])['curve.committed.worstRankWinRate']).toBe(0.7);
    expect(curveMetrics([emptyMix('committed')])['curve.committed.worstRankWinRate']).toBeNull();
  });

  it('only counts ranks with at least MIN_RANK_SAMPLE normal weeks', () => {
    // A committed server of a handful of weeks never reaches the sample size at any rank above 1.
    const small = runCurveMix(
      { seed: 'worst', weeks: 3, servers: 2, income: 'allowance' },
      'committed',
      SERVER_MIXES['committed'] ?? {},
    );
    expect(MIN_RANK_SAMPLE).toBeGreaterThan(small.normal.raids);
    expect(small.worstRank).toBeNull();
  });
});

function emptyMix(id: string): CurveMixResult {
  const empty = statsOf([]);
  return {
    id,
    servers: 0,
    players: 0,
    weeks: [],
    ranks: [],
    bands: { r1: empty, r2to5: empty, r6up: empty },
    normal: empty,
    week1: empty,
    finalRankMean: null,
    worstRank: null,
  };
}

describe('the rank bands and the profile mix helpers', () => {
  it('cover every rank once', () => {
    for (let r = 1; r <= RULES.raid.scaling.maxRank; r++) {
      expect(CURVE_BANDS.filter((b) => r >= b.from && r <= b.to)).toHaveLength(1);
    }
  });

  it('scale the default journey server to any size with the same total', () => {
    for (const n of [1, 2, 5, 9, 12, 15]) {
      const mix = scaleProfileMix(SERVER_MIXES['default'] ?? {}, n);
      expect(Object.values(mix).reduce((a, b) => a + b, 0)).toBe(n);
      expect(journeyRoster(n)).toHaveLength(n);
    }
    expect(scaleProfileMix(SERVER_MIXES['default'] ?? {}, 9)).toEqual(SERVER_MIXES['default']);
    expect(() => scaleProfileMix({ a: 1 }, 0)).toThrow(RangeError);
    expect(() => scaleProfileMix({ a: 0 }, 3)).toThrow(RangeError);
  });
});

const dir = mkdtempSync(join(tmpdir(), 'sim-curve-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the curve CLI', () => {
  it('reads its options and rejects bad ones', () => {
    expect(parseCurveCli([]).settings.mixes.map((m) => m.id)).toEqual([...CURVE_MIXES]);
    expect(parseCurveCli(['--server-mix', 'committed']).settings.mixes).toHaveLength(1);
    expect(parseCurveCli(['--mix', 'regular=5,drop-in=3']).settings.mixes[0]?.id).toBe('custom');
    expect(() => parseCurveCli(['--server-mix', 'nope'])).toThrow();
    expect(() => parseCurveCli(['--weeks', '0'])).toThrow();
    expect(() => parseCurveCli(['--servers', 'x'])).toThrow();
    const errors: string[] = [];
    const io = { out: () => undefined, err: (t: string) => errors.push(t) };
    expect(main(['--set', 'raid.curve.ranks.1.hpBp=abc'], io)).toBe(2);
    expect(main(['--set', 'raid.curve.nothing=5'], io)).toBe(2);
    expect(errors).toHaveLength(2);
  });

  it('overrides the curve for a run and restores it afterwards', () => {
    const before = RULES.raid.curve.ranks[2]?.hpBp;
    const out: string[] = [];
    const code = main(
      [
        '--set',
        'raid.curve.ranks.2.hpBp=12345',
        '--weeks',
        '1',
        '--servers',
        '1',
        '--server-mix',
        'default',
        '--out',
        join(dir, 'run'),
      ],
      { out: (t) => out.push(t), err: () => undefined },
    );
    expect(code).toBe(0);
    expect(RULES.raid.curve.ranks[2]?.hpBp).toBe(before);
    expect(out.join('\n')).toContain('Report written');
    const report = JSON.parse(readFileSync(join(dir, 'run', 'report-curve.json'), 'utf8')) as {
      mixes: { id: string }[];
    };
    expect(report.mixes.map((m) => m.id)).toEqual(['default']);
  });
});
