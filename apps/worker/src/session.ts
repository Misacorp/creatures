import { SNOWFLAKE_RE } from './schemas';

/** Sliding idle expiry: a session unused for this long is dead. */
export const SESSION_IDLE_MS = 60 * 60 * 1000;
/** Absolute maximum lifetime, however active the session is. */
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
/** last_used_at is refreshed at most this often, to avoid a write on every request. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

const SECRET_BYTES = 32;
// 32 bytes in unpadded base64url is exactly 43 characters (both the secret and the MAC).
const TOKEN_RE = /^s1\.(\d{17,20})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;
const BEARER_RE = /^Bearer ([^\s]+)$/i;

export interface ParsedToken {
  guildId: string;
  secret: string;
  mac: string;
}

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateSessionSecret(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

const encoder = new TextEncoder();

// Cache of the derived key for the most recent client secret, per isolate. Keyed on the secret
// value, so a rotated secret derives a new key. Rotating DISCORD_CLIENT_SECRET therefore
// invalidates every outstanding session token (players just sign in again), which is acceptable.
let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

/**
 * HKDF-SHA256 over the Discord client secret gives a non-extractable HMAC key used only to make
 * session tokens tamper-evident, so a forged guild id is rejected before any Durable Object is
 * addressed. No extra secret to manage.
 */
export function getSessionKey(clientSecret: string): Promise<CryptoKey> {
  if (clientSecret === '') {
    return Promise.reject(new Error('missing client secret'));
  }
  if (cachedKey?.secret === clientSecret) {
    return cachedKey.key;
  }
  const key = (async () => {
    const material = await crypto.subtle.importKey(
      'raw',
      encoder.encode(clientSecret),
      'HKDF',
      false,
      ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: encoder.encode('leet-creatures/session'),
        info: encoder.encode('session-token-v1'),
      },
      material,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign', 'verify'],
    );
  })();
  const entry = { secret: clientSecret, key };
  cachedKey = entry;
  // Do not cache a failure.
  key.catch(() => {
    if (cachedKey === entry) cachedKey = null;
  });
  return key;
}

function macInput(guildId: string, secret: string): Uint8Array {
  return encoder.encode(`s1.${guildId}.${secret}`);
}

/** Builds `s1.<guildId>.<secret>.<mac>`. The Worker does this after the DO returns the secret. */
export async function formatSessionToken(
  key: CryptoKey,
  guildId: string,
  secret: string,
): Promise<string> {
  if (!SNOWFLAKE_RE.test(guildId)) {
    throw new Error('invalid guild id');
  }
  const mac = await crypto.subtle.sign('HMAC', key, macInput(guildId, secret));
  return `s1.${guildId}.${secret}.${base64Url(new Uint8Array(mac))}`;
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Constant-time MAC check (crypto.subtle.verify). Call before addressing any Durable Object. */
export async function verifyTokenMac(key: CryptoKey, token: ParsedToken): Promise<boolean> {
  const mac = base64UrlDecode(token.mac);
  if (mac === null) return false;
  return crypto.subtle.verify('HMAC', key, mac, macInput(token.guildId, token.secret));
}

export function parseSessionToken(token: string): ParsedToken | null {
  const match = TOKEN_RE.exec(token);
  if (match === null) return null;
  const [, guildId, secret, mac] = match;
  if (guildId === undefined || secret === undefined || mac === undefined) return null;
  return { guildId, secret, mac };
}

/** Extracts and strictly parses `Authorization: Bearer s1.<guildId>.<secret>.<mac>`. */
export function parseAuthorization(header: string | null): ParsedToken | null {
  if (header === null || header.length > 256) return null;
  const match = BEARER_RE.exec(header);
  if (match === null || match[1] === undefined) return null;
  return parseSessionToken(match[1]);
}

/** Only this hash is ever stored; the secret itself exists only in the client's memory. */
export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return toHex(new Uint8Array(digest));
}
