/**
 * The places of the game screen (the "tabs": `Tab` is the id of the current place). Each is a
 * picture and a word in the main navigation (`MainNav`: the phone's bottom dock, the desktop's left rail,
 * and the More drawer when a dock cannot hold them all; the list the navigation reads is `navPlaces` in
 * `nav-places.ts`). The glyphs are one-colour (`w`), so the active place (dark on gold) can tint its
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
}

/**
 * Left to right is an escalating level of danger and excitement (Misa): your creatures at home, the
 * Workshop, Expeditions out in the world, the Valley Games (a silly show, no danger, but a crowd), the
 * Dungeon, and the Raid boss last.
 */
export const TABS: readonly TabDef[] = [
  { id: 'collection', label: 'Creatures', glyph: 'paw' },
  { id: 'workshop', label: 'Workshop', glyph: 'anvil' },
  { id: 'expeditions', label: 'Expeditions', glyph: 'compass' },
  { id: 'games', label: 'Games', glyph: 'trophy' },
  { id: 'dungeon', label: 'Dungeon', glyph: 'door' },
  { id: 'raid', label: 'Raid', glyph: 'blade' },
];

const INK = '#0d0a1a';

/** The palette change for a tab's picture: dark on the gold of the selected tab, its own colours otherwise. */
export function tabPalette(active: boolean): Readonly<Record<string, string>> | undefined {
  return active ? { w: INK, m: INK } : undefined;
}
