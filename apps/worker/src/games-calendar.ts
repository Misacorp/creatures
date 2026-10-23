/**
 * The Valley Games calendar (docs/design/valley-games.md, "Days"). A show day D is a guild-local date:
 * entries for D are open from D-1's show to D's lock (the daily reset, 13:37), D's events are resolved at
 * the lock and play to everyone at D's show (13:40). All conversions go through `time.ts`; the timezone
 * is always passed in.
 */
import { RULES } from '@creatures/game';
import { addDays, gameDay, isoWeekday, zonedDate, zonedTimeToEpoch } from './time';

/** When entries for show day `day` lock (its daily reset), in epoch ms. */
export function gamesLockAt(day: string, tz: string): number {
  const { hour, minute } = RULES.games.lockAt;
  return zonedTimeToEpoch(day, hour, minute, tz);
}

/** When show day `day`'s show starts by the schedule, in epoch ms (a stored `show_at` wins). */
export function gamesShowAt(day: string, tz: string): number {
  const { hour, minute } = RULES.games.showAt;
  return zonedTimeToEpoch(day, hour, minute, tz);
}

/** The show day whose lock has passed most recently: the game day of `now`. */
export function lockedDayAt(now: number, tz: string): string {
  return gameDay(now, tz, RULES.games.lockAt);
}

/**
 * The show day entries are for at `now`: the first day whose show has not started yet. A day's show is its
 * stored `show_at` when it has one (`storedShowAt`; the dev tools can play a day early), else the schedule.
 */
export function nextShowDay(
  now: number,
  tz: string,
  storedShowAt: (day: string) => number | null,
): string {
  let day = zonedDate(now, tz);
  // The day before can still be next when its show was never played (not possible by the schedule, but
  // a stored show time is the truth), so start one back.
  const before = addDays(day, -1);
  if (now < (storedShowAt(before) ?? gamesShowAt(before, tz))) day = before;
  for (let i = 0; i < 8; i++) {
    if (now < (storedShowAt(day) ?? gamesShowAt(day, tz))) return day;
    day = addDays(day, 1);
  }
  return day;
}

/** The ISO weekday of the Prize Stall's game day (Wednesday, guild time). */
export const STALL_WEEKDAY = 3;

/**
 * Whether show day `day` (a guild-local date, so its weekday is the guild's) is the bonus day
 * (`RULES.games.bonus.weekday`), which has one bonus event more.
 */
export function isGamesBonusDay(day: string): boolean {
  return isoWeekday(day) === RULES.games.bonus.weekday;
}
