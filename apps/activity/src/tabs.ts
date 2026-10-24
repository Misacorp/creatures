/**
 * The places of the game screen (the "tabs": `Tab` is the id of the current place). Each is a
 * picture and a word in the main navigation (`MainNav`: the phone's bottom dock of three group buttons,
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

export type TabGroup = 'home' | 'adventure' | 'games';

interface TabGroupDef {
  id: TabGroup;
  label: string;
  /** The id of the glyph in `glyphs.ts`. */
  glyph: string;
}

/**
 * The groups of the main navigation in their order: the three buttons of the phone dock and the headings of
 * the desktop rail. A group with one place is a direct button. A future village or home map is one more place in Home.
 */
export const NAV_GROUPS: readonly TabGroupDef[] = [
  { id: 'home', label: 'Home', glyph: 'home' },
  { id: 'adventure', label: 'Adventure', glyph: 'peaks' },
  { id: 'games', label: 'Games', glyph: 'trophy' },
];

/**
 * Left to right is an escalating level of danger and excitement (Misa): your creatures at home, the
 * Workshop, Expeditions out in the world, the Valley Games (a silly show, no danger, but a crowd), the
 * Dungeon, and the Raid boss last.
 */
export const TABS: readonly TabDef[] = [
  { id: 'collection', label: 'Creatures', glyph: 'paw', group: 'home' },
  { id: 'workshop', label: 'Workshop', glyph: 'anvil', group: 'home' },
  { id: 'expeditions', label: 'Expeditions', glyph: 'compass', group: 'adventure' },
  { id: 'games', label: 'Games', glyph: 'trophy', group: 'games' },
  { id: 'dungeon', label: 'Dungeon', glyph: 'door', group: 'adventure' },
  { id: 'raid', label: 'Raid', glyph: 'blade', group: 'adventure' },
];

const INK = '#0d0a1a';

/** The palette change for a tab's picture: dark on the gold of the selected tab, its own colours otherwise. */
export function tabPalette(active: boolean): Readonly<Record<string, string>> | undefined {
  return active ? { w: INK, m: INK } : undefined;
}
