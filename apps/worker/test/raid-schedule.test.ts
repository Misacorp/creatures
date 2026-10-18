import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  addWeeks,
  doneKey,
  eventTimes,
  isWeekId,
  nextDueEvent,
  weekIdFor,
  weekIndex,
  RAID_EVENTS,
  type RaidEvent,
} from '../src/raid-schedule';

const HELSINKI = 'Europe/Helsinki';
const NEW_YORK = 'America/New_York';
const z = (iso: string) => Date.parse(iso);

describe('weekIdFor', () => {
  it('starts the week at Monday 13:37, so Monday before that belongs to the week before', () => {
    // 2027-01-11 is a Monday; Helsinki is UTC+2 in January, so 13:37 is 11:37Z.
    expect(weekIdFor(z('2027-01-11T11:36:59.999Z'), HELSINKI)).toBe('2027-W01');
    expect(weekIdFor(z('2027-01-11T11:37:00Z'), HELSINKI)).toBe('2027-W02');
    expect(weekIdFor(z('2027-01-11T00:00:00Z'), HELSINKI)).toBe('2027-W01');
    expect(weekIdFor(z('2027-01-10T21:59:59Z'), HELSINKI)).toBe('2027-W01'); // Sunday night
    expect(weekIdFor(z('2027-01-15T10:00:00Z'), HELSINKI)).toBe('2027-W02'); // Friday
    expect(weekIdFor(z('2027-01-18T11:36:59Z'), HELSINKI)).toBe('2027-W02');
    expect(weekIdFor(z('2027-01-18T11:37:00Z'), HELSINKI)).toBe('2027-W03');
  });

  it('works in the guild timezone, not UTC (America/New_York)', () => {
    // 13:37 EST is 18:37Z.
    expect(weekIdFor(z('2027-01-11T18:36:59Z'), NEW_YORK)).toBe('2027-W01');
    expect(weekIdFor(z('2027-01-11T18:37:00Z'), NEW_YORK)).toBe('2027-W02');
    // Early Monday UTC is still Sunday evening in New York.
    expect(weekIdFor(z('2027-01-11T03:00:00Z'), NEW_YORK)).toBe('2027-W01');
    // A Helsinki Monday 14:00 is a different week than the same instant would be elsewhere.
    expect(weekIdFor(z('2027-01-11T12:00:00Z'), HELSINKI)).toBe('2027-W02');
    expect(weekIdFor(z('2027-01-11T12:00:00Z'), NEW_YORK)).toBe('2027-W01');
  });

  it('follows ISO week numbers across the year end (2026 has 53 weeks)', () => {
    expect(weekIdFor(z('2026-12-28T12:00:00Z'), HELSINKI)).toBe('2026-W53');
    expect(weekIdFor(z('2027-01-03T12:00:00Z'), HELSINKI)).toBe('2026-W53');
    expect(weekIdFor(z('2027-01-04T12:00:00Z'), HELSINKI)).toBe('2027-W01');
    expect(addWeeks('2026-W53', 1)).toBe('2027-W01');
    expect(addWeeks('2027-W01', -1)).toBe('2026-W53');
    expect(weekIndex('2027-W01') - weekIndex('2026-W53')).toBe(1);
    expect(weekIndex('2027-W03') - weekIndex('2027-W02')).toBe(1);
  });

  it('is stable across the EU DST switches', () => {
    // Spring: Sunday 2027-03-28 03:00 EET jumps to 04:00 EEST.
    expect(weekIdFor(z('2027-03-28T17:00:00Z'), HELSINKI)).toBe(
      weekIdFor(z('2027-03-22T12:00:00Z'), HELSINKI),
    );
    // Monday 2027-03-29 13:37 EEST is 10:37Z: one minute before it is still the old week.
    const before = weekIdFor(z('2027-03-29T10:36:59Z'), HELSINKI);
    const after = weekIdFor(z('2027-03-29T10:37:00Z'), HELSINKI);
    expect(addWeeks(before, 1)).toBe(after);
    // Autumn: Monday 2027-11-01 13:37 EET is 11:37Z, the Monday of the switch week 10:37Z.
    const oct = weekIdFor(z('2027-10-25T10:37:00Z'), HELSINKI); // 13:37 EEST
    expect(weekIdFor(z('2027-10-25T10:36:59Z'), HELSINKI)).toBe(addWeeks(oct, -1));
    const nov = weekIdFor(z('2027-11-01T11:37:00Z'), HELSINKI); // 13:37 EET
    expect(weekIdFor(z('2027-11-01T11:36:59Z'), HELSINKI)).toBe(oct);
    expect(nov).toBe(addWeeks(oct, 1));
  });
});

