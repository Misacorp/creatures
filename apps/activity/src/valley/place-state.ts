/**
 * What each place has for you and what it is doing next, worked out from what the game screen already holds
 * (today's pips, trips, jobs, Games view, attention block and raid schedule; no request of its own). Pure.
 *
 * - `placeBubbles`: the bubble of every place that has something waiting, from today's pips (`tab-alerts.ts`)
 *   mapped tab to place with `viewOf`: a glyph, and a count where the waiting thing counts (trips, jobs,
 *   catches, events to enter).
 * - `placeStates`: the Places list's second column, phrased as what happens next ("Pip back in 2 h"). A place
 *   whose data has not loaded keeps its page's name. Nothing here says what you missed (valley goals, F-1).
 */
import { emptyEvents, showLive } from '../games-view';
import { jobProgress, openJobs } from '../gear-view';
import { explorerName, legEnd, tripCounts, type HomeInput } from '../home-view';
import { ALERT_TEXT, type TabAlerts } from '../tab-alerts';
import { TABS, type Tab } from '../tabs';
import { formatCountdown, formatZoned } from '../time-format';
import { placeLabel, readingOrder } from './valley-logic';
import type { PlaceId } from './valley-art';
import { OPEN_PLACES, PAGE_TITLES, isOpenPlace, viewOf, type OpenPlaceId } from './valley-nav';

/** What a place's lines and bubbles read: the game screen's own state (a subset of the Home board's input). */
export type PlaceInput = Pick<
  HomeInput,
  'now' | 'timezone' | 'trips' | 'jobs' | 'creatures' | 'games' | 'pending' | 'attention' | 'raid'
>;

/** A bubble over a place: the glyph of what waits, a count when there is more than one, its spoken words. */
export interface PlaceBubble {
  place: OpenPlaceId;
  glyph: string;
  /** How many wait, when it is more than one; else null. */
  count: number | null;
  /** What waits, in words, for the place's spoken name. */
  spoken: string;
}

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : `${String(n)} ${many}`;

/** How many things wait behind a tab's pip, where the pip counts them. */
function countOf(tab: Tab, alert: string, input: PlaceInput): number {
  switch (tab) {
    case 'expeditions': {
      const { home, choice } = tripCounts(input.trips, input.now);
      return home.length + choice.length;
    }
    case 'workshop':
      return openJobs(input.jobs ?? []).filter((j) => jobProgress(j, input.now).ready).length;
    case 'collection':
      return input.pending;
    case 'games':
      return alert === ALERT_TEXT.gamesEntries && input.games !== null
        ? emptyEvents(input.games.next, input.creatures).length
        : 0;
    default:
      return 0;
  }
}

function spokenOf(tab: Tab, alert: string, count: number): string {
  if (count < 2) return alert;
  switch (tab) {
    case 'expeditions':
      return `${String(count)} trips need you`;
    case 'workshop':
      return `${String(count)} jobs are ready`;
    case 'collection':
      return `${String(count)} catches await your choice`;
    case 'games':
      return `${String(count)} events to enter`;
    default:
      return alert;
  }
}

/** One bubble per place that has a pip on one of its tabs (the first tab's, in the order of the tabs). */
export function placeBubbles(alerts: TabAlerts, input: PlaceInput): PlaceBubble[] {
  const out: PlaceBubble[] = [];
  for (const def of TABS) {
    const alert = alerts[def.id];
    if (alert === null) continue;
    const view = viewOf(def.id, 'house');
    if (view.kind !== 'place' || out.some((b) => b.place === view.place)) continue;
    const count = countOf(def.id, alert, input);
    out.push({
      place: view.place,
      glyph: def.glyph,
      count: count > 1 ? count : null,
      spoken: spokenOf(def.id, alert, count),
    });
  }
  return out;
}

/** The place's bubble, if it has one. */
export function bubbleAt(bubbles: readonly PlaceBubble[], id: PlaceId): PlaceBubble | undefined {
  return bubbles.find((b) => b.place === id);
}

/** A place's spoken name, with what waits there ("Forge, Workshop. A job is ready"). */
export function placeSpoken(id: PlaceId, bubble: PlaceBubble | undefined): string {
  return bubble === undefined ? placeLabel(id) : `${placeLabel(id)}. ${bubble.spoken}`;
}

const after = (ms: number): string => formatCountdown(ms, 'short');

function signpostLine(input: PlaceInput): string {
  const { now } = input;
  const { home, choice, out } = tripCounts(input.trips, now);
  const waiting = home.length + choice.length;
  if (waiting === 1) return choice.length === 1 ? 'an explorer waits' : 'a trip is home';
  if (waiting > 1) return `${String(waiting)} trips need you`;
  const [first] = out;
  if (first === undefined) return 'nobody is out';
  return out.length === 1
    ? `${explorerName(first, input.creatures)} back in ${after(legEnd(first, now) - now)}`
    : `${String(out.length)} trips out`;
}

