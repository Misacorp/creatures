/**
 * Schedule strip and countdown text for the raid tab. The server sends the week's event times as
 * UTC milliseconds plus the guild's timezone; labels are shown in that timezone, because the raid
 * calendar ("Fri 13:37") is guild-local for everyone.
 */
import type { RaidEventId } from './raid-api';
import { RAID_EVENT_IDS } from './raid-api';

const EVENT_TITLES: Record<RaidEventId, string> = {
  weekStart: 'Preparation',
  phase1: 'Phase 1',
  phase2: 'Phase 2',
  finale: 'Finale',
};

export function eventTitle(event: RaidEventId): string {
  return EVENT_TITLES[event];
}

/** "Fri 13:37" in the given timezone. An unknown timezone falls back to UTC. */
export function formatEventTime(at: number, timeZone: string): string {
  return formatTime(at, timeZone, 'short');
}

/** "Monday 13:37": the same, with the weekday spelled out. */
export function formatEventTimeLong(at: number, timeZone: string): string {
  return formatTime(at, timeZone, 'long');
}

function formatTime(at: number, timeZone: string, weekday: 'short' | 'long'): string {
  const make = (zone: string): Intl.DateTimeFormat =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      weekday,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = make(timeZone);
  } catch {
    formatter = make('UTC');
  }
  const part = (type: string): string =>
    formatter.formatToParts(at).find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')} ${part('hour')}:${part('minute')}`;
}

export interface ScheduleStep {
  event: RaidEventId;
  title: string;
  /** "Fri 13:37" */
  when: string;
  /** Where the step ends ("Fri 13:37"), for Preparation, which is a stretch of time; else null. */
  until: string | null;
  /**
   * done: over; now: the step the week is in (it started and the next one has not); next: the next
   * one; later: after that. A step is never "now" before its own time: that is what keeps Phase 1
   * from showing as active before Friday 13:37.
   */
  state: 'done' | 'now' | 'next' | 'later';
}

/**
 * The four steps of the week in order: Preparation (week start to Phase 1), Phase 1, Phase 2 and
 * the Finale, marked done / now / next / later from the server's next event. Once the server has no
 * next event, everything is done.
 */
export function scheduleSteps(
  schedule: Readonly<Record<RaidEventId, number>>,
  next: { event: RaidEventId } | null,
  timeZone: string,
): ScheduleStep[] {
  const nextIndex = next === null ? RAID_EVENT_IDS.length : RAID_EVENT_IDS.indexOf(next.event);
  const stateOf = (index: number): ScheduleStep['state'] => {
    if (next === null || index < nextIndex - 1) return 'done';
    if (index === nextIndex - 1) return 'now';
    return index === nextIndex ? 'next' : 'later';
  };
  return RAID_EVENT_IDS.map((event, index) => ({
    event,
    title: EVENT_TITLES[event],
    when: formatEventTime(schedule[event], timeZone),
    until: event === 'weekStart' ? formatEventTime(schedule.phase1, timeZone) : null,
    state: stateOf(index),
  }));
}

/** "3d 04h 05m", "4h 05m 06s", "5m 06s" or "7s". Never negative. */
export function formatLongCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  if (days > 0) return `${String(days)}d ${pad(hours)}h ${pad(minutes)}m`;
  if (hours > 0) return `${String(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${String(minutes)}m ${pad(seconds)}s`;
  return `${String(seconds)}s`;
}

/**
 * A short wait for the "what to do now" line: "3 d 4 h", "2 h 10 m" or "12 m" (a zero part is left out).
 * Minutes round up, so it never reads "0 m" while something is still ahead, and it is never negative.
 */
export function formatShortCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  if (days > 0) return hours === 0 ? `${String(days)} d` : `${String(days)} d ${String(hours)} h`;
  if (hours > 0)
    return minutes === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(minutes)} m`;
  return `${String(minutes)} m`;
}

/** "Phase 1 in 2d 03h 04m", or "Phase 1 is happening now" once the time has passed. */
export function countdownText(
  next: { event: RaidEventId; at: number } | null,
  serverNow: number,
): string {
  if (next === null) return 'This raid week is finished. A new boss arrives on Monday.';
  const remaining = next.at - serverNow;
  const title = EVENT_TITLES[next.event];
  if (remaining <= 0) return `${title} is happening now.`;
  return `${title} in ${formatLongCountdown(remaining)}`;
}
