import { describe, expect, it } from 'vitest';
import { BUNDLED_GLYPHS } from './glyphs';
import { groupAlert, navGroups, navPlaces, type NavPlace } from './nav-places';
import { ALERT_TEXT, NO_ALERTS } from './tab-alerts';
import { NAV_GROUPS, TABS } from './tabs';

function place(id: string, group: string, pip: string | null = null): NavPlace {
  return { id, label: id.toUpperCase(), glyph: 'paw', group, pip };
}

const ids = (list: readonly { id: string }[]): string[] => list.map((p) => p.id);

describe('the place list', () => {
  it('is the six tabs in their order, each with its group and its pip from the alerts', () => {
    const places = navPlaces({ ...NO_ALERTS, workshop: ALERT_TEXT.jobReady });
    expect(ids(places)).toEqual(TABS.map((t) => t.id));
    expect(places.map((p) => p.label)).toEqual(TABS.map((t) => t.label));
    expect(places.map((p) => p.group)).toEqual(TABS.map((t) => t.group));
    expect(places.find((p) => p.id === 'workshop')?.pip).toBe('a job is ready');
    expect(places.filter((p) => p.pip !== null)).toHaveLength(1);
  });

  it('puts every place in a known group and gives every group a picture', () => {
    const known = NAV_GROUPS.map((g) => g.id);
    for (const tab of TABS) expect(known, tab.id).toContain(tab.group);
    for (const group of NAV_GROUPS) {
      expect(Object.hasOwn(BUNDLED_GLYPHS, group.glyph), group.id).toBe(true);
      expect(group.label.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('navGroups', () => {
  const places = navPlaces(NO_ALERTS);

  it('is Home, Adventure and Games with their places in list order', () => {
    const groups = navGroups(places);
    expect(ids(groups)).toEqual(['home', 'adventure', 'games']);
    expect(groups.map((g) => ids(g.places))).toEqual([
      ['collection', 'workshop'],
      ['expeditions', 'dungeon', 'raid'],
      ['games'],
    ]);
  });

  it('makes a group with one place a direct button and the others menus', () => {
    expect(navGroups(places).map((g) => g.direct)).toEqual([false, false, true]);
  });

  it('leaves out a group with no place, and a new place joins its group by data alone', () => {
    const more = [...places, place('market', 'home')];
    expect(navGroups(places.filter((p) => p.group !== 'games')).map((g) => g.id)).toEqual([
      'home',
      'adventure',
    ]);
    expect(ids(navGroups(more)[0]?.places ?? [])).toEqual(['collection', 'workshop', 'market']);
  });

  it('rolls the pips of a group up', () => {
    const busy = navPlaces({
      ...NO_ALERTS,
      expeditions: ALERT_TEXT.tripHome,
      raid: ALERT_TEXT.raidPlace,
      games: ALERT_TEXT.gamesEntries,
    });
    const [home, adventure, games] = navGroups(busy);
    expect(home?.pip).toBeNull();
    expect(adventure?.pip).toBe('2 places need you');
    expect(games?.pip).toBe(ALERT_TEXT.gamesEntries);
  });
});

describe('groupAlert, the roll-up pip', () => {
  it('is absent while nothing in the group waits', () => {
    expect(groupAlert([place('a', 'g'), place('b', 'g')])).toBeNull();
  });

  it('names the one place that waits, with its reason', () => {
    expect(groupAlert([place('a', 'g'), place('b', 'g', 'a trip is home')])).toBe(
      'B: a trip is home',
    );
  });

  it('counts several', () => {
    expect(groupAlert([place('a', 'g', 'x'), place('b', 'g', 'y'), place('c', 'g')])).toBe(
      '2 places need you',
    );
  });

  it('is just the reason for a group of one place', () => {
    expect(groupAlert([place('a', 'g', 'x')])).toBe('x');
  });
});
