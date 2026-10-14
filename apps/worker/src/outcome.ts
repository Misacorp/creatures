/** The common shape of an answer from the game logic: a value, or an error the route turns into a status. */
export type ErrorStatus = 400 | 404 | 409;

export type Outcome<T> =
  { ok: true; value: T } | { ok: false; status: ErrorStatus; error: string; reason?: string };

/**
 * Thrown inside a transaction to roll it back and answer with an error. The one error class for every
 * game action (collection, expeditions, gear, dungeon, raid).
 */
export class GameError extends Error {
  constructor(
    readonly status: ErrorStatus,
    readonly code: string,
    readonly reason?: string,
  ) {
    super(code);
    this.name = 'GameError';
  }
}

/** Runs `fn` in a transaction; a `GameError` rolls it back and becomes an error outcome. */
export function atomically<T>(
  storage: { transactionSync<R>(fn: () => R): R },
  fn: () => T,
): Outcome<T> {
  try {
    return { ok: true, value: storage.transactionSync(fn) };
  } catch (err) {
    if (err instanceof GameError) {
      return {
        ok: false,
        status: err.status,
        error: err.code,
        ...(err.reason === undefined ? {} : { reason: err.reason }),
      };
    }
    throw err;
  }
}
