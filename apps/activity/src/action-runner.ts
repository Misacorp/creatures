/**
 * The shared rules for running one player action: one at a time, busy and error shown, the
 * idempotency key kept or dropped by what the server answered, and the screen reloaded after a
 * definite "no" that says it was out of date. Plain code with no framework, so the rules can be
 * tested; `use-action-runner.ts` binds it to a component's state.
 */
import type { ActionId, KeyStore } from './actions';

/** What the runner needs from its screen. It is read again at every run, so closures may change. */
export interface ActionRunnerConfig {
  keys: KeyStore;
  /** Words for a failure; `currency` names what ran out (see `errorText`). */
  errorText: (err: unknown, currency?: string) => string;
  /** True when a failure means the screen was out of date. */
  isStale: (err: unknown) => boolean;
  setBusy: (busy: boolean) => void;
  setError: (text: string | null) => void;
  setNotice: (text: string | null) => void;
  /** False once the screen is gone: nothing is set on it then. */
  isMounted: () => boolean;
  /** Called when a run starts (not when it was turned away because one is running). */
  onStart?: () => void;
  /** Called after a failure was shown, before any reload. */
  onFail?: (err: unknown) => void;
  /** Loads the view again after a stale failure. Busy stays on until it is done. */
  onStale?: (err: unknown) => void | Promise<void>;
}

export interface RunOptions {
  /** Names what ran out when the server says `insufficient_funds` (Bait when left out). */
  currency?: string;
  /** False to skip the reload after a stale failure (for a plain read). Default true. */
  reload?: boolean;
}

export interface ActionRunner {
  /** True while an action runs. A second tap in the same tick is turned away before `busy` renders. */
  inFlight: () => boolean;
  /** Runs an action that has no key (it is safe to repeat). Resolves undefined on failure or if turned away. */
  run: <T>(task: () => Promise<T>, options?: RunOptions) => Promise<T | undefined>;
  /**
   * Runs an action that spends or grants. The task gets the action's key: the same one on a retry
   * after an unknown outcome (network error, server error, rate limit), a fresh one after a
   * definite answer. Resolves undefined on failure or if turned away.
   */
  runKeyed: <T>(
    action: ActionId,
    task: (key: string) => Promise<T>,
    options?: RunOptions,
  ) => Promise<T | undefined>;
}

export function createActionRunner(config: () => ActionRunnerConfig): ActionRunner {
  let inFlight = false;

  async function execute<T>(
    action: ActionId | null,
    task: (key: string) => Promise<T>,
    options: RunOptions,
  ): Promise<T | undefined> {
    if (inFlight) return undefined;
    inFlight = true;
    const start = config();
    start.onStart?.();
    start.setBusy(true);
    start.setError(null);
    start.setNotice(null);
    // The key is made after the one-at-a-time check, so a turned-away tap never creates one.
    const settle = (err?: unknown): void => {
      if (action !== null) config().keys.settle(action, err);
    };
    try {
      const value = await task(action === null ? '' : config().keys.keyFor(action));
      settle();
      return value;
    } catch (err) {
      settle(err);
      const now = config();
      if (now.isMounted()) {
        now.setError(now.errorText(err, options.currency));
        now.onFail?.(err);
        if (options.reload !== false && now.isStale(err)) {
          try {
            await now.onStale?.(err);
          } catch {
            // Keep the error above; the next action reloads anyway.
          }
        }
      }
      return undefined;
    } finally {
      inFlight = false;
      const end = config();
      if (end.isMounted()) end.setBusy(false);
    }
  }

  return {
    inFlight: () => inFlight,
    run: (task, options = {}) => execute(null, () => task(), options),
    runKeyed: (action, task, options = {}) => execute(action, task, options),
  };
}
