import { describe, expect, it } from 'vitest';
import {
  formatCountdown,
  formatDuration,
  formatHourOfDay,
  formatHours,
  formatRelative,
  formatZoned,
  zonedClock,
} from './time-format';

// Friday 2026-10-09 13:37 in Helsinki (UTC+3 in October) is 10:37 UTC.
const FRIDAY = Date.UTC(2026, 9, 9, 10, 37);
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('formatCountdown, hms', () => {
  it.each([
    [0, '0s'],
    [-5000, '0s'],
    [999, '1s'],
    [12_000, '12s'],
    [65_000, '1m 05s'],
    [3_723_000, '1h 02m 03s'],
    [12 * HOUR, '12h 00m 00s'],
  ])('%i ms is %s', (ms, text) => {
    expect(formatCountdown(ms, 'hms')).toBe(text);
  });

  it('never rolls hours over into days', () => {
    expect(formatCountdown(24 * HOUR, 'hms')).toBe('24h 00m 00s');
    expect(formatCountdown(3 * DAY + 4 * HOUR, 'hms')).toBe('76h 00m 00s');
  });
});

describe('formatCountdown, days', () => {
  it.each([
    [0, '0s'],
    [-5000, '0s'],
    [7_000, '7s'],
    [65_000, '1m 05s'],
    [2 * HOUR + 3 * MIN + 4_000, '2h 03m 04s'],
    [DAY, '1d 00h 00m'],
    [3 * DAY + 4 * HOUR + 5 * MIN + 6_000, '3d 04h 05m'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatCountdown(ms, 'days')).toBe(expected);
  });
});

describe('formatCountdown, short', () => {
  it('shows days and hours, hours and minutes, or minutes', () => {
    expect(formatCountdown(3 * DAY + 4 * HOUR + 59 * MIN, 'short')).toBe('3 d 4 h');
    expect(formatCountdown(2 * HOUR + 10 * MIN, 'short')).toBe('2 h 10 m');
    expect(formatCountdown(12 * MIN, 'short')).toBe('12 m');
  });

  it('leaves out a part that is zero', () => {
    expect(formatCountdown(2 * DAY, 'short')).toBe('2 d');
    expect(formatCountdown(5 * HOUR, 'short')).toBe('5 h');
  });

  it('rounds minutes up and is never negative', () => {
    expect(formatCountdown(1, 'short')).toBe('1 m');
    expect(formatCountdown(61_000, 'short')).toBe('2 m');
    expect(formatCountdown(-5000, 'short')).toBe('0 m');
  });
});

describe('formatCountdown, clock', () => {
  it.each([
    [0, '0:00'],
    [-4000, '0:00'],
    [1, '0:01'],
    [59_000, '0:59'],
    [252_000, '4:12'],
    [300_000, '5:00'],
  ])('formats %i ms as %s', (ms, text) => {
    expect(formatCountdown(ms, 'clock')).toBe(text);
  });
});

describe('formatDuration', () => {
  it('writes a length of time in words', () => {
    expect(formatDuration(4 * HOUR)).toBe('4 h');
    expect(formatDuration(3 * HOUR + 44 * MIN)).toBe('3 h 44 min');
    expect(formatDuration(45 * MIN)).toBe('45 min');
    expect(formatDuration(-5)).toBe('0 min');
  });

  it('keeps hours as hours, and spells the minute unit differently from the short countdown', () => {
    expect(formatDuration(30 * HOUR)).toBe('30 h');
    expect(formatCountdown(30 * HOUR, 'short')).toBe('1 d 6 h');
    expect(formatDuration(2 * HOUR + 10 * MIN)).toBe('2 h 10 min');
    expect(formatCountdown(2 * HOUR + 10 * MIN, 'short')).toBe('2 h 10 m');
  });
});

describe('hours and hours of the day', () => {
  it('writes whole hours', () => {
    expect(formatHours(2)).toBe('2 h');
    expect(formatHours(24)).toBe('24 h');
  });

  it('writes the hour of a day as a clock', () => {
    expect(formatHourOfDay(6)).toBe('06:00');
    expect(formatHourOfDay(20)).toBe('20:00');
  });
});

describe('formatRelative', () => {
  const NOW = Date.UTC(2026, 9, 10, 12, 0);
  it.each([
    [0, 'just now'],
    [-5 * MIN, 'just now'],
    [59_000, 'just now'],
    [MIN, '1 minute ago'],
    [5 * MIN, '5 minutes ago'],
    [60 * MIN, '1 hour ago'],
    [3 * 60 * MIN, '3 hours ago'],
    [24 * 60 * MIN, '1 day ago'],
    [50 * 60 * MIN, '2 days ago'],
  ])('%i ms ago -> %s', (ago, text) => {
    expect(formatRelative(NOW - ago, NOW)).toBe(text);
  });
});

describe('formatZoned', () => {
  it('shows the weekday and time in the guild timezone', () => {
    expect(formatZoned(FRIDAY, 'Europe/Helsinki', 'short')).toBe('Fri 13:37');
    expect(formatZoned(FRIDAY, 'UTC', 'short')).toBe('Fri 10:37');
    expect(formatZoned(FRIDAY - 4 * DAY, 'Europe/Helsinki', 'short')).toBe('Mon 13:37');
  });

  it('follows daylight saving time', () => {
    // Winter: Helsinki is UTC+2.
    expect(formatZoned(Date.UTC(2026, 0, 9, 11, 37), 'Europe/Helsinki', 'short')).toBe('Fri 13:37');
  });

  it('falls back to UTC for an unknown timezone', () => {
    expect(formatZoned(FRIDAY, 'Not/AZone', 'short')).toBe('Fri 10:37');
  });

  it('can spell the weekday out', () => {
    expect(formatZoned(FRIDAY - 4 * DAY, 'Europe/Helsinki', 'long')).toBe('Monday 13:37');
    expect(formatZoned(FRIDAY + 2 * DAY + 6 * HOUR + 23 * MIN, 'Europe/Helsinki', 'long')).toBe(
      'Sunday 20:00',
    );
  });
});

describe('zonedClock', () => {
  it('reads the hour and minute in the timezone', () => {
    expect(zonedClock(FRIDAY, 'Europe/Helsinki')).toEqual({ hour: 13, minute: 37 });
    expect(zonedClock(FRIDAY, 'UTC')).toEqual({ hour: 10, minute: 37 });
  });

  it('gives null for an unknown timezone', () => {
    expect(zonedClock(FRIDAY, 'Not/AZone')).toBeNull();
  });
});
