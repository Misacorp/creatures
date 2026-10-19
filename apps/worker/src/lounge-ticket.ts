/**
 * The one-time ticket that opens the lounge's live socket (`docs/design/lounge-live.md`).
 *
 * A browser WebSocket cannot send an `Authorization` header, and the Discord proxy's handling of
 * `Sec-WebSocket-Protocol` is undocumented. So the client first asks `POST /api/lounge/ticket` (a normal
 * authenticated request) and then opens the socket with `?ticket=<ticket>`. The ticket is made to be
 * safe in a URL that may be logged: it lives 30 seconds, works once, and is worth nothing else (it is
 * not a session token and no other route accepts it).
 *
 * Format: `l1.<guildId>.<secret>.<mac>`. The MAC (HMAC-SHA256, its own HKDF key derived from the Discord
 * client secret) lets the Worker reject a forged guild id before any Durable Object is addressed, the
 * same way it does for session tokens. The secret is 32 random bytes; the Durable Object keeps only its
 * hash, in memory, until it is used or expires.
 */
import { derivedHmacKey, toHex } from './keys';
import { SNOWFLAKE_RE } from './schemas';
import { base64Url, base64UrlDecode, generateSessionSecret } from './session';

/** How long a ticket can be redeemed after it is made. */
export const TICKET_TTL_MS = 30_000;
/** The most tickets one Durable Object holds at once; the oldest are dropped. */
export const TICKET_MAX_PENDING = 200;

const TICKET_RE = /^l1\.(\d{17,20})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;
const encoder = new TextEncoder();

const ticketKey = derivedHmacKey({
  salt: 'leet-creatures/lounge',
  info: 'lounge-ticket-v1',
  usages: ['sign', 'verify'],
});

export interface ParsedTicket {
  guildId: string;
  secret: string;
  mac: string;
}

export function parseTicket(value: string | null): ParsedTicket | null {
  if (value === null || value.length > 160) return null;
  const match = TICKET_RE.exec(value);
  if (match === null) return null;
  const [, guildId, secret, mac] = match;
  if (guildId === undefined || secret === undefined || mac === undefined) return null;
  return { guildId, secret, mac };
}

const macInput = (guildId: string, secret: string): Uint8Array =>
  encoder.encode(`l1.${guildId}.${secret}`);

/** Constant-time MAC check. Call before addressing any Durable Object. */
export async function verifyTicketMac(
  clientSecret: string,
  ticket: ParsedTicket,
): Promise<boolean> {
  const mac = base64UrlDecode(ticket.mac);
  if (mac === null) return false;
  return crypto.subtle.verify(
    'HMAC',
    await ticketKey(clientSecret),
    mac,
    macInput(ticket.guildId, ticket.secret),
  );
}

async function hashTicketSecret(secret: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(secret))));
}

interface Pending {
  userId: string;
  expiresAt: number;
}

/** The tickets of one guild, in memory: lost when the object restarts, which only costs a reconnect. */
export class TicketBook {
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly clientSecret: string,
    private readonly now: () => number,
  ) {}

  /** Makes a ticket for `userId` (who comes from the verified session). */
  async mint(guildId: string, userId: string): Promise<string> {
    if (!SNOWFLAKE_RE.test(guildId)) throw new Error('invalid guild id');
    const secret = generateSessionSecret();
    const mac = new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        await ticketKey(this.clientSecret),
        macInput(guildId, secret),
      ),
    );
    const hash = await hashTicketSecret(secret);
    const t = this.now();
    this.dropExpired(t);
    this.pending.set(hash, { userId, expiresAt: t + TICKET_TTL_MS });
    // A Map keeps insertion order, so the first key is the oldest.
    while (this.pending.size > TICKET_MAX_PENDING) {
      const oldest = this.pending.keys().next();
      if (oldest.done === true) break;
      this.pending.delete(oldest.value);
    }
    return `l1.${guildId}.${secret}.${base64Url(mac)}`;
  }

  /** The user a ticket was made for, once: the ticket is gone after this call. Null if unknown or expired. */
  async redeem(secret: string): Promise<string | null> {
    const hash = await hashTicketSecret(secret);
    const found = this.pending.get(hash);
    this.pending.delete(hash);
    if (found === undefined || found.expiresAt <= this.now()) return null;
    return found.userId;
  }

  size(): number {
    return this.pending.size;
  }

  private dropExpired(t: number): void {
    for (const [hash, p] of this.pending) {
      if (p.expiresAt <= t) this.pending.delete(hash);
    }
  }
}
