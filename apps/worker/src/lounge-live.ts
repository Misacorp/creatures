/**
 * The lounge's live socket: push for the living room (`docs/design/lounge-live.md`).
 *
 * Server to client only. The sockets live in the guild's own Durable Object and use the WebSocket
 * Hibernation API, so an idle room costs nothing: the object can sleep while the sockets stay open. A
 * client sends exactly one thing, the text `ping`, and the runtime answers `pong` without waking the
 * object (`setWebSocketAutoResponse`). Anything else a client sends closes its socket. Clients keep
 * sending their intents (move, choose a lounger) over the normal HTTP routes, so every rule, schema and
 * rate limit stays where it was.
 *
 * Who a socket belongs to comes from a one-time ticket made by an authenticated request
 * (`lounge-ticket.ts`), never from anything the client sends over the socket.
 */
import type { Resident } from './lounger';
import { TicketBook, parseTicket } from './lounge-ticket';
import { errorResponse } from './http';
import { SESSION_ABSOLUTE_MS } from './session';

/** The upgrade route (a GET with `Upgrade: websocket` and `?ticket=`). Open only with the flag on. */
export const LIVE_PATH = '/api/lounge/live';
/** The route that makes a ticket (POST, normal session auth). */
export const TICKET_PATH = '/api/lounge/ticket';

/** Requests that never change what the room shows (reads sent as POST, and the ticket itself). */
export const LIVE_QUIET_PATHS: ReadonlySet<string> = new Set(['/api/room', TICKET_PATH]);

/** Open sockets one player may have in one guild (two tabs and a spare); the oldest are closed. */
export const MAX_SOCKETS_PER_USER = 3;
/** Open sockets one guild may have; further upgrades answer 503 and the client polls instead. */
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

/** What the server pushes. `resident` is exactly one entry of the `POST /api/room` answer. */
export type LiveMessage =
  { v: 1; type: 'hello'; serverNow: number } | { v: 1; type: 'resident'; resident: Resident };

interface Attachment {
  userId: string;
  connectedAt: number;
}

function readAttachment(ws: WebSocket): Attachment | null {
  const raw: unknown = ws.deserializeAttachment();
  if (typeof raw !== 'object' || raw === null) return null;
  const { userId, connectedAt } = raw as Record<string, unknown>;
  return typeof userId === 'string' && typeof connectedAt === 'number'
    ? { userId, connectedAt }
    : null;
}

/** The part of the push the guild core needs (a core without one has no live socket). */
export interface LiveHooks {
  enabled(): boolean;
  mintTicket(guildId: string, userId: string): Promise<string>;
  /** `userId` just changed something: pushes their room view to the guild's sockets if it changed. */
  notify(userId: string): void;
}

export interface LoungeLiveDeps {
  ctx: DurableObjectState;
  /** The `LOUNGE_LIVE` flag. */
  enabled: boolean;
  clientSecret: string;
  guildId: () => string;
  now: () => number;
  /** The room view of one player, or null when they are not a resident (no starter yet). */
  residentOf: (userId: string) => Resident | null;
}

/** Remembered last pushes per player, so a request that changed nothing pushes nothing. */
const LAST_SENT_MAX = 500;

export class LoungeLive implements LiveHooks {
  private readonly tickets: TicketBook;
  private readonly lastSent = new Map<string, string>();

  constructor(private readonly deps: LoungeLiveDeps) {
    this.tickets = new TicketBook(deps.clientSecret, deps.now);
    deps.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  enabled(): boolean {
    return this.deps.enabled;
  }

  mintTicket(guildId: string, userId: string): Promise<string> {
    return this.tickets.mint(guildId, userId);
  }

  /** Open sockets of this guild, stale ones excluded (they are closed here). */
  openSockets(): WebSocket[] {
    this.pruneStale(this.deps.now());
    return this.deps.ctx.getWebSockets();
  }

  /** Closes sockets with no ping for `STALE_MS` or older than `MAX_AGE_MS`. Returns how many it closed. */
  pruneStale(now: number): number {
    let closed = 0;
    for (const ws of this.deps.ctx.getWebSockets()) {
      const att = readAttachment(ws);
      const lastPing = this.deps.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      const lastAlive = Math.max(lastPing, att?.connectedAt ?? 0);
      const dead = att === null || now - lastAlive > STALE_MS || now - att.connectedAt > MAX_AGE_MS;
      if (dead) {
        closeQuietly(ws, CLOSE_STALE, 'stale');
        closed++;
      }
    }
    return closed;
  }

  /** The upgrade request: the Worker has already checked the ticket's MAC, the object redeems it. */
  async upgrade(request: Request): Promise<Response> {
    if (!this.deps.enabled) return errorResponse('not_found', 404);
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return errorResponse('upgrade_required', 426, { Upgrade: 'websocket' });
    }
    const ticket = parseTicket(ticketParam(request));
    if (ticket === null || ticket.guildId !== this.deps.guildId()) {
      return errorResponse('invalid_ticket', 401);
    }
    const userId = await this.tickets.redeem(ticket.secret);
    if (userId === null) return errorResponse('invalid_ticket', 401);

    const now = this.deps.now();
    this.pruneStale(now);
    const all = this.deps.ctx.getWebSockets();
    if (all.length >= MAX_SOCKETS_PER_GUILD) return errorResponse('live_full', 503);
    const mine = this.deps.ctx
      .getWebSockets(userTag(userId))
      .map((ws) => ({ ws, at: readAttachment(ws)?.connectedAt ?? 0 }))
      .sort((a, b) => a.at - b.at);
    while (mine.length >= MAX_SOCKETS_PER_USER) {
      const oldest = mine.shift();
      if (oldest !== undefined) closeQuietly(oldest.ws, CLOSE_REPLACED, 'replaced');
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.deps.ctx.acceptWebSocket(server, [userTag(userId)]);
    server.serializeAttachment({ userId, connectedAt: now } satisfies Attachment);
    server.send(JSON.stringify({ v: 1, type: 'hello', serverNow: now } satisfies LiveMessage));
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * `userId` has just made a change. If anyone is listening, their room view is read and sent to every
   * socket of this guild, unless it is the same as the last one sent. Never throws.
   */
  notify(userId: string): void {
    if (!this.deps.enabled) return;
    // Not to the sender's own sockets: their client draws their creature from its own state.
    const own = new Set(this.deps.ctx.getWebSockets(userTag(userId)));
    const sockets = this.openSockets().filter((ws) => !own.has(ws));
    if (sockets.length === 0) return;
    const resident = this.deps.residentOf(userId);
    if (resident === null) return;
    const payload = JSON.stringify({ v: 1, type: 'resident', resident } satisfies LiveMessage);
    if (this.lastSent.get(userId) === payload) return;
    if (this.lastSent.size >= LAST_SENT_MAX) this.lastSent.clear();
    this.lastSent.set(userId, payload);
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {
        closeQuietly(ws, CLOSE_STALE, 'send failed');
      }
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

const userTag = (userId: string): string => `u:${userId}`;

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

function closeQuietly(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}
