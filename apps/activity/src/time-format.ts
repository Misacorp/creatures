/**
 * Every way the client writes a time or a wait as text, in one place. All of it is pure: the caller
 * passes the time (server time where it matters) and, for a time of day, the timezone, always
 * explicitly. Two spellings of the same unit differ on purpose for now (`m` in countdowns, `min` in
 * durations); both come from `formatSpan`, so unifying them later is a one-word change.
 */

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** The wait is rounded up to whole seconds and is never negative. */
const wholeSeconds = (ms: number): number => Math.max(0, Math.ceil(ms / 1000));

/**
 * How a wait is written:
 * - `hms`: "1h 02m 03s", "4m 05s" or "12s". Hours do not roll over into days.
 * - `days`: "3d 04h 05m", then like `hms` below a day.
 * - `short`: "3 d 4 h", "2 h 10 m" or "12 m"; a zero part is left out and minutes round up.
 * - `clock`: "4:12".
 */
export type CountdownStyle = 'hms' | 'days' | 'short' | 'clock';

/** A wait as text. Never negative. */
export function formatCountdown(ms: number, style: CountdownStyle): string {
  if (style === 'short') return formatSpan(ms, { days: true, minuteUnit: 'm' });
  const total = wholeSeconds(ms);
  if (style === 'clock') return `${String(Math.floor(total / 60))}:${pad2(total % 60)}`;
  const withDays = style === 'days';
  const days = withDays ? Math.floor(total / 86_400) : 0;
  const hours = Math.floor((total - days * 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${String(days)}d ${pad2(hours)}h ${pad2(minutes)}m`;
  if (hours > 0) return `${String(hours)}h ${pad2(minutes)}m ${pad2(seconds)}s`;
  if (minutes > 0) return `${String(minutes)}m ${pad2(seconds)}s`;
  return `${String(seconds)}s`;
}

/** A length of time as "4 h", "3 h 44 min" or "45 min" (minutes round up, hours do not roll into days). */
export function formatDuration(ms: number): string {
  return formatSpan(ms, { days: false, minuteUnit: 'min' });
}

/** Whole hours as "6 h". */
export function formatHours(hours: number): string {
  return `${String(hours)} h`;
}

/** The hour of a day as "20:00". */
export function formatHourOfDay(hour: number): string {
  return `${pad2(hour)}:00`;
}

/**
 * A span at minute precision: "3 d 4 h", "2 h 10 m", "45 min". A zero part is left out, minutes
 * round up (so it never reads "0" while something is still ahead) and it is never negative.
 */
function formatSpan(ms: number, options: { days: boolean; minuteUnit: 'm' | 'min' }): string {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  const days = options.days ? Math.floor(total / 1440) : 0;
  const hours = Math.floor((total - days * 1440) / 60);
  const minutes = total % 60;
  const minuteText = `${String(minutes)} ${options.minuteUnit}`;
  if (days > 0) return hours === 0 ? `${String(days)} d` : `${String(days)} d ${String(hours)} h`;
  if (hours > 0) return minutes === 0 ? `${String(hours)} h` : `${String(hours)} h ${minuteText}`;
  return minuteText;
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". Never negative. */
export function formatRelative(then: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)} day${days === 1 ? '' : 's'} ago`;
}

function zonedFormatter(timeZone: string, weekday: 'short' | 'long' | null): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    ...(weekday === null ? {} : { weekday }),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/** "Fri 13:37" (`short`) or "Friday 13:37" (`long`) in the given timezone. An unknown timezone falls back to UTC. */
export function formatZoned(at: number, timeZone: string, weekday: 'short' | 'long'): string {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = zonedFormatter(timeZone, weekday);
  } catch {
    formatter = zonedFormatter('UTC', weekday);
  }
  const part = (type: string): string =>
    formatter.formatToParts(at).find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')} ${part('hour')}:${part('minute')}`;
}

/** The local hour and minute of a moment in a timezone; null for an unknown timezone. */
export function zonedClock(at: number, timeZone: string): { hour: number; minute: number } | null {
  try {
    const parts = zonedFormatter(timeZone, null).formatToParts(at);
    const num = (type: string): number =>
      Number(parts.find((p) => p.type === type)?.value ?? Number.NaN);
    const hour = num('hour');
    const minute = num('minute');
    return Number.isNaN(hour) || Number.isNaN(minute) ? null : { hour, minute };
  } catch {
    return null;
  }
}
