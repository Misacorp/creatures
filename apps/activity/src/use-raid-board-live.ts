/**
 * Keeps the raid board's live socket (`raid-board-socket.ts`) open for as long as the Raid tab shows a
 * party's board: opened when the server offers it, a party is shown and nothing else has taken the tab
 * (the finale), closed when the tab is left (the component unmounts) or the party changes. The handlers
 * are read through refs, so the socket (opened once per party) never calls a stale one.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { RaidView } from './raid-api';
import { createRaidBoardSocket } from './raid-board-socket';

export interface RaidBoardLiveInputs {
  /** The server offers the socket (`/api/config`'s `raidLive`). */
  offered: boolean;
  /** The tab is showing its board (loaded, the finale is not on). */
  open: boolean;
  week: string | null;
  party: number | null;
  /** The raid view on screen right now. */
  current: () => RaidView | null;
  /** Shows a view the push produced. */
  show: (view: RaidView) => void;
  /** Loads the raid view again, once (the caller dedupes). */
  reload: () => void;
}

export function useRaidBoardLive(inputs: RaidBoardLiveInputs): void {
  const latest = useRef(inputs);
  latest.current = inputs;
  const { offered, open, week, party } = inputs;
  useEffect(() => {
    if (!offered || !open || week === null || party === null) return undefined;
    const socket = createRaidBoardSocket({
      week,
      party,
      current: () => latest.current.current(),
      show: (view) => {
        latest.current.show(view);
      },
      reload: () => {
        latest.current.reload();
      },
    });
    socket.start();
    return () => {
      socket.stop();
    };
  }, [offered, open, week, party]);
}
