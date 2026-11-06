import { describe, expect, it } from 'vitest';
import {
  RULES,
  VALLEY_RULES,
  anyShardPayment,
  gearBase,
  rerollOdds,
  rerollPrice,
  visitorHere,
  visitorHereAt,
  visitorWeekOf,
} from '../src';

const HOUR = 3_600_000;
// Monday 2027-01-04 00:00 UTC.
const MONDAY = Date.UTC(2027, 0, 4);

describe('the visitor: his window (V-VIS-1)', () => {
  it('is here from Thursday 00:00 until the leave hour, never on Wednesday night', () => {
    const at = (hours: number): boolean =>
      visitorHereAt(VALLEY_RULES, MONDAY + hours * HOUR, 'UTC');
    expect(at(0)).toBe(false);
    expect(at(71.9)).toBe(false);
    expect(at(72)).toBe(true);
    expect(at(100)).toBe(true);
    expect(at(166.9)).toBe(true);
    expect(at(VALLEY_RULES.visitor.leaveHour)).toBe(false);
    expect(at(168)).toBe(false);
    // The next Thursday he is back.
    expect(at(168 + 72)).toBe(true);
  });

  it('reads the wall clock of the guild, so Thursday 00:00 in Helsinki is Wednesday 22:00 UTC (winter)', () => {
    const wedNight = Date.UTC(2027, 0, 6, 21, 59);
    const thuStart = Date.UTC(2027, 0, 6, 22, 0);
    expect(visitorHereAt(VALLEY_RULES, wedNight, 'Europe/Helsinki')).toBe(false);
    expect(visitorHereAt(VALLEY_RULES, thuStart, 'Europe/Helsinki')).toBe(true);
    // In summer time (UTC+3) the same wall clock is an hour earlier in UTC.
    expect(visitorHereAt(VALLEY_RULES, Date.UTC(2027, 5, 9, 20, 59), 'Europe/Helsinki')).toBe(
      false,
    );
    expect(visitorHereAt(VALLEY_RULES, Date.UTC(2027, 5, 9, 21, 0), 'Europe/Helsinki')).toBe(true);
  });

  it('keys the week by its guild-local Monday, and Sunday night belongs to the week that began on Monday', () => {
    expect(visitorWeekOf(MONDAY, 'UTC')).toEqual({ key: '2027-01-04', hoursIn: 0 });
    expect(visitorWeekOf(MONDAY + 167.5 * HOUR, 'UTC').key).toBe('2027-01-04');
    expect(visitorWeekOf(MONDAY + 168 * HOUR, 'UTC').key).toBe('2027-01-11');
    // Sunday 23:30 in New York is already Monday in UTC: the week key follows the zone.
    const sundayNy = Date.UTC(2027, 0, 11, 4, 30);
    expect(visitorWeekOf(sundayNy, 'America/New_York').key).toBe('2027-01-04');
    expect(visitorWeekOf(sundayNy, 'UTC').key).toBe('2027-01-11');
  });

  it('answers by hour of the week the same way as by instant', () => {
    for (let h = 0; h < 336; h += 0.5) {
      expect(visitorHere(VALLEY_RULES, h)).toBe(
        visitorHereAt(VALLEY_RULES, MONDAY + h * HOUR, 'UTC'),
      );
    }
  });
});

describe('the visitor: the reroll price (V-VIS-3)', () => {
  const v = VALLEY_RULES.visitor;

  it('is the base at the base level, linear in item level, times growth per reroll made', () => {
    expect(rerollPrice(VALLEY_RULES, v.baseLevel, 0)).toEqual([v.acorns, v.scrap]);
    expect(rerollPrice(VALLEY_RULES, v.baseLevel * 2, 0)).toEqual([v.acorns * 2, v.scrap * 2]);
    expect(rerollPrice(VALLEY_RULES, v.baseLevel, 1)).toEqual([
      Math.round(v.acorns * v.growth),
      Math.round(v.scrap * v.growth),
    ]);
    expect(rerollPrice(VALLEY_RULES, v.baseLevel, 3)).toEqual([
      Math.round(v.acorns * v.growth ** 3),
      Math.round(v.scrap * v.growth ** 3),
    ]);
  });

  it('never goes below one item level and always rises with each reroll', () => {
    expect(rerollPrice(VALLEY_RULES, 0, 0)).toEqual(rerollPrice(VALLEY_RULES, 1, 0));
    const first = rerollPrice(VALLEY_RULES, 12, 0);
    const second = rerollPrice(VALLEY_RULES, 12, 1);
    expect(second[0]).toBeGreaterThan(first[0]);
    expect(second[1]).toBeGreaterThan(first[1]);
  });
});

describe('the visitor: paying the blueprint in shards of any element (V-VIS-5)', () => {
  it('takes one at a time from the biggest pile, so the piles come down together', () => {
    expect(anyShardPayment([10, 4, 0, 0, 0], 3)).toEqual([3, 0, 0, 0, 0]);
    expect(anyShardPayment([10, 4, 0, 0, 0], 8)).toEqual([6, 2, 0, 0, 0]);
    expect(anyShardPayment([5, 5, 5, 0, 0], 4)).toEqual([2, 1, 1, 0, 0]);
  });

  it('refuses when the player holds too few in all, and takes nothing for a price of zero', () => {
    expect(anyShardPayment([1, 1, 0, 0, 0], 3)).toBeNull();
    expect(anyShardPayment([1, 1, 0, 0, 0], 0)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('the visitor: the odds shown before a reroll (V-VIS-2)', () => {
  const hat = (): NonNullable<ReturnType<typeof gearBase>> => {
    const base = gearBase('felt-hat');
    if (base === undefined) throw new Error('no hat base');
    return base;
  };

  it('counts the lines of the rarity and gives the top tier its item level allows', () => {
    const low = rerollOdds(hat(), 'epic', 3);
    expect(low.topTier).toBe(0);
    expect(low.topChance).toBe(1);
    expect(low.lines).toBe(RULES.gear.rolledLines.epic);
    const high = rerollOdds(hat(), 'epic', 20);
    expect(high.topTier).toBe(4);
    expect(high.topChance).toBeCloseTo((RULES.gear.tierWeights[0] ?? 0) / 100);
    expect(high.tiers.map((t) => t.tier)).toEqual([4, 3, 2, 1]);
    expect(high.tiers.reduce((s, t) => s + t.chance, 0)).toBeCloseTo(1);
  });
});
