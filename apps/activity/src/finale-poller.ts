/**
 * Keeps the finale screen's snapshot fresh: the fast poll, and the finale's live socket on top of it
 * (`docs/design/finale-live.md`). Framework-free, with the fetch, the clock and the timers injected, so
 * the tests drive it deterministically; `Live.tsx` wires it to Preact and to `live-socket.ts`.
 *
 * - Not live (no socket, or it dropped): the poll of old, every 2 s and just after each round boundary
 *   (`nextPollDelay`).
 * - Live (the socket delivers): the server pushes a snapshot at every round start, so the poll is only a
 *   safety net (`nextLiveDelay`: slow, with one earlier look just after the next boundary). A missed
 *   alarm or push never freezes the fight.
 * - A pushed snapshot goes through `accept` like a polled one, so the screen's "newer snapshot wins" rule
 *   (`pickNewer`) covers both; the next poll is then planned from the newest snapshot.
 */
import { errorRetryDelayMs, isRetryableStatus, nextLiveDelay, nextPollDelay } from './live';
import type { LiveSnapshot } from './live-api';
import { ApiError } from './api';

export interface FinalePollerDeps {
  fetchSnapshot: () => Promise<LiveSnapshot>;
  /** Gives the screen a snapshot (polled or pushed); it keeps the newer of this and what it has. */
  accept: (snapshot: LiveSnapshot) => void;
  /** The newest snapshot the screen has, or null. */
  latest: () => LiveSnapshot | null;
  /** The estimated server time now (UTC ms). */
  serverNow: () => number;
  /** A poll failed. `retrying` is false for an answer a retry cannot fix (the poll stops). */
  onError: (error: unknown, retrying: boolean) => void;
  /** A poll worked after failures. */
  onRecovered: () => void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface FinalePoller {
  /** Starts with a snapshot the screen already has, or (null) with a first poll at once. */
  start(initial: LiveSnapshot | null): void;
  /** The live socket started or stopped delivering. Dropping polls at once and goes back to the fast pace. */
  setLive(live: boolean): void;
  /** A snapshot the socket pushed. */
  push(snapshot: LiveSnapshot): void;
  /** Stops everything: no timer, and an answer on its way is dropped. */
  stop(): void;
}

export function createFinalePoller(deps: FinalePollerDeps): FinalePoller {
  const setTimer = deps.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let live = false;
  let stopped = false;
  let started = false;
  let timer: unknown = null;
  let failures = 0;
  /** Bumped when the schedule changes, so an answer to an older poll does not reschedule. */
  let generation = 0;

  const clear = (): void => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  function delayFor(snapshot: LiveSnapshot): number | null {
    const now = deps.serverNow();
    return live ? nextLiveDelay(snapshot, now) : nextPollDelay(snapshot, now);
  }

  /** Plans the next poll from the newest snapshot (nothing when the fight is over). */
  function plan(): void {
    clear();
    if (stopped) return;
    const snapshot = deps.latest();
    if (snapshot === null) return;
    const delay = delayFor(snapshot);
    if (delay === null) return;
    timer = setTimer(poll, delay);
  }

  function poll(): void {
    timer = null;
    const mine = ++generation;
    deps.fetchSnapshot().then(
      (next) => {
        if (stopped) return;
        if (failures > 0) deps.onRecovered();
        failures = 0;
        deps.accept(next);
        // An answer to an older poll does not undo a newer plan (a push or a mode change since).
        if (mine === generation) plan();
      },
      (err: unknown) => {
        if (stopped) return;
        failures += 1;
        const status = err instanceof ApiError ? err.status : null;
        if (!isRetryableStatus(status)) {
          deps.onError(err, false);
          return;
        }
        deps.onError(err, true);
        if (mine !== generation) return;
        clear();
        timer = setTimer(poll, errorRetryDelayMs(failures));
      },
    );
  }

  return {
    start(initial) {
      if (started) return;
      started = true;
      if (initial !== null) {
        deps.accept(initial);
        plan();
      } else {
        poll();
      }
    },
    setLive(next) {
      if (stopped || live === next) return;
      live = next;
      if (!started) return;
      // Dropped: look at once, then the fast pace. Live: the socket greets with a snapshot; the plan
      // moves to the safety pace.
      if (next) {
        generation++;
        plan();
      } else {
        clear();
        poll();
      }
    },
    push(snapshot) {
      if (stopped) return;
      deps.accept(snapshot);
      generation++;
      plan();
    },
    stop() {
      stopped = true;
      generation++;
      clear();
    },
  };
}
