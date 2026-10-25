import { useMediaQuery } from '../hooks';

/**
 * The width from which a screen has a side panel beside its main area (and the app card widens,
 * `side-panel.css`); below it the panel's content goes under the main area or into a sheet. One width for
 * every screen that uses `WideLayout` (the Expeditions world map, the Valley Games show).
 */
export const WIDE_QUERY = '(min-width: 60rem)';

/**
 * The width from which the main navigation, below `WIDE_QUERY`, is one bottom bar with every place in a row
 * instead of the phone's three-button dock with sub-menus (decisions.md 2026-10-25: measured, the longest word,
 * "Expeditions", fits its share of the bar from about 600 px and has room to breathe from 720 px). Each place
 * added to the navigation needs about 80 px more, so this moves up with it.
 */
export const BAR_QUERY = '(min-width: 45rem)';

/** Whether the window is at least `BAR_QUERY` wide (live). */
export function useBar(): boolean {
  return useMediaQuery(BAR_QUERY);
}

/** Whether the window is at least `WIDE_QUERY` wide (live). */
export function useWide(): boolean {
  return useMediaQuery(WIDE_QUERY);
}
