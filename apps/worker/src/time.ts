/**
 * Time zone helpers built on `Intl.DateTimeFormat` only (no date libraries). All instants are UTC
 * epoch milliseconds; the game calendar is guild-local, and this is the one place that converts
 * between the two. Every function takes the zone as a required argument: callers resolve the
 * guild's timezone once and pass it down.
 */

/**
 * The timezone of a guild that has none stored. Use it only where a guild's settings are created
 * or read with no stored value, never as a default parameter.
 */
export const DEFAULT_GUILD_TIMEZONE = 'Europe/Helsinki';

const TIMEZONE_NAME_RE = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;
const MAX_TIMEZONE_LENGTH = 64;

/**
 * True when `tz` is an IANA zone name this runtime understands. Fixed offsets such as "+02:00"
 * are rejected: a guild's zone must follow daylight saving rules by name.
 */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length > MAX_TIMEZONE_LENGTH || !TIMEZONE_NAME_RE.test(tz)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
/** One day in milliseconds. */
export const DAY_MS = 24 * 60 * MINUTE;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let formatter = formatters.get(tz);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, formatter);
  }
  return formatter;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(epochMs: number, tz: string): LocalParts {
  const out: Record<string, number> = {};
  for (const part of formatterFor(tz).formatToParts(new Date(epochMs))) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  const { year, month, day, hour, minute, second } = out;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    throw new Error('could not read the local time parts');
  }
  // Some engines print midnight as 24 even with h23; normalise defensively.
  return { year, month, day, hour: hour % 24, minute, second };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** The 'YYYY-MM-DD' calendar date of an instant in the given time zone. */
export function zonedDate(epochMs: number, tz: string): string {
  const p = localParts(epochMs, tz);
  return `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}`;
}

/** The local hour (0 to 23) of an instant in the given time zone. DST-safe: the zone's own rules decide. */
export function zonedHour(epochMs: number, tz: string): number {
  return localParts(epochMs, tz).hour;
}

/** Offset of the zone from UTC at an instant, in ms (local wall clock minus UTC). Whole seconds. */
function offsetAt(epochMs: number, tz: string): number {
  const p = localParts(epochMs, tz);
  const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return localAsUtc - Math.floor(epochMs / SECOND) * SECOND;
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date);
  if (m === null) throw new Error('date must be YYYY-MM-DD');
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error('date is not a real calendar date');
  }
  return { year, month, day };
}

/** The 'YYYY-MM-DD' calendar date of a UTC instant (the instant is read as a UTC date). */
export function formatDate(utcMs: number): string {
  const d = new Date(utcMs);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

/** UTC midnight, in epoch milliseconds, of a real 'YYYY-MM-DD' date (throws for anything else). */
export function dateToUtcMs(date: string): number {
  const { year, month, day } = parseDate(date);
  return Date.UTC(year, month - 1, day);
}

/** ISO weekday of a real 'YYYY-MM-DD' date: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  return ((new Date(dateToUtcMs(date)).getUTCDay() + 6) % 7) + 1;
}

/** Adds (or subtracts) whole calendar days to a 'YYYY-MM-DD' date. Pure calendar arithmetic. */
export function addDays(date: string, days: number): string {
  const { year, month, day } = parseDate(date);
  return formatDate(Date.UTC(year, month - 1, day + days));
}

/**
 * Converts a local wall-clock time in `tz` to epoch milliseconds, correct across DST changes.
 *
 * - A nonexistent local time (the spring-forward gap, such as 03:30 on 2026-03-29 in Europe/Helsinki)
 *   resolves to the first instant after the gap, which is the moment the clocks jump (04:00).
 * - An ambiguous local time (the fall-back overlap, such as 03:30 on 2026-10-25 in Europe/Helsinki)
 *   resolves to the earlier of the two instants (the one before the clocks go back).
 */
export function zonedTimeToEpoch(date: string, hour: number, minute: number, tz: string): number {
  const { year, month, day } = parseDate(date);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('hour must be 0-23');
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('minute must be 0-59');
  }
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Offsets in force a day before and after: DST changes are months apart, so these bracket
  // every offset that could apply at the requested local time.
  const before = offsetAt(naive - DAY_MS, tz);
  const after = offsetAt(naive + DAY_MS, tz);
  const matches: number[] = [];
  for (const offset of new Set([before, after])) {
    const candidate = naive - offset;
    if (offsetAt(candidate, tz) === offset) matches.push(candidate);
  }
  if (matches.length > 0) return Math.min(...matches); // two matches means the overlap: earlier wins
  // Gap: no instant has this wall time. Find the first instant on the "after" offset.
  let lo = naive - Math.max(before, after); // surely before the change (still on the old offset)
  let hi = naive - Math.min(before, after); // surely after the change
  while (hi - lo > SECOND) {
    const mid = lo + Math.floor((hi - lo) / 2 / SECOND) * SECOND;
    if (offsetAt(mid, tz) === after) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The next instant strictly after `nowMs` whose local wall time in `tz` is hour:minute. */
export function nextOccurrence(nowMs: number, hour: number, minute: number, tz: string): number {
  const today = zonedDate(nowMs, tz);
  for (let i = 0; i <= 3; i++) {
    const candidate = zonedTimeToEpoch(addDays(today, i), hour, minute, tz);
    if (candidate > nowMs) return candidate;
  }
  throw new Error('no occurrence found');
}

/** The latest instant at or before `nowMs` whose local wall time in `tz` is hour:minute. */
export function previousOccurrence(
  nowMs: number,
  hour: number,
  minute: number,
  tz: string,
): number {
  const today = zonedDate(nowMs, tz);
  for (let i = 0; i <= 3; i++) {
    const candidate = zonedTimeToEpoch(addDays(today, -i), hour, minute, tz);
    if (candidate <= nowMs) return candidate;
  }
  throw new Error('no occurrence found');
}

/** A local wall-clock time of day. */
export interface TimeOfDay {
  hour: number;
  minute: number;
}

/**
 * The game day of an instant: the 'YYYY-MM-DD' date on which the current day started, where a day
 * starts at `reset` local time in `tz` (13:37 in `RULES.daily.reset`). Before the reset it is still
 * the previous date's game day. DST-safe through `zonedTimeToEpoch`.
 */
export function gameDay(epochMs: number, tz: string, reset: TimeOfDay): string {
  const today = zonedDate(epochMs, tz);
  return epochMs >= zonedTimeToEpoch(today, reset.hour, reset.minute, tz)
    ? today
    : addDays(today, -1);
}

/** When a game day ends: the reset on the next calendar date, in epoch ms. */
export function gameDayEnd(day: string, tz: string, reset: TimeOfDay): number {
  return zonedTimeToEpoch(addDays(day, 1), reset.hour, reset.minute, tz);
}
