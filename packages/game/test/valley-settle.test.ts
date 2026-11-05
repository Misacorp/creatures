import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
  VALLEY_RULES,
  ValleyRulesSchema,
  awayShare,
  catchUpMultiplier,
  hearthMultiplier,
  masteryBonus,
  settle,
  type SettleState,
} from '../src';

const H = 3_600_000;
const start = (creatures = 2): SettleState => ({
  settledAt: 0,
  lastVisitAt: 0,
  hearth: 1,
  creatures: Array.from({ length: creatures }, () => ({ xp: 0, carry: 0, capXp: Infinity })),
});
const total = (s: SettleState, i = 0): number =>
  (s.creatures[i]?.xp ?? 0) + (s.creatures[i]?.carry ?? 0);

describe('the valley rules as data', () => {
  it('pass their schema, which rejects unknown keys', () => {
    expect(v.safeParse(ValleyRulesSchema, VALLEY_RULES).success).toBe(true);
    expect(v.safeParse(ValleyRulesSchema, { ...VALLEY_RULES, extra: 1 }).success).toBe(false);
  });

  it('give the away steps, catch-up, hearth and mastery formulas', () => {
    expect(awayShare(VALLEY_RULES, 'B', 0)).toBe(1);
    expect(awayShare(VALLEY_RULES, 'B', 47.9)).toBe(1);
    expect(awayShare(VALLEY_RULES, 'B', 48)).toBe(0.85);
    expect(awayShare(VALLEY_RULES, 'A', 24)).toBe(0.85);
    expect(awayShare(VALLEY_RULES, 'B', 5000)).toBe(VALLEY_RULES.away.beyond);
    expect(catchUpMultiplier(VALLEY_RULES, 0)).toBe(1);
    expect(catchUpMultiplier(VALLEY_RULES, -3)).toBe(1);
    expect(catchUpMultiplier(VALLEY_RULES, 99)).toBe(VALLEY_RULES.bonfire.catchUp.maxMultiplier);
    expect(hearthMultiplier(VALLEY_RULES, 1)).toBe(1);
    expect(hearthMultiplier(VALLEY_RULES, 3)).toBeCloseTo(1.08, 12);
    expect(masteryBonus(VALLEY_RULES, 47)).toBe(0);
    expect(masteryBonus(VALLEY_RULES, 48)).toBe(0.05);
    expect(masteryBonus(VALLEY_RULES, 10_000)).toBe(0.15);
  });
});

