/**
 * What the Home page says, as plain data worked out from what the game screen already holds (the trips, the
 * Workshop's jobs, the Games view, the attention block, the forecast, the creatures). Pure: the caller passes
 * the server time and the guild's timezone. Nothing here asks the server for anything. The two layouts of the
 * design round (a "Today board" and "Place cards") both read this, so the words are the same in each.
 *
 * The raid's schedule is the one thing the game screen does not hold today (the Raid tab loads its own view,
 * and the attention block only says "creatures to place"): it is an optional input, and every line that needs
 * it simply reads shorter, or is left out, when it is null.
 */
import type { Attention, Creature } from './api';
import { creatureName } from './game';
import type { GamesView } from './games-types';
import { emptyEvents, gamesAlert, showLive } from './games-view';
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

/** The part of the Raid view the Home page can use (the week's times, the next one, the guild's timezone). */
export interface RaidGlance {
  schedule: Readonly<Record<RaidEventId, number>>;
  next: { event: RaidEventId; at: number } | null;
}

export interface HomeInput {
  /** Server time now (UTC epoch ms). */
  now: number;
  /** The guild's timezone, always passed. */
  timezone: string;
  trips: readonly Trip[];
  /** The Workshop's jobs, or null while they have not loaded. */
  jobs: readonly Job[] | null;
  creatures: readonly Creature[];
  /** The Games view, or null while it has not loaded. */
  games: GamesView | null;
  /** Duplicates waiting for a choice. */
  pending: number;
  attention: Attention | null;
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

function expeditionsLine(input: HomeInput): string {
  const { home, choice, out } = tripCounts(input.trips, input.now);
  const waiting = home.length + choice.length;
  const parts: string[] = [];
  if (waiting > 0)
    parts.push(choice.length > 0 && waiting === 1 ? 'Push on?' : `${String(waiting)} home`);
  const first = out[0];
  if (first !== undefined) {
    const back = whenText(input.now, legEnd(first, input.now), input.timezone);
    parts.push(
      parts.length === 0 || out.length > 1
        ? `${String(out.length)} out, next back ${back}`
        : `1 out, back ${back}`,
    );
  }
  return parts.length === 0 ? 'Nobody out' : parts.join(', ');
}

// --- Workshop ---

function workshopLine(input: HomeInput): string | null {
  if (input.jobs === null) return null;
  const open = openJobs(input.jobs);
  if (open.length === 0) return 'No job running';
  const ready = open.filter((j) => jobProgress(j, input.now).ready).length;
  const running = open.filter((j) => !jobProgress(j, input.now).ready);
  const first = running[0];
  const parts: string[] = [];
  if (ready > 0) parts.push(ready === 1 ? 'Job ready' : `${String(ready)} jobs ready`);
  if (first !== undefined) {
    const at = whenText(input.now, first.endsAt, input.timezone);
    parts.push(
      running.length > 1
        ? `${String(running.length)} running, next ${at}`
        : `1 running, ready ${at}`,
    );
  }
  return parts.join(', ');
}

// --- Games ---

function gamesLine(input: HomeInput): string | null {
  const view = input.games;
  if (view === null) return null;
  const { now, timezone } = input;
  if (showLive(view, now)) return 'The show is on';
  const { next } = view;
  if (now < next.lockAt && next.open) {
    const waiting = emptyEvents(next, input.creatures).length;
    const lock = whenText(now, next.lockAt, timezone);
    return waiting > 0
      ? `Enter by ${lock}`
      : `Entered, show ${whenText(now, next.showAt, timezone)}`;
  }
  if (now < next.showAt) return `Show at ${whenText(now, next.showAt, timezone)}`;
  return 'Results are in';
}

// --- Raid and the rest ---

function raidLine(input: HomeInput): string | null {
  const place = input.attention?.raid === true;
  const next = input.raid?.next ?? null;
  if (place) return 'Creatures to place';
  if (next === null) return input.raid === null ? null : 'This week is done';
  return `${eventTitle(next.event)} ${whenText(input.now, next.at, input.timezone)}`;
}

function dungeonLine(input: HomeInput): string | null {
  if (input.attention === null) return null;
  return input.attention.dungeon ? 'Run open' : 'No run waiting';
}

function creaturesLine(input: HomeInput): string {
  const count = plural(input.creatures.length, 'creature', 'creatures');
  return input.pending > 0
    ? `${count}, ${plural(input.pending, 'catch', 'catches')} to answer`
    : count;
}

// --- Place cards (variant B) ---

export interface PlaceCardView {
  id: Tab;
  label: string;
  glyph: string;
  /** One line of status, or null when the client does not hold what it needs. */
  status: string | null;
  /** The pip's reason (the words a screen reader adds), or null. */
  pip: string | null;
}

/** The six places in the order of the card grid, each with its status line and its pip. */
export function placeCards(input: HomeInput): PlaceCardView[] {
  const alerts = homeAlerts(input);
  const lines: Record<Tab, string | null> = {
    expeditions: expeditionsLine(input),
    workshop: workshopLine(input),
    raid: raidLine(input),
    games: gamesLine(input),
    dungeon: dungeonLine(input),
    collection: creaturesLine(input),
  };
  const order: Tab[] = ['expeditions', 'workshop', 'raid', 'games', 'dungeon', 'collection'];
  return order.map((id) => ({
    id,
    label: placeLabel(id),
    glyph: placeGlyph(id),
    status: lines[id],
    pip: alerts[id],
  }));
}

// --- Needs you (variant A) ---

export interface NeedRow {
  place: Tab;
  label: string;
  glyph: string;
  /** What is waiting, in a sentence. */
  reason: string;
  /** A time that matters ("by 13:37"), or null. */
  until: string | null;
}

/** The rows of "Needs you": one per place that has a pip, the most pressing first (a closing door before a finished job). */
export function needsYou(input: HomeInput): NeedRow[] {
  const alerts = homeAlerts(input);
  const { now, timezone } = input;
  const rows: NeedRow[] = [];
  const add = (place: Tab, reason: string, until: string | null = null): void => {
    rows.push({ place, label: placeLabel(place), glyph: placeGlyph(place), reason, until });
  };

  if (alerts.games !== null && input.games !== null) {
    if (alerts.games === ALERT_TEXT.gamesLive) add('games', 'The show is on');
    else {
      const n = emptyEvents(input.games.next, input.creatures).length;
      add(
        'games',
        `${plural(n, 'event is', 'events are')} open to enter`,
        `by ${whenText(now, input.games.next.lockAt, timezone)}`,
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
  if (alerts.collection !== null) {
    add('collection', `${plural(input.pending, 'catch awaits', 'catches await')} your choice`);
  }
  return rows;
}

// --- Coming up (variant A) ---

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

/** The next things on the clock, soonest first, at most `limit` (default four). One row each for trips, jobs, the Games and the raid. */
export function comingUp(input: HomeInput, limit = 4): ComingRow[] {
  const { now, timezone } = input;
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
    if (raid.next !== null && raid.next.event !== 'finale') {
      add(raid.next.at, 'raid', `Raid: ${eventTitle(raid.next.event)}`);
    }
    add(raid.schedule.finale, 'raid', 'Raid finale');
  }
  return rows.sort((a, b) => a.at - b.at).slice(0, limit);
}

// --- The valley today (variant A) ---

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
