// HMAC keys derived from the Discord client secret, and hex encoding. Each purpose (session token,
// analytics actor, guild alias, feedback reporter) has its own salt and info label, so the keys
// differ. Changing a label changes every MAC or hash made with that key.

const encoder = new TextEncoder();

export interface KeyLabel {
  salt: string;
  info: string;
  usages: ('sign' | 'verify')[];
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns a function that derives a non-extractable HMAC-SHA256 key from a secret with HKDF-SHA256
 * and the given label. The key for the most recent secret is cached per isolate (keyed on the
 * secret value, so a rotated secret derives a new key). A failed derivation is not cached.
 */
export function derivedHmacKey(label: KeyLabel): (secret: string) => Promise<CryptoKey> {
  let cached: { secret: string; key: Promise<CryptoKey> } | null = null;
  return (secret) => {
    if (cached?.secret === secret) return cached.key;
    const key = (async () => {
      const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
        'deriveKey',
      ]);
      return crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: encoder.encode(label.salt),
          info: encoder.encode(label.info),
        },
        material,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        label.usages,
      );
    })();
    const entry = { secret, key };
    cached = entry;
    key.catch(() => {
      if (cached === entry) cached = null;
    });
    return key;
  };
}

/** Lowercase hex of HMAC-SHA256(text), cut to the first `bytes` bytes when given. */
export async function hmacHex(key: CryptoKey, text: string, bytes?: number): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
  return toHex(bytes === undefined ? mac : mac.subarray(0, bytes));
}
