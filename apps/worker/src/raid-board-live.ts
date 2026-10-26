/**
 * The raid board's push (`docs/design/raid-live-board.md`): when a player's placement changed their
 * party's board, the party's other raid-board sockets get one small message with just the changed cells
 * (and a roster change if someone joined or left). It never rebuilds the view and builds nothing when
 * nobody listens. Only sockets whose topic is that party's raid board are written to; the actor's own
 * sockets are skipped (their HTTP answer carries the change). No timer, no alarm: the object can sleep.
 */
import type { BoardPush } from './raid-board-change';
import { LiveSockets, socketIdentity, type LiveMessage } from './live-socket';
import type { Topic } from './live-topic';

type RaidTopic = Extract<Topic, { kind: 'raid' }>;

export interface RaidPushDeps {
  sockets: LiveSockets;
}

export class RaidPush {
  constructor(private readonly deps: RaidPushDeps) {}

  /** The party's open board sockets that do not belong to `actorId`. */
  private listeners(week: string, party: number, actorId: string): WebSocket[] {
    const { sockets } = this.deps;
    if (!sockets.enabled('raid')) return [];
    const topic: RaidTopic = { kind: 'raid', week, party };
    return sockets.openSockets(topic).filter((ws) => socketIdentity(ws)?.userId !== actorId);
  }

  listening(week: string, party: number, actorId: string): boolean {
    return this.listeners(week, party, actorId).length > 0;
  }

  /** Sends the change to the party's other board sockets. Never throws. */
  notify(actorId: string, push: BoardPush): void {
    try {
      const listening = this.listeners(push.week, push.party, actorId);
      if (listening.length === 0) return;
      const payload = JSON.stringify({ v: 1, type: 'raid', ...push } satisfies LiveMessage);
      for (const ws of listening) this.deps.sockets.send(ws, payload);
    } catch (err) {
      console.error('raid board push failed', err instanceof Error ? err.name : 'unknown');
    }
  }
}
