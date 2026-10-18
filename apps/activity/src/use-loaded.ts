import { useEffect, useState } from 'preact/hooks';

export interface Loaded<T> {
  /** The last value that loaded (kept while a newer one loads), or null before the first. */
  value: T | null;
  /** The last load failed (a later success clears it). */
  failed: boolean;
  /** Why the last load failed (what the promise rejected with); meaningful only while `failed`. */
  error: unknown;
  /** Loads again now. */
  reload: () => void;
}

/**
 * Loads something from the server when the component appears and again whenever `deps` change (and every
 * `everyMs`, when given). A slower, older answer never replaces a newer one. Used for the destinations, the
 * profile and the one-shot reads of the raid and finale cards, which the state does not carry.
 *
 * `resetOnDeps` empties the value and the failure when `deps` change, for a card that must not show the
 * last thing's numbers while the next one loads; by default the last value stays on screen until the new
 * one arrives.
 */
export function useLoaded<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  everyMs?: number,
  resetOnDeps = false,
): Loaded<T> {
  const [value, setValue] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let current = true;
    if (resetOnDeps) {
      setValue(null);
      setFailed(false);
      setError(null);
    }
    const run = (): void => {
      load().then(
        (next) => {
          if (!current) return;
          setValue(next);
          setFailed(false);
          setError(null);
        },
        (err: unknown) => {
          if (!current) return;
          setFailed(true);
          setError(err);
        },
      );
    };
    run();
    const timer = everyMs === undefined ? undefined : setInterval(run, everyMs);
    return () => {
      current = false;
      if (timer !== undefined) clearInterval(timer);
    };
  }, [...deps, nonce]);
  return {
    value,
    failed,
    error,
    reload: () => {
      setNonce((n) => n + 1);
    },
  };
}
