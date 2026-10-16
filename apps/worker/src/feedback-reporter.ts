const encoder = new TextEncoder();

let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

/** The reporter HMAC key: HKDF from the Discord client secret, with its own salt and info label. */
function reporterKey(secret: string): Promise<CryptoKey> {
  if (cachedKey?.secret === secret) return cachedKey.key;
  const key = (async () => {
    const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
      'deriveKey',
    ]);
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: encoder.encode('leet-creatures/feedback'),
        info: encoder.encode('feedback-reporter-v1'),
      },
      material,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    );
  })();
  const entry = { secret, key };
  cachedKey = entry;
  key.catch(() => {
    if (cachedKey === entry) cachedKey = null;
  });
  return key;
}

/**
 * A keyed hash of a Discord user id (32 hex characters), used only for the per-reporter limit in the
 * feedback inbox. It is not reversible without the Discord client secret and never leaves the Worker.
 */
export async function reporterHash(secret: string, userId: string): Promise<string> {
  const key = await reporterKey(secret);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(userId)));
  return Array.from(mac.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}
