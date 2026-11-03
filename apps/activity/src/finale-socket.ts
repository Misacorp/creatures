/**
 * The finale screen's live socket (`docs/design/finale-live.md`): `live-socket.ts` pointed at the
 * finale's ticket and address, with every pushed finale snapshot checked by `parseLiveSnapshot` (the
 * same check a polled one gets) and handed to the poller, and the socket's live/not-live state telling
 * the poller whether to poll slowly or at the normal pace. Pushes of other kinds are ignored.
 */
import { fetchFinaleTicket, finaleSocketUrl } from './api';
import type { PollSnapshot } from './live';
import { parseLiveSnapshot, type LiveSnapshot } from './live-api';
import {
  browserSocket,
  createLiveSocket,
  type LiveSocket,
  type LiveSocketDeps,
} from './live-socket';
import type { FinalePoller } from './finale-poller';

export interface FinaleSocketDeps<S extends PollSnapshot = LiveSnapshot>
  extends Partial<Omit<LiveSocketDeps, 'onLive' | 'onMessage'>> {
  /** The party whose finale to listen to (the server checks that the player is in it). */
  week: string;
  party: number;
  poller: Pick<FinalePoller<S>, 'push' | 'setLive'>;
}

/** The finale's socket for the shipped rules: its snapshots are checked by `parseLiveSnapshot`. */
export function createFinaleSocket(deps: FinaleSocketDeps): LiveSocket {
  return createFinaleSocketWith(parseLiveSnapshot, deps);
}

/** The finale's socket for any snapshot shape (combat v2 brings its own): each pushed snapshot goes through `parse`. */
export function createFinaleSocketWith<S extends PollSnapshot>(
  parse: (data: unknown) => S,
  deps: FinaleSocketDeps<S>,
): LiveSocket {
  const { week, party, poller, ...overrides } = deps;
  return createLiveSocket({
    getTicket: () => fetchFinaleTicket(week, party),
    url: (ticket) => finaleSocketUrl(ticket, window.location),
    createSocket: browserSocket,
    ...overrides,
    onLive: (live) => {
      poller.setLive(live);
    },
    onMessage: (message) => {
      if (message.type !== 'finale') return;
      try {
        poller.push(parse(message.snapshot));
      } catch {
        // Not a snapshot we understand: the poll covers it.
      }
    },
  });
}
