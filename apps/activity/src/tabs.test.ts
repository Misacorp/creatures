import { describe, expect, it } from 'vitest';
import { BUNDLED_GLYPHS } from './glyphs';
import {
  DEFAULT_PLACE,
  HOME_PINS,
  NAV_GROUPS,
  NAV_HOME,
  TABS,
  homePageOf,
  isPlace,
  isTab,
  navPlaceOf,
  tabPalette,
} from './tabs';

describe('the tabs', () => {
  it('has the seven tabs: the Collection (creatures, Workshop, Journal), then the adventures in rising danger, the Valley Games last', () => {
    expect(TABS.map((t) => t.id)).toEqual([
      'collection',
      'workshop',
      'journal',
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

describe('the groups and Home', () => {
  it('has two groups, Collection and Adventure, in the places Misa named', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['collection', 'adventure']);
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(['Collection', 'Adventure']);
    const of = (id: string) => TABS.filter((t) => t.group === id).map((t) => t.id);
    expect(of('collection')).toEqual(['collection', 'workshop', 'journal']);
    expect(of('adventure')).toEqual(['expeditions', 'dungeon', 'raid', 'games']);
  });

  it('has a Home entry with a word and a picture of its own, and it is a place but not a tab', () => {
    expect(NAV_HOME.label).toBe('Home');
    expect(Object.hasOwn(BUNDLED_GLYPHS, NAV_HOME.glyph)).toBe(true);
    expect(TABS.map((t) => t.id)).not.toContain(NAV_HOME.id);
    expect(TABS.map((t) => t.glyph)).not.toContain(NAV_HOME.glyph);
    expect(isPlace('home')).toBe(true);
    expect(isTab('home')).toBe(false);
    expect(isPlace('raid')).toBe(true);
    expect(isPlace('lounge')).toBe(false);
  });
});

describe('the pins and pages of Home', () => {
  it('opens the Journal as a place and the Stats as a page of Home', () => {
    expect(HOME_PINS.map((p) => p.screen)).toEqual(['journal', 'home/stats']);
    expect(isTab('journal')).toBe(true);
    expect(navPlaceOf('journal')).toBe('journal');
    expect(navPlaceOf('home/stats')).toBe('home');
    expect(homePageOf('journal')).toBeNull();
    expect(homePageOf('home/stats')).toBe('stats');
  });
});

describe('the default place', () => {
  it('is Home, so the app opens on the Today board', () => {
    expect(DEFAULT_PLACE).toBe(NAV_HOME.id);
    expect(isPlace(DEFAULT_PLACE)).toBe(true);
  });
});
