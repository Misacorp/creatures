import { ApiError } from './api';

/**
 * Idempotency keys for user actions. An action gets one key (`crypto.randomUUID()`), created the
 * first time it is tried. If the request fails in a way that leaves the outcome unknown (network
 * error, server error, rate limit), the same key is reused on the retry so the server can tell it
 * is a repeat. Once the server has given a definite answer, the key is dropped.
 */
interface KeyStore {
  /** The key for this action, created if there is none yet. */
  keyFor(action: string): string;
  /** Call when an attempt is over: `err` is the failure, or undefined on success. */
  settle(action: string, err?: unknown): void;
}

/** True when the request might have reached the server, so a retry must reuse the key. */
export function outcomeUnknown(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status >= 500 || err.status === 429;
}

export function createKeyStore(generate: () => string = () => crypto.randomUUID()): KeyStore {
  const pending = new Map<string, string>();
  return {
    keyFor(action) {
      let key = pending.get(action);
      if (key === undefined) {
        key = generate();
        pending.set(action, key);
      }
      return key;
    },
    settle(action, err) {
      if (err === undefined || !outcomeUnknown(err)) pending.delete(action);
    },
  };
}
