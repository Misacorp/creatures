/**
 * Scrolling the page to an element, kindly: smooth unless the player prefers reduced motion. Guarded, so
 * it does nothing where the browser lacks the API (and in the tests).
 */

/** "smooth", or "auto" (a jump) for a player who prefers reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
  } catch {
    return 'auto';
  }
}

/** Scrolls the element to the top of the view and moves focus to it (without a second scroll). */
export function scrollAndFocus(element: HTMLElement | null): boolean {
  if (element === null) return false;
  if (typeof element.focus === 'function') element.focus({ preventScroll: true });
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
  }
  return true;
}
