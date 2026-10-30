/** The roster profile: the valley's data and its loader, the speeds, new players, and a column at a week's levels. */
import { describe, expect, it } from 'vitest';
import {
  LEVEL_CAP,
  ROSTER_SPEEDS,
  ROSTER_WEEKS,
  SPEED_FACTOR,
  levelOfCreature,
  levelledColumn,
  rosterLevels,
  rosterWeek,
  talentSlotsAt,
  type RosterWeek,
} from '../src/roster';
import {
  COVERAGE_SERVERS,
  VALLEY_COVERAGE,
  VALLEY_ROSTER,
  coverageAt,
  parseRosterProfile,
  parseServerCoverage,
} from '../src/valley';
import { formStats } from '../src/species';
import { FORM_KNACKS } from '../src/knacks';

const daily = (week: number): RosterWeek => rosterWeek(VALLEY_ROSTER, 'daily', week);

describe('the valley profile', () => {
  it('covers weeks 1 to 24 for every kind', () => {
    expect(VALLEY_ROSTER.daily).toHaveLength(ROSTER_WEEKS);
    expect(VALLEY_ROSTER.weekly).toHaveLength(ROSTER_WEEKS);
    expect(VALLEY_ROSTER.newPlayer).toHaveLength(ROSTER_WEEKS);
    expect(daily(1).week).toBe(1);
    expect(daily(24).week).toBe(24);
  });

  it('keeps the valley numbers as they are, fractions included', () => {
    expect(daily(1).first).toBe(11);
    expect(daily(2).tenth).toBe(8.5);
    expect(daily(24).size).toBe(60);
    expect(rosterWeek(VALLEY_ROSTER, 'weekly', 1).first).toBe(9);
  });

  it('grows to the cap late', () => {
    expect(daily(8).third).toBeGreaterThan(daily(4).third);
    expect(daily(12).third).toBeLessThan(LEVEL_CAP);
    expect(daily(24).third).toBe(LEVEL_CAP);
  });

  it('keeps the levels in order, within 1 and the cap, and the best three and the roster size growing', () => {
    // The 20th creature may fall from one week to the next while the roster is smaller than 20 (the valley reports the lowest
    // owned level for a creature not owned), so only the first, third and tenth are checked week to week.
    for (const table of [VALLEY_ROSTER.daily, VALLEY_ROSTER.weekly, VALLEY_ROSTER.newPlayer])
      table.forEach((r, i) => {
        expect(r.first).toBeGreaterThanOrEqual(r.third);
        expect(r.third).toBeGreaterThanOrEqual(r.tenth);
        expect(r.first).toBeLessThanOrEqual(LEVEL_CAP);
        expect(r.twentieth).toBeGreaterThanOrEqual(1);
        expect(r.size).toBeGreaterThanOrEqual(1);
        const before = table[i - 1];
        if (before) {
          expect(r.first).toBeGreaterThanOrEqual(before.first);
          expect(r.third).toBeGreaterThanOrEqual(before.third);
          expect(r.tenth).toBeGreaterThanOrEqual(before.tenth);
          expect(r.size).toBeGreaterThanOrEqual(before.size);
        }
      });
  });

  it('carries the extra fields: all forms, talent slots that follow the best level, gear unused', () => {
    expect(daily(1).forms).toBe('all');
    expect(daily(1).talentSlots).toBe(1);
    expect(daily(24).talentSlots).toBe(3);
    expect(daily(1).gear).toBeGreaterThan(0);
    expect(talentSlotsAt(19)).toBe(1);
    expect(talentSlotsAt(20)).toBe(2);
    expect(talentSlotsAt(25)).toBe(3);
    for (const r of VALLEY_ROSTER.daily) expect(r.talentSlots).toBe(talentSlotsAt(r.first));
  });

  it('gives a weekly player no more than a daily player, week for week', () => {
    for (const w of [1, 4, 8, 12, 20]) {
      const weekly = rosterWeek(VALLEY_ROSTER, 'weekly', w);
      expect(weekly.first).toBeLessThanOrEqual(daily(w).first);
      expect(weekly.third).toBeLessThanOrEqual(daily(w).third);
      expect(weekly.size).toBeLessThanOrEqual(daily(w).size);
    }
  });
});

