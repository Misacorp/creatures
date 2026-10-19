import { describe, expect, it } from 'vitest';
import {
  applyXpBoost,
  creatureXpParts,
  dayCreatureXpParts,
  dayParts,
  dayXpEffects,
  gearPart,
  legacyDayParts,
  treatPart,
  xpBoost,
  xpBoostTotalBp,
  type WeatherDay,
  type XpBoostPart,
} from '../src';

function day(boon: string, omen: string | null = null, omenBp = 10_000): WeatherDay {
  return { day: '2026-10-19', boon, omen, wild: false, boonBp: 10_000, omenBp };
}

const share = (name: string, bp: number, source: 'day' | 'gear' | 'trip' = 'day'): XpBoostPart => ({
  source,
  name,
  bp,
});

describe('xp boost', () => {
  it('multiplies the treat and every share: the Total is their product', () => {
    expect(xpBoostTotalBp([])).toBe(10_000);
    expect(xpBoostTotalBp([treatPart(2)])).toBe(20_000);
    expect(xpBoostTotalBp([treatPart(3), share('Hearty Breakfast', 2500)])).toBe(37_500);
    // Two shares multiply, they are not added: x0.8 times x1.1 is x0.88 (added it was x0.9).
    expect(xpBoostTotalBp([share('Cold Snap', -2000), share('Trail XP', 1000, 'gear')])).toBe(8800);
    // Treat x2, Boon x1.25, gear x1.1, trip bonus x1.5: 2 * 1.25 * 1.1 * 1.5 = 4.125.
    expect(
      xpBoostTotalBp([
        treatPart(2),
        share('Hearty Breakfast', 2500),
        share('Trail XP', 1000, 'gear'),
        share('Milestones', 5000, 'trip'),
      ]),
    ).toBe(41_250);
    // Two treats (never both in practice) multiply too.
    expect(xpBoostTotalBp([treatPart(2), treatPart(3)])).toBe(60_000);
  });

  it('rounds down after each share, in order', () => {
    // 10000 * 1.0001 = 10001; 10001 * 1.0001 = 10002.0001 -> 10002.
    expect(xpBoostTotalBp([share('A', 1), share('B', 1)])).toBe(10_002);
    // x3 * 1.0333 = 30999 exactly; * 1.0333 again = 32031.27 -> 32031.
    expect(xpBoostTotalBp([treatPart(3), share('A', 333), share('B', 333)])).toBe(32_031);
    // The same parts in a different order may differ by a rounding digit at most, never more.
    const a = xpBoostTotalBp([share('A', 777), share('B', -333)]);
    const b = xpBoostTotalBp([share('B', -333), share('A', 777)]);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it('never goes below nothing', () => {
    expect(xpBoostTotalBp([share('X', -20_000, 'trip')])).toBe(0);
    expect(xpBoostTotalBp([share('X', -10_000), share('Y', 5000)])).toBe(0);
    expect(xpBoostTotalBp([treatPart(2), share('X', -10_000), share('Y', -50_000)])).toBe(0);
    expect(applyXpBoost(500, [share('X', -20_000)])).toBe(0);
  });

  it('applyXpBoost is exactly floor(base x Total / 10000), the Total the player sees', () => {
    const sets: XpBoostPart[][] = [
      [],
      [treatPart(2)],
      [treatPart(3), share('Hearty Breakfast', 2500), share('Cold Snap', -2000)],
      [
        share('Milestones', 1500, 'trip'),
        share('Twist', 2000, 'trip'),
        share('Trail XP', 800, 'gear'),
      ],
      [share('Gone', -10_000)],
    ];
    for (const parts of sets) {
      const total = xpBoost(parts)?.totalBp ?? 10_000;
      for (const base of [0, 1, 7, 12, 99, 250, 1337, 4000]) {
        expect(applyXpBoost(base, parts)).toBe(Math.floor((base * total) / 10_000));
      }
    }
    expect(applyXpBoost(40, [treatPart(2), share('A', 2500)])).toBe(100);
    expect(applyXpBoost(7, [share('A', 1500), share('B', 1500)])).toBe(9); // 7 * 1.3225 = 9.2575
  });

  it('applyXpBoost takes whole numbers from 0 only', () => {
    expect(() => applyXpBoost(-1, [])).toThrow(RangeError);
    expect(() => applyXpBoost(1.5, [])).toThrow(RangeError);
    expect(() => applyXpBoost(Number.NaN, [])).toThrow(RangeError);
  });

  it('stays within safe integers with the biggest bases and totals the content allows', () => {
    const parts: XpBoostPart[] = [
      treatPart(4),
      share('A', 50_000),
      share('B', 50_000),
      share('C', 50_000),
      share('D', 50_000, 'gear'),
    ];
    const total = xpBoostTotalBp(parts);
    expect(Number.isSafeInteger(total * 100_000)).toBe(true);
    expect(Number.isSafeInteger(applyXpBoost(100_000, parts))).toBe(true);
  });

  it('builds a creature gain from the treat and the day: the treat first, then each effect', () => {
    expect(creatureXpParts(false, null, [])).toEqual([]);
    expect(creatureXpParts(true, null, [])).toEqual([{ source: 'treat', name: 'Treat', times: 2 }]);
    expect(creatureXpParts(true, 3, dayParts([{ id: 'cold-snap', bp: -2000 }]))).toEqual([
      { source: 'treat', name: 'Treat', times: 3 },
      { source: 'day', name: 'Cold Snap', bp: -2000 },
    ]);
    // Without a treat, the treat's multiplier is not used.
    expect(creatureXpParts(false, 3, [share('Cold Snap', -2000)])).toEqual([
      share('Cold Snap', -2000),
    ]);
    const both = dayCreatureXpParts(true, day('hearty-breakfast', 'cold-snap'));
    expect(both).toEqual([
      { source: 'treat', name: 'Treat', times: 3 },
      { source: 'day', name: 'Hearty Breakfast', bp: 2500 },
      { source: 'day', name: 'Cold Snap', bp: -2000 },
    ]);
    expect(dayCreatureXpParts(false, null)).toEqual([]);
  });

  it('leaves out parts that change nothing, and is null when none is left', () => {
    expect(xpBoost([])).toBeNull();
    expect(xpBoost([treatPart(1), { source: 'gear', name: 'Apprentice', bp: 0 }])).toBeNull();
    expect(xpBoost([treatPart(2), { source: 'day', name: 'Quiet', bp: 0 }])).toEqual({
      parts: [{ source: 'treat', name: 'Treat', times: 2 }],
      totalBp: 20_000,
    });
  });

  it("lists the day's experience effects as applied, by id, and names them from the content", () => {
    expect(dayXpEffects(null)).toEqual([]);
    expect(dayXpEffects(day('fair-winds'))).toEqual([]);
    expect(dayXpEffects(day('hearty-breakfast', 'cold-snap'))).toEqual([
      { id: 'hearty-breakfast', bp: 2500 },
      { id: 'cold-snap', bp: -2000 },
    ]);
    // Scaled by the day's strength (a half-strength Omen).
    expect(dayXpEffects(day('fair-winds', 'cold-snap', 5000))).toEqual([
      { id: 'cold-snap', bp: -1000 },
    ]);
    expect(
      dayParts([
        { id: 'cold-snap', bp: -2000 },
        { id: 'gone', bp: 100 },
      ]),
    ).toEqual([
      { source: 'day', name: 'Cold Snap', bp: -2000 },
      // An effect whose content left keeps its change under a fallback name: the amount never drops it.
      { source: 'day', name: 'Weather', bp: 100 },
    ]);
  });

  it('names the total of a day stored before each effect was', () => {
    expect(legacyDayParts({ boon: 'hearty-breakfast', omen: null, xpBp: 0 })).toEqual([]);
    expect(legacyDayParts({ boon: 'fair-winds', omen: 'cold-snap', xpBp: -2000 })).toEqual([
      { source: 'day', name: 'Cold Snap', bp: -2000 },
    ]);
    expect(legacyDayParts({ boon: 'hearty-breakfast', omen: 'cold-snap', xpBp: 500 })).toEqual([
      { source: 'day', name: 'Hearty Breakfast and Cold Snap', bp: 500 },
    ]);
  });

  it('names a gear share by its line', () => {
    expect(gearPart('trail-xp', 800)).toEqual({ source: 'gear', name: 'Trail XP', bp: 800 });
    expect(gearPart('apprentice', 1400)).toEqual({ source: 'gear', name: 'Apprentice', bp: 1400 });
  });
});
