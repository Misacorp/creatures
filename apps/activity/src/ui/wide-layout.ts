import { useMediaQuery } from '../hooks';

/**
 * The width from which a screen has a side panel beside its main area (and the app card widens,
 * `side-panel.css`); below it the panel's content goes under the main area or into a sheet. One width for
 * every screen that uses `WideLayout` (the Expeditions world map, the Valley Games show).
 */
export const WIDE_QUERY = '(min-width: 60rem)';

/** Whether the window is at least `WIDE_QUERY` wide (live). */
export function useWide(): boolean {
  return useMediaQuery(WIDE_QUERY);
}
