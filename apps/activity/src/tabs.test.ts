import { describe, expect, it } from 'vitest';
import { BUNDLED_GLYPHS } from './glyphs';
import { NAV_GROUPS, NAV_LOUNGE, TABS, tabPalette } from './tabs';

describe('the tabs', () => {
  it('has the six tabs: your creatures, then the adventures in rising danger, the Valley Games last', () => {
    expect(TABS.map((t) => t.id)).toEqual([
      'collection',
      'workshop',
      'expeditions',
      'dungeon',
      'raid',
      'games',
    ]);
    expect(TABS[0]?.label).toBe('Creatures');
    expect(new Set(TABS.map((t) => t.id)).size).toBe(TABS.length);
  });

  it('gives every tab a picture and a word, so the dock and the rail can name every place', () => {
    for (const tab of TABS) {
      expect(Object.hasOwn(BUNDLED_GLYPHS, tab.glyph), tab.id).toBe(true);
      expect(tab.label.length).toBeGreaterThan(2);
      expect(tab.label.length).toBeLessThanOrEqual(11);
    }
    expect(new Set(TABS.map((t) => t.glyph)).size).toBe(TABS.length);
  });

  it('tints the picture of the selected tab dark, and leaves the others alone', () => {
    expect(tabPalette(false)).toBeUndefined();
    expect(tabPalette(true)).toEqual({ w: '#0d0a1a', m: '#0d0a1a' });
  });
});

describe('the groups and the Lounge', () => {
  it('has two groups, Creatures and Adventure, in the places Misa named', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['creatures', 'adventure']);
    const of = (id: string) => TABS.filter((t) => t.group === id).map((t) => t.id);
    expect(of('creatures')).toEqual(['collection', 'workshop']);
    expect(of('adventure')).toEqual(['expeditions', 'dungeon', 'raid', 'games']);
  });

  it('has a Lounge entry with a word and a picture, and it is not a place', () => {
    expect(NAV_LOUNGE.label).toBe('Lounge');
    expect(Object.hasOwn(BUNDLED_GLYPHS, NAV_LOUNGE.glyph)).toBe(true);
    expect(TABS.map((t) => t.id)).not.toContain(NAV_LOUNGE.id);
  });
});
