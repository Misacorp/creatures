/**
 * Where the page goes when a reveal card appears (a claimed trip or job). The claim button that was
 * pressed is gone by then and the card is at the top of its tab, so without help the page stays
 * wherever it was. Decisions only: the card does the scrolling and the focusing.
 */

/** How much of the card has to be on screen, from its top edge down, to count as seen. */
export const MIN_VISIBLE_PX = 48;

/**
 * True when the card's top edge is not in view, so the page should bring it to the top of the screen.
 * A card whose top is already on screen is left alone (coming back to a tab with a reveal still open
 * must not move the page). `top` is the card's distance from the top of the viewport.
 */
export function shouldScrollToCard(top: number, viewportHeight: number): boolean {
  return top < 0 || top > viewportHeight - MIN_VISIBLE_PX;
}

/** How the page scrolls to the card: smoothly, or at once for a player who asks for less motion; the card's top goes to the top. */
export function arriveScroll(reducedMotion: boolean): ScrollIntoViewOptions {
  return { behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' };
}

/**
 * True when focus should move to the card: focus is nowhere (on the page itself, or on an element
 * that has since left it, such as the claim button that was pressed). Focus that sits on something
 * still on the page, such as the tab button just used, stays where it is.
 */
export function shouldFocusCard(active: { isConnected: boolean } | null, page: unknown): boolean {
  return active === null || active === page || !active.isConnected;
}
