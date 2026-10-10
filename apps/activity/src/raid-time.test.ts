import { describe, expect, it } from 'vitest';
import { countdownText, formatEventTime, formatLongCountdown, scheduleSteps } from './raid-time';

// Friday 2026-10-09 13:37 in Helsinki (UTC+3 in October) is 10:37 UTC.
const FRIDAY = Date.UTC(2026, 9, 9, 10, 37);
const HOUR = 3_600_000;
const schedule = {
  weekStart: FRIDAY - 4 * 24 * HOUR,
  phase1: FRIDAY,
  phase2: FRIDAY + 24 * HOUR,
  finale: FRIDAY + 2 * 24 * HOUR + 6 * HOUR + 23 * 60_000,
};

describe('formatEventTime', () => {
  it('shows the weekday and time in the guild timezone', () => {
    expect(formatEventTime(FRIDAY, 'Europe/Helsinki')).toBe('Fri 13:37');
    expect(formatEventTime(FRIDAY, 'UTC')).toBe('Fri 10:37');
    expect(formatEventTime(schedule.weekStart, 'Europe/Helsinki')).toBe('Mon 13:37');
    expect(formatEventTime(schedule.finale, 'Europe/Helsinki')).toBe('Sun 20:00');
  });

  it('follows daylight saving time', () => {
    // Winter: Helsinki is UTC+2.
    expect(formatEventTime(Date.UTC(2026, 0, 9, 11, 37), 'Europe/Helsinki')).toBe('Fri 13:37');
  });

  it('falls back to UTC for an unknown timezone', () => {
    expect(formatEventTime(FRIDAY, 'Not/AZone')).toBe('Fri 10:37');
  });
});

describe('scheduleSteps', () => {
  it('marks done, next and later steps', () => {
    const steps = scheduleSteps(schedule, { event: 'phase2' }, 'Europe/Helsinki');
    expect(steps.map((s) => s.event)).toEqual(['weekStart', 'phase1', 'phase2', 'finale']);
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'next', 'later']);
    expect(steps[0]?.title).toBe('Boss reveal');
    expect(steps[1]?.when).toBe('Fri 13:37');
  });

  it('marks everything done when nothing is left', () => {
    const steps = scheduleSteps(schedule, null, 'Europe/Helsinki');
    expect(steps.every((s) => s.state === 'done')).toBe(true);
  });

  it('shows the first phase as next at the start of the week', () => {
    const steps = scheduleSteps(schedule, { event: 'phase1' }, 'Europe/Helsinki');
    expect(steps.map((s) => s.state)).toEqual(['done', 'next', 'later', 'later']);
  });
});

describe('formatLongCountdown', () => {
  it.each([
    [0, '0s'],
    [-5000, '0s'],
    [7_000, '7s'],
    [65_000, '1m 05s'],
    [2 * HOUR + 3 * 60_000 + 4_000, '2h 03m 04s'],
    [3 * 24 * HOUR + 4 * HOUR + 5 * 60_000 + 6_000, '3d 04h 05m'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatLongCountdown(ms)).toBe(expected);
  });
});

describe('countdownText', () => {
  it('counts down to the next event', () => {
    expect(countdownText({ event: 'phase1', at: FRIDAY }, FRIDAY - 2 * HOUR)).toBe(
      'Phase 1 in 2h 00m 00s',
    );
  });

  it('says so when the time has come', () => {
    expect(countdownText({ event: 'finale', at: FRIDAY }, FRIDAY + 1)).toBe(
      'Finale is happening now.',
    );
  });

  it('explains the end of the week', () => {
    expect(countdownText(null, FRIDAY)).toContain('Monday');
  });
});
