/**
 * A button that answers a finger at once: the action runs on the touch's pointer down, not on the click that
 * follows it. On a phone a tap while a list is still gliding (momentum scrolling) only stops the glide, and the
 * browser sends no click, so a click-only button seemed dead until the page stood still (Misa, 2026-10-25).
 * A mouse, the keyboard (Enter, Space) and assistive tech still act on the click as before.
 *
 * After a touch press, the one click that may follow it is swallowed wherever it lands: on the button itself
 * (the action already ran) or on whatever now lies under the finger (a tray that closed, a new page). The guard
 * ends at the next press or after a short while, so it never eats a later, real tap.
 *
 * Only for buttons that sit still while the page scrolls (the dock, its trays, the HUD): a press on something
 * inside the scrolling page would fire at the start of a scroll gesture.
 */

/** How long after a touch press its trailing click may still come. */
const CLICK_AFTER_PRESS_MS = 800;

const CAPTURE = { capture: true } as const;

let disarm: (() => void) | null = null;

/** Swallows the next click on the page, until the next press or `CLICK_AFTER_PRESS_MS`. */
function swallowNextClick(): void {
  disarm?.();
  if (typeof window === 'undefined') return;
  const swallow = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    end();
  };
  const timer = window.setTimeout(end, CLICK_AFTER_PRESS_MS);
  function end(): void {
    window.clearTimeout(timer);
    window.removeEventListener('click', swallow, CAPTURE);
    window.removeEventListener('pointerdown', end, CAPTURE);
    if (disarm === end) disarm = null;
  }
  window.addEventListener('click', swallow, CAPTURE);
  // Added while this press is being dispatched, so it first hears the next press.
  window.addEventListener('pointerdown', end, CAPTURE);
  disarm = end;
}

export interface InstantPressProps {
  onPointerDown: (event: PointerEvent) => void;
  onClick: () => void;
}

/** The handlers to spread on a `<button>`: `action` runs once per press, as early as the input allows. */
export function instantPress(action: () => void): InstantPressProps {
  return {
    onPointerDown: (event) => {
      if (event.pointerType === 'mouse' || event.button > 0) return;
      swallowNextClick();
      action();
    },
    onClick: action,
  };
}
