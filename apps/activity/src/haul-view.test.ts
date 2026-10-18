import { EXPEDITION_LENGTHS, expeditionContent, lengthRules } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { glyph } from './glyphs';
import { CHANCE_WORDS, MAX_PIPS, expectedHaul, haulTitle } from './haul-view';

const row = (rows: ReturnType<typeof expectedHaul>, key: string) => {
  const found = rows.find((r) => r.key === key);
  if (found === undefined) throw new Error(`no row ${key}`);
  return found;
};

const total = (length: (typeof EXPEDITION_LENGTHS)[number], kit: string[] = []): number =>
  expectedHaul(length, 'tide', kit).reduce((n, r) => n + r.level, 0);

describe('the expected haul of a trip', () => {
  it('lists the same things for every length, with pips that grow with the length', () => {
    const keys = expectedHaul('short', 'tide', []).map((r) => r.key);
    for (const length of EXPEDITION_LENGTHS) {
      expect(expectedHaul(length, 'tide', []).map((r) => r.key)).toEqual(keys);
    }
    expect(total('short')).toBeLessThan(total('medium'));
    expect(total('medium')).toBeLessThan(total('long'));
    expect(total('long')).toBeLessThan(total('day'));
    for (const length of EXPEDITION_LENGTHS) {
      for (const r of expectedHaul(length, 'tide', ['lure-great', 'map-scrap-great'])) {
        expect(r.level, `${length} ${r.key}`).toBeLessThanOrEqual(MAX_PIPS);
        expect(r.level).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('gives every icon a short word and a fuller line, and draws it with a picture we have', () => {
    for (const r of expectedHaul('long', 'ember', ['lantern-basic', 'satchel-basic'])) {
      expect(r.label.length, r.key).toBeGreaterThanOrEqual(2);
      expect(r.label.length, r.key).toBeLessThanOrEqual(12);
      expect(r.detail.length, r.key).toBeGreaterThan(5);
      if (r.icon.kind === 'glyph') expect(glyph(r.icon.id), r.icon.id).toBeDefined();
    }
  });

  it('shows no percentage and no chance as a number, with or without supplies', () => {
    const kits = [[], ['lure-great'], ['map-scrap-basic', 'satchel-great'], ['lantern-good']];
    for (const kit of kits) {
      for (const length of EXPEDITION_LENGTHS) {
        for (const r of expectedHaul(length, 'grove', kit)) {
          expect(`${r.label} ${r.detail}`, `${length} ${r.key}`).not.toMatch(/%|percent/i);
        }
      }
    }
    expect(CHANCE_WORDS).toHaveLength(MAX_PIPS + 1);
  });

  it('draws the shard of the place and Tide shards for a mixed place', () => {
    const shards = (element: string | null) =>
      expectedHaul('long', element, []).find((r) => r.label === 'Shards');
    expect(shards('ember')?.icon).toEqual({ kind: 'part', part: 'ember-shard' });
    expect(shards(null)?.icon).toEqual({ kind: 'part', part: 'tide-shard' });
  });

  it('says no scrap on a trip that brings none', () => {
    expect(lengthRules('short').loot.scrap).toBe(0);
    expect(row(expectedHaul('short', 'tide', []), 'scrap').detail).toBe('No scrap');
    expect(row(expectedHaul('short', 'tide', []), 'scrap').level).toBe(0);
    expect(row(expectedHaul('long', 'tide', []), 'scrap').detail).toBe(
      `${String(lengthRules('long').loot.scrap)} scrap`,
    );
  });
});

describe('what the chosen supplies add to the haul', () => {
  it('counts the catch rolls a map scrap adds, and marks the row as raised', () => {
    const plain = row(expectedHaul('long', 'tide', []), 'catch');
    const mapped = row(expectedHaul('long', 'tide', ['map-scrap-basic']), 'catch');
    expect(plain.detail).toMatch(/^1 catch roll, each (rarely|sometimes|often|very often) brings/);
    expect(mapped.detail).toMatch(/^2 catch rolls, each /);
    expect(mapped.level).toBeGreaterThanOrEqual(plain.level);
    expect(plain.boosted).toBe(false);
    expect(mapped.boosted).toBe(true);
  });

  it('says in words how often a roll brings a creature, and a lure raises it', () => {
    const none = row(expectedHaul('short', 'tide', []), 'catch');
    const great = row(expectedHaul('short', 'tide', ['lure-great']), 'catch');
    expect(none.detail).toContain('each rarely brings a creature');
    expect(great.detail).not.toContain('each rarely');
    expect(great.level).toBeGreaterThanOrEqual(none.level);
    expect(great.boosted).toBe(true);
    expect(none.boosted).toBe(false);
  });

  it('adds a "New faces" row only when a lure is carried, the better tier more so', () => {
    expect(expectedHaul('short', 'tide', []).some((r) => r.key === 'fresh')).toBe(false);
    const basic = row(expectedHaul('short', 'tide', ['lure-basic']), 'fresh');
    const great = row(expectedHaul('short', 'tide', ['lure-great']), 'fresh');
    expect(basic.level).toBeGreaterThan(0);
    expect(great.level).toBeGreaterThan(basic.level);
    expect(great.boosted).toBe(true);
  });

  it('leaves the rare-find row to the length (a lure does not make rarer creatures)', () => {
    const none = row(expectedHaul('short', 'tide', []), 'rarity');
    const great = row(expectedHaul('short', 'tide', ['lure-great']), 'rarity');
    expect(great.level).toBe(none.level);
    expect(great.boosted).toBe(false);
  });

  it('raises the parts and the supply find with a satchel', () => {
    const plain = expectedHaul('long', 'tide', []);
    const packed = expectedHaul('long', 'tide', ['satchel-great']);
    expect(row(packed, 'supply').boosted).toBe(true);
    expect(row(packed, 'supply').level).toBeGreaterThanOrEqual(row(plain, 'supply').level);
    expect(row(packed, 'scrap').boosted).toBe(true);
    expect(row(packed, 'tide-shard').boosted).toBe(true);
    expect(row(plain, 'scrap').boosted).toBe(false);
  });

  it('adds a deeper-area row only when a lantern is carried', () => {
    expect(expectedHaul('long', 'tide', []).some((r) => r.key === 'deep')).toBe(false);
    const lit = expectedHaul('long', 'tide', ['lantern-basic']);
    expect(row(lit, 'deep').boosted).toBe(true);
    expect(row(lit, 'deep').level).toBeGreaterThan(0);
  });

  it('lets a supply lift a short trip without it ever passing the pips of the scale', () => {
    const everything = expeditionContent.supplies.map((s) => s.id);
    for (const id of everything) {
      for (const r of expectedHaul('day', 'tide', [id])) {
        expect(r.level).toBeLessThanOrEqual(MAX_PIPS);
      }
    }
  });

  it('ignores a supply id the content does not know', () => {
    expect(expectedHaul('long', 'tide', ['no-such-supply'])).toEqual(
      expectedHaul('long', 'tide', []),
    );
  });
});

describe('the title of the haul', () => {
  it('names the trip and the supplies', () => {
    expect(haulTitle('long', [])).toBe('A 12 h trip');
    expect(haulTitle('short', ['lure-good'])).toBe('A 2 h trip with Sweet Lure');
    expect(haulTitle('day', ['lure-good', 'lantern-basic'])).toBe(
      'A 24 h trip with Sweet Lure and Candle Lantern',
    );
  });
});
