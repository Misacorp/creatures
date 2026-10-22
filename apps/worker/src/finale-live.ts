/**
 * The finale's push (`docs/design/finale-live.md`): the live Sunday finale over the live sockets. The
 * fight is derived from the clock, so nothing ticks; what wakes the object is the Durable Object alarm
 * (`nextAt`, which the guild core folds into its one alarm) and what is sent is a full snapshot, built by
 * the very code `GET /api/raid/live` uses, for each watching player on their own (it holds that player's
 * abilities; the seed and other players' private data never leave the server).
 *
 * Who hears what:
 * - the alarm at a round start (also the lobby turning into the fight and the fight ending): every
 *   socket of every party with a socket, once, if the stage moved since the last push;
 * - after a player's Fire or Hold succeeded: the party's other sockets (the actor got the HTTP answer);
 * - when a socket opens or closes: the whole party's sockets (the "watching" list changed, and the new
 *   socket gets its first snapshot without a request).
 *
 * Only sockets whose topic is that party's finale are ever written to. No timer is kept: the object can
 * sleep between rounds.
 */
import type { LiveSnapshot } from './raid-live-view';
import { LiveSockets, socketIdentity, type LiveMessage } from './live-socket';
import { topicTag, type Topic } from './live-topic';

type FinaleTopic = Extract<Topic, { kind: 'finale' }>;

export interface FinalePushDeps {
  sockets: LiveSockets;
  /**
   * The finale snapshot of one player of this party and week, built like the poll route builds it, or
   * null when the player is not in that party or the week is not the current one.
   */
  snapshotFor: (userId: string, week: string, party: number) => LiveSnapshot | null;
  /** The next moment the party's snapshot changes shape (a round start, the start, the end), or null. */
  nextChangeAt: (week: string, party: number) => number | null;
}

/** What makes two snapshots of one party the same stage: nothing to push between them. */
const stageKey = (s: LiveSnapshot): string =>
  `${s.status}|${String(s.practice)}|${String(s.round)}|${String(s.startsAt)}`;

const LAST_KEY_MAX = 50;

export class FinalePush {
  /** The stage last pushed per topic, in memory: a lost one only costs one repeated push. */
  private readonly lastKey = new Map<string, string>();
  /** A socket that is closing: not counted as watching while its close is announced. */
  private leaving: WebSocket | null = null;

  constructor(private readonly deps: FinalePushDeps) {}

  private enabled(): boolean {
    return this.deps.sockets.enabled('finale');
  }

  /** The players of a party who have a finale socket open (they count as watching without polling). */
  watchersOf(week: string, party: number): ReadonlySet<string> {
    const topic: FinaleTopic = { kind: 'finale', week, party };
    const ids = new Set<string>();
    for (const ws of this.deps.sockets.openSockets(topic)) {
      if (ws === this.leaving) continue;
      const who = socketIdentity(ws);
      if (who !== null) ids.add(who.userId);
    }
    return ids;
  }

  /** The next moment any party with an open socket wants a snapshot, or null. */
  nextAt(): number | null {
    if (!this.enabled()) return null;
    let next: number | null = null;
    for (const { topic } of this.deps.sockets.finaleTopics()) {
      const at = this.deps.nextChangeAt(topic.week, topic.party);
      if (at !== null && (next === null || at < next)) next = at;
    }
    return next;
  }

  /** The alarm: each party whose stage moved since its last push gets every socket a fresh snapshot. */
  tick(): void {
    if (!this.enabled()) return;
    this.guarded('tick', () => {
      for (const { topic } of this.deps.sockets.finaleTopics()) {
        this.pushTopic(topic, () => true, true);
      }
    });
  }

  /** `actorId` acted in their party's finale: the party's other sockets get a fresh snapshot. */
  afterAction(actorId: string): void {
    if (!this.enabled()) return;
    this.guarded('action', () => {
      const topics = new Map<string, FinaleTopic>();
      for (const ws of this.deps.sockets.socketsOfUser(actorId)) {
        const who = socketIdentity(ws);
        if (who !== null && who.topic.kind === 'finale') topics.set(topicTag(who.topic), who.topic);
      }
      for (const topic of topics.values()) this.pushTopic(topic, (id) => id !== actorId, false);
    });
  }

  /** A finale socket opened: its whole party gets a snapshot (the opener's first, and a new watcher for the rest). */
  afterOpen(topic: FinaleTopic): void {
    if (!this.enabled()) return;
    this.guarded('open', () => {
      this.pushTopic(topic, () => true, false);
    });
  }

  /** A finale socket closed: the rest of its party gets a snapshot without it in the watching list. */
  afterClose(ws: WebSocket): void {
    if (!this.enabled()) return;
    this.guarded('close', () => {
      const who = socketIdentity(ws);
      if (who === null || who.topic.kind !== 'finale') return;
      this.leaving = ws;
      try {
        this.pushTopic(who.topic, () => true, false);
      } finally {
        this.leaving = null;
      }
    });
  }

  /**
   * Sends each listening player of one topic their own snapshot (one build per player, shared by their
   * tabs). `only` picks the players to send to. With `skipSame`, nothing is sent when the party's stage
   * is the one last pushed. The stage is always remembered.
   */
  private pushTopic(
    topic: FinaleTopic,
    only: (userId: string) => boolean,
    skipSame: boolean,
  ): void {
    const byUser = new Map<string, WebSocket[]>();
    for (const ws of this.deps.sockets.openSockets(topic)) {
      if (ws === this.leaving) continue;
      const who = socketIdentity(ws);
      if (who === null) continue;
      const list = byUser.get(who.userId);
      if (list === undefined) byUser.set(who.userId, [ws]);
      else list.push(ws);
    }
    const tag = topicTag(topic);
    let keyed = false;
    for (const [userId, list] of byUser) {
      let snapshot: LiveSnapshot | null;
      try {
        snapshot = this.deps.snapshotFor(userId, topic.week, topic.party);
      } catch (err) {
        console.error('finale snapshot failed', err instanceof Error ? err.name : 'unknown');
        continue;
      }
      if (snapshot === null) continue;
      if (!keyed) {
        keyed = true;
        const key = stageKey(snapshot);
        if (skipSame && this.lastKey.get(tag) === key) return;
        if (this.lastKey.size >= LAST_KEY_MAX) this.lastKey.clear();
        this.lastKey.set(tag, key);
      }
      if (!only(userId)) continue;
      const payload = JSON.stringify({ v: 1, type: 'finale', snapshot } satisfies LiveMessage);
      for (const ws of list) this.deps.sockets.send(ws, payload);
    }
  }

  /** The push is a courtesy: whatever goes wrong here never reaches the request or the alarm. */
  private guarded(what: string, run: () => void): void {
    try {
      run();
    } catch (err) {
      console.error(`finale push (${what}) failed`, err instanceof Error ? err.name : 'unknown');
    }
  }
}
