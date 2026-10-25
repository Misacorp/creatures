/**
 * What the Home page says, as plain data worked out from what the game screen already holds (the trips, the
 * Workshop's jobs, the Games view, the attention block, the forecast, the creatures, the raid's schedule). Pure:
 * the caller passes the server time and the guild's timezone. Nothing here asks the server for anything.
 * `home/board.ts` turns these rows into the Today board's notices.
 *
 * The raid's schedule comes from the raid view the game loads when it opens (`use-raid-glance.ts`). It is an
 * optional input: every line that needs it is left out when it is null (the load failed or has not landed).
 */
import type { Attention, Creature } from './api';
import { creaturesNeedLine, type NeedsState } from './creature-needs';
import { creatureName } from './game';
import type { GamesView } from './games-types';
import { emptyEvents, gamesAlert } from './games-view';
import type { Job } from './gear-types';
import { jobProgress, jobTitle, openJobs } from './gear-view';
import { eventTitle } from './raid-time';
import type { RaidEventId } from './raid-api';
import { ALERT_TEXT, tabAlerts, type TabAlerts } from './tab-alerts';
import type { Tab } from './tabs';
import { TABS } from './tabs';
import { formatCountdown, formatZoned } from './time-format';
import { destinationName, tripStatus } from './trip-view';
import type { Trip } from './expedition-types';
import { skyKind, skyNames, type SkyKind } from './weather-view';
import type { Forecast } from './weather-types';

/** The part of the Raid view the Home page uses: the week's times (UTC epoch ms). */
export interface RaidGlance {
  schedule: Readonly<Record<RaidEventId, number>>;
}

export interface HomeInput {
  /** Server time now (UTC epoch ms). */
  now: number;
  /**
   * The guild's timezone, always passed. Null while it is not known (it comes with the state only): the
   * board then leaves out every time of day instead of guessing one.
   */
  timezone: string | null;
  trips: readonly Trip[];
  /** The Workshop's jobs, or null while they have not loaded. */
  jobs: readonly Job[] | null;
  creatures: readonly Creature[];
  /** The Games view, or null while it has not loaded. */
  games: GamesView | null;
  /** Duplicates waiting for a choice. */
  pending: number;
  attention: Attention | null;
  /**
   * What the Creatures notice reads (balances, the waiting catches, the Talent Book price), the game state itself.
   * Absent: the notice speaks of the waiting catches only.
   */
  creatureState?: NeedsState;
  raid: RaidGlance | null;
  forecast: Forecast | null;
}

/** "15:20" on the same local day as `now`, else "Sun 20:00". */
export function whenText(now: number, at: number, timezone: string): string {
  const [nowDay] = formatZoned(now, timezone, 'short').split(' ');
  const [atDay, atTime] = formatZoned(at, timezone, 'short').split(' ');
  return nowDay === atDay ? (atTime ?? '') : `${atDay ?? ''} ${atTime ?? ''}`;
}

const placeLabel = (id: Tab): string => TABS.find((t) => t.id === id)?.label ?? id;
const placeGlyph = (id: Tab): string => TABS.find((t) => t.id === id)?.glyph ?? 'unknown';

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? `1 ${one}` : `${String(n)} ${many}`;

/** The pips of every place, by the game's own rules (the same call the game screen makes). */
export function homeAlerts(input: HomeInput): TabAlerts {
  return tabAlerts({
    expeditions: input.trips,
    jobs: input.jobs,
    attention: input.attention,
    pending: input.pending,
    games: gamesAlert(input.games, input.creatures, input.now),
    serverNow: input.now,
  });
}

// --- Expeditions ---

interface TripCounts {
  /** Trips home or waiting for the push-on choice (they need the player). */
  home: Trip[];
  choice: Trip[];
  /** Trips still out (a trip itself or a push-on), the soonest first. */
  out: Trip[];
}

function tripCounts(trips: readonly Trip[], now: number): TripCounts {
  const counts: TripCounts = { home: [], choice: [], out: [] };
  for (const trip of trips) {
    if (trip.status !== 'active') continue;
    const { phase } = tripStatus(trip, now);
    if (phase === 'ready') counts.home.push(trip);
    else if (phase === 'choice') counts.choice.push(trip);
    else counts.out.push(trip);
  }
  counts.out.sort((a, b) => legEnd(a, now) - legEnd(b, now));
  return counts;
}

