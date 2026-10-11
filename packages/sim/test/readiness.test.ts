import { describe, expect, it } from 'vitest';
import { RULES, readinessBand } from '@creatures/game';
import {
  bandRows,
  buildReadinessCases,
  defaultReadinessSettings,
  formatReadinessReport,
  marginAtWinRate,
} from '../src/readiness';
import { main } from '../src/readiness-cli';

describe('readiness calibration', () => {
  it('finds the margin where a win rate is reached, smoothing noise', () => {
    const pts = [
      { marginBp: 6000, p: 0 },
      { marginBp: 8000, p: 0 },
      { marginBp: 9000, p: 0.2 },
      { marginBp: 9500, p: 0.1 }, // noise below its neighbour is pooled
      { marginBp: 10_500, p: 0.8 },
      { marginBp: 12_000, p: 1 },
    ];
    const at50 = marginAtWinRate(pts, 0.5);
    expect(at50).toBeGreaterThan(9_500);
    expect(at50).toBeLessThan(10_600);
    expect(marginAtWinRate(pts, 0.99)).toBeGreaterThan(10_500);
    expect(marginAtWinRate([{ marginBp: 1, p: 0 }], 0.5)).toBeNull();
    expect(marginAtWinRate([], 0.5)).toBeNull();
  });

  it('groups inputs into the bands of the rules', () => {
    const r = RULES.progression.readiness;
    const rows = bandRows([
      { marginBp: r.evenFromBp - 1, pDefault: 0, pSkilled: 0.1 },
      { marginBp: r.evenFromBp, pDefault: 0.2, pSkilled: 0.4 },
      { marginBp: r.likelyFromBp, pDefault: 0.7, pSkilled: 0.8 },
      { marginBp: r.strongFromBp, pDefault: 1, pSkilled: 1 },
      { marginBp: r.strongFromBp + 500, pDefault: 1, pSkilled: 1 },
    ]);
    expect(rows.map((x) => [x.band, x.inputs])).toEqual([
      ['long_shot', 1],
      ['even', 1],
      ['likely', 1],
      ['strong', 2],
    ]);
    expect(readinessBand({ damage: r.strongFromBp, hpLeft: 10_000 })).toBe('strong');
  });

  it('measures a tiny sample deterministically and prints a report', () => {
    const settings = {
      ...defaultReadinessSettings('quick'),
      maxCases: 3,
      seeds: 4,
      searchSeeds: 2,
    };
    const a = buildReadinessCases(settings);
    const b = buildReadinessCases(settings);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    for (const c of a) {
      expect(c.marginBp).toBeGreaterThan(0);
      expect(c.weekMarginBp).toBeGreaterThan(0);
      for (const p of [c.pDefault, c.pSkilled, c.pWeekDefault, c.pWeekSkilled]) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
    const text = formatReadinessReport(a);
    expect(text).toContain('After Saturday');
    expect(text).toContain('From Monday');
  });

  it('the CLI rejects bad arguments', () => {
    const errors: string[] = [];
    const io = { out: () => undefined, err: (t: string) => errors.push(t) };
    expect(main(['--cases', 'x'], io)).toBe(2);
    expect(main(['--nope'], io)).toBe(2);
    expect(errors.length).toBe(2);
  });
});
