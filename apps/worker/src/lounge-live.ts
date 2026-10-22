/**
 * The lounge's push (`docs/design/lounge-live.md`): when a player changes something the living room
 * shows, their new room entry goes to the other lounge sockets of the guild. The sockets themselves,
 * tickets and caps are in `live-socket.ts`. Only sockets whose topic is the lounge are ever written to.
 */
import type { Resident } from './lounger';
import { LiveSockets, type LiveMessage } from './live-socket';
import { LOUNGE_TOPIC } from './live-topic';

export interface LoungePushDeps {
  sockets: LiveSockets;
  /** The room view of one player, or null when they are not a resident (no starter yet). */
  residentOf: (userId: string) => Resident | null;
}

/** Remembered last pushes per player, so a request that changed nothing pushes nothing. */
const LAST_SENT_MAX = 500;

export class LoungePush {
  private readonly lastSent = new Map<string, string>();

  constructor(private readonly deps: LoungePushDeps) {}

  /**
   * `userId` has just made a change. If anyone is listening, their room view is read and sent to every
   * lounge socket of this guild, unless it is the same as the last one sent. Never throws.
   */
  notify(userId: string): void {
    const { sockets } = this.deps;
    if (!sockets.enabled('lounge')) return;
    // Not to the sender's own sockets: their client draws their creature from its own state.
    const own = new Set(sockets.socketsOfUser(userId));
    const listening = sockets.openSockets(LOUNGE_TOPIC).filter((ws) => !own.has(ws));
    if (listening.length === 0) return;
    const resident = this.deps.residentOf(userId);
    if (resident === null) return;
    const payload = JSON.stringify({ v: 1, type: 'resident', resident } satisfies LiveMessage);
    if (this.lastSent.get(userId) === payload) return;
    if (this.lastSent.size >= LAST_SENT_MAX) this.lastSent.clear();
    this.lastSent.set(userId, payload);
    for (const ws of listening) sockets.send(ws, payload);
  }
}
