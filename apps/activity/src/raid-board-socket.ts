/**
 * The Raid tab's live socket (`docs/design/raid-live-board.md`): `live-socket.ts` pointed at the raid
 * board's ticket and address. A pushed `raid` message goes through `parseBoardPush` and is applied to the
 * view on screen in place (`applyBoardPush`). A message that is junk, or cannot be applied to what is
 * shown, costs one normal reload, and so does a socket that comes back after a drop (pushes may have been
 * missed meanwhile). With the socket down nothing else changes: no polling is added.
 */
import { fetchRaidBoardTicket, raidBoardSocketUrl } from './api';
import {
  browserSocket,
  createLiveSocket,
  type LiveSocket,
  type LiveSocketDeps,
} from './live-socket';
import { applyBoardPush, parseBoardPush } from './raid-board-live';
import type { RaidView } from './raid-api';

export interface RaidBoardSocketDeps extends Partial<Omit<LiveSocketDeps, 'onLive' | 'onMessage'>> {
  /** The party whose board to listen to (the server checks that the raid view would show it to this player). */
  week: string;
  party: number;
  /** The raid view on screen right now, or null before it has loaded. */
  current: () => RaidView | null;
  /** Shows a view the push produced (the caller keeps its server clock offset). */
  show: (view: RaidView) => void;
  /** Loads the raid view again (`fetchRaid`); the caller runs one at a time. */
  reload: () => void;
}

export function createRaidBoardSocket(deps: RaidBoardSocketDeps): LiveSocket {
  const { week, party, current, show, reload, ...overrides } = deps;
  let wasLive = false;
  let dropped = false;
  return createLiveSocket({
    getTicket: () => fetchRaidBoardTicket(week, party),
    url: (ticket) => raidBoardSocketUrl(ticket, window.location),
    createSocket: browserSocket,
    ...overrides,
    onLive: (live) => {
      if (live && dropped) {
        // Back after a drop: what happened meanwhile was not pushed to us.
        dropped = false;
        reload();
      }
      if (!live && wasLive) dropped = true;
      wasLive = live;
    },
    onMessage: (message) => {
      if (message.type !== 'raid') return;
      const push = parseBoardPush(message.push);
      const view = current();
      const applied = push === null || view === null ? null : applyBoardPush(view, push);
      if (applied === null) {
        reload();
        return;
      }
      show(applied);
    },
  });
}
