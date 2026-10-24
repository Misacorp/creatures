import { describe, expect, it } from 'vitest';
import { BUNDLED_GLYPHS } from './glyphs';
import {
  dockItems,
  groupAlert,
  navGroups,
  navLounge,
  navPlaces,
  type NavPlace,
} from './nav-places';
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

  it('is Creatures and Adventure with their places in list order, the Games last in Adventure', () => {
    const groups = navGroups(places);
    expect(ids(groups)).toEqual(['creatures', 'adventure']);
    expect(groups.map((g) => ids(g.places))).toEqual([
      ['collection', 'workshop'],
      ['expeditions', 'dungeon', 'raid', 'games'],
    ]);
  });

  it('makes a group with several places a menu and a group with one place a direct button', () => {
    expect(navGroups(places).map((g) => g.direct)).toEqual([false, false]);
    expect(navGroups(places.filter((p) => p.id !== 'workshop')).map((g) => g.direct)).toEqual([
      true,
      false,
    ]);
  });

  it('leaves out a group with no place, and a new place joins its group by data alone', () => {
    const more = [...places, place('market', 'creatures')];
    expect(navGroups(places.filter((p) => p.group !== 'adventure')).map((g) => g.id)).toEqual([
      'creatures',
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
    const [creatures, adventure] = navGroups(busy);
    expect(creatures?.pip).toBeNull();
    // Expeditions, Raid and Games all wait: the right group counts all four of its places.
    expect(adventure?.pip).toBe('3 places need you');
  });

  it('rolls the Games pip into Adventure, named when it is the only one', () => {
    const [, adventure] = navGroups(navPlaces({ ...NO_ALERTS, games: ALERT_TEXT.gamesEntries }));
    expect(adventure?.pip).toBe(`Games: ${ALERT_TEXT.gamesEntries}`);
  });

  it('shows no pip on a group while nothing in it waits', () => {
    expect(navGroups(places).map((g) => g.pip)).toEqual([null, null]);
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

describe('dockItems', () => {
  const groups = navGroups(navPlaces(NO_ALERTS));

  it('puts the Lounge between the groups: left group, Lounge, right group', () => {
    const items = dockItems(groups, navLounge(null));
    expect(items.map((item) => (item.kind === 'group' ? item.group.id : item.lounge.id))).toEqual([
      'creatures',
      'lounge',
      'adventure',
    ]);
  });

  it('is just the groups with no Lounge', () => {
    expect(dockItems(groups, null).map((item) => item.kind)).toEqual(['group', 'group']);
  });

  it('keeps the Lounge in the middle when a group is added, by data alone', () => {
    const three = navGroups(
      [...navPlaces(NO_ALERTS), place('a', 'extra')],
      [...NAV_GROUPS, { id: 'extra', label: 'Extra', glyph: 'paw' }],
    );
    const kinds = dockItems(three, navLounge(null)).map((item) => item.kind);
    expect(kinds).toEqual(['group', 'lounge', 'group', 'group']);
  });

  it('carries the Lounge pip, or none', () => {
    expect(navLounge(null).pip).toBeNull();
    expect(navLounge('someone is here').pip).toBe('someone is here');
    expect(navLounge(null).label).toBe('Lounge');
  });
});
