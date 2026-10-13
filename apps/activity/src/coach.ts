/**
 * The one-time "Tap any tag to learn what it means" hint on the Raid tab. Dismissed forever with a
 * flag in `localStorage`, a local convenience only (nothing is sent to the server). Storage can be
 * missing, full or blocked (Discord's embedded frame, private modes), so every read and write is
 * wrapped: if storage throws, the hint still shows (and hides for the rest of the session once
 * dismissed) and nothing breaks.
 */

export const COACH_KEY = 'lc.coach.tags.v1';
export const COACH_TEXT = 'Tap any tag to learn what it means';

/** Where the flag lives. A function, because even touching `window.localStorage` can throw. */
export type StorageGetter = () => Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage: StorageGetter = () => window.localStorage;

/** Set when the hint is dismissed, so a storage that cannot remember does not bring it back at once. */
let dismissedThisSession = false;

/** Forgets the in-memory flag (tests only). */
export function resetCoachSession(): void {
  dismissedThisSession = false;
}

/** True when the hint was dismissed before (or earlier in this session). False if storage throws. */
export function coachDismissed(getStorage: StorageGetter = browserStorage): boolean {
  if (dismissedThisSession) return true;
  try {
    return getStorage().getItem(COACH_KEY) === '1';
  } catch {
    return false;
  }
}

/** Dismisses the hint for good. Never throws. */
export function dismissCoach(getStorage: StorageGetter = browserStorage): void {
  dismissedThisSession = true;
  try {
    getStorage().setItem(COACH_KEY, '1');
  } catch {
    // Storage is unavailable: the in-memory flag still hides it for this session.
  }
}
