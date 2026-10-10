import { describe, expect, it } from 'vitest';
import {
  formatSessionToken,
  generateSessionSecret,
  getSessionKey,
  hashSecret,
  parseAuthorization,
  parseSessionToken,
  verifyTokenMac,
} from '../src/session';

const GUILD = '333333333333333333';
const MAC = 'm'.repeat(43);
const key = await getSessionKey('test-client-secret');

describe('session tokens', () => {
  it('generates 43-char base64url secrets that differ each time', () => {
    const a = generateSessionSecret();
    const b = generateSessionSecret();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('round-trips guild id and secret', async () => {
    const secret = generateSessionSecret();
    const token = await formatSessionToken(key, GUILD, secret);
    expect(token).toMatch(new RegExp(`^s1\\.${GUILD}\\.${secret}\\.[A-Za-z0-9_-]{43}$`));
    const parsed = parseSessionToken(token);
    expect(parsed).toMatchObject({ guildId: GUILD, secret });
    expect(parseAuthorization(`Bearer ${token}`)).toEqual(parsed);
    expect(parsed && (await verifyTokenMac(key, parsed))).toBe(true);
  });

  it('is deterministic for the same key, and the key is cached per client secret', async () => {
    const secret = generateSessionSecret();
    expect(await formatSessionToken(key, GUILD, secret)).toBe(
      await formatSessionToken(await getSessionKey('test-client-secret'), GUILD, secret),
    );
  });

  it('verifies the MAC and rejects tampering or a different client secret', async () => {
    const secret = generateSessionSecret();
    const parsed = parseSessionToken(await formatSessionToken(key, GUILD, secret));
    if (parsed === null) throw new Error('unparseable');
    expect(await verifyTokenMac(key, { ...parsed, guildId: '444444444444444444' })).toBe(false);
    expect(await verifyTokenMac(key, { ...parsed, secret: generateSessionSecret() })).toBe(false);
    expect(await verifyTokenMac(key, { ...parsed, mac: MAC })).toBe(false);
    const other = await getSessionKey('rotated-client-secret');
    expect(await verifyTokenMac(other, parsed)).toBe(false);
    // Switching secrets and back still works (rotation derives a fresh key).
    expect(await verifyTokenMac(await getSessionKey('test-client-secret'), parsed)).toBe(true);
  });

  it('refuses an empty client secret', async () => {
    await expect(getSessionKey('')).rejects.toThrow();
  });

  it('refuses to format a token for a non-snowflake guild', async () => {
    await expect(formatSessionToken(key, 'abc', generateSessionSecret())).rejects.toThrow();
  });

  it.each([
    ['empty', ''],
    ['old 3-part format', `s1.${GUILD}.${'a'.repeat(43)}`],
    ['wrong version', `s2.${GUILD}.${'a'.repeat(43)}.${MAC}`],
    ['short guild id', `s1.1234.${'a'.repeat(43)}.${MAC}`],
    ['non-numeric guild id', `s1.${'x'.repeat(18)}.${'a'.repeat(43)}.${MAC}`],
    ['short secret', `s1.${GUILD}.${'a'.repeat(42)}.${MAC}`],
    ['long secret', `s1.${GUILD}.${'a'.repeat(44)}.${MAC}`],
    ['bad secret chars', `s1.${GUILD}.${'a'.repeat(42)}+.${MAC}`],
    ['short mac', `s1.${GUILD}.${'a'.repeat(43)}.${'m'.repeat(42)}`],
    ['long mac', `s1.${GUILD}.${'a'.repeat(43)}.${'m'.repeat(44)}`],
    ['extra segment', `s1.${GUILD}.${'a'.repeat(43)}.${MAC}.x`],
    ['trailing newline', `s1.${GUILD}.${'a'.repeat(43)}.${MAC}\n`],
  ])('rejects malformed token: %s', (_name, token) => {
    expect(parseSessionToken(token)).toBeNull();
  });

  it('rejects malformed Authorization headers', async () => {
    const token = await formatSessionToken(key, GUILD, generateSessionSecret());
    expect(parseAuthorization(null)).toBeNull();
    expect(parseAuthorization(token)).toBeNull();
    expect(parseAuthorization(`Basic ${token}`)).toBeNull();
    expect(parseAuthorization(`Bearer  ${token}`)).toBeNull();
    expect(parseAuthorization(`Bearer ${token} extra`)).toBeNull();
    expect(parseAuthorization(`Bearer ${'a'.repeat(300)}`)).toBeNull();
  });

  it('hashes to SHA-256 hex, deterministically', async () => {
    expect(await hashSecret('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
