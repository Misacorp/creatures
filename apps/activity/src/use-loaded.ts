import { useEffect, useState } from 'preact/hooks';

export interface Loaded<T> {
  /** The last value that loaded (kept while a newer one loads), or null before the first. */
  value: T | null;
  /** The last load failed (a later success clears it). */
  failed: boolean;
  /** Loads again now. */
  reload: () => void;
}

/**
 * Loads something from the server when the component appears and again whenever `deps` change (and every
 * `everyMs`, when given). A slower, older answer never replaces a newer one. Used for the destinations and
 * the profile, which the state does not carry.
 */
export function useLoaded<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  everyMs?: number,
): Loaded<T> {
  const [value, setValue] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let current = true;
    const run = (): void => {
      load().then(
        (next) => {
          if (!current) return;
          setValue(next);
          setFailed(false);
        },
        () => {
          if (current) setFailed(true);
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
    reload: () => {
      setNonce((n) => n + 1);
    },
  };
}
