import { useRef, useState } from 'preact/hooks';
import type { GearItem } from './gear-types';

/**
 * The marks of the bag's selection mode, quick to tap. A tap shows its mark at once and the request goes out in
 * the background, one at a time (the action runner turns a second request away while one runs, so taps made
 * meanwhile wait here and go out together, the ones that mean the same together). The server stays the truth:
 * when an answer arrives the screen holds the server's marks again, and a request that failed (or was turned
 * away) simply stops overriding, so the item shows what the server says. `pending` is true while any tap has
 * not been answered yet.
 */
export function useMarks(mark: (itemIds: readonly string[], on: boolean) => Promise<unknown>): {
  /** Whether the item shows as marked (the player's latest tap, else the server's mark). */
  isMarked: (item: Pick<GearItem, 'id' | 'markedForDismantle'>) => boolean;
  /** Mark or unmark these items. */
  set: (itemIds: readonly string[], on: boolean) => void;
  pending: boolean;
} {
  const [wanted, setWanted] = useState<ReadonlyMap<string, boolean>>(new Map());
  const queue = useRef(new Map<string, boolean>());
  const sending = useRef(false);

  const flush = async (): Promise<void> => {
    if (sending.current) return;
    sending.current = true;
    try {
      while (queue.current.size > 0) {
        const [, on] = queue.current.entries().next().value as [string, boolean];
        const ids = [...queue.current].filter(([, v]) => v === on).map(([id]) => id);
        for (const id of ids) queue.current.delete(id);
        await mark(ids, on);
        // The answer replaced the screen's marks (or an error was shown): stop overriding these items,
        // unless the player tapped one again while the request was out.
        setWanted((prev) => {
          const next = new Map(prev);
          for (const id of ids) {
            if (!queue.current.has(id) && next.get(id) === on) next.delete(id);
          }
          return next;
        });
      }
    } finally {
      sending.current = false;
    }
  };

  return {
    isMarked: (item) => wanted.get(item.id) ?? item.markedForDismantle,
    set: (itemIds, on) => {
      if (itemIds.length === 0) return;
      for (const id of itemIds) queue.current.set(id, on);
      setWanted((prev) => {
        const next = new Map(prev);
        for (const id of itemIds) next.set(id, on);
        return next;
      });
      void flush();
    },
    pending: wanted.size > 0,
  };
}
