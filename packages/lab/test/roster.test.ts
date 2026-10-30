/** The roster profile: the placeholder's documented points, the curve, the speeds, new players, and a column at a week's levels. */
import { describe, expect, it } from 'vitest';
import {
  LEVEL_CAP,
  NEW_CATCH_UP,
  PLACEHOLDER_ROSTER,
  ROSTER_SPEEDS,
  ROSTER_WEEKS,
  SPEED_FACTOR,
  WEEKLY_GROWTH,
  curveOf,
  levelOfCreature,
  levelledColumn,
  rosterLevels,
  rosterWeek,
  talentSlotsAt,
  type RosterWeek,
} from '../src/roster';
import { formStats } from '../src/species';
import { FORM_KNACKS } from '../src/knacks';

const daily = (week: number): RosterWeek => rosterWeek(PLACEHOLDER_ROSTER, 'daily', week);

describe('the curve', () => {
  it('passes through its points, never overshoots and is flat outside', () => {
    const f = curveOf([
      [0, 1],
      [2, 10],
      [6, 20],
      [10, 21],
    ]);
    expect(f(0)).toBe(1);
    expect(f(2)).toBeCloseTo(10);
    expect(f(6)).toBeCloseTo(20);
    expect(f(10)).toBe(21);
    expect(f(-3)).toBe(1);
    expect(f(40)).toBe(21);
    let last = 0;
    for (let t = 0; t <= 10; t += 0.25) {
      expect(f(t)).toBeGreaterThanOrEqual(last);
      expect(f(t)).toBeLessThanOrEqual(21);
      last = f(t);
    }
  });
});

describe('the placeholder profile', () => {
  it('covers weeks 1 to 24 for every kind', () => {
    expect(PLACEHOLDER_ROSTER.daily).toHaveLength(ROSTER_WEEKS);
    expect(PLACEHOLDER_ROSTER.weekly).toHaveLength(ROSTER_WEEKS);
    expect(PLACEHOLDER_ROSTER.newPlayer).toHaveLength(ROSTER_WEEKS);
    expect(daily(1).week).toBe(1);
    expect(daily(24).week).toBe(24);
  });

  it('hits the valley docs examples for a daily player', () => {
    // Best three at about 19, 25 and 29 at weeks 4, 8 and 12.
    expect(daily(4).third).toBeCloseTo(19, 0);
    expect(daily(8).third).toBeCloseTo(25, 0);
    expect(daily(12).third).toBeCloseTo(29, 0);
    // The 10th creature at 15 to 17 at week 4, and 15 creatures by then.
    expect(daily(4).tenth).toBeGreaterThanOrEqual(15);
    expect(daily(4).tenth).toBeLessThanOrEqual(17);
    expect(daily(4).size).toBeGreaterThanOrEqual(15);
  });

  it('still grows at week 12 and reaches the cap late', () => {
    expect(daily(13).third).toBeGreaterThan(daily(12).third);
    expect(daily(12).third).toBeLessThan(LEVEL_CAP);
    expect(daily(24).third).toBe(LEVEL_CAP);
  });

  it('is monotone: levels never fall, never pass the cap, the best is never below the next', () => {
    for (const table of [
      PLACEHOLDER_ROSTER.daily,
      PLACEHOLDER_ROSTER.weekly,
      PLACEHOLDER_ROSTER.newPlayer,
    ])
      table.forEach((r, i) => {
        expect(r.first).toBeGreaterThanOrEqual(r.third);
        expect(r.third).toBeGreaterThanOrEqual(r.tenth);
        expect(r.tenth).toBeGreaterThanOrEqual(r.twentieth);
        expect(r.first).toBeLessThanOrEqual(LEVEL_CAP);
        expect(r.twentieth).toBeGreaterThanOrEqual(1);
        const before = table[i - 1];
        if (before) {
          expect(r.first).toBeGreaterThanOrEqual(before.first);
          expect(r.third).toBeGreaterThanOrEqual(before.third);
          expect(r.tenth).toBeGreaterThanOrEqual(before.tenth);
          expect(r.size).toBeGreaterThanOrEqual(before.size);
        }
      });
  });

  it('carries the extra fields: all forms, talent slots by level, gear unused', () => {
    expect(daily(1).forms).toBe('all');
    expect(daily(1).talentSlots).toBe(1);
    expect(daily(12).talentSlots).toBe(3);
    expect(daily(1).gear).toBe(0);
    expect(talentSlotsAt(19)).toBe(1);
    expect(talentSlotsAt(20)).toBe(2);
    expect(talentSlotsAt(25)).toBe(3);
  });

  it('gives a weekly player the daily player at 77.5% of the weeks played', () => {
    expect(WEEKLY_GROWTH).toBeGreaterThanOrEqual(0.75);
    expect(WEEKLY_GROWTH).toBeLessThanOrEqual(0.8);
    for (const w of [4, 8, 12, 20]) {
      const weekly = rosterWeek(PLACEHOLDER_ROSTER, 'weekly', w);
      expect(weekly.third).toBeLessThanOrEqual(daily(w).third);
      // Between the daily player's levels of the two weeks around 0.775 w.
      expect(weekly.third).toBeGreaterThanOrEqual(daily(Math.floor(WEEKLY_GROWTH * w)).third - 0.1);
      expect(weekly.third).toBeLessThanOrEqual(daily(Math.ceil(WEEKLY_GROWTH * w)).third + 0.1);
    }
  });
});