/** When the leg a trip is on ends. */
function legEnd(trip: Trip, now: number): number {
  return tripStatus(trip, now).remainingMs + now;
}

function explorerName(trip: Trip, creatures: readonly Creature[]): string {
  const creature = creatures.find((c) => c.id === trip.creatureId);
  return creature === undefined ? 'An explorer' : creatureName(creature);
}

// --- Needs you ---

export interface NeedRow {
  place: Tab;
  label: string;
  glyph: string;
  /** What is waiting, in a sentence. */
  reason: string;
  /** A time that matters ("by 13:37"), or null. */
  until: string | null;
  /** True when the notice opens its place with the "Needs you" filter on (the Creatures notice, for creatures that need you). */
  needsFilter: boolean;
}

/** The rows of "Needs you": one per place that has a pip, the most pressing first (a closing door before a finished job). */
export function needsYou(input: HomeInput): NeedRow[] {
  const alerts = homeAlerts(input);
  const { now, timezone } = input;
  const rows: NeedRow[] = [];
  const add = (
    place: Tab,
    reason: string,
    until: string | null = null,
    needsFilter = false,
  ): void => {
    rows.push({
      place,
      label: placeLabel(place),
      glyph: placeGlyph(place),
      reason,
      until,
      needsFilter,
    });
  };

  if (alerts.games !== null && input.games !== null) {
    if (alerts.games === ALERT_TEXT.gamesLive) add('games', 'The show is on');
    else {
      const n = emptyEvents(input.games.next, input.creatures).length;
      add(
        'games',
        `${plural(n, 'event is', 'events are')} open to enter`,
        timezone === null ? null : `by ${whenText(now, input.games.next.lockAt, timezone)}`,
      );
    }
  }
  if (alerts.raid !== null) add('raid', 'Creatures to place');
  if (alerts.expeditions !== null) {
    const { home, choice } = tripCounts(input.trips, now);
    const waiting = [...choice, ...home];
    const [one] = waiting;
    if (waiting.length === 1 && one !== undefined) {
      const who = explorerName(one, input.creatures);
      add(
        'expeditions',
        choice.length === 1
          ? `${who} wants to push on from ${destinationName(one.destination)}`
          : `${who} is home from ${destinationName(one.destination)}`,
      );
    } else add('expeditions', `${String(waiting.length)} trips need you`);
  }
  if (alerts.workshop !== null && input.jobs !== null) {
    const ready = openJobs(input.jobs).filter((j) => jobProgress(j, now).ready);
    const [one] = ready;
    add(
      'workshop',
      ready.length === 1 && one !== undefined
        ? `${jobTitle(one)} is ready`
        : `${String(ready.length)} jobs are ready`,
    );
  }
  if (alerts.dungeon !== null) add('dungeon', "Today's run is open");
  // The Creatures notice: the waiting catches (the place's pip) and the creatures that can do something now.
  const catches =
    alerts.collection === null
      ? null
      : `${plural(input.pending, 'catch awaits', 'catches await')} your choice`;
  const creaturesLine =
    input.creatureState === undefined
      ? null
      : creaturesNeedLine(input.creatures, input.creatureState);
  const reasons = [catches, creaturesLine].filter((r): r is string => r !== null);
  if (reasons.length > 0) add('collection', reasons.join('; '), null, creaturesLine !== null);
  return rows;
}

// --- Coming up ---

export interface ComingRow {
  at: number;
  place: Tab;
  glyph: string;
  text: string;
  /** "15:20" or "Sun 20:00". */
  when: string;
  /** "in 5 h 20 m". */
  rel: string;
}

