import { describe, expect, it } from 'vitest';
import { BUNDLED_GLYPHS } from './glyphs';
import { TABS, tabAfterKey, tabPalette } from './tabs';

describe('the tabs', () => {
  it('has the five tabs in order of rising danger, the Raid last', () => {
    expect(TABS.map((t) => t.id)).toEqual([
      'collection',
      'workshop',
      'expeditions',
      'dungeon',
      'raid',
    ]);
    expect(TABS[0]?.label).toBe('Creatures');
    expect(new Set(TABS.map((t) => t.id)).size).toBe(TABS.length);
  });

  it('gives every tab a picture and a word, so all five fit as picture over word', () => {
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

  it('moves along the tabs with the arrow keys, wrapping, and Home and End jump', () => {
    expect(tabAfterKey('collection', 'ArrowRight')).toBe('workshop');
    expect(tabAfterKey('raid', 'ArrowRight')).toBe('collection');
    expect(tabAfterKey('collection', 'ArrowLeft')).toBe('raid');
    expect(tabAfterKey('dungeon', 'Home')).toBe('collection');
    expect(tabAfterKey('dungeon', 'End')).toBe('raid');
    expect(tabAfterKey('raid', 'Enter')).toBeNull();
    expect(tabAfterKey('raid', 'a')).toBeNull();
  });
});
