/**
 * Silent re-authentication for expired sessions. A request that fails with an expired session is
 * retried once after signing in again; concurrent failures share one sign-in.
 */
export interface ReauthOptions {
  /** Signs in again (and stores the new session). Rejects if that is not possible. */
  reauthenticate: () => Promise<void>;
  /** True if the error means "your session is no longer valid". */
  isSessionExpired: (err: unknown) => boolean;
}

export interface Reauth {
  /**
   * Runs `task`. If it fails with an expired session, signs in again and runs it once more (the
   * task closure is the same, so it keeps its idempotency key). If signing in fails, the original
   * error is thrown. A second failure is never retried.
   */
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createReauth(options: ReauthOptions): Reauth {
  let inFlight: Promise<void> | null = null;
  // Counts completed sign-ins, so a request that failed on the old session while another request
  // was already re-signing in just retries instead of starting a second sign-in.
  let generation = 0;

  function refresh(): Promise<void> {
    inFlight ??= options.reauthenticate().then(
      () => {
        generation++;
        inFlight = null;
      },
      (err: unknown) => {
        inFlight = null;
        throw err;
      },
    );
    return inFlight;
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      const startedAt = generation;
      try {
        return await task();
      } catch (err) {
        if (!options.isSessionExpired(err)) throw err;
        if (generation === startedAt) {
          try {
            await refresh();
          } catch {
            throw err;
          }
        }
        return task();
      }
    },
  };
}
