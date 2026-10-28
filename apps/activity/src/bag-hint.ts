/**
 * The one-time hint over the bag's grid about selecting several items (decisions.md, 2026-10-27, "Bulk selection
 * replaces marking"). It names the gesture that starts a selection on this device: a press and hold on a touch
 * screen, a click on the box in the tile's corner with a mouse. It is gone for good on this device once the player dismisses it or
 * selects anything, with a flag in `localStorage` (a local convenience, nothing is sent to the server). Storage can
 * be missing, full or blocked (Discord's embedded frame, private modes), so every read and write is wrapped: if
 * storage throws, the hint still shows and stays hidden for the rest of the session once dismissed, and nothing
 * breaks (the same rule as `coach.ts`).
 */

export const BAG_HINT_KEY = 'lc.bag-select-hint.v1';

export const BAG_HINT_TOUCH = 'Press and hold an item to select several';
export const BAG_HINT_POINTER = 'Click the box on an item to select several';

/** Where the flag lives. A function, because even touching `window.localStorage` can throw. */
export type StorageGetter = () => Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage: StorageGetter = () => window.localStorage;

/** Set when the hint is retired, so a storage that cannot remember does not bring it back at once. */
let retiredThisSession = false;

/** Forgets the in-memory flag (tests only). */
export function resetBagHintSession(): void {
  retiredThisSession = false;
}

/** True when the hint was dismissed before (or earlier in this session). False if storage throws. */
export function bagHintRetired(getStorage: StorageGetter = browserStorage): boolean {
  if (retiredThisSession) return true;
  try {
    return getStorage().getItem(BAG_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Retires the hint for good (dismissed, or the player selected something). Never throws. */
export function retireBagHint(getStorage: StorageGetter = browserStorage): void {
  retiredThisSession = true;
  try {
    getStorage().setItem(BAG_HINT_KEY, '1');
  } catch {
    // Storage is unavailable: the in-memory flag still hides it for this session.
  }
}

/**
 * Whether this device has a precise hovering pointer (a mouse): the hint then names the box, otherwise the
 * press and hold. Where `matchMedia` is missing it is a touch device.
 */
export function hasMousePointer(): boolean {
  try {
    return (
      typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches
    );
  } catch {
    return false;
  }
}

/** The hint's words for this device. */
export function bagHintText(mouse: boolean = hasMousePointer()): string {
  return mouse ? BAG_HINT_POINTER : BAG_HINT_TOUCH;
}
