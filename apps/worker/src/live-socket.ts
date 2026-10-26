/**
 * The live sockets of a guild: the transport shared by the lounge's push (`lounge-live.ts`,
 * `docs/design/lounge-live.md`) and the finale's (`finale-live.ts`, `docs/design/finale-live.md`).
 *
 * Server to client only. The sockets live in the guild's own Durable Object and use the WebSocket
 * Hibernation API, so an idle room costs nothing: the object can sleep while the sockets stay open. A
 * client sends exactly one thing, the text `ping`, and the runtime answers `pong` without waking the
 * object (`setWebSocketAutoResponse`). Anything else a client sends closes its socket. Clients keep
 * sending their intents over the normal HTTP routes, so every rule, schema and rate limit stays where it
 * was.
 *
 * Who a socket belongs to, and which topic it listens to (the lounge, or one party's finale), come from a
 * one-time ticket made by an authenticated request (`live-ticket.ts`), never from anything the client
 * sends over the socket. A socket is tagged `u:<userId>` and `t:<topic>`, and a push goes to the sockets
 * of one topic only.
 */
import type { LoungePaid } from './lounge-company';
import type { Resident } from './lounger';
import type { BoardPush } from './raid-board-change';
import type { LiveSnapshot } from './raid-live-view';
import { TicketBook, parseTicket } from './live-ticket';
import { parseTopicTag, topicTag, userTag, type Topic, type TopicKind } from './live-topic';
import { errorResponse } from './http';
import { SESSION_ABSOLUTE_MS } from './session';

/** The lounge's upgrade route (a GET with `Upgrade: websocket` and `?ticket=`). Open only with `LOUNGE_LIVE` on. */
export const LIVE_PATH = '/api/lounge/live';
/** The route that makes a lounge ticket (POST, normal session auth). */
export const TICKET_PATH = '/api/lounge/ticket';
/** The finale's upgrade route. Open only with `FINALE_LIVE` on; only a finale ticket opens it. */
export const FINALE_LIVE_PATH = '/api/finale/live';
/** The route that makes a finale ticket (POST, normal session auth, a body naming the party). */
export const FINALE_TICKET_PATH = '/api/finale/ticket';

/** The raid board's upgrade route. Open only with `RAID_LIVE` on; only a raid-board ticket opens it. */
export const RAID_LIVE_PATH = '/api/raid/board/live';
/** The route that makes a raid-board ticket (POST, normal session auth, a body naming the party). */
export const RAID_TICKET_PATH = '/api/raid/board/ticket';

/** The topic kind each upgrade route serves: a ticket of the other kind is refused there. */
export const LIVE_PATH_KINDS: Readonly<Record<string, TopicKind>> = {
  [LIVE_PATH]: 'lounge',
  [FINALE_LIVE_PATH]: 'finale',
  [RAID_LIVE_PATH]: 'raid',
};

/** Requests that never change what the room shows (reads sent as POST, and the tickets themselves). */
export const LIVE_QUIET_PATHS: ReadonlySet<string> = new Set([
  '/api/room',
  TICKET_PATH,
  FINALE_TICKET_PATH,
  RAID_TICKET_PATH,
]);

/** Requests after which a party's other finale watchers get a fresh snapshot: Fire, Hold and Unhold, and a practice start. */
export const FINALE_ACTION_PATHS: ReadonlySet<string> = new Set([
  '/api/raid/live/action',
  '/api/raid/practice',
]);

/**
 * Open sockets one player may have in one guild for one topic kind (two tabs and a spare); the oldest
 * are closed. A player may hold a lounge socket and a finale socket at once.
 */
export const MAX_SOCKETS_PER_USER = 3;
/** Open sockets one guild may have, whatever their topics; further upgrades answer 503 and the client polls instead. */
export const MAX_SOCKETS_PER_GUILD = 64;
/** A socket whose last ping (or open) is older than this is dead: clients ping every 60 s. */
export const STALE_MS = 150_000;
/** No socket outlives the session that could have made its ticket. */
export const MAX_AGE_MS = SESSION_ABSOLUTE_MS;

/** The only text a client may send. The runtime answers it by itself. */
export const PING = 'ping';
export const PONG = 'pong';

/** Close codes (3000 to 4999 are free for applications). */
export const CLOSE_REPLACED = 4000;
export const CLOSE_STALE = 4001;
export const CLOSE_PROTOCOL = 4002;

/**
 * What the server pushes. `resident` is exactly one entry of the `POST /api/room` answer (lounge sockets
 * only); `lounge-xp` is what lounging just paid the socket's own player's lounger (their own lounge sockets
 * only); `finale` is the answer of `GET /api/raid/live` for the socket's own player (finale sockets only);
 * `raid` is what one placement change did to the party's board (raid-board sockets of that party only).
 */
