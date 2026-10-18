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

/**
 * Scrolls the element to the top of the view and moves focus to it (without a second scroll). Smooth by
 * default; pass "auto" for a jump.
 */
export function scrollAndFocus(
  element: HTMLElement | null,
  behavior: ScrollBehavior = scrollBehavior(),
): boolean {
  if (element === null) return false;
  if (typeof element.focus === 'function') element.focus({ preventScroll: true });
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'start', behavior });
  }
  return true;
}

/** How far the page is scrolled down (0 where there is no window, as in the tests' fake DOM). */
export function pageScrollY(): number {
  return typeof window === 'undefined' ? 0 : window.scrollY;
}

/** Jumps the page to this scroll position (no glide). Guarded like the rest. */
export function scrollPageTo(top: number): void {
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo({ top, left: 0, behavior: 'auto' });
  }
}

/** Jumps to the top of the page. */
export function scrollToTop(): void {
  scrollPageTo(0);
}
