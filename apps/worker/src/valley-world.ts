/**
 * The world scouts see, as a function of time (phase 5 step 2, V-SCOUT-8 opening hours and V-SCOUT-11 the week's twist): day or night
 * at the guild's own clock, whether the week is a Festival week, and today's weekly special. The pure pass asks for the world at the start
 * of each stretch and for the next moment it changes, so a stretch never straddles night falling or a new week.
 *
 * Read from the calendar alone (no rows): `weeklySpecial` rotates by the raid week's index. The dev tools' forced night and festival
 * switches belong to the old trips and are not read here.
 */
import {
  expeditionContent,
  isNightHour,
  specialOf,
  weeklySpecial,
  type ScoutWorld,
  type WorldClock,
} from '@creatures/game';
import { addWeeks, eventTimes, weekIdFor, weekIndex } from './raid-schedule';
import { zonedHour } from './time';

const HOUR_MS = 3_600_000;

/** The world at one instant in the guild's timezone. */
export function worldAt(tz: string, at: number): ScoutWorld {
  const week = weeklySpecial(weekIndex(weekIdFor(at, tz)));
  return {
    night: isNightHour(zonedHour(at, tz)),
    festival: week.festival,
    special: specialOf(week.destination, week.twist.effect),
  };
}

/** The week's twist as a short answer for the Signpost: the destination and the twist's id (shown from Monday, V-SCOUT-11). */
export function specialOfWeek(
  tz: string,
  at: number,
): { destination: string; twist: string; festival: boolean } {
  const week = weeklySpecial(weekIndex(weekIdFor(at, tz)));
  return { destination: week.destination, twist: week.twist.id, festival: week.festival };
}

/** The first moment after `at` the night flag flips (to the millisecond, found by halving the hour it falls in). */
function nextNightChange(tz: string, at: number): number {
  const now = isNightHour(zonedHour(at, tz));
  let lo = at;
  for (let i = 1; i <= 26; i++) {
    const hi = at + i * HOUR_MS;
    if (isNightHour(zonedHour(hi, tz)) !== now) {
      let low = lo;
      let high = hi;
      while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (isNightHour(zonedHour(mid, tz)) === now) low = mid;
        else high = mid;
      }
      return high;
    }
    lo = hi;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * The world as a clock for one pass. `watchNight` says whether any seat stands where night matters (the Moonlit Reef): only then
 * is night a reason to split. The week always is (a twist changes the rates at its destination, a Festival week opens the Grounds).
 */
export function scoutClock(tz: string, watchNight: boolean): WorldClock {
  const weekEnds = new Map<string, number>();
  const nextWeek = (at: number): number => {
    const id = weekIdFor(at, tz);
    let end = weekEnds.get(id);
    if (end === undefined) {
      end = eventTimes(addWeeks(id, 1), tz).weekStart;
      weekEnds.set(id, end);
    }
    return end;
  };
  return {
    at: (at) => worldAt(tz, at),
    nextChange: (at) => Math.min(nextWeek(at), watchNight ? nextNightChange(tz, at) : Infinity),
  };
}

/** Whether a destination id is one the content knows (the Signpost lists these). */
export const knownDestination = (id: string): boolean =>
  expeditionContent.destinations.some((d) => d.id === id);