export type LiveMessage =
  | { v: 1; type: 'hello'; serverNow: number }
  | { v: 1; type: 'resident'; resident: Resident }
  | ({ v: 1; type: 'lounge-xp' } & LoungePaid)
  | { v: 1; type: 'finale'; snapshot: LiveSnapshot }
  | ({ v: 1; type: 'raid' } & BoardPush);

interface Attachment {
  userId: string;
  connectedAt: number;
  /** The socket's topic tag (`topicTag`). */
  topic: string;
}

function readAttachment(ws: WebSocket): Attachment | null {
  const raw: unknown = ws.deserializeAttachment();
  if (typeof raw !== 'object' || raw === null) return null;
  const { userId, connectedAt, topic } = raw as Record<string, unknown>;
  return typeof userId === 'string' && typeof connectedAt === 'number' && typeof topic === 'string'
    ? { userId, connectedAt, topic }
    : null;
}

/** Who a socket belongs to and what it listens to, or null for a socket without a valid attachment. */
export function socketIdentity(ws: WebSocket): { userId: string; topic: Topic } | null {
  const att = readAttachment(ws);
  const topic = att === null ? null : parseTopicTag(att.topic);
  return att === null || topic === null ? null : { userId: att.userId, topic };
}

/** What the guild core needs from the live sockets (a core without them has no live socket). */
export interface LiveHooks {
  /** Whether the server offers sockets of this kind (the `LOUNGE_LIVE`, `FINALE_LIVE` and `RAID_LIVE` flags). */
  enabled(kind: TopicKind): boolean;
  mintTicket(guildId: string, userId: string, topic: Topic): Promise<string>;
  /** `userId` just changed something: pushes their room view to the lounge's sockets if it changed. */
  notify(userId: string): void;
  /** Lounging just paid `userId`'s lounger: their own lounge sockets (and nobody else's) are told. Never throws. */
  notifyLoungeXp(userId: string, paid: LoungePaid): void;
  /** `userId` just acted in their party's finale: their party's other sockets get a fresh snapshot. */
  notifyFinale(userId: string): void;
  /**
   * The alarm woke (or a round may have started): every finale topic with open sockets whose stage has
   * moved since the last push gets each socket its own fresh snapshot.
   */
  tickFinale(): void;
  /** True when someone other than `actorId` has the party's raid board socket open (no listener: no push is built). */
  raidBoardListening(week: string, party: number, actorId: string): boolean;
  /** One placement change of `actorId`: the party's other raid-board sockets get it. Never throws. */
  notifyRaidBoard(actorId: string, push: BoardPush): void;
  /** The players of a party who have a finale socket open (they count as watching without polling). */
  finaleWatchers(week: string, party: number): ReadonlySet<string>;
  /** The next moment a finale socket will want a snapshot (a round start), or null. Always after now. */
  nextFinaleAt(): number | null;
}

export interface LiveSocketsDeps {
  ctx: DurableObjectState;
  /** Which topics the server offers (`LOUNGE_LIVE`, `FINALE_LIVE` and `RAID_LIVE`). */
  enabled: Readonly<Record<TopicKind, boolean>>;
  clientSecret: string;
  guildId: () => string;
  now: () => number;
  /** Called with the topic of each socket right after it was accepted and greeted. Must not throw. */
  onAccept?: (topic: Topic) => void;
}

export class LiveSockets {
  private readonly tickets: TicketBook;