describe('isWeekId', () => {
  it('accepts real ISO weeks only', () => {
    expect(isWeekId('2027-W02')).toBe(true);
    expect(isWeekId('2026-W53')).toBe(true);
    expect(isWeekId('2027-W53')).toBe(false); // 2027 has 52 weeks
    expect(isWeekId('2027-W00')).toBe(false);
    expect(isWeekId('2027-W54')).toBe(false);
    // Mondays that fall outside years 0000-9999 are no week (and must not throw).
    expect(isWeekId('9999-W53')).toBe(false);
    expect(isWeekId('9999-W99')).toBe(false);
    expect(isWeekId('0000-W01')).toBe(false);
    for (const bad of [
      '2027-2',
      '2027W02',
      '2027-w02',
      '',
      ' 2027-W02',
      '2027-W02 ',
      3,
      null,
      {},
    ]) {
      expect(isWeekId(bad)).toBe(false);
    }
  });
});

describe('eventTimes', () => {
  it('gives the default schedule in Helsinki winter time', () => {
    expect(eventTimes('2027-W02', HELSINKI)).toEqual({
      weekStart: z('2027-01-11T11:37:00Z'),
      phase1: z('2027-01-15T11:37:00Z'),
      phase2: z('2027-01-16T11:37:00Z'),
      finale: z('2027-01-17T18:00:00Z'),
    });
  });

  it('is DST-safe in the spring switch week (Sunday 2027-03-28)', () => {
    const week = weekIdFor(z('2027-03-22T12:00:00Z'), HELSINKI);
    expect(eventTimes(week, HELSINKI)).toEqual({
      weekStart: z('2027-03-22T11:37:00Z'), // EET
      phase1: z('2027-03-26T11:37:00Z'),
      phase2: z('2027-03-27T11:37:00Z'),
      finale: z('2027-03-28T17:00:00Z'), // 20:00 EEST
    });
    // The week after starts on summer time.
    expect(eventTimes(addWeeks(week, 1), HELSINKI).weekStart).toBe(z('2027-03-29T10:37:00Z'));
  });

  it('is DST-safe in the autumn switch week (Sunday 2027-10-31)', () => {
    const week = weekIdFor(z('2027-10-26T12:00:00Z'), HELSINKI);
    expect(eventTimes(week, HELSINKI)).toEqual({
      weekStart: z('2027-10-25T10:37:00Z'), // EEST
      phase1: z('2027-10-29T10:37:00Z'),
      phase2: z('2027-10-30T10:37:00Z'),
      finale: z('2027-10-31T18:00:00Z'), // 20:00 EET
    });
  });

  it('is DST-safe in America/New_York (US switches on 2027-03-14 and 2027-11-07)', () => {
    const spring = weekIdFor(z('2027-03-10T12:00:00Z'), NEW_YORK);
    expect(eventTimes(spring, NEW_YORK)).toEqual({
      weekStart: z('2027-03-08T18:37:00Z'), // EST
      phase1: z('2027-03-12T18:37:00Z'),
      phase2: z('2027-03-13T18:37:00Z'),
      finale: z('2027-03-15T00:00:00Z'), // Sunday 20:00 EDT
    });
    const autumn = weekIdFor(z('2027-11-03T12:00:00Z'), NEW_YORK);
    expect(eventTimes(autumn, NEW_YORK)).toEqual({
      weekStart: z('2027-11-01T17:37:00Z'), // EDT
      phase1: z('2027-11-05T17:37:00Z'),
      phase2: z('2027-11-06T17:37:00Z'),
      finale: z('2027-11-08T01:00:00Z'), // Sunday 20:00 EST
    });
  });

  it('keeps the events in order and inside their week for every week of two years', () => {
    for (const tz of [HELSINKI, NEW_YORK]) {
      let week = '2026-W40';
      for (let i = 0; i < 110; i++) {
        const t = eventTimes(week, tz);
        expect(t.weekStart).toBeLessThan(t.phase1);
        expect(t.phase1).toBeLessThan(t.phase2);
        expect(t.phase2).toBeLessThan(t.finale);
        expect(weekIdFor(t.weekStart, tz)).toBe(week);
        expect(weekIdFor(t.weekStart - 1, tz)).toBe(addWeeks(week, -1));
        expect(weekIdFor(t.finale, tz)).toBe(week);
        expect(eventTimes(addWeeks(week, 1), tz).weekStart).toBeGreaterThan(t.finale);
        week = addWeeks(week, 1);
      }
    }
  });

  it('rejects ids that are not weeks', () => {
    expect(() => eventTimes('nope', HELSINKI)).toThrow();
  });
});

