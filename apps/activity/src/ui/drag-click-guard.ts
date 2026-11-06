/**
 * The click that ends a drag is not a tap (Misa, 2026-11-06: a popover must open on a click, never after a drag).
 * Every draggable calls `swallowNextClick()` the moment a drag it started ends: the one click the browser sends
 * right after the release is stopped before it reaches anything, wherever it lands and even if the element that
 * was dragged has been drawn again by then. A click that never comes (released over another element) costs
 * nothing: the guard lets go after `GUARD_MS`, so the next real tap works. The own click handlers of
 * `useDragDrop`, the Paddock's `Draggable` and `useDragScroll` stay as a second line.
 */

/** The click follows the release in the same task; this is only the longest the guard waits for it. */
export const GUARD_MS = 60;

/** What the guard needs of the window: tests pass a plain `EventTarget`. */
export type ClickTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

const CAPTURE = { capture: true };

export function swallowNextClick(target: ClickTarget = window): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const release = (): void => {
    target.removeEventListener('click', onClick, CAPTURE);
    if (timer !== null) clearTimeout(timer);
  };
  function onClick(event: Event): void {
    release();
    event.stopPropagation();
    event.preventDefault();
  }
  target.addEventListener('click', onClick, CAPTURE);
  timer = setTimeout(release, GUARD_MS);
}