function forgeLine(input: PlaceInput): string | null {
  if (input.jobs === null) return null;
  const { now } = input;
  const open = openJobs(input.jobs);
  const ready = open.filter((j) => jobProgress(j, now).ready).length;
  if (ready > 0) return ready === 1 ? 'a job waits' : `${String(ready)} jobs wait`;
  const [soonest] = open.map((j) => j.endsAt).sort((a, b) => a - b);
  if (soonest === undefined) return 'no job running';
  return open.length === 1
    ? `a job done in ${after(soonest - now)}`
    : `first of ${String(open.length)} jobs in ${after(soonest - now)}`;
}

function arenaLine(input: PlaceInput): string | null {
  if (input.attention?.raid === true) return 'creatures to place';
  const { raid, now, timezone } = input;
  if (raid === null) return null;
  const [next] = Object.values(raid.schedule)
    .filter((at) => at > now)
    .sort((a, b) => a - b);
  if (next === undefined) return "this week's raid is over";
  if (timezone === null) return `raid in ${after(next - now)}`;
  const [today] = formatZoned(now, timezone, 'long').split(' ');
  const [day] = formatZoned(next, timezone, 'long').split(' ');
  return day === today ? 'raid today' : `raid ${day ?? ''}`.trim();
}

function caveLine(input: PlaceInput): string | null {
  if (input.attention === null) return null;
  return input.attention.dungeon ? 'a run waits' : 'no run waiting';
}

function fairLine(input: PlaceInput): string | null {
  const view = input.games;
  if (view === null) return null;
  const { now } = input;
  if (showLive(view, now)) return 'the show is on';
  if (now < view.next.lockAt) {
    const n = emptyEvents(view.next, input.creatures).length;
    if (n > 0) return `${plural(n, 'an event', 'events')} to enter`;
    return `entries close in ${after(view.next.lockAt - now)}`;
  }
  if (now < view.next.showAt) return `show in ${after(view.next.showAt - now)}`;
  return 'results are in';
}

function paddockLine(input: PlaceInput): string {
  if (input.pending > 0) return `${plural(input.pending, 'a newcomer', 'newcomers')} at the gate`;
  const home = input.creatures.filter((c) => !c.away && c.busy === null).length;
  return home === 0 ? 'none at home' : `${String(home)} at home`;
}

/** What a place's row says when its data is not here yet (or it is not open): its page, or that it is not open. */
export function placeFallback(id: PlaceId): string {
  return isOpenPlace(id) ? PAGE_TITLES[id] : 'not open yet';
}

/** Every place's row line: what happens next there. */
export function placeStates(input: PlaceInput): Record<PlaceId, string> {
  const lines: Record<OpenPlaceId, string | null> = {
    signpost: signpostLine(input),
    forge: forgeLine(input),
    arena: arenaLine(input),
    cave: caveLine(input),
    fair: fairLine(input),
    paddock: paddockLine(input),
    house: 'Journal, Stats',
  };
  const out = {} as Record<PlaceId, string>;
  for (const id of OPEN_PLACES) out[id] = lines[id] ?? placeFallback(id);
  for (const id of ['bonfire', 'school', 'visitor', 'market'] as const) out[id] = placeFallback(id);
  return out;
}

/** How long after the finale begins the raid still counts as live (ms): the glance holds the start times only. */
export const LIVE_WINDOW_MS = 30 * 60 * 1000;

/**
 * When the week's raid comes, as the Arena band's small label: "live now" while the finale plays, "today" on the
 * guild's day of the finale, else its weekday ("Saturday"). Nothing once it is over, before the raid view has
 * loaded, or while the timezone is not known (never a guessed day). No HP: that stays on the raid page.
 */
export function raidTiming(
  raid: HomeInput['raid'],
  now: number,
  timezone: string | null,
): string | null {
  if (raid === null || timezone === null) return null;
  const finale = raid.schedule.finale;
  if (now >= finale) return now < finale + LIVE_WINDOW_MS ? 'live now' : null;
  const [today] = formatZoned(now, timezone, 'long').split(' ');
  const [day] = formatZoned(finale, timezone, 'long').split(' ');
  return day === undefined ? null : day === today ? 'today' : day;
}

/**
 * The Places list's order: the places with something waiting first, then the other open places, then the four
 * not-yet-open places last; each group in the map's reading order.
 */
export function listOrder(bubbles: readonly PlaceBubble[]): PlaceId[] {
  const all = readingOrder();
  const waiting = all.filter((id) => bubbleAt(bubbles, id) !== undefined);
  const rest = all.filter((id) => bubbleAt(bubbles, id) === undefined);
  return [...waiting, ...rest.filter(isOpenPlace), ...rest.filter((id) => !isOpenPlace(id))];
}
