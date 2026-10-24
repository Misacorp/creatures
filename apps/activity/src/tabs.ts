/**
 * The places of the game screen (the "tabs": `Tab` is the id of the current place). Each is a
 * picture and a word in the main navigation (`MainNav`: the phone's bottom dock of a group button, Home and a group button,
 * the desktop's left rail with Home first and the groups under headings; the list the navigation reads is `navPlaces` in
 * `nav-places.ts`). Every tab belongs to one group (`NAV_GROUPS`); Home (`NAV_HOME`) is a place that is in no group. The glyphs are one-colour (`w`), so the active place (dark on gold) can tint its
 * picture to stay readable.
 */

export type Tab =
  'collection' | 'journal' | 'expeditions' | 'games' | 'raid' | 'workshop' | 'dungeon';

/** Every place of the game screen: Home (the page the app opens on) and the tabs. */
export type Place = 'home' | Tab;

/**
 * The pages that open from Home (a pin on the Today board) and are not places of the navigation: sub-pages of
 * Home. The current screen is a `Place` or one of these (`Screen`); the navigation shows Home as current on
 * them. Stats is the one today (the Journal became a place of the Collection group, 2026-10-24). A new page
 * is one entry here, its view in `Game.tsx` and a pin in `HOME_PINS`.
 */
export const HOME_PAGES = [{ id: 'stats', label: 'Stats', screen: 'home/stats' }] as const;

/**
 * The pins on the Today board, in order: each opens a screen. The Journal's is a place (it shows in the
 * Collection group and the pin is just another way in), the Stats' is a sub-page of Home.
 */
export const HOME_PINS = [
  { id: 'journal', label: 'Journal', screen: 'journal' },
  { id: 'stats', label: 'Stats', screen: 'home/stats' },
] as const satisfies readonly { id: string; label: string; screen: Screen }[];

/** The id of a pin on the board. */
export type PinId = (typeof HOME_PINS)[number]['id'];

/** The id of a page that opens from Home. */
export type HomePage = (typeof HOME_PAGES)[number]['id'];

/** The screen id of a Home page (`home/journal`). */
export type HomeScreenId = (typeof HOME_PAGES)[number]['screen'];

/** What the game screen can show: a place, or a page that opens from Home. */
export type Screen = Place | HomeScreenId;

/** The screen id of a Home page. */
export function homeScreen(page: HomePage): HomeScreenId {
  return HOME_PAGES.find((p) => p.id === page)?.screen ?? 'home/stats';
}

/** The Home page a screen id is (`home/journal` is the Journal), or null for a place. */
export function homePageOf(screen: Screen): HomePage | null {
  return HOME_PAGES.find((p) => p.screen === screen)?.id ?? null;
}

/** The place the navigation marks as current on `screen`: a Home page counts as Home. */
export function navPlaceOf(screen: Screen): Place {
  return HOME_PAGES.some((p) => p.screen === screen) ? 'home' : (screen as Place);
}

/** The place the app opens on: Home (Misa, 2026-10-24: the Home page is the default). */
export const DEFAULT_PLACE: Place = 'home';

/** Whether `id` is the id of a place, Home included (the navigation hands back plain strings). */
export function isPlace(id: string): id is Place {
  return id === NAV_HOME.id || isTab(id);
}

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

export type TabGroup = 'collection' | 'adventure';

interface TabGroupDef {
  id: TabGroup;
  label: string;
  /** The id of the glyph in `glyphs.ts`. */
  glyph: string;
}

/**
 * The groups of the main navigation in their order: the two group buttons of the phone dock (Home
 * sits between them, see `NAV_HOME`) and the headings of the desktop rail. A group with one place is
 * a direct button. The first group is the Collection (Misa, 2026-10-24: Creatures, Workshop and Journal; Items will
 * split from the Workshop later, which is one more place in this group). A future village or home map is one more
 * place in it too.
 */
export const NAV_GROUPS: readonly TabGroupDef[] = [
  { id: 'collection', label: 'Collection', glyph: 'paw' },
  { id: 'adventure', label: 'Adventure', glyph: 'peaks' },
];

/**
 * Home: the page the app opens on and the dock's middle button, the primary one (gold, raised). It is in no
 * group: on a phone it sits between the two group buttons, on a desktop it is the first item of the rail.
 * It shows the Today board (what needs you, what is coming up, the valley's day); on a phone the living room
 * is drawn at the top of that page, on a desktop the room band is above every screen as before.
 */
export const NAV_HOME = { id: 'home', label: 'Home', glyph: 'home' } as const;

/**
 * In list order, which is the order inside a group: your creatures, the Workshop and the Journal, then the
 * adventures in rising danger (Expeditions, Dungeon, Raid), and the Valley Games last (Misa, 2026-10-24: "the
 * current adventures button but it could include the games section too").
 */
export const TABS: readonly TabDef[] = [
  { id: 'collection', label: 'Creatures', glyph: 'paw', group: 'collection' },
  { id: 'workshop', label: 'Workshop', glyph: 'anvil', group: 'collection' },
  { id: 'journal', label: 'Journal', glyph: 'journal', group: 'collection' },
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
