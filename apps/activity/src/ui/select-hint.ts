/**
 * The one-time hint over a list where several things can be selected (decisions.md, 2026-10-27, "Bulk selection
 * replaces marking"; shared since 2026-10-28). It names the gesture that starts a selection on this device: a press
 * and hold on a touch screen, a click on the box in a tile's corner with a mouse. Each list has its own `SelectHint`
 * (a storage key and its words). It is gone for good on this device once the player dismisses it or selects
 * anything, with a flag in `localStorage` (a local convenience, nothing is sent to the server). Storage can be
 * missing, full or blocked (Discord's embedded frame, private modes), so every read and write is wrapped: if storage
 * throws, the hint still shows and stays hidden for the rest of the session once dismissed, and nothing breaks (the
 * same rule as `coach.ts`).
 */

/** One list's hint: where its flag lives and its two wordings. */
export interface SelectHint {
  /** The `localStorage` key of the flag ("lc.<list>-select-hint.v1"). Never reuse one for another list. */
  key: string;
  /** The words for a finger ("Press and hold an item to select several"). */
  touch: string;
  /** The words for a mouse ("Click the box on an item to select several"). */
  mouse: string;
}

/** Where the flag lives. A function, because even touching `window.localStorage` can throw. */
export type StorageGetter = () => Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage: StorageGetter = () => window.localStorage;

/** The hints retired in this session, so a storage that cannot remember does not bring one back at once. */
const retiredThisSession = new Set<string>();

/** Forgets the in-memory flags (tests only). */
export function resetSelectHintSession(): void {
  retiredThisSession.clear();
}

/** True when the hint was dismissed before (or earlier in this session). False if storage throws. */
export function selectHintRetired(
  hint: SelectHint,
  getStorage: StorageGetter = browserStorage,
): boolean {
  if (retiredThisSession.has(hint.key)) return true;
  try {
    return getStorage().getItem(hint.key) === '1';
  } catch {
    return false;
  }
}

/** Retires the hint for good (dismissed, or the player selected something). Never throws. */
export function retireSelectHint(
  hint: SelectHint,
  getStorage: StorageGetter = browserStorage,
): void {
  retiredThisSession.add(hint.key);
  try {
    getStorage().setItem(hint.key, '1');
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
export function selectHintText(hint: SelectHint, mouse: boolean = hasMousePointer()): string {
  return mouse ? hint.mouse : hint.touch;
}
