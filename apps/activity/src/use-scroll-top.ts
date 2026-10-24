import { useEffect, useRef } from 'preact/hooks';
import { scrollToTop } from './scroll-to';

/**
 * Jumps the page (the window: nothing else scrolls the game) to its top whenever `place` changes, so a
 * tap on the dock, a tray, the rail or a Home notice always lands at the top of that page, not wherever
 * the last one was scrolled to (Misa, 2026-10-24). Instant, not smooth. Not on the first render.
 */
export function useScrollTopOnChange(place: string): void {
  const previous = useRef(place);
  useEffect(() => {
    if (previous.current === place) return;
    previous.current = place;
    scrollToTop();
  }, [place]);
}
