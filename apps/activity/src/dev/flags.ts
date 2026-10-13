/**
 * "Reset local flags": forgets what this browser remembers about the player having seen things (the
 * Raid tab's tag hint and the slot-wipe notice), so they show again. The welcome kit is not a local
 * flag: the server gives it once per player, and "Reset my account" is what brings it back.
 */
import { COACH_KEY, resetCoachSession } from '../coach';
import { WIPE_NOTICE_KEY } from '../wipe-notice';

/** The part of the Web Storage API this needs (so a test can pass a fake). */
export interface FlagStorage {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

/** Keys of every "seen it" flag the app keeps, and the prefixes the app uses for its own keys. */
export const LOCAL_FLAG_KEYS: readonly string[] = [COACH_KEY, WIPE_NOTICE_KEY];
export const LOCAL_FLAG_PREFIXES: readonly string[] = ['lc.', 'creatures:'];

/** The browser's storage, or null where it is missing or blocked. */
function browserStorage(): FlagStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Removes the local flags. Returns how many keys it removed. Never throws. */
export function resetLocalFlags(storage: FlagStorage | null = browserStorage()): number {
  resetCoachSession();
  if (storage === null) return 0;
  try {
    const keys = new Set<string>(LOCAL_FLAG_KEYS);
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key !== null && LOCAL_FLAG_PREFIXES.some((p) => key.startsWith(p))) keys.add(key);
    }
    let removed = 0;
    for (const key of keys) {
      storage.removeItem(key);
      removed += 1;
    }
    return removed;
  } catch {
    return 0;
  }
}
