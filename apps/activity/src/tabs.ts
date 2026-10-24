/**
 * The places of the game screen (the "tabs": `Tab` is the id of the current place). Each is a
 * picture and a word in the main navigation (`MainNav`: the phone's bottom dock of a group button, the Lounge and a group button,
 * the desktop's left rail grouped under headings; the list the navigation reads is `navPlaces` in
 * `nav-places.ts`). Every place belongs to one group (`NAV_GROUPS`). The glyphs are one-colour (`w`), so the active place (dark on gold) can tint its
 * picture to stay readable.
 */

export type Tab = 'collection' | 'expeditions' | 'games' | 'raid' | 'workshop' | 'dungeon';

/** Whether `id` is the id of a place (the navigation hands back plain strings). */
export function isTab(id: string): id is Tab {
  return TABS.some((t) => t.id === id);
}

interface TabDef {
  id: Tab;
  /** The word beside or under the picture, also the accessible name. */
  label: string;
  /** The id of the glyph in `glyphs.ts`. */
  glyph: string;
  /** The id of the group (`NAV_GROUPS`) the place belongs to. */
  group: TabGroup;
}

export type TabGroup = 'creatures' | 'adventure';

interface TabGroupDef {
  id: TabGroup;
  label: string;
  /** The id of the glyph in `glyphs.ts`. */
  glyph: string;
}

/**
 * The groups of the main navigation in their order: the two group buttons of the phone dock (the Lounge
 * button sits between them, see `NAV_LOUNGE`) and the headings of the desktop rail. A group with one place is
 * a direct button. The first group's name is a placeholder (Misa, 2026-10-24, "something that refers to
 * creatures, items, workshop"): renaming it is this one line. A future village or home map is one more place
 * in the first group.
 */
export const NAV_GROUPS: readonly TabGroupDef[] = [
  { id: 'creatures', label: 'Creatures', glyph: 'paw' },
  { id: 'adventure', label: 'Adventure', glyph: 'peaks' },
];

/**
 * The Lounge: the dock's middle button, the primary one. It is not a place (a screen you are "in"): it opens
 * the living room in a sheet, because on a phone the room no longer sits at the top of every screen. The
 * desktop keeps the room band and has no such button.
 */
export const NAV_LOUNGE = { id: 'lounge', label: 'Lounge', glyph: 'couch' } as const;

/**
 * In list order, which is the order inside a group: your creatures at home and the Workshop, then the
 * adventures in rising danger (Expeditions, Dungeon, Raid), and the Valley Games last (Misa, 2026-10-24: "the
 * current adventures button but it could include the games section too").
 */
export const TABS: readonly TabDef[] = [
  { id: 'collection', label: 'Creatures', glyph: 'paw', group: 'creatures' },
  { id: 'workshop', label: 'Workshop', glyph: 'anvil', group: 'creatures' },
  { id: 'expeditions', label: 'Expeditions', glyph: 'compass', group: 'adventure' },
  { id: 'dungeon', label: 'Dungeon', glyph: 'door', group: 'adventure' },
  { id: 'raid', label: 'Raid', glyph: 'blade', group: 'adventure' },
  { id: 'games', label: 'Games', glyph: 'trophy', group: 'adventure' },
];

const INK = '#0d0a1a';

/** The palette change for a tab's picture: dark on the gold of the selected tab, its own colours otherwise. */
export function tabPalette(active: boolean): Readonly<Record<string, string>> | undefined {
  return active ? { w: INK, m: INK } : undefined;
}