  constructor(private readonly deps: LiveSocketsDeps) {
    this.tickets = new TicketBook(deps.clientSecret, deps.now);
    deps.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  enabled(kind: TopicKind): boolean {
    return this.deps.enabled[kind];
  }

  mintTicket(guildId: string, userId: string, topic: Topic): Promise<string> {
    return this.tickets.mint(guildId, userId, topic);
  }

  /** Open sockets of this guild (of one topic, if given), stale ones excluded (they are closed here). */
  openSockets(topic?: Topic): WebSocket[] {
    this.pruneStale(this.deps.now());
    return topic === undefined
      ? this.deps.ctx.getWebSockets()
      : this.deps.ctx.getWebSockets(topicTag(topic));
  }

  /** Open sockets of one player, whatever their topics (stale ones may still be in it). */
  socketsOfUser(userId: string): WebSocket[] {
    return this.deps.ctx.getWebSockets(userTag(userId));
  }

  /** The finale topics that have an open socket, with the players listening to each. Stale sockets are closed first. */
  finaleTopics(): { topic: Extract<Topic, { kind: 'finale' }>; sockets: WebSocket[] }[] {
    const byTag = new Map<
      string,
      { topic: Extract<Topic, { kind: 'finale' }>; sockets: WebSocket[] }
    >();
    for (const ws of this.openSockets()) {
      const who = socketIdentity(ws);
      if (who === null || who.topic.kind !== 'finale') continue;
      const tag = topicTag(who.topic);
      const entry = byTag.get(tag);
      if (entry === undefined) byTag.set(tag, { topic: who.topic, sockets: [ws] });
      else entry.sockets.push(ws);
    }
    return [...byTag.values()];
  }

  /** Closes sockets with no ping for `STALE_MS` or older than `MAX_AGE_MS`. Returns how many it closed. */
  pruneStale(now: number): number {
    let closed = 0;
    for (const ws of this.deps.ctx.getWebSockets()) {
      const att = readAttachment(ws);
      const lastPing = this.deps.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      const lastAlive = Math.max(lastPing, att?.connectedAt ?? 0);
      const dead =
        att === null ||
        parseTopicTag(att.topic) === null ||
        now - lastAlive > STALE_MS ||
        now - att.connectedAt > MAX_AGE_MS;
      if (dead) {
        closeQuietly(ws, CLOSE_STALE, 'stale');
        closed++;
      }
    }
    return closed;
  }

  /**
   * The upgrade request: the Worker has already checked the ticket's MAC, the object redeems it. The
   * route says which kind of socket this is; a ticket made for the other kind is refused.
   */
  async upgrade(request: Request): Promise<Response> {
    const kind = LIVE_PATH_KINDS[new URL(request.url).pathname];
    if (kind === undefined || !this.deps.enabled[kind]) return errorResponse('not_found', 404);
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return errorResponse('upgrade_required', 426, { Upgrade: 'websocket' });
    }
    const ticket = parseTicket(ticketParam(request));
    if (ticket === null || ticket.guildId !== this.deps.guildId()) {
      return errorResponse('invalid_ticket', 401);
    }
    const redeemed = await this.tickets.redeem(ticket.secret);
    if (redeemed === null || redeemed.topic.kind !== kind) {
      return errorResponse('invalid_ticket', 401);
    }
    const { userId, topic } = redeemed;

    const now = this.deps.now();
    this.pruneStale(now);
    const all = this.deps.ctx.getWebSockets();
    if (all.length >= MAX_SOCKETS_PER_GUILD) return errorResponse('live_full', 503);
    const mine = this.deps.ctx
      .getWebSockets(userTag(userId))
      .filter((ws) => socketIdentity(ws)?.topic.kind === kind)
      .map((ws) => ({ ws, at: readAttachment(ws)?.connectedAt ?? 0 }))
      .sort((a, b) => a.at - b.at);
    while (mine.length >= MAX_SOCKETS_PER_USER) {
      const oldest = mine.shift();
      if (oldest !== undefined) closeQuietly(oldest.ws, CLOSE_REPLACED, 'replaced');
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.deps.ctx.acceptWebSocket(server, [userTag(userId), topicTag(topic)]);
    server.serializeAttachment({
      userId,
      connectedAt: now,
      topic: topicTag(topic),
    } satisfies Attachment);
    server.send(JSON.stringify({ v: 1, type: 'hello', serverNow: now } satisfies LiveMessage));
    this.deps.onAccept?.(topic);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Sends one message to a socket; a socket that cannot take it is closed. Never throws. */
  send(ws: WebSocket, payload: string): void {
    try {
      ws.send(payload);
    } catch {
      closeQuietly(ws, CLOSE_STALE, 'send failed');
    }
  }

  // --- Hibernation handlers (the Durable Object class forwards its own) ---

  /** The auto-response takes `ping`; anything that arrives here is not allowed. */
  webSocketMessage(ws: WebSocket): void {
    closeQuietly(ws, CLOSE_PROTOCOL, 'unexpected message');
  }

  webSocketClose(ws: WebSocket, code: number): void {
    closeQuietly(ws, safeCode(code), 'closed');
  }

  webSocketError(ws: WebSocket): void {
    closeQuietly(ws, 1011, 'error');
  }
}

/** The `ticket` query parameter if it is the only parameter, exactly once. */
function ticketParam(request: Request): string | null {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].length !== 1) return null;
  const all = params.getAll('ticket');
  return all.length === 1 ? (all[0] ?? null) : null;
}

/** A code a server may send in a close frame; reserved ones (1005, 1006, 1015) become a normal close. */
function safeCode(code: number): number {
  return code === 1000 || (code >= 3000 && code <= 4999) || code === 1011 ? code : 1000;
}

export function closeQuietly(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}
