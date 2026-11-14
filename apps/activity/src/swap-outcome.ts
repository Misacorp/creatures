/**
 * How a swap request you asked went (combat v2, B4): the words of the one-time note the asker sees, and which notes they have already
 * seen. The server keeps a week's settled requests (`SwapsV2.settled`); this remembers the seen ids in `localStorage` (guarded as in
 * `wipe-notice.ts`: inside Discord the storage may be blocked, then a note simply shows again next session, which is harmless).
 */
import { placeTextV2, type GridV2 } from './raid-board-v2';
import type { SettledSwapV2 } from './raid-v2-api';
import { browserStorage, type NoticeStorage } from './wipe-notice';

export const SWAP_SEEN_KEY = 'creatures:raid-swap-outcomes-seen';

const nameOf = (c: SettledSwapV2['creatureA']): string => c?.name ?? 'an empty slot';

/**
 * The note for a settled request, in plain words: "Mira accepted: Emberkit and Lanternfin swapped places.", "Mira declined your swap of
 * Emberkit for Lanternfin.", or "Your request to Mira ended: the board changed or the stage began." The request names the creatures
 * as they were asked (`creatureA` is yours, or the one asked to move).
 */
export function settledText(request: SettledSwapV2, grid: GridV2): string {
  const { creatureA, creatureB } = request;
  const move = creatureB === null;
  if (request.status === 'accepted') {
    return move
      ? `${request.to} accepted: ${nameOf(creatureA)} moved to ${placeTextV2(request.slotB, grid)}.`
      : `${request.to} accepted: ${nameOf(creatureA)} and ${nameOf(creatureB)} swapped places.`;
  }
  if (request.status === 'declined') {
    return move
      ? `${request.to} declined to move ${nameOf(creatureA)} to ${placeTextV2(request.slotB, grid)}.`
      : `${request.to} declined your swap of ${nameOf(creatureA)} for ${nameOf(creatureB)}.`;
  }
  return `Your request to ${request.to} ended: the board changed or the stage began.`;
}

/** The ids of the outcomes already shown and closed. Anything unreadable counts as none. */
export function seenSwapIds(storage: NoticeStorage | null = browserStorage()): Set<string> {
  if (storage === null) return new Set();
  try {
    const raw = storage.getItem(SWAP_SEEN_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

/** Remembers that an outcome was seen (the newest 50 are kept). Returns false when the storage refused. */
export function markSwapSeen(
  id: string,
  storage: NoticeStorage | null = browserStorage(),
): boolean {
  if (storage === null) return false;
  try {
    const all = [...seenSwapIds(storage).add(id)].slice(-50);
    storage.setItem(SWAP_SEEN_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** The settled requests the asker has not closed yet. */
export const unseenSwaps = (
  settled: readonly SettledSwapV2[],
  seen: ReadonlySet<string>,
): SettledSwapV2[] => settled.filter((r) => !seen.has(r.id));
