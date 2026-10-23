/**
 * The tabs of the game screen. Six of them have to fit side by side on a phone (390 px wide, 16 px
 * gutters) with no horizontal scroll, so every tab is a small picture over a short word, and the
 * picture is part of the tab at every width. The glyphs are one-colour (`w`), so a selected tab
 * (dark on gold) can tint its picture to stay readable.
 */

export type Tab = 'collection' | 'expeditions' | 'games' | 'raid' | 'workshop' | 'dungeon';

interface TabDef {
  id: Tab;
  /** The word under the picture, also the accessible name. */
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

/** The tab a key moves to inside the tab list: arrows step (wrapping), Home and End jump. */
export function tabAfterKey(current: Tab, key: string): Tab | null {
  const index = TABS.findIndex((t) => t.id === current);
  if (index < 0) return null;
  const last = TABS.length - 1;
  let to: number;
  switch (key) {
    case 'ArrowRight':
      to = index === last ? 0 : index + 1;
      break;
    case 'ArrowLeft':
      to = index === 0 ? last : index - 1;
      break;
    case 'Home':
      to = 0;
      break;
    case 'End':
      to = last;
      break;
    default:
      return null;
  }
  return TABS[to]?.id ?? null;
}
