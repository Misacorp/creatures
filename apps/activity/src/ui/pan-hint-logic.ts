/**
 * The rules of `ui/PanHint`, the one cue that a map pans sideways: which edges still have more to see, and
 * which maps the player has already learned (Misa, 2026-11-06: one hint, the same on every scrolling map).
 * Pure, so the rules are tested without a browser.
 */

/** Pixels of slack: sub-pixel scroll positions must not count as "more". */
const SLACK = 2;
/** A box that overflows by less than this (padding, a ring's room) does not pan in any way worth a hint. */
export const MIN_OVERFLOW = 16;
/** How far (px) a map must move from where it was drawn before the player is taken to have scrolled it. */
export const MOVED_PX = 8;
/** A scroll counts as the player's own when a pointer, wheel, touch or key was used this recently (ms). */
export const INPUT_WINDOW_MS = 1500;

export interface Edges {
  left: boolean;
  right: boolean;
}

/** Which edges have more to see: nothing when the box fits (a desktop width), both once it is in the middle. */
export function edgesWithMore(scrollLeft: number, clientWidth: number, scrollWidth: number): Edges {
  if (scrollWidth - clientWidth < MIN_OVERFLOW) return { left: false, right: false };
  return {
    left: scrollLeft > SLACK,
    right: scrollLeft + clientWidth < scrollWidth - SLACK,
  };
}

/** True when a scroll event is the player's doing: input came lately and the box has moved far enough. */
export function playerScrolled(
  now: number,
  lastInput: number | null,
  startLeft: number,
  scrollLeft: number,
): boolean {
  if (lastInput === null || now - lastInput > INPUT_WINDOW_MS) return false;
  return Math.abs(scrollLeft - startLeft) >= MOVED_PX;
}

/** The maps learned in this session (a page load): once scrolled, a map's hint does not come back. */
const learned = new Set<string>();

export function isLearned(id: string): boolean {
  return learned.has(id);
}

export function markLearned(id: string): void {
  learned.add(id);
}

/** For tests only: forget every map. */
export function forgetAll(): void {
  learned.clear();
}
