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
import type { SchoolState, ValleyVisit, VisitorState } from '../api';
import { bonfireLine } from './bonfire-cast';
import { marketLine } from './market-view';
import { visitorLine } from './visitor-view';
import { readyLine, schoolLine } from './school-view';
import { commonsOf, placeMention } from './commons-view';
import { forgeSystemsLine, fullFloors, longWaits } from './forge-view';
import { fullPacks, signpostSystemsLine } from './signpost-view';
import { placeLabel, readingOrder } from './valley-logic';
import type { PlaceId } from './valley-art';
import { OPEN_PLACES, PAGE_TITLES, isOpenPlace, viewOf, type OpenPlaceId } from './valley-nav';

/** What a place's lines and bubbles read: the game screen's own state (a subset of the Home board's input). */
export type PlaceInput = Pick<
  HomeInput,
  'now' | 'timezone' | 'trips' | 'jobs' | 'creatures' | 'games' | 'pending' | 'attention' | 'raid'
> & {
  /** The valley's resting creatures (`VALLEY_SYSTEMS` on): the Bonfire's line is made from it; absent or null leaves the Bonfire "not open yet". */
  visit?: ValleyVisit | null;
  /** What the server said of the weekly visitor (`VALLEY_SYSTEMS` on): his place's line says his stall is open or he is back Thursday; absent or null leaves it "not open yet". */
  visitor?: VisitorState | null;
  /** What the server said of the School (`VALLEY_SYSTEMS` on): its line says where the teacher stands and how many are ready to graduate; absent or null leaves it "not open yet" (the ceremony's count still shows). */
  school?: SchoolState | null;
};

/** A bubble over a place: the glyph of what waits, a count when there is more than one, its spoken words. */
export interface PlaceBubble {
  place: PlaceId;
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
  // With the valley's systems a full pack is the Signpost's news (V-SCOUT-4: "pack full"); trips are gone, so no tab pip says it.
  const full = input.visit == null ? 0 : fullPacks(input.visit);
  if (full > 0 && !out.some((b) => b.place === 'signpost')) {
    out.push({
      place: 'signpost',
      glyph: 'satchel',
      count: full > 1 ? full : null,
      spoken:
        full === 1 ? 'A scout\u2019s pack is full' : `${String(full)} scouts\u2019 packs are full`,
    });
  }
  // The Forge's news (V-FORGE-4, V-FORGE-5): a full floor, or a shortage that has lasted more than a day; never in the return walk.
  const floors = input.visit == null ? 0 : fullFloors(input.visit);
  const waits = input.visit == null ? 0 : longWaits(input.visit);
  if (floors + waits > 0 && !out.some((b) => b.place === 'forge')) {
    const n = floors + waits;
    out.push({
      place: 'forge',
      glyph: 'anvil',
      count: n > 1 ? n : null,
      spoken:
        floors > 0
          ? floors === 1
            ? 'A floor is full'
            : `${String(floors)} floors are full`
          : 'An anvil has waited on an input for a day',
    });
  }
  // The School's news (V-TRIAL-3, V-SCH-11): creatures ready to graduate, else a lesson one of yours could take with a seat free.
  const ready = input.visit?.graduation?.ready ?? 0;
  const school = input.school;
  const lesson =
    school !== undefined &&
    school !== null &&
    school.phase === 'here' &&
    school.talent !== null &&
    school.wouldLearn.some((id) => !school.seats.some((s) => s.creatureId === id)) &&
    school.seats.some((s) => s.creatureId === null);
  if (ready > 0) {
    out.push({
      place: 'school',
      glyph: 'sparkle',
      count: ready > 1 ? ready : null,
      spoken: readyLine(ready) ?? '',
    });
  } else if (lesson) {
    out.push({
      place: 'school',
      glyph: 'hand',
      count: null,
      spoken: 'The visiting teacher has a lesson one of yours can take',
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
  // With the valley's systems there are scouts at seats, not trips.
  if (input.visit != null) return signpostSystemsLine(input.visit);
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
  // With the valley's systems there are smiths at anvils, not timed jobs.
  if (input.visit != null) return forgeSystemsLine(input.visit);
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
  out.bonfire = bonfireLine(input.visit, input.creatures) ?? out.bonfire;
  out.market = marketLine(input.visit) ?? out.market;
  out.visitor = visitorLine(input.visitor) ?? out.visitor;
  out.school = schoolLine(input.school, input.visit?.graduation) ?? out.school;
  // A project that is being built gets a mention (it matters: it has a clock); an open one does not, the board says it.
  const commons = commonsOf(input.visit);
  for (const id of ['bonfire', 'forge', 'signpost', 'paddock'] as const) {
    const mention = placeMention(commons, id);
    if (mention === null) continue;
    // The Bonfire's line is only its resting count, so the hearth takes its place; the other lines keep what they say.
    out[id] = id === 'bonfire' ? mention : `${out[id]} · ${mention}`;
  }
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
 * The Places list's order: the places with something waiting first, then the other open places (`opened` adds the
 * places a flag opened, the Bonfire), then the places not open yet last; each group in the map's reading order.
 */
export function listOrder(
  bubbles: readonly PlaceBubble[],
  opened: readonly PlaceId[] = [],
): PlaceId[] {
  const all = readingOrder();
  const open = (id: PlaceId): boolean => isOpenPlace(id) || opened.includes(id);
  const waiting = all.filter((id) => bubbleAt(bubbles, id) !== undefined);
  const rest = all.filter((id) => bubbleAt(bubbles, id) === undefined);
  return [...waiting, ...rest.filter(open), ...rest.filter((id) => !open(id))];
}
