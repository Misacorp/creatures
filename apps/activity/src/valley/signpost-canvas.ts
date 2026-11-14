/**
 * The Signpost's small pure parts (`SignpostCanvas.tsx`). The place is the expedition map alone (Misa, 2026-11-15: a click on the
 * Signpost opens the map directly; the road scene with the seats is gone), so what is left here is what the map's packs button says.
 */
import type { ValleySeatView } from '@creatures/game';

/** The finds waiting in all the packs: how many seats have a full pack (the packs button's count). */
export function fullPackCount(seats: readonly ValleySeatView[]): number {
  return seats.filter((s) => s.creatureId !== null && s.store.full).length;
}
