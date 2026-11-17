/**
 * Whether the keyboard put the focus where it is now (the element matches `:focus-visible`, the only case the
 * game draws a focus ring for). A drawer or a popover asks this when it opens: only a keyboard user gets the
 * focus back on the control that opened it when it closes. After a tap or a click (or an action) nothing is
 * focused again, so no ring is left on the control just left (Misa, 2026-11-05: rings detract from the game;
 * they are for Tab navigation only).
 */
export function keyboardHasFocus(): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body) return false;
  if (typeof active.matches !== 'function') return false;
  try {
    return active.matches(':focus-visible');
  } catch {
    return false;
  }
}

/** Whether the last thing the player did was press a key (not a click or a tap). Tracked from the first import on. */
let lastInputWasKeyboard = false;
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener(
    'keydown',
    () => {
      lastInputWasKeyboard = true;
    },
    true,
  );
  document.addEventListener(
    'pointerdown',
    () => {
      lastInputWasKeyboard = false;
    },
    true,
  );
}

/**
 * Whether the player arrived by keyboard. For a control that takes the focus by script when a page opens, after the control that was
 * clicked is already gone (so `keyboardHasFocus` has nothing to read): only then may the focus show a ring there.
 */
export function arrivedByKeyboard(): boolean {
  return keyboardHasFocus() || lastInputWasKeyboard;
}