describe('the valley loader', () => {
  const week = (n: number) => ({
    week: n,
    first: 10,
    third: 9,
    tenth: 5,
    twentieth: 2,
    size: 5,
    forms: 'all',
    talentSlots: 1,
    talentsPicked: false,
    gear: 3,
  });
  const weeks = (f: (n: number) => unknown = week) =>
    Array.from({ length: ROSTER_WEEKS }, (_, i) => f(i + 1));
  const profile = () => ({ daily: weeks(), weekly: weeks(), newPlayer: weeks() });

  it('accepts a well-formed profile, with a form list instead of "all"', () => {
    expect(parseRosterProfile(profile()).daily).toHaveLength(ROSTER_WEEKS);
    const withList = { ...profile(), daily: weeks((n) => ({ ...week(n), forms: ['splashet'] })) };
    expect(parseRosterProfile(withList).daily[0]?.forms).toEqual(['splashet']);
  });

  it('throws a clear message for a wrong shape', () => {
    expect(() => parseRosterProfile(null)).toThrow(/must be an object/);
    expect(() => parseRosterProfile({ ...profile(), weekly: weeks().slice(1) })).toThrow(
      /weekly must list 24 weeks/,
    );
    expect(() =>
      parseRosterProfile({ ...profile(), daily: weeks((n) => ({ ...week(n), first: 31 })) }),
    ).toThrow(/daily\[0\]\.first must be a number from 1 to 30/);
    expect(() =>
      parseRosterProfile({ ...profile(), daily: weeks((n) => ({ ...week(n), size: 2.5 })) }),
    ).toThrow(/size must be a whole number/);
    expect(() =>
      parseRosterProfile({ ...profile(), daily: weeks((n) => ({ ...week(n), forms: 'some' })) }),
    ).toThrow(/forms must be "all" or a list/);
    expect(() =>
      parseRosterProfile({ ...profile(), daily: weeks((n) => ({ ...week(n), forms: [3] })) }),
    ).toThrow(/forms must be "all" or a list/);
    expect(() =>
      parseRosterProfile({ ...profile(), newPlayer: weeks((n) => ({ ...week(n + 1) })) }),
    ).toThrow(/newPlayer\[0\]\.week must be 1/);
    expect(() =>
      parseRosterProfile({ ...profile(), daily: weeks((n) => ({ ...week(n), talentsPicked: 1 })) }),
    ).toThrow(/talentsPicked/);
  });

  const cover = (n: number) => ({ week: n, common: 1, rare: 0.5, epic: 0 });
  const coverage = () => ({ mixed5: weeks(cover), mixed8: weeks(cover), mixed15: weeks(cover) });

  it('checks the coverage the same way', () => {
    expect(parseServerCoverage(coverage()).mixed8).toHaveLength(ROSTER_WEEKS);
    expect(() => parseServerCoverage({ ...coverage(), mixed8: undefined })).toThrow(
      /mixed8 must list 24 weeks/,
    );
    expect(() =>
      parseServerCoverage({ ...coverage(), mixed5: weeks((n) => ({ ...cover(n), rare: 1.2 })) }),
    ).toThrow(/mixed5\[0\]\.rare must be a number from 0 to 1/);
  });

  it('loads the files in the repo: three servers, shares between 0 and 1, more of the common species owned than of the epic', () => {
    for (const server of COVERAGE_SERVERS)
      expect(VALLEY_COVERAGE[server]).toHaveLength(ROSTER_WEEKS);
    for (const w of [1, 12, 24])
      expect(coverageAt(VALLEY_COVERAGE, 'mixed8', 'common', w)).toBeGreaterThanOrEqual(
        coverageAt(VALLEY_COVERAGE, 'mixed8', 'epic', w),
      );
    // A bigger server owns at least as much by the end.
    expect(coverageAt(VALLEY_COVERAGE, 'mixed15', 'rare', 24)).toBeGreaterThanOrEqual(
      coverageAt(VALLEY_COVERAGE, 'mixed5', 'rare', 24),
    );
    expect(coverageAt(VALLEY_COVERAGE, 'mixed8', 'rare', 99)).toBe(
      Math.max(...VALLEY_COVERAGE.mixed8.map((w) => w.rare)),
    );
  });
});

describe('new players', () => {
  it('start low, catch up and never pass a daily player', () => {
    const at = (w: number) => rosterWeek(VALLEY_ROSTER, 'new', w, 6);
    expect(at(6).third).toBeLessThan(daily(6).third);
    expect(at(6).week).toBe(6);
    for (let w = 6; w <= 24; w++) expect(at(w).third).toBeLessThanOrEqual(daily(w).third);
    expect(at(20).third).toBe(daily(20).third);
    // A week later the new player has more.
    expect(at(7).third).toBeGreaterThan(at(6).third);
  });

  it('need a join week, and have nothing before it', () => {
    expect(() => rosterWeek(VALLEY_ROSTER, 'new', 5)).toThrow(/join week/);
    expect(() => rosterWeek(VALLEY_ROSTER, 'new', 4, 6)).toThrow(/week 6/);
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
    const levels = rosterLevels(VALLEY_ROSTER, 'daily', 8, 'expected', 5);
    expect(levels).toHaveLength(5);
    expect(levels.every(Number.isInteger)).toBe(true);
    expect([...levels].sort((a, b) => b - a)).toEqual(levels);
    expect(rosterLevels(VALLEY_ROSTER, 'daily', 1, 'expected', 50)).toHaveLength(daily(1).size);
  });
});

describe('the speeds', () => {
  it('are one function of the profile: slow 20% behind, fast 20% ahead, capped at 30', () => {
    expect(ROSTER_SPEEDS).toEqual(['slow', 'expected', 'fast']);
    for (const week of [1, 4, 8, 12, 24]) {
      const expected = rosterLevels(VALLEY_ROSTER, 'daily', week, 'expected', 10);
      const slow = rosterLevels(VALLEY_ROSTER, 'daily', week, 'slow', 10);
      const fast = rosterLevels(VALLEY_ROSTER, 'daily', week, 'fast', 10);
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
    expect(rosterLevels(VALLEY_ROSTER, 'daily', 24, 'fast', 1)).toEqual([LEVEL_CAP]);
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
