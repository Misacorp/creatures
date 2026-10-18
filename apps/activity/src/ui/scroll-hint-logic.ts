/**
 * The rules of the scroll hint (`use-scroll-hint.ts`, `ScrollHint.tsx`), as plain functions so they can be
 * tested without a browser: when a box overflows, how far it moves in a frame, and which scrolls are the
 * hint's own. No drawing here.
 */

/** How long a box rests before the hint starts to move it. */
export const SCROLL_HINT_DELAY_MS = 2500;

/** How fast the hint moves the content, in CSS pixels a second (slow on purpose: a hint, not a scroll). */
export const SCROLL_HINT_SPEED = 12;

/** The user touches the box in one of these ways: the hint is over for that content. */
export const SCROLL_HINT_INTERACTIONS = [
  'pointerdown',
  'touchstart',
  'wheel',
  'keydown',
  'focusin',
] as const;

/** The part of an element the rules read. */
export interface ScrollBox {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}

/** How far the box can scroll (0 when its content fits). */
export function maxScroll(box: Pick<ScrollBox, 'scrollHeight' | 'clientHeight'>): number {
  return Math.max(0, box.scrollHeight - box.clientHeight);
}

/** True when there is more content than room (a pixel of rounding does not count). */
export function overflows(box: Pick<ScrollBox, 'scrollHeight' | 'clientHeight'>): boolean {
  return maxScroll(box) > 1;
}

/** True while there is more to see below the visible part. */
export function hasMoreBelow(box: ScrollBox): boolean {
  return maxScroll(box) - box.scrollTop > 2;
}

/**
 * Where the content is after a frame: `speed` pixels a second for `elapsedMs`, never up and never past
 * `max`. A long gap (a hidden tab) counts as at most a tenth of a second, so the content never jumps.
 */
export function nextScrollTop(
  position: number,
  elapsedMs: number,
  speed: number,
  max: number,
): number {
  const step = (Math.min(Math.max(elapsedMs, 0), 100) * speed) / 1000;
  return Math.min(max, Math.max(position, position + step));
}

/** A scroll the hint did not cause: the box is not where the hint last put it (the box rounds, so a little off is its own). */
export function isOwnScroll(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 1.5;
}
