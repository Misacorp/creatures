import { describe, expect, it } from 'vitest';
import { kitLevels, type TripContext } from './boost-view';
import { expectedHaul } from './haul-view';

const trip = (over: Partial<TripContext> = {}): TripContext => ({
  length: 'long',
  place: 'ember-caves',
  role: 'payoff',
  stars: 0,
  twist: null,
  ...over,
});

describe('the haul strip marks follow the brackets of the whole kit', () => {
  const row = (rows: ReturnType<typeof expectedHaul>, key: string) => {
    const found = rows.find((r) => r.key === key);
    if (found === undefined) throw new Error(`no row ${key}`);
    return found;
  };

  it('gives each raised row its bracket and leaves the others without a mark', () => {
    const t = trip({ length: 'short' });
    const kit = ['satchel-basic', 'map-scrap-basic'];
    const rows = expectedHaul('short', 'ember', kit, kitLevels(t, kit));
    expect(row(rows, 'scrap').bracket).toBe(4);
    expect(row(rows, 'scrap').detail).toContain('at least double with your supplies');
    // A map adds ticks to gear and XP too.
    expect(row(rows, 'gear').boosted).toBe(true);
    expect(row(rows, 'xp').boosted).toBe(true);
    expect(row(rows, 'rarity').boosted).toBe(false);
    expect(row(rows, 'rarity').bracket).toBe(0);
  });

  it('keeps the plain mark when no trip is known', () => {
    const rows = expectedHaul('long', 'ember', ['satchel-basic']);
    expect(row(rows, 'scrap').boosted).toBe(true);
    expect(row(rows, 'scrap').bracket).toBe(0);
  });

  it('has no bracket with an empty kit', () => {
    const rows = expectedHaul('long', 'ember', [], kitLevels(trip(), []));
    expect(rows.every((r) => !r.boosted && r.bracket === 0)).toBe(true);
  });
});