describe('nextDueEvent', () => {
  const doneThrough = (weekId: string, count: number): Set<string> =>
    new Set(RAID_EVENTS.slice(0, count).map((e: RaidEvent) => doneKey(weekId, e)));

  it('returns the earliest event that is not done, in time order', () => {
    const now = z('2027-01-15T12:00:00Z'); // Friday after phase 1's time
    const all = new Set<string>([
      ...doneThrough('2027-W01', 4),
      ...doneThrough('2027-W02', 1), // weekStart done
    ]);
    expect(nextDueEvent(now, HELSINKI, all)).toEqual({
      weekId: '2027-W02',
      event: 'phase1',
      at: z('2027-01-15T11:37:00Z'),
    });
    const withPhase1 = new Set([...all, doneKey('2027-W02', 'phase1')]);
    expect(nextDueEvent(now, HELSINKI, withPhase1)).toEqual({
      weekId: '2027-W02',
      event: 'phase2',
      at: z('2027-01-16T11:37:00Z'),
    });
    const withAllOfW02 = new Set([...all, ...doneThrough('2027-W02', 4)]);
    expect(nextDueEvent(now, HELSINKI, withAllOfW02)).toEqual({
      weekId: '2027-W03',
      event: 'weekStart',
      at: z('2027-01-18T11:37:00Z'),
    });
  });

  it('includes the previous week, so a finale missed over the week change still runs', () => {
    const now = z('2027-01-19T10:00:00Z'); // Tuesday of W03
    const done = new Set([...doneThrough('2027-W02', 3)]); // finale of W02 missing
    // The previous week is W02: its finale is the earliest not-done event... after W02's earlier
    // ones; W01's events were never marked, so they come first.
    const next = nextDueEvent(now, HELSINKI, done, '2027-W02');
    expect(next).toEqual({ weekId: '2027-W02', event: 'finale', at: z('2027-01-17T18:00:00Z') });
  });

  it('accepts a predicate and can start from an older week', () => {
    const now = z('2027-01-25T10:00:00Z');
    const next = nextDueEvent(now, HELSINKI, () => false, '2027-W01');
    expect(next).toEqual({ weekId: '2027-W01', event: 'weekStart', at: z('2027-01-04T11:37:00Z') });
  });

  it('crosses both EU DST switches and the year end with the right instants', () => {
    // Everything before the week of 2027-03-28 is done.
    const now = z('2027-03-28T16:00:00Z');
    const week = weekIdFor(now, HELSINKI);
    const done = new Set([...doneThrough(addWeeks(week, -1), 4), ...doneThrough(week, 3)]);
    expect(nextDueEvent(now, HELSINKI, done)).toEqual({
      weekId: week,
      event: 'finale',
      at: z('2027-03-28T17:00:00Z'),
    });
  });

  it('works in America/New_York', () => {
    const now = z('2027-03-14T12:00:00Z');
    const week = weekIdFor(now, NEW_YORK);
    const done = new Set([...doneThrough(addWeeks(week, -1), 4), ...doneThrough(week, 3)]);
    expect(nextDueEvent(now, NEW_YORK, done)?.at).toBe(z('2027-03-15T00:00:00Z'));
  });
});

describe('boss rotation input', () => {
  it('weekIndex rotates through the content bosses one per week', () => {
    const ids: string[] = [];
    let week = '2027-W01';
    for (let i = 0; i < content.bosses.length * 2; i++) {
      ids.push((content.bosses[weekIndex(week) % content.bosses.length] as { id: string }).id);
      week = addWeeks(week, 1);
    }
    expect(new Set(ids.slice(0, content.bosses.length)).size).toBe(content.bosses.length);
    expect(ids.slice(0, content.bosses.length)).toEqual(ids.slice(content.bosses.length));
  });
});
