/**
 * Schedule strip and countdown text for the raid tab. The server sends the week's event times as
 * UTC milliseconds plus the guild's timezone; labels are shown in that timezone, because the raid
 * calendar ("Fri 13:37") is guild-local for everyone.
 */
import type { RaidEventId } from './raid-api';
import { RAID_EVENT_IDS } from './raid-api';

const EVENT_TITLES: Record<RaidEventId, string> = {
  weekStart: 'Boss reveal',
  phase1: 'Phase 1',
  phase2: 'Phase 2',
  finale: 'Finale',
};

export function eventTitle(event: RaidEventId): string {
  return EVENT_TITLES[event];
}

/** "Fri 13:37" in the given timezone. An unknown timezone falls back to UTC. */
export function formatEventTime(at: number, timeZone: string): string {
  const make = (zone: string): Intl.DateTimeFormat =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      weekday: 'short',
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
  /** done: already happened; next: the next one; later: after the next one. */
  state: 'done' | 'next' | 'later';
}

/** The four steps of the week in order, marked done / next / later. */
export function scheduleSteps(
  schedule: Readonly<Record<RaidEventId, number>>,
  next: { event: RaidEventId } | null,
  timeZone: string,
): ScheduleStep[] {
  const nextIndex = next === null ? RAID_EVENT_IDS.length : RAID_EVENT_IDS.indexOf(next.event);
  return RAID_EVENT_IDS.map((event, index) => ({
    event,
    title: EVENT_TITLES[event],
    when: formatEventTime(schedule[event], timeZone),
    state: index < nextIndex ? 'done' : index === nextIndex ? 'next' : 'later',
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
