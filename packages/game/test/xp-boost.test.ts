import { describe, expect, it } from 'vitest';
import {
  dayParts,
  dayXpEffects,
  gearPart,
  legacyDayParts,
  treatPart,
  xpBoost,
  xpBoostTotalBp,
  type WeatherDay,
} from '../src';

function day(boon: string, omen: string | null = null, omenBp = 10_000): WeatherDay {
  return { day: '2026-10-19', boon, omen, wild: false, boonBp: 10_000, omenBp };
}

describe('xp boost', () => {
  it('multiplies the treat and adds the shares', () => {
    expect(xpBoostTotalBp([treatPart(2)])).toBe(20_000);
    expect(
      xpBoostTotalBp([treatPart(3), { source: 'day', name: 'Hearty Breakfast', bp: 2500 }]),
    ).toBe(37_500);
    expect(
      xpBoostTotalBp([
        { source: 'day', name: 'Cold Snap', bp: -2000 },
        { source: 'gear', name: 'Trail XP', bp: 1000 },
      ]),
    ).toBe(9000);
    // Never below nothing.
    expect(xpBoostTotalBp([{ source: 'trip', name: 'X', bp: -20_000 }])).toBe(0);
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
    ).toEqual([{ source: 'day', name: 'Cold Snap', bp: -2000 }]);
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
