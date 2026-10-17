/**
 * The forecast as plain data for the screens: the wall calendar in the living room (its picture, its
 * label and its now-and-then speech bubble), the card it opens, and the one compact line on the raid card
 * and the dungeon card. Pure: the words are the server's (`GET /api/weather`); nothing here works out a
 * number or draws a random one (the bubble takes an injected `Rng`, the browser's crypto source on screen).
 */
import { int, type Rng } from '@creatures/game';
import type { Forecast, WeatherDay, WeatherEntry } from './weather-types';

/** The calendar's picture: no page yet, a clear day, a day with an Omen, a day with a wild Omen. */
export type SkyKind = 'blank' | 'sun' | 'cloud' | 'storm';

/** The picture for a day: sun for a Boon alone, a cloud with an Omen, a storm with a wild one. */
export function skyKind(day: WeatherDay | null): SkyKind {
  if (day === null) return 'blank';
  if (day.omen === null) return 'sun';
  return day.wild ? 'storm' : 'cloud';
}

/** "Fair Winds and Heavy Rain", or just the Boon's name when there is no Omen. */
export function skyNames(day: WeatherDay): string {
  return day.omen === null ? day.boon.name : `${day.boon.name} and ${day.omen.name}`;
}

/** Everything an entry does, as the server wrote it: the raid and dungeon lines, then trips and the rest. */
export function entryLines(entry: WeatherEntry): string[] {
  return [...entry.fight, ...entry.trips];
}

/** The name the screen reader gets for the calendar button: what the sky is, and that it opens. */
export function calendarLabel(forecast: Forecast | null): string {
  const today = forecast?.today ?? null;
  if (today === null) return 'Wall calendar: no forecast yet. Open it.';
  return `Wall calendar: today is ${skyNames(today)}. Open the forecast.`;
}

/** Which of the two known days an instant falls in, or null (neither: a time past tomorrow). */
export function dayOfInstant(forecast: Forecast, at: number): 'today' | 'tomorrow' | null {
  for (const key of ['today', 'tomorrow'] as const) {
    const day = forecast[key];
    if (day !== null && at >= day.startsAt && at < day.endsAt) return key;
  }
  return null;
}

/**
 * The compact line of the raid card and the dungeon card: "Sky today: Fair Winds and Heavy Rain." With a
 * stage time (the raid's next stage) it names the day that stage is on when that is tomorrow ("Sky when
 * Phase 2 runs"), else today's. Null when there is nothing to say (no forecast).
 */
export function skyLine(
  forecast: Forecast | null,
  stage: { at: number; name: string } | null = null,
): { label: string; names: string; wild: boolean; kind: SkyKind } | null {
  if (forecast === null) return null;
  if (stage !== null) {
    const when = dayOfInstant(forecast, stage.at);
    const day = when === null ? null : forecast[when];
    // The stage runs under the weather of its own day: say so when that is tomorrow's.
    if (when === 'tomorrow' && day !== null) {
      return {
        label: `Sky when ${stage.name} runs`,
        names: skyNames(day),
        wild: day.wild,
        kind: skyKind(day),
      };
    }
  }
  const today = forecast.today;
  if (today === null) return null;
  return {
    label: 'Sky today',
    names: skyNames(today),
    wild: today.wild,
    kind: skyKind(today),
  };
}

/** A line the calendar may say is at most this many characters (a bubble is only a few words wide). */
export const BUBBLE_MAX_CHARS = 32;
const SOON = 'Soon: ';

/**
 * The lines the calendar may mutter: what today's Boon and Omen say, and a warning of tomorrow's Omen
 * ("Soon: A storm is coming"). Cut to a bubble's width: a line that does not fit is left out.
 */
export function bubbleLines(forecast: Forecast | null): string[] {
  if (forecast === null) return [];
  const out: string[] = [];
  const add = (line: string): void => {
    if ([...line].length <= BUBBLE_MAX_CHARS) out.push(line);
  };
  const today = forecast.today;
  if (today !== null) {
    for (const entry of [today.boon, today.omen]) {
      if (entry !== null) for (const line of entry.bubbles) add(line);
    }
  }
  const tomorrow = forecast.tomorrow;
  if (tomorrow?.omen != null) {
    const first = tomorrow.omen.bubbles[0];
    if (first !== undefined) add(`${SOON}${first.charAt(0).toLowerCase()}${first.slice(1)}`);
  }
  return out;
}

/** One line at random, or null when there is none. */
export function pickBubble(rng: Rng, lines: readonly string[]): string | null {
  if (lines.length === 0) return null;
  return lines[int(rng, lines.length)] ?? null;
}

/** The wait before the next bubble, in whole seconds from 10 to 30 (the creatures talk more often). */
export const CALENDAR_BUBBLE_MIN_GAP_S = 10;
export const CALENDAR_BUBBLE_MAX_GAP_S = 30;
export const CALENDAR_BUBBLE_SHOW_MS = 3500;

export function calendarBubbleGap(rng: Rng): number {
  return (
    (CALENDAR_BUBBLE_MIN_GAP_S +
      int(rng, CALENDAR_BUBBLE_MAX_GAP_S - CALENDAR_BUBBLE_MIN_GAP_S + 1)) *
    1000
  );
}

/** Wait this long after today's day ends before asking for the forecast again (the server draws it then). */
export const FORECAST_RECHECK_GRACE_MS = 5_000;
/** When the forecast is already out of date (the clocks disagree, or the server has not turned over), ask again this often. */
export const FORECAST_RETRY_MS = 30_000;
/** The longest a timer may wait (a browser timer holds at most about 24 days). */
const MAX_TIMER_MS = 2_000_000_000;

/**
 * How long until the forecast is out of date: the end of today by the server's clock, plus a moment for
 * the server to have rolled over. Null when there is no today. A forecast that is out of date already
 * (the answer came before the server turned over) is asked for again after `FORECAST_RETRY_MS`, never in
 * a tight loop. Capped for a timer.
 */
export function forecastRecheckDelay(forecast: Forecast | null, serverNow: number): number | null {
  const end = forecast?.today?.endsAt;
  if (end === undefined) return null;
  if (end <= serverNow) return FORECAST_RETRY_MS;
  return Math.min(MAX_TIMER_MS, end - serverNow + FORECAST_RECHECK_GRACE_MS);
}
