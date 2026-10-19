/**
 * The pips of the tab bar and the timers that keep them true. They follow the server's clock: one
 * timer, set for the next trip or job to run out (a long wait is capped), and set again after it
 * fires; and one check a moment after the server said something could change by itself.
 */
import { useEffect, useState } from 'preact/hooks';
import type { Attention, Expedition } from './api';
import type { Job } from './gear-types';
import {
  RECHECK_RETRY_MS,
  changeDelay,
  nextChangeAt,
  recheckDelay,
  tabAlerts,
  type TabAlerts,
} from './tab-alerts';

export function useTabPips(input: {
  expeditions: readonly Expedition[];
  /** The gear view's job list, or null while it has not loaded. */
  jobs: readonly Job[] | null;
  /** What needs the player, as last known (null: not known yet). */
  attention: Attention | null;
  /** How many duplicates wait for a choice. */
  pending: number;
  /** Server clock minus local clock. */
  offset: number;
  /** Reloads the state in the background; false when it did not start because an action is running. */
  refresh: () => boolean;
}): TabAlerts {
  const { expeditions, jobs, attention, offset } = input;
  // Bumped when a trip or job runs out, so the pips are worked out again at that moment.
  const [pipTick, setPipTick] = useState(0);
  const serverNow = Date.now() + offset;
  const alerts = tabAlerts({ expeditions, jobs, attention, pending: input.pending, serverNow });
  const changeAt = nextChangeAt({ expeditions, jobs, serverNow });
  useEffect(() => {
    if (changeAt === null) return undefined;
    const timer = setTimeout(
      () => {
        setPipTick((n) => n + 1);
      },
      changeDelay(changeAt, Date.now() + offset),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [changeAt, offset, pipTick]);

  // When the server said something could change by itself (the daily reset, the next raid event),
  // ask once a moment after; if an action was running, once more a few seconds later.
  const recheckAt = attention?.recheckAt ?? null;
  useEffect(() => {
    const wait = recheckDelay(recheckAt, Date.now() + offset);
    if (wait === null) return undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      if (input.refresh()) return;
      retry = setTimeout(() => {
        input.refresh();
      }, RECHECK_RETRY_MS);
    }, wait);
    return () => {
      clearTimeout(timer);
      if (retry !== undefined) clearTimeout(retry);
    };
  }, [recheckAt, offset]);

  return alerts;
}
