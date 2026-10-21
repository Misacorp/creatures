import { describe, expect, it } from 'vitest';
import { expeditionContent } from '@creatures/game';
import { kitLevels, supplyBoostLines, type TripContext } from './boost-view';
import { expectedHaul } from './haul-view';

const trip = (over: Partial<TripContext> = {}): TripContext => ({
  length: 'long',
  place: 'ember-caves',
  role: 'payoff',
  stars: 0,
  twist: null,
  ...over,
});

const texts = (t: TripContext, id: string) => supplyBoostLines(t, id).map((l) => l.text);

describe('the supply card lines for a trip', () => {
  it('says a Small Satchel brings at least double parts on 2 h and more on 12 h', () => {
    expect(texts(trip({ length: 'short' }), 'satchel-basic')).toEqual([
      'Parts: at least double on this trip',
    ]);
    expect(texts(trip({ length: 'long' }), 'satchel-basic')).toEqual(['Parts: more on this trip']);
  });

  it('describes a lure by creatures and new species, a lantern by the deeper area', () => {
    const lure = supplyBoostLines(trip(), 'lure-good');
    expect(lure.map((l) => l.category)).toEqual(['creatures', 'newSpecies']);
    expect(supplyBoostLines(trip(), 'lantern-good').map((l) => l.category)).toEqual([
      'deepCreatures',
      'creatures',
    ]);
  });

  it('describes a map in one line about everything', () => {
    const lines = supplyBoostLines(trip({ length: 'short' }), 'map-scrap-good');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toMatch(/^Everything: .+ on this trip$/);
  });

  it('shows nothing without a place or an explorer, and nothing for an unknown supply', () => {
    expect(supplyBoostLines(trip({ place: null }), 'lure-basic')).toEqual([]);
    expect(supplyBoostLines(trip({ role: null }), 'lure-basic')).toEqual([]);
    expect(supplyBoostLines(trip(), 'nope')).toEqual([]);
  });

  it('recomputes when the length changes', () => {
    const short = supplyBoostLines(trip({ length: 'short' }), 'lure-basic')[0]?.level ?? 0;
    const long = supplyBoostLines(trip({ length: 'long' }), 'lure-basic')[0]?.level ?? 0;
    expect(short).toBeGreaterThan(long);
  });

  it('never puts a digit or a percent sign in the text', () => {
    for (const s of expeditionContent.supplies) {
      for (const length of ['short', 'medium', 'long', 'day'] as const) {
        for (const line of supplyBoostLines(trip({ length }), s.id)) {
          expect(line.text, `${s.id} ${length}`).not.toMatch(/[\d%]/);
        }
      }
    }
  });
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
