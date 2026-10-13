/**
 * Schedule strip and countdown text for the raid tab. The server sends the week's event times as
 * UTC milliseconds plus the guild's timezone; labels are shown in that timezone, because the raid
 * calendar ("Fri 13:37") is guild-local for everyone.
 */
import type { RaidEventId } from './raid-api';
import { RAID_EVENT_IDS } from './raid-api';
import { formatZoned } from './time-format';

const EVENT_TITLES: Record<RaidEventId, string> = {
  weekStart: 'Preparation',
  phase1: 'Phase 1',
  phase2: 'Phase 2',
  finale: 'Finale',
};

export function eventTitle(event: RaidEventId): string {
  return EVENT_TITLES[event];
}

interface ScheduleStep {
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
    when: formatZoned(schedule[event], timeZone, 'short'),
    until: event === 'weekStart' ? formatZoned(schedule.phase1, timeZone, 'short') : null,
    state: stateOf(index),
  }));
}
