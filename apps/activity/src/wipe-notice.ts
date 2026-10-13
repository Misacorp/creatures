/**
 * The one-time notice after expeditions v2 started everyone over with one slot: trips in slots 2 and 3
 * were called home and their Bait given back. The server keeps the cancelled trips in the state; the
 * notice remembers which ones the player has seen in `localStorage` (guarded: inside Discord the
 * storage may be blocked, then it simply shows again next session, which is harmless).
 */
import type { Creature } from './api';
import type { CancelledTrip } from './expedition-types';
import { creatureName } from './game';
import { destinationName } from './trip-view';

export const WIPE_NOTICE_KEY = 'creatures:expeditions-v2-notice';

/** The notice's text, friendly and short. */
export const WIPE_NOTICE_TEXT =
  'Expeditions got bigger: everyone starts with one slot. Your trips in slots 2–3 were called home and their Bait refunded.';

/** The part of the Web Storage API the notice uses (so tests can pass a fake). */
export interface NoticeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's storage, or null where it is missing or blocked. */
export function browserStorage(): NoticeStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The ids of the cancelled trips whose notice was already seen. Anything unreadable counts as none. */
export function seenIds(storage: NoticeStorage | null): Set<string> {
  if (storage === null) return new Set();
  try {
    const raw = storage.getItem(WIPE_NOTICE_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

/** The cancelled trips the player has not been told about yet. */
export function unseenCancelled(
  cancelled: readonly CancelledTrip[],
  seen: ReadonlySet<string>,
): CancelledTrip[] {
  return cancelled.filter((c) => !seen.has(c.id));
}

/** Remembers that these trips were seen. Returns false when the storage refused (nothing is kept). */
export function markSeen(storage: NoticeStorage | null, trips: readonly CancelledTrip[]): boolean {
  if (storage === null) return false;
  try {
    const all = new Set([...seenIds(storage), ...trips.map((t) => t.id)]);
    storage.setItem(WIPE_NOTICE_KEY, JSON.stringify([...all]));
    return true;
  } catch {
    return false;
  }
}

/** "Cindle at the Old Crossroads": who was called home from where. Text only. */
export function cancelledLine(trip: CancelledTrip, creatures: readonly Creature[]): string {
  const creature = creatures.find((c) => c.id === trip.creatureId);
  const who = creature === undefined ? 'A creature' : creatureName(creature);
  return `${who} at ${destinationName(trip.destination)}`;
}
