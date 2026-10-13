import { describe, expect, it } from 'vitest';
import {
  formatEventTime,
  formatEventTimeLong,
  formatLongCountdown,
  formatShortCountdown,
  scheduleSteps,
} from './raid-time';

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
  it('lists Preparation, Phase 1, Phase 2 and the Finale in order', () => {
    const steps = scheduleSteps(schedule, { event: 'phase1' }, 'Europe/Helsinki');
    expect(steps.map((s) => s.event)).toEqual(['weekStart', 'phase1', 'phase2', 'finale']);
    expect(steps.map((s) => s.title)).toEqual(['Preparation', 'Phase 1', 'Phase 2', 'Finale']);
    expect(steps.map((s) => s.when)).toEqual(['Mon 13:37', 'Fri 13:37', 'Sat 13:37', 'Sun 20:00']);
  });

  it('runs Preparation from Monday 13:37 until Friday 13:37 and no other step has an end', () => {
    const steps = scheduleSteps(schedule, { event: 'phase1' }, 'Europe/Helsinki');
    expect(steps[0]?.until).toBe('Fri 13:37');
    expect(steps.slice(1).map((s) => s.until)).toEqual([null, null, null]);
  });

  it('keeps Phase 1 from showing as active before Friday: Preparation is now, Phase 1 is next', () => {
    const steps = scheduleSteps(schedule, { event: 'phase1' }, 'Europe/Helsinki');
    expect(steps.map((s) => s.state)).toEqual(['now', 'next', 'later', 'later']);
  });

  it('moves on as the events pass', () => {
    const state = (event: 'phase2' | 'finale') =>
      scheduleSteps(schedule, { event }, 'Europe/Helsinki').map((s) => s.state);
    expect(state('phase2')).toEqual(['done', 'now', 'next', 'later']);
    expect(state('finale')).toEqual(['done', 'done', 'now', 'next']);
  });

  it('marks everything done when nothing is left', () => {
    const steps = scheduleSteps(schedule, null, 'Europe/Helsinki');
    expect(steps.every((s) => s.state === 'done')).toBe(true);
  });

  it('reads the same on the guild clock in a week that ends daylight saving time', () => {
    // Helsinki goes back to winter time on Sunday 2026-10-25 at 04:00 local. That week's Monday and
    // Friday are summer time (UTC+3) and its finale is winter time (UTC+2); the next week is all
    // winter time. The labels stay Mon 13:37, Fri 13:37, Sat 13:37 and Sun 20:00 in both.
    const labels = ['Mon 13:37', 'Fri 13:37', 'Sat 13:37', 'Sun 20:00'];
    const changeWeek = {
      weekStart: Date.UTC(2026, 9, 19, 10, 37),
      phase1: Date.UTC(2026, 9, 23, 10, 37),
      phase2: Date.UTC(2026, 9, 24, 10, 37),
      finale: Date.UTC(2026, 9, 25, 18, 0),
    };
    const winterWeek = {
      weekStart: Date.UTC(2026, 9, 26, 11, 37),
      phase1: Date.UTC(2026, 9, 30, 11, 37),
      phase2: Date.UTC(2026, 9, 31, 11, 37),
      finale: Date.UTC(2026, 10, 1, 18, 0),
    };
    for (const week of [changeWeek, winterWeek]) {
      const steps = scheduleSteps(week, { event: 'phase1' }, 'Europe/Helsinki');
      expect(steps.map((s) => s.when)).toEqual(labels);
      expect(steps[0]?.until).toBe('Fri 13:37');
    }
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

describe('formatEventTimeLong', () => {
  it('spells the weekday out', () => {
    expect(formatEventTimeLong(schedule.weekStart, 'Europe/Helsinki')).toBe('Monday 13:37');
    expect(formatEventTimeLong(schedule.finale, 'Europe/Helsinki')).toBe('Sunday 20:00');
  });
});

describe('formatShortCountdown', () => {
  it('shows days and hours, hours and minutes, or minutes', () => {
    expect(formatShortCountdown(3 * 24 * HOUR + 4 * HOUR + 59 * 60_000)).toBe('3 d 4 h');
    expect(formatShortCountdown(2 * HOUR + 10 * 60_000)).toBe('2 h 10 m');
    expect(formatShortCountdown(12 * 60_000)).toBe('12 m');
  });

  it('leaves out a part that is zero', () => {
    expect(formatShortCountdown(2 * 24 * HOUR)).toBe('2 d');
    expect(formatShortCountdown(5 * HOUR)).toBe('5 h');
  });

  it('rounds minutes up and is never negative', () => {
    expect(formatShortCountdown(1)).toBe('1 m');
    expect(formatShortCountdown(61_000)).toBe('2 m');
    expect(formatShortCountdown(-5000)).toBe('0 m');
  });
});