describe('new players', () => {
  it('start low, catch up and never pass a daily player', () => {
    const at = (w: number) => rosterWeek(PLACEHOLDER_ROSTER, 'new', w, 6);
    expect(at(6).third).toBeLessThan(daily(6).third);
    expect(at(6).week).toBe(6);
    for (let w = 6; w <= 24; w++) expect(at(w).third).toBeLessThanOrEqual(daily(w).third);
    expect(NEW_CATCH_UP).toBeGreaterThan(1);
    expect(at(20).third).toBe(daily(20).third);
    // A week later the new player has more.
    expect(at(7).third).toBeGreaterThan(at(6).third);
  });

  it('need a join week, and have nothing before it', () => {
    expect(() => rosterWeek(PLACEHOLDER_ROSTER, 'new', 5)).toThrow(/join week/);
    expect(() => rosterWeek(PLACEHOLDER_ROSTER, 'new', 4, 6)).toThrow(/week 6/);
  });
});

describe('levels of the creatures', () => {
  it('are exact at the 1st, 3rd, 10th and 20th and straight between', () => {
    const r = daily(8);
    expect(levelOfCreature(r, 1)).toBe(r.first);
    expect(levelOfCreature(r, 3)).toBe(r.third);
    expect(levelOfCreature(r, 10)).toBe(r.tenth);
    expect(levelOfCreature(r, 20)).toBe(r.twentieth);
    expect(levelOfCreature(r, 2)).toBeCloseTo((r.first + r.third) / 2);
    expect(levelOfCreature(r, 25)).toBe(r.twentieth);
  });

  it('are whole numbers, best first, at most the roster size', () => {
    const levels = rosterLevels(PLACEHOLDER_ROSTER, 'daily', 8, 'expected', 5);
    expect(levels).toHaveLength(5);
    expect(levels.every(Number.isInteger)).toBe(true);
    expect([...levels].sort((a, b) => b - a)).toEqual(levels);
    expect(rosterLevels(PLACEHOLDER_ROSTER, 'daily', 1, 'expected', 50)).toHaveLength(
      daily(1).size,
    );
  });
});

describe('the speeds', () => {
  it('are one function of the profile: slow 20% behind, fast 20% ahead, capped at 30', () => {
    expect(ROSTER_SPEEDS).toEqual(['slow', 'expected', 'fast']);
    for (const week of [1, 4, 8, 12, 24]) {
      const expected = rosterLevels(PLACEHOLDER_ROSTER, 'daily', week, 'expected', 10);
      const slow = rosterLevels(PLACEHOLDER_ROSTER, 'daily', week, 'slow', 10);
      const fast = rosterLevels(PLACEHOLDER_ROSTER, 'daily', week, 'fast', 10);
      const r = daily(week);
      expected.forEach((l, k) => {
        const raw = levelOfCreature(r, k + 1);
        expect(l).toBe(Math.max(1, Math.round(raw)));
        expect(slow[k]).toBe(Math.max(1, Math.round(raw * SPEED_FACTOR.slow)));
        expect(fast[k]).toBe(Math.min(LEVEL_CAP, Math.round(raw * SPEED_FACTOR.fast)));
        expect(slow[k] as number).toBeLessThanOrEqual(l);
        expect(fast[k] as number).toBeGreaterThanOrEqual(l);
      });
    }
    expect(rosterLevels(PLACEHOLDER_ROSTER, 'daily', 24, 'fast', 1)).toEqual([LEVEL_CAP]);
    expect(SPEED_FACTOR.slow).toBe(0.8);
    expect(SPEED_FACTOR.fast).toBe(1.2);
  });
});

describe('a column at a week', () => {
  const form = Object.keys(FORM_KNACKS)[0] as string;
  const cap = formStats(form, LEVEL_CAP).levelCap;

  it('gives each row its creature level, within the form cap', () => {
    const column = levelledColumn(
      [
        { formId: form, knack: 'none' },
        { formId: form, knack: 'none' },
        { formId: form, knack: 'none' },
      ],
      [26, 22, 99],
    );
    expect(column.map((p) => p.level)).toEqual([Math.min(26, cap), Math.min(22, cap), cap]);
  });

  it('keeps the talents the level has slots for', () => {
    const picks = [{ formId: form, knack: 'none', talents: ['a', 'b', 'c'] }];
    expect(levelledColumn(picks, [5])[0]?.talents).toEqual(['a']);
    expect(levelledColumn(picks, [20])[0]?.talents).toEqual(cap >= 20 ? ['a', 'b'] : ['a']);
    expect(levelledColumn([{ formId: form, knack: 'none' }], [5])[0]).not.toHaveProperty('talents');
  });
});
