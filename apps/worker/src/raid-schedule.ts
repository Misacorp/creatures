/**
 * The raid calendar: pure functions from instants to raid weeks and back. The schedule itself is
 * config (`RULES.raid.schedule`: ISO weekday plus guild-local time). Every function takes the
 * guild's timezone explicitly; all conversions go through `time.ts`, so DST changes are handled in
 * one place.
 *
 * A raid week starts at `weekStart` (Monday 13:37 by default) and ends at the next one, so Monday
 * 00:00 to 13:36 still belongs to the previous week. Its id is the ISO week label of the day it
 * starts on, for example `2027-W02`.
 */
import { RULES } from '@creatures/game';
import { addDays, zonedDate, zonedTimeToEpoch } from './time';

export const RAID_EVENTS = ['weekStart', 'phase1', 'phase2', 'finale'] as const;
export type RaidEvent = (typeof RAID_EVENTS)[number];
/** The three fights of a week, in order. */
export const RAID_PHASES = ['phase1', 'phase2', 'finale'] as const;
export type RaidPhase = (typeof RAID_PHASES)[number];

export interface ScheduledEvent {
  weekId: string;
  event: RaidEvent;
  /** UTC epoch milliseconds. */
  at: number;
}

const WEEK_ID_RE = /^(\d{4})-W(\d{2})$/;
const DAY_MS = 86_400_000;

function parseDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) throw new Error('bad date');
  return Date.UTC(y, m - 1, d);
}

function formatDate(utcMs: number): string {
  const d = new Date(utcMs);
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

/** ISO weekday of a 'YYYY-MM-DD' date: 1 = Monday ... 7 = Sunday. */
function isoWeekday(date: string): number {
  return ((new Date(parseDate(date)).getUTCDay() + 6) % 7) + 1;
}

/** The ISO week label (`YYYY-Www`) of a calendar date. */
function isoWeekLabel(date: string): string {
  const ms = parseDate(date);
  // The Thursday of the date's ISO week decides the ISO year.
  const thursday = ms + (4 - isoWeekday(date)) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday - jan1) / DAY_MS / 7) + 1;
  return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}`;
}

/** The Monday of an ISO week, as 'YYYY-MM-DD'. Null if the label is not a real ISO week. */
function mondayOf(weekId: string): string | null {
  const m = WEEK_ID_RE.exec(weekId);
  if (m === null) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1) return null;
  const jan4 = Date.UTC(year, 0, 4);
  const week1Monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
  const monday = formatDate(week1Monday + (week - 1) * 7 * DAY_MS);
  // Rejects week 53 in a 52-week year and anything else that rolls into another year's label.
  return isoWeekLabel(monday) === weekId ? monday : null;
}

/** True for a real raid week id such as `2027-W02`. */
export function isWeekId(value: unknown): value is string {
  return typeof value === 'string' && mondayOf(value) !== null;
}

function mondayOrThrow(weekId: string): string {
  const monday = mondayOf(weekId);
  if (monday === null) throw new Error('not a raid week id');
  return monday;
}

/** The date (guild-local) the week starts on. */
function startDateOf(weekId: string): string {
  return addDays(mondayOrThrow(weekId), RULES.raid.schedule.weekStart.weekday - 1);
}

function localEpoch(date: string, at: { hour: number; minute: number }, tz: string): number {
  return zonedTimeToEpoch(date, at.hour, at.minute, tz);
}

/**
 * The id of the raid week an instant belongs to. The week starts at the `weekStart` time on its
 * start weekday, so the hours between local midnight and that time still belong to the week before.
 */
export function weekIdFor(now: number, tz: string): string {
  const { weekStart } = RULES.raid.schedule;
  const today = zonedDate(now, tz);
  const back = (isoWeekday(today) - weekStart.weekday + 7) % 7;
  let startDate = addDays(today, -back);
  if (localEpoch(startDate, weekStart, tz) > now) startDate = addDays(startDate, -7);
  return isoWeekLabel(startDate);
}

/** The week id `weeks` weeks after (or before, if negative) `weekId`. */
export function addWeeks(weekId: string, weeks: number): string {
  return isoWeekLabel(addDays(startDateOf(weekId), weeks * 7));
}

/**
 * A stable integer for a week that grows by one each week (also across year ends): whole weeks
 * since the Unix epoch's first Monday. Used to rotate bosses.
 */
export function weekIndex(weekId: string): number {
  const days = Math.round(parseDate(mondayOrThrow(weekId)) / DAY_MS);
  // 1970-01-01 is a Thursday, so the first Monday is day 4.
  return Math.floor((days - 4) / 7);
}

/** Orders week ids chronologically (ids of the same format sort as text). */
export function compareWeekIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Epoch milliseconds of every event of a week, in the guild's timezone. DST-safe. */
export function eventTimes(weekId: string, tz: string): Record<RaidEvent, number> {
  const schedule = RULES.raid.schedule;
  const startDate = startDateOf(weekId);
  const start = localEpoch(startDate, schedule.weekStart, tz);
  const at = (event: Exclude<RaidEvent, 'weekStart'>): number => {
    const when = schedule[event];
    let offset = (when.weekday - schedule.weekStart.weekday + 7) % 7;
    const sameDayBefore =
      offset === 0 &&
      when.hour * 60 + when.minute <= schedule.weekStart.hour * 60 + schedule.weekStart.minute;
    if (sameDayBefore) offset = 7;
    return localEpoch(addDays(startDate, offset), when, tz);
  };
  return { weekStart: start, phase1: at('phase1'), phase2: at('phase2'), finale: at('finale') };
}

/** Marker key for an event of a week, as stored and as used by `nextDueEvent`. */
export function doneKey(weekId: string, event: RaidEvent): string {
  return `${weekId}:${event}`;
}

export type DoneCheck = ReadonlySet<string> | ((weekId: string, event: RaidEvent) => boolean);

/**
 * The earliest event that is not done yet, from `fromWeekId` (default: the week before the current
 * one, so a finale missed over the week change still runs) to the week after the current one.
 * The event may be in the past (due, run late) or the future. `done` is a set of `doneKey`s or a
 * predicate. Null only if everything in that window is done.
 */
export function nextDueEvent(
  now: number,
  tz: string,
  done: DoneCheck,
  fromWeekId?: string,
): ScheduledEvent | null {
  const isDone =
    typeof done === 'function'
      ? done
      : (weekId: string, event: RaidEvent) => done.has(doneKey(weekId, event));
  const current = weekIdFor(now, tz);
  const last = addWeeks(current, 1);
  let week = fromWeekId !== undefined && fromWeekId < current ? fromWeekId : addWeeks(current, -1);
  let best: ScheduledEvent | null = null;
  for (let guard = 0; guard < 64 && compareWeekIds(week, last) <= 0; guard++) {
    const times = eventTimes(week, tz);
    for (const event of RAID_EVENTS) {
      if (isDone(week, event)) continue;
      const at = times[event];
      if (best === null || at < best.at) best = { weekId: week, event, at };
    }
    week = addWeeks(week, 1);
  }
  return best;
}