/** The next things on the clock, soonest first, at most `limit` (default five, so the raid's finale fits beside four others). One row each for trips, jobs, the Games and the raid. */
export function comingUp(input: HomeInput, limit = 5): ComingRow[] {
  const { now, timezone } = input;
  // Without the guild's timezone a time of day would be a guess: no rows.
  if (timezone === null) return [];
  const rows: ComingRow[] = [];
  const add = (at: number, place: Tab, text: string): void => {
    if (at <= now) return;
    rows.push({
      at,
      place,
      glyph: placeGlyph(place),
      text,
      when: whenText(now, at, timezone),
      rel: `in ${formatCountdown(at - now, 'short')}`,
    });
  };

  const view = input.games;
  if (view !== null) {
    if (view.next.open && now < view.next.lockAt) add(view.next.lockAt, 'games', 'Games lock');
    else add(view.next.showAt, 'games', 'Games show');
  }
  const { out } = tripCounts(input.trips, now);
  const [soonestTrip] = out;
  if (soonestTrip !== undefined) {
    add(
      legEnd(soonestTrip, now),
      'expeditions',
      out.length === 1
        ? `${explorerName(soonestTrip, input.creatures)} is back`
        : `First of ${String(out.length)} trips is back`,
    );
  }
  const running = openJobs(input.jobs ?? []).filter((j) => !jobProgress(j, now).ready);
  const [soonestJob] = running;
  if (soonestJob !== undefined) {
    add(
      soonestJob.endsAt,
      'workshop',
      running.length === 1
        ? `${jobTitle(soonestJob)} is ready`
        : `First of ${String(running.length)} jobs is ready`,
    );
  }
  const raid = input.raid;
  if (raid !== null) {
    // The next phase still to come (the schedule alone says which, so a stale load never shows a past one), then the finale.
    const phase = (['phase1', 'phase2'] as const).find((event) => raid.schedule[event] > now);
    if (phase !== undefined) add(raid.schedule[phase], 'raid', `Raid: ${eventTitle(phase)}`);
    add(raid.schedule.finale, 'raid', 'Raid finale');
  }
  return rows.sort((a, b) => a.at - b.at).slice(0, limit);
}

// --- Quiet places ---

export interface QuietRow {
  place: Tab;
  label: string;
  glyph: string;
  /** One calm line ("No run waiting"). */
  text: string;
}

/**
 * The places with nothing going on and nothing waiting, one calm line each: no trip out, no job running, no
 * dungeon run open, the raid week over, the Games show over. A place the client does not hold the data for
 * yet (its view has not loaded) is left out, not called quiet. A place that waits for the player or is
 * running something is not here: it has a row in "Needs you" or "Coming up".
 */
export function quietRows(input: HomeInput): QuietRow[] {
  const { now } = input;
  const alerts = homeAlerts(input);
  const rows: QuietRow[] = [];
  const add = (place: Tab, text: string): void => {
    rows.push({ place, label: placeLabel(place), glyph: placeGlyph(place), text });
  };
  const trips = tripCounts(input.trips, now);
  if (alerts.expeditions === null && trips.out.length === 0) add('expeditions', 'Nobody is out');
  if (input.jobs !== null && alerts.workshop === null) {
    if (openJobs(input.jobs).length === 0) add('workshop', 'No job running');
  }
  if (input.attention !== null && alerts.dungeon === null) add('dungeon', 'No run waiting');
  if (input.raid !== null && alerts.raid === null && now >= input.raid.schedule.finale) {
    add('raid', "This week's raid is over");
  }
  if (input.games !== null && alerts.games === null && now >= input.games.next.showAt) {
    add('games', 'Results are in');
  }
  return rows;
}

// --- The valley today ---

export interface ValleyToday {
  kind: SkyKind;
  /** "Fair Winds and Heavy Rain", or null with no forecast. */
  sky: string | null;
  /** Today's Games events, in order. */
  lineup: { id: string; name: string; kind: string; scene: string }[];
}

export function valleyToday(input: HomeInput): ValleyToday {
  const today = input.forecast?.today ?? null;
  return {
    kind: skyKind(today),
    sky: today === null ? null : skyNames(today),
    lineup: (input.games?.next.lineup ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      scene: e.scene,
    })),
  };
}

/** The line when nothing waits, in the game's calm voice. */
export const CALM_LINE = 'All quiet in the valley. The fire is lit and nothing needs you.';
