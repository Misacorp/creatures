import { ALERT_TEXT, type TabAlerts } from '../../tab-alerts';
import { TABS, type Tab } from '../../tabs';

/**
 * Shared sample data of the main navigation mock-ups (`MainNavMockups`, dev-only, see
 * docs/design/decisions.md 2026-10-24): the pips a busy player has, the HUD's currencies and the
 * names of the six places. Nothing here ships to players.
 */

/** A busy day: a job is ready, a trip is home, the show has events to enter and today's run is open. */
export const MOCK_ALERTS: TabAlerts = {
  collection: null,
  workshop: ALERT_TEXT.jobReady,
  expeditions: ALERT_TEXT.tripHome,
  games: ALERT_TEXT.gamesEntries,
  dungeon: ALERT_TEXT.dungeonOpen,
  raid: null,
};

export const MOCK_BAIT = 1240;
export const MOCK_ESSENCE = 36;

/** The tabs in today's order. */
export const NAV_TABS = TABS;

export function tabLabel(id: Tab): string {
  return TABS.find((t) => t.id === id)?.label ?? id;
}

export function tabGlyph(id: Tab): string {
  return TABS.find((t) => t.id === id)?.glyph ?? 'unknown';
}

/** How many tabs have a pip (the back button of the valley shows the count of the other places). */
export function pipCount(alerts: TabAlerts, except: Tab | null): number {
  return TABS.filter((t) => t.id !== except && alerts[t.id] !== null).length;
}

/** The screens a mock-up can show behind the navigation. */
export const NAV_SCREENS = ['creatures', 'games'] as const;
export type NavScreenName = (typeof NAV_SCREENS)[number];

/** The groups of option 3: Adventure holds the three places that go out and fight. */
export const ADVENTURE: readonly Tab[] = ['expeditions', 'dungeon', 'raid'];
