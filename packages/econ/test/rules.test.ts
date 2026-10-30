/** The rules as data: the schema, the away steps against posts.md's table, the assumptions list. */
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { awayShare, catchUpMultiplier, hearthMultiplier, masteryBonus } from '../src/curves';
import { PROFILES } from '../src/profiles';
import { assumptionsFrom } from '../src/report';
import { RULES } from '../src/rules';
import rulesSource from '../src/rules.ts?raw';
import { ProfileSchema, RulesSchema } from '../src/schema';
import { ALL_SERVERS } from '../src/servers';

describe('the rules schema', () => {
  it('accepts the rules and every profile', () => {
    expect(v.safeParse(RulesSchema, RULES).success).toBe(true);
    for (const profile of PROFILES) expect(v.safeParse(ProfileSchema, profile).success).toBe(true);
  });

  it('rejects unknown keys, odds above 1 and away steps that run backwards', () => {
    expect(v.safeParse(RulesSchema, { ...RULES, extra: 1 }).success).toBe(false);
    const bad = {
      ...RULES,
      scouts: { ...RULES.scouts, perHour: { ...RULES.scouts.perHour, creatures: 1.5 } },
    };
    expect(v.safeParse(RulesSchema, bad).success).toBe(false);
    const backwards = { ...RULES, away: { ...RULES.away, B: [...RULES.away.B].reverse() } };
    expect(v.safeParse(RulesSchema, backwards).success).toBe(false);
    expect(v.safeParse(ProfileSchema, { ...PROFILES[0], hours: [25] }).success).toBe(false);
  });

  it('only names profiles that exist', () => {
    const ids = new Set(PROFILES.map((p) => p.id));
    for (const server of ALL_SERVERS)
      for (const p of server.players) expect(ids.has(p.profile)).toBe(true);
  });
});

describe('the away steps (V-POST-10, posts.md curve B and A)', () => {
  const share = (curve: 'A' | 'B', hours: number): number => awayShare(RULES, curve, hours);

  it('curve B: 100% for 48 h, 85% to day 4, 60% to day 7, 30% to day 14, 10% to day 30, near zero after', () => {
    expect([0, 47.9].map((h) => share('B', h))).toEqual([1, 1]);
    expect([48, 95.9].map((h) => share('B', h))).toEqual([0.85, 0.85]);
    expect([96, 167.9].map((h) => share('B', h))).toEqual([0.6, 0.6]);
    expect([168, 335.9].map((h) => share('B', h))).toEqual([0.3, 0.3]);
    expect([336, 719.9].map((h) => share('B', h))).toEqual([0.1, 0.1]);
    expect(share('B', 720)).toBeLessThan(0.05);
    expect(share('B', 5000)).toBeLessThan(0.05);
  });

  it('curve A: 100% for 24 h, 85% to day 3, 60% to day 7, 30% to day 14, 10% to day 30', () => {
    expect([
      share('A', 23),
      share('A', 24),
      share('A', 71),
      share('A', 72),
      share('A', 167),
      share('A', 168),
    ]).toEqual([1, 0.85, 0.85, 0.6, 0.6, 0.3]);
  });

  /** The share of a daily player's gains over a visit cycle: the table in posts.md. */
  const cycle = (curve: 'A' | 'B', hours: number): number => {
    let sum = 0;
    for (let h = 0; h < hours; h++) sum += share(curve, h);
    return sum / hours;
  };

  it("gives posts.md's table: every 2 days 100%, weekend off 97%, every 3 days 95%, weekly 79% (B)", () => {
    expect(cycle('B', 48)).toBeCloseTo(1, 5);
    expect(cycle('B', 60)).toBeCloseTo(0.97, 2);
    expect(cycle('B', 72)).toBeCloseTo(0.95, 2);
    expect(cycle('B', 168)).toBeCloseTo(0.79, 2);
  });

  it("gives posts.md's table for curve A: every 2 days 92.5%, every 3 days 90%, weekly 73%", () => {
    expect(cycle('A', 48)).toBeCloseTo(0.925, 3);
    expect(cycle('A', 72)).toBeCloseTo(0.9, 2);
    expect(cycle('A', 168)).toBeCloseTo(0.73, 2);
  });

  it('a month away gives about nine days of growth on both curves', () => {
    for (const curve of ['A', 'B'] as const) {
      let sum = 0;
      for (let h = 0; h < 30 * 24; h++) sum += share(curve, h);
      expect(sum / 24).toBeGreaterThan(8.5);
      expect(sum / 24).toBeLessThan(10);
    }
  });
});

describe('the other curves', () => {
  it('catch-up: x2 at 6 or more levels below the target, fading to x1 at it', () => {
    expect(catchUpMultiplier(RULES, 6)).toBe(2);
    expect(catchUpMultiplier(RULES, 20)).toBe(2);
    expect(catchUpMultiplier(RULES, 3)).toBe(1.5);
    expect(catchUpMultiplier(RULES, 0)).toBe(1);
    expect(catchUpMultiplier(RULES, -4)).toBe(1);
  });

  it('the hearth: +4% a level above 1, +16% at level 5; mastery at 2, 7 and 21 days', () => {
    expect(hearthMultiplier(RULES, 1)).toBe(1);
    expect(hearthMultiplier(RULES, 5)).toBeCloseTo(1.16, 10);
    expect([0, 47, 48, 167, 168, 503, 504].map((h) => masteryBonus(RULES, h))).toEqual([
      0, 0, 0.05, 0.05, 0.1, 0.1, 0.15,
    ]);
  });
});

describe('the assumptions list', () => {
  it('lists every ASSUMPTION marker of rules.ts', () => {
    const markers = (rulesSource.match(/\/\/ ASSUMPTION:/g) ?? []).length;
    const listed = assumptionsFrom(rulesSource);
    expect(markers).toBeGreaterThan(20);
    expect(listed).toHaveLength(markers);
    for (const a of listed) expect(a.text.length).toBeGreaterThan(10);
  });
});
