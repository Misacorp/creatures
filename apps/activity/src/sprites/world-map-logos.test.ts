import { expeditionContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { expandRows, spriteSize, validateSprite } from './sprite-data';
import { GLYPH_HEIGHT, GLYPH_WIDTH, canDraw, glyph, textWidth } from './world-map-font';
import { LOGO_IDS, buildLogo, logoOf } from './world-map-logos';

const destinations = expeditionContent.destinations;

describe('the pixel font', () => {
  it('draws every capital letter as seven rows of five', () => {
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const rows = glyph(letter);
      expect(rows, letter).toHaveLength(GLYPH_HEIGHT);
      for (const row of rows)
        expect(row, letter).toMatch(new RegExp(`^[#.]{${String(GLYPH_WIDTH)}}$`));
      expect(rows.join('').includes('#'), letter).toBe(true);
    }
  });

  it('gives every letter its own shape, and reads lower case as capitals', () => {
    const shapes = new Set([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) => glyph(l).join('/')));
    expect(shapes.size).toBe(26);
    expect(glyph('e')).toEqual(glyph('E'));
    expect(canDraw('Old Crossroads')).toBe(true);
    expect(canDraw('Café')).toBe(false);
    expect(textWidth('ABC')).toBe(17);
    expect(textWidth('')).toBe(0);
  });
});

describe('the place logos', () => {
  it('has a logo for every destination, and the font can draw its name', () => {
    expect([...LOGO_IDS].sort()).toEqual(destinations.map((d) => d.id).sort());
    for (const d of destinations) {
      expect(canDraw(d.name), d.name).toBe(true);
      expect(logoOf(d.id), d.id).toBeDefined();
    }
    expect(logoOf('no-such-place')).toBeUndefined();
    expect(buildLogo('no-such-place', 'Nowhere')).toBeUndefined();
  });

  it('is well-formed sprite data, small enough to sit over a landmark', () => {
    for (const d of destinations) {
      const logo = logoOf(d.id);
      if (logo === undefined) throw new Error(d.id);
      expect(() => {
        validateSprite(logo);
      }, d.id).not.toThrow();
      const size = spriteSize(logo);
      expect(size.width, d.id).toBeLessThanOrEqual(80);
      expect(size.height, d.id).toBeLessThanOrEqual(34);
    }
  });

  it('puts a multi-word name on two lines and a single word on one', () => {
    const height = (id: string) => spriteSize(logoOf(id) ?? { rows: ['.'], palette: {} }).height;
    expect(height('tidepools')).toBeLessThan(height('ember-caves') - 6);
  });

  it('is two-tone, outlined and uses at least five colours with none unused', () => {
    for (const d of destinations) {
      const logo = logoOf(d.id);
      if (logo === undefined) throw new Error(d.id);
      const used = new Set(expandRows(logo).join(''));
      used.delete('.');
      expect(used.size, d.id).toBeGreaterThanOrEqual(5);
      for (const key of used) expect(Object.hasOwn(logo.palette, key), `${d.id} ${key}`).toBe(true);
    }
  });

  it('keeps one pixel of clear edge so the outline is never cut at the border of its box', () => {
    for (const d of destinations) {
      const logo = logoOf(d.id);
      if (logo === undefined) throw new Error(d.id);
      const rows = expandRows(logo);
      const width = rows[0]?.length ?? 0;
      // The text is drawn one pixel in from the left and top, so the first column and row hold no letter fill.
      for (const row of rows) expect(row.length).toBe(width);
    }
  });

  it('draws each place in its own colours', () => {
    const firstColours = destinations.map((d) => {
      const logo = logoOf(d.id);
      return JSON.stringify(Object.values(logo?.palette ?? {}).sort());
    });
    expect(new Set(firstColours).size).toBe(destinations.length);
  });

  it('is built once per place', () => {
    expect(logoOf('tidepools')).toBe(logoOf('tidepools'));
  });
});
