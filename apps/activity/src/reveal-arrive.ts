/**
 * Where the page goes when a reveal card appears (a claimed trip or job). The claim button that was
 * pressed is gone by then and the card is at the top of its tab, so without help the page stays
 * wherever it was. Decisions only: the card does the scrolling and the focusing.
 */

/** How much of the card has to be on screen, from its top edge down, to count as seen. */
export const MIN_VISIBLE_PX = 48;

/** A fresh card whose top is already this close to the top of the screen is not moved (no jiggle). */
export const TOP_SLACK_PX = 4;

/** How long a claim's "fresh" mark lives: a claim whose card never came is forgotten after this. */
export const FRESH_TTL_MS = 10_000;

let freshAt: number | null = null;

/** Called by a claim action: the reveal card that mounts next arrived from this claim. */
export function markFreshReveal(now: number = Date.now()): void {
  freshAt = now;
}

/** True once for the card that mounts after a claim (and not after the mark has gone stale); clears the mark. */
export function consumeFreshReveal(now: number = Date.now()): boolean {
  const fresh = freshAt !== null && now - freshAt <= FRESH_TTL_MS;
  freshAt = null;
  return fresh;
}

/**
 * True when the page should bring the card to the top of the screen. A card that just arrived from a
 * claim (`fresh`) always goes to the top unless it is already there. Any other card (coming back to a
 * tab with a reveal still open) is left alone while its top edge is on screen. `top` is the card's
 * distance from the top of the viewport.
 */
export function shouldScrollToCard(top: number, viewportHeight: number, fresh = false): boolean {
  if (fresh) return Math.abs(top) > TOP_SLACK_PX;
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
