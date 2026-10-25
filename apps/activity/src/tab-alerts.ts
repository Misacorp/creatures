/**
 * The pips on the main tabs, as pure functions: which tab has something that needs the player, and
 * the next moment that could change that without any request (a trip or a job running out). The
 * Dungeon and Raid pips come from the server's `attention` block (and the two screens' own updates);
 * the Expeditions and Workshop pips are worked out here from the trips and jobs the screen already
 * holds, by the server's clock. Each reason is a few plain words read out by screen readers after
 * the tab's name ("Expeditions, a trip is home").
 */
import type { Attention, Expedition } from './api';
import { RESET_GRACE_MS } from './dungeon-flow';
import type { Job } from './gear-types';
import { jobProgress, openJobs } from './gear-view';
import type { Tab } from './tabs';
import { tripStatus } from './trip-view';

/** For every tab: why it has a pip, or null when it has none. */
export type TabAlerts = Readonly<Record<Tab, string | null>>;

export const NO_ALERTS: TabAlerts = {
  collection: null,
  workshop: null,
  journal: null,
  stats: null,
  expeditions: null,
  games: null,
  dungeon: null,
  raid: null,
};

/** The reasons, in the words a screen reader adds to the tab's name. */
export const ALERT_TEXT = {
  tripHome: 'a trip is home',
  choiceWaiting: 'a choice is waiting',
  jobReady: 'a job is ready',
  dungeonOpen: "today's run is open",
  raidPlace: 'creatures to place',
  catchWaiting: 'a catch awaits your choice',
  gamesLive: 'the show is on',
  gamesEntries: 'events to enter',
} as const;

/** A waiting choice is named before a trip that is simply home: it is the one that needs a decision. */
function expeditionsAlert(trips: readonly Expedition[], serverNow: number): string | null {
  let home = false;
  for (const trip of trips) {
    if (trip.status !== 'active') continue;
    const { phase } = tripStatus(trip, serverNow);
    if (phase === 'choice') return ALERT_TEXT.choiceWaiting;
    if (phase === 'ready') home = true;
  }
  return home ? ALERT_TEXT.tripHome : null;
}

function workshopAlert(jobs: readonly Job[] | null, serverNow: number): string | null {
  if (jobs === null) return null;
  return openJobs(jobs).some((job) => jobProgress(job, serverNow).ready)
    ? ALERT_TEXT.jobReady
    : null;
}

/**
 * The pip of every tab at server time `serverNow`. `jobs` is the gear view's job list, or null while
 * that has not loaded (no Workshop pip then); `attention` is null while the server's answer is not
 * known (no Dungeon or Raid pip then).
 */
export function tabAlerts(input: {
  expeditions: readonly Expedition[];
  jobs: readonly Job[] | null;
  attention: Attention | null;
  /** How many duplicates wait for a choice (the Collection tab holds their cards). Absent: none. */
  pending?: number;
  /** The Games tab's pip, worked out from its own state (`gamesAlert`); absent or null: none. */
  games?: string | null;
  serverNow: number;
}): TabAlerts {
  const { expeditions, jobs, attention, serverNow } = input;
  return {
    collection: (input.pending ?? 0) > 0 ? ALERT_TEXT.catchWaiting : null,
    workshop: workshopAlert(jobs, serverNow),
    journal: null,
    stats: null,
    expeditions: expeditionsAlert(expeditions, serverNow),
    games: input.games ?? null,
    dungeon: attention?.dungeon === true ? ALERT_TEXT.dungeonOpen : null,
    raid: attention?.raid === true ? ALERT_TEXT.raidPlace : null,
  };
}

/**
 * The soonest server time after `serverNow` at which a pip could appear by itself: the end of an
 * active trip that is still out, the end of a push-on leg, or the end of a running job. Null when
 * nothing is running.
 */
export function nextChangeAt(input: {
  expeditions: readonly Expedition[];
  jobs: readonly Job[] | null;
  serverNow: number;
}): number | null {
  const { expeditions, jobs, serverNow } = input;
  let soonest: number | null = null;
  const consider = (at: number): void => {
    if (at > serverNow && (soonest === null || at < soonest)) soonest = at;
  };
  for (const trip of expeditions) {
    if (trip.status !== 'active') continue;
    if (serverNow < trip.endsAt) consider(trip.endsAt);
    else if (trip.pushOn !== null) consider(trip.pushOn.endsAt);
  }
  for (const job of jobs ?? []) {
    if (job.status === 'running') consider(job.endsAt);
  }
  return soonest;
}

/** The longest delay a browser timer takes (a larger one fires at once). */
export const MAX_TIMER_MS = 2 ** 31 - 1;

/** A moment's wait after a trip or job is due, so the server's clock has surely passed it too. */
const CHANGE_SLACK_MS = 50;

/** How long to wait (local ms) until server time `at`, capped for a timer. Never negative. */
export function changeDelay(at: number, serverNow: number): number {
  return Math.min(Math.max(0, at - serverNow) + CHANGE_SLACK_MS, MAX_TIMER_MS);
}

/** How long after `attention.recheckAt` to ask the server again: a moment, as after the dungeon's reset. */
export const RECHECK_GRACE_MS = RESET_GRACE_MS;

/** The second try, when the first was turned away because an action was running. */
export const RECHECK_RETRY_MS = 4_000;

/**
 * The wait (local ms, capped for a timer) before asking the server again for `recheckAt`, or null
 * when there is no such time or it is not in the future.
 */
export function recheckDelay(recheckAt: number | null, serverNow: number): number | null {
  if (recheckAt === null || recheckAt <= serverNow) return null;
  return Math.min(recheckAt - serverNow + RECHECK_GRACE_MS, MAX_TIMER_MS);
}