describe('settle', () => {
  it('pays the base rate at full share within the first steps, with a fractional carry', () => {
    const s = settle(start(1), 0, 10.5 * H, []);
    expect(s.creatures[0]).toEqual({ xp: 52, carry: 0.5, capXp: Infinity });
    expect(s.settledAt).toBe(10.5 * H);
  });

  it('steps the share down at the away boundaries counted from the last visit', () => {
    // Curve B: 48 h at 1, then 48 h at 0.85, then 72 h at 0.6.
    const s = settle(start(1), 0, 168 * H, []);
    const expected = 5 * (48 + 48 * 0.85 + 72 * 0.6);
    expect(total(s)).toBeCloseTo(expected, 6);
  });

  it('restarts the steps at a visit and takes the hearth held from then', () => {
    const s = settle(start(1), 0, 100 * H, [{ at: 60 * H, kind: 'visit', hearth: 1.2 }]);
    // 0..48 at 1, 48..60 at 0.85 (hearth 1), then from the visit 40 h at 1 with the hearth 1.2.
    expect(total(s)).toBeCloseTo(5 * (48 + 12 * 0.85) + 5 * 1.2 * 40, 6);
    expect(s.lastVisitAt).toBe(60 * H);
  });

  it('is invariant under splitting: a to c equals a to b to c, wherever b falls', () => {
    const events = [
      { at: 30 * H, kind: 'visit' as const },
      { at: 200 * H, kind: 'visit' as const, hearth: 1.08 },
      { at: 500 * H, kind: 'visit' as const },
    ];
    const whole = settle(start(), 0, 900 * H, events);
    for (const b of [1, 29.5 * H, 30 * H, 48 * H, 77.3 * H, 200 * H, 333 * H, 500 * H, 899 * H]) {
      const first = settle(start(), 0, b, events);
      const second = settle(first, b, 900 * H, events);
      expect(second.lastVisitAt).toBe(whole.lastVisitAt);
      expect(second.hearth).toBe(whole.hearth);
      expect(total(second)).toBeCloseTo(total(whole), 6);
      expect(second.creatures[0]?.xp).toBe(whole.creatures[0]?.xp);
    }
  });

  it('changes nothing when settled again at the same now', () => {
    const events = [{ at: 30 * H, kind: 'visit' as const }];
    const once = settle(start(), 0, 100 * H, events);
    const twice = settle(once, 100 * H, 100 * H, events);
    expect(twice).toEqual(once);
    // An event at `now` is applied once; the second pass has nothing left.
    const atNow = settle(start(), 0, 100 * H, [{ at: 100 * H, kind: 'visit' }]);
    expect(settle(atNow, 100 * H, 100 * H, [{ at: 100 * H, kind: 'visit' }])).toEqual(atNow);
  });

  it('keeps the bank: XP above it is lost and the carry goes with it', () => {
    const s = settle({ ...start(1), creatures: [{ xp: 0, carry: 0, capXp: 100 }] }, 0, 48 * H, []);
    expect(s.creatures[0]).toEqual({ xp: 100, carry: 0, capXp: 100 });
  });

  it('never goes back in time or starts from the wrong place', () => {
    expect(() => settle(start(), 0, -1, [])).toThrow(RangeError);
    expect(() => settle(start(), 5, 10, [])).toThrow(RangeError);
  });

  it('does not change its input', () => {
    const s = start();
    const copy = JSON.stringify(s);
    settle(s, 0, 100 * H, [{ at: 10 * H, kind: 'visit' }]);
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe('settle: catch-up, joining creatures and the allowance store', () => {
  const withStore = (): SettleState => ({
    ...start(2),
    allowance: { store: 0, carry: 0 },
  });

  it('multiplies only idle XP by the creature catch-up held since the visit', () => {
    const s = settle(
      {
        ...start(2),
        creatures: [
          { xp: 0, carry: 0, capXp: Infinity, catchUp: 3 },
          start(1).creatures[0] as never,
        ],
      },
      0,
      10 * H,
      [],
    );
    expect(total(s, 0)).toBeCloseTo(150, 6);
    expect(total(s, 1)).toBeCloseTo(50, 6);
  });

  it('pays a creature nothing before it joined, and splits there', () => {
    const joined = { xp: 0, carry: 0, capXp: Infinity, joinedAt: 6 * H };
    const state = { ...start(1), creatures: [joined] };
    expect(total(settle(state, 0, 10 * H, []))).toBeCloseTo(20, 6);
    const half = settle(state, 0, 3 * H, []);
    expect(total(half)).toBe(0);
    expect(total(settle(half, 3 * H, 10 * H, []))).toBeCloseTo(20, 6);
  });

  it('builds the allowance by the away steps and stops at the store size (three days)', () => {
    const day = VALLEY_RULES.acorns.allowancePerDay;
    const one = settle(withStore(), 0, 24 * H, []);
    expect(one.allowance?.store).toBe(day);
    // The store holds storeHours of the hourly rate and nothing more.
    const cap = (day / 24) * VALLEY_RULES.posts.storeHours;
    const long = settle(withStore(), 0, 400 * H, [{ at: 400 * H, kind: 'visit' }]);
    expect(long.allowance?.store).toBe(cap);
    expect(long.allowance?.carry).toBe(0);
    // A state without a store builds none.
    expect(settle(start(), 0, 24 * H, []).allowance).toBeUndefined();
  });

  it('keeps the allowance invariant under splitting and unchanged by a repeat', () => {
    const events = [{ at: 60 * H, kind: 'visit' as const }];
    const whole = settle(withStore(), 0, 300 * H, events);
    for (const b of [5.5 * H, 59 * H, 60 * H, 111 * H]) {
      const second = settle(settle(withStore(), 0, b, events), b, 300 * H, events);
      const a = whole.allowance as { store: number; carry: number };
      const c = second.allowance as { store: number; carry: number };
      expect(c.store + c.carry).toBeCloseTo(a.store + a.carry, 6);
    }
    expect(settle(whole, 300 * H, 300 * H, events)).toEqual(whole);
  });
});
