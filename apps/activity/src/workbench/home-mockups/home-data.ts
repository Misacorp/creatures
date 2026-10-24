import type { Attention, Creature } from '../../api';
import type { Trip } from '../../expedition-types';
import gearRunning from '../../fixtures/gear-running.json';
import { parseGearState } from '../../gear-parse';
import type { Job } from '../../gear-types';
import type { GamesView } from '../../games-types';
import type { HomeInput, RaidGlance } from '../../home-view';
import { sampleForecast } from '../data';
import { gamesRoster, gamesView } from '../games-tab-sample';
import { CREATURES, tripIn } from '../entries/trips';

/**
 * Fixture data for the Home page design round (dev only). One fixed "now", Saturday 13 February 2027, 10:00 in
 * Helsinki, so every screenshot reads the same: the Games lock at 13:37, a trip back at 15:20, a job ready at
 * 14:05, Phase 2 of the raid at 13:37 and its finale on Sunday at 20:00. The trips, jobs, Games view and
 * forecast are the same samples the other workbench pages use, moved to that clock.
 */

export const HOME_NOW = Date.UTC(2027, 1, 13, 8, 0);
export const HOME_TZ = 'Europe/Helsinki';

const HOUR = 3_600_000;
const MINUTE = 60_000;
/** A time of day in Helsinki (UTC+2 in February) on the fixture's Saturday. */
const at = (hour: number, minute: number): number => Date.UTC(2027, 1, 13, hour - 2, minute);

export const HOME_STATES = ['busy', 'nothing waiting', 'crowded'] as const;
export type HomeState = (typeof HOME_STATES)[number];

/** A trip of the sample explorers that ends at `endsAt` (an active trip still out). */
function tripEnding(n: number, endsAt: number): Trip {
  const base = tripIn('running', n);
  const length = base.endsAt - base.startedAt;
  return {
    ...base,
    id: `home-trip-${String(n)}`,
    startedAt: endsAt - length,
    endsAt,
    readyAt: endsAt,
  };
}

/** A trip that came home `ago` ms before the fixture's now. */
function tripHome(n: number, ago: number): Trip {
  return { ...tripEnding(n, HOME_NOW - ago), id: `home-trip-${String(n)}` };
}

/** A trip with the end-of-trip push-on choice waiting. */
function tripChoice(n: number): Trip {
  const home = tripIn('push-on pending', n);
  const length = home.endsAt - home.startedAt;
  const end = HOME_NOW - 10 * MINUTE;
  return {
    ...home,
    id: `home-trip-${String(n)}`,
    startedAt: end - length,
    endsAt: end,
    readyAt: end,
  };
}

const GEAR_JOBS: Job[] = parseGearState(gearRunning).jobs;

/** A Workshop job (the sample craft) ending at `endsAt`; ready when that is past. */
function job(n: number, endsAt: number): Job {
  const base = GEAR_JOBS.find((j) => j.kind === 'craft') ?? GEAR_JOBS[0];
  if (base === undefined) throw new Error('the gear fixture has no job');
  const length = 3 * HOUR;
  return {
    ...base,
    id: `home-job-${String(n)}`,
    startedAt: endsAt - length,
    endsAt,
    status: endsAt <= HOME_NOW ? 'ready' : 'running',
  };
}

/** The Games view of the fixture day, its clock moved to the fixture's: entries close at 13:37, the show is at 14:00. */
function games(entered: boolean): GamesView {
  const { view } = gamesView(entered ? 'entries: all entered' : 'entries: one entered');
  return {
    ...view,
    serverNow: HOME_NOW,
    phase: 'entries',
    next: { ...view.next, open: true, lockAt: at(13, 37), showAt: at(14, 0) },
  };
}

/** The raid week: Phase 1 is done, Phase 2 is next today, the finale is Sunday at 20:00. */
export const RAID: RaidGlance = {
  schedule: {
    weekStart: at(13, 37) - 6 * 24 * HOUR,
    phase1: at(13, 37) - 24 * HOUR,
    phase2: at(13, 37),
    finale: at(20, 0) + 24 * HOUR,
  },
  next: { event: 'phase2', at: at(13, 37) },
};

const NO_ATTENTION: Attention = { dungeon: false, raid: false, recheckAt: null };
const ALL_ATTENTION: Attention = { dungeon: true, raid: true, recheckAt: null };

/** The nine creatures: the three explorers of the trip samples and the six of the Games roster. */
export const HOME_CREATURES: Creature[] = [...CREATURES, ...gamesRoster()];

/** Everything the Home page reads, for a day. `raid` false leaves the raid's schedule out (the game screen does not hold it today). */
export function homeInput(state: string, raid: boolean): HomeInput {
  const common = {
    now: HOME_NOW,
    timezone: HOME_TZ,
    creatures: HOME_CREATURES,
    raid: raid ? RAID : null,
    forecast: sampleForecast('boon and omen'),
  };
  if (state === 'nothing waiting') {
    return {
      ...common,
      trips: [tripEnding(1, at(15, 20)), tripEnding(2, at(18, 5))],
      jobs: [job(1, at(14, 5))],
      games: games(true),
      pending: 0,
      attention: NO_ATTENTION,
    };
  }
  if (state === 'crowded') {
    return {
      ...common,
      trips: [
        tripHome(0, 40 * MINUTE),
        tripChoice(1),
        tripHome(2, 3 * HOUR),
        tripEnding(3, at(15, 20)),
      ],
      jobs: [job(1, HOME_NOW - 20 * MINUTE), job(2, HOME_NOW - 2 * HOUR), job(3, at(14, 5))],
      games: games(false),
      pending: 3,
      attention: ALL_ATTENTION,
    };
  }
  return {
    ...common,
    trips: [tripHome(0, 40 * MINUTE), tripEnding(1, at(15, 20)), tripEnding(2, at(18, 5))],
    jobs: [job(1, HOME_NOW - 20 * MINUTE), job(2, at(14, 5))],
    games: games(false),
    pending: 0,
    attention: ALL_ATTENTION,
  };
}
