import { derivedHmacKey, hmacHex } from './keys';

/** The reporter HMAC key: HKDF from the Discord client secret, with its own salt and info label. */
const reporterKey = derivedHmacKey({
  salt: 'leet-creatures/feedback',
  info: 'feedback-reporter-v1',
  usages: ['sign'],
});

/**
 * A keyed hash of a Discord user id (32 hex characters), used only for the per-reporter limit in the
 * feedback inbox. It is not reversible without the Discord client secret and never leaves the Worker.
 */
export async function reporterHash(secret: string, userId: string): Promise<string> {
  return hmacHex(await reporterKey(secret), userId, 16);
}
