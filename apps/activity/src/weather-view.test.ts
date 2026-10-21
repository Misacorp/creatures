import { createSeededRng, type Rng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/weather-forecast.json';
import { parseForecast } from './weather-parse';
import type { Forecast, WeatherDay, WeatherEntry } from './weather-types';
import {
  BUBBLE_MAX_CHARS,
  CALENDAR_BUBBLE_MAX_GAP_S,
  CALENDAR_BUBBLE_MIN_GAP_S,
  FORECAST_RECHECK_GRACE_MS,
  FORECAST_RETRY_MS,
  bubbleLines,
  calendarBubbleGap,
  calendarLabel,
  dayOfInstant,
  entryLines,
  forecastRecheckDelay,
  pickBubble,
  skyKind,
  skyLine,
  skyNames,
} from './weather-view';

const DAY = 86_400_000;

const entry = (name: string, extra: Partial<WeatherEntry> = {}): WeatherEntry => ({
  id: name.toLowerCase().replaceAll(' ', '-'),
  name,
  flavor: 'Flavour.',
  bubbles: [`${name} today`],
  fight: [],
  trips: [],
  ...extra,
});

const day = (at: number, boon: string, omen: string | null = null, wild = false): WeatherDay => ({
  day: 'd',
  startsAt: at,
  endsAt: at + DAY,
  boon: entry(boon),
  omen: omen === null ? null : entry(omen),
  wild,
  treatTimes: 2,
});

const T = 1_800_000_000_000;
const forecast = (today: WeatherDay | null, tomorrow: WeatherDay | null = null): Forecast => ({
  today,
  tomorrow,
});

describe('the pictures', () => {
  it('is a sun for a Boon alone, a cloud with an Omen, a storm with a wild one, blank without a day', () => {
    expect(skyKind(null)).toBe('blank');
    expect(skyKind(day(T, 'Fair Winds'))).toBe('sun');
    expect(skyKind(day(T, 'Fair Winds', 'Heavy Rain'))).toBe('cloud');
    expect(skyKind(day(T, 'Fair Winds', 'Stormfront', true))).toBe('storm');
  });

  it('names the day, and says both when there are two', () => {
    expect(skyNames(day(T, 'Fair Winds'))).toBe('Fair Winds');
    expect(skyNames(day(T, 'Fair Winds', 'Heavy Rain'))).toBe('Fair Winds and Heavy Rain');
  });

  it('lists the raid and dungeon lines, then the trips lines', () => {
    expect(entryLines(entry('X', { fight: ['a', 'b'], trips: ['c'] }))).toEqual(['a', 'b', 'c']);
    expect(entryLines(entry('X'))).toEqual([]);
  });

  it('labels the button for a screen reader', () => {
    expect(calendarLabel(null)).toMatch(/no forecast yet/);
    expect(calendarLabel(forecast(null))).toMatch(/no forecast yet/);
    expect(calendarLabel(forecast(day(T, 'Fair Winds', 'Heavy Rain')))).toBe(
      'Wall calendar: today is Fair Winds and Heavy Rain. Open the forecast.',
    );
  });
});

describe('which day an instant is in', () => {
  const f = forecast(day(T, 'A'), day(T + DAY, 'B'));

  it('is today from its start to its end, then tomorrow, then nothing', () => {
    expect(dayOfInstant(f, T)).toBe('today');
    expect(dayOfInstant(f, T + DAY - 1)).toBe('today');
    expect(dayOfInstant(f, T + DAY)).toBe('tomorrow');
    expect(dayOfInstant(f, T + 2 * DAY - 1)).toBe('tomorrow');
    expect(dayOfInstant(f, T + 2 * DAY)).toBeNull();
    expect(dayOfInstant(f, T - 1)).toBeNull();
    expect(dayOfInstant(forecast(null, null), T)).toBeNull();
  });
});

describe('the compact line', () => {
  const f = forecast(
    day(T, 'Fair Winds', 'Heavy Rain'),
    day(T + DAY, 'Market Day', 'Stormfront', true),
  );

  it('says today by default', () => {
    expect(skyLine(f)).toEqual({
      label: 'Sky today',
      names: 'Fair Winds and Heavy Rain',
      wild: false,
      kind: 'cloud',
    });
  });

  it('names the stage when the next stage runs tomorrow, and says today when it runs today or later', () => {
    expect(skyLine(f, { at: T + DAY + 3_600_000, name: 'Phase 2' })).toEqual({
      label: 'Sky when Phase 2 runs',
      names: 'Market Day and Stormfront',
      wild: true,
      kind: 'storm',
    });
    expect(skyLine(f, { at: T + 3_600_000, name: 'Phase 1' })?.label).toBe('Sky today');
    expect(skyLine(f, { at: T + 5 * DAY, name: 'Finale' })?.label).toBe('Sky today');
  });

  it('says nothing without a forecast or without today', () => {
    expect(skyLine(null)).toBeNull();
    expect(skyLine(forecast(null, day(T, 'A')))).toBeNull();
    // With no today but a known tomorrow, a stage that runs tomorrow still gets its own day's line.
    expect(
      skyLine(forecast(null, day(T + DAY, 'A')), { at: T + DAY + 1, name: 'Phase 1' })?.label,
    ).toBe('Sky when Phase 1 runs');
  });

  it('is for a sun when there is no Omen', () => {
    expect(skyLine(forecast(day(T, 'Fair Winds')))?.kind).toBe('sun');
  });
});

describe('the calendar speaks', () => {
  it("draws from what today says and warns of tomorrow's Omen, in a bubble's width", () => {
    const f = forecast(
      day(T, 'Fair Winds', 'Heavy Rain'),
      day(T + DAY, 'Market Day', 'Static Sky'),
    );
    expect(bubbleLines(f)).toEqual([
      'Fair Winds today',
      'Heavy Rain today',
      'Soon: static Sky today',
    ]);
    for (const line of bubbleLines(f))
      expect([...line].length).toBeLessThanOrEqual(BUBBLE_MAX_CHARS);
  });

  it('leaves out a line that would not fit, and says nothing without a forecast', () => {
    const long = 'x'.repeat(BUBBLE_MAX_CHARS + 1);
    const f = forecast({ ...day(T, 'A'), boon: entry('A', { bubbles: [long, 'ok'] }) });
    expect(bubbleLines(f)).toEqual(['ok']);
    expect(bubbleLines(null)).toEqual([]);
    expect(bubbleLines(forecast(null, null))).toEqual([]);
  });

  it('only warns of tomorrow when tomorrow has an Omen', () => {
    expect(bubbleLines(forecast(day(T, 'A'), day(T + DAY, 'B')))).toEqual(['A today']);
  });

  it('picks one line at random from the injected source, and none from an empty list', () => {
    const lines = ['a', 'b', 'c'];
    const seen = new Set<string | null>();
    const rng = createSeededRng('calendar');
    for (let i = 0; i < 200; i++) seen.add(pickBubble(rng, lines));
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
    expect(pickBubble(rng, [])).toBeNull();
  });

  it('waits a whole number of seconds from 10 to 30, using the whole range', () => {
    const fixed = (v: number): Rng => ({ nextU32: () => v });
    expect(calendarBubbleGap(fixed(0))).toBe(CALENDAR_BUBBLE_MIN_GAP_S * 1000);
    const rng = createSeededRng('calendar-gaps');
    const gaps = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const gap = calendarBubbleGap(rng);
      expect(gap % 1000).toBe(0);
      expect(gap).toBeGreaterThanOrEqual(CALENDAR_BUBBLE_MIN_GAP_S * 1000);
      expect(gap).toBeLessThanOrEqual(CALENDAR_BUBBLE_MAX_GAP_S * 1000);
      gaps.add(gap);
    }
    expect(gaps.size).toBe(CALENDAR_BUBBLE_MAX_GAP_S - CALENDAR_BUBBLE_MIN_GAP_S + 1);
  });
});

describe('asking for the forecast again', () => {
  it('waits for the end of today by the server clock, plus a moment', () => {
    const f = forecast(day(T, 'A'));
    expect(forecastRecheckDelay(f, T + DAY - 60_000)).toBe(60_000 + FORECAST_RECHECK_GRACE_MS);
  });

  it('does not loop when the day is already over: it tries again after a while', () => {
    const f = forecast(day(T, 'A'));
    expect(forecastRecheckDelay(f, T + DAY)).toBe(FORECAST_RETRY_MS);
    expect(forecastRecheckDelay(f, T + 3 * DAY)).toBe(FORECAST_RETRY_MS);
  });

  it('has no timer without a today, and never asks a timer for more than it can hold', () => {
    expect(forecastRecheckDelay(null, T)).toBeNull();
    expect(forecastRecheckDelay(forecast(null, day(T, 'A')), T)).toBeNull();
    const far = { ...day(T, 'A'), endsAt: T + 400 * DAY };
    expect(forecastRecheckDelay(forecast(far), T)).toBeLessThanOrEqual(2_000_000_000);
  });
});

describe('parsing what the server sends', () => {
  it('reads the captured forecast', () => {
    const parsed = parseForecast(fixture);
    expect(parsed.today?.boon.name).toBe('Fair Winds');
    expect(parsed.today?.omen?.name).toBe('Static Sky');
    expect(parsed.tomorrow?.omen).toBeNull();
    expect(parsed.tomorrow?.wild).toBe(false);
    expect(parsed.today?.treatTimes).toBe(2);
  });

  it('reads a forecast with no days', () => {
    expect(parseForecast({ today: null, tomorrow: null })).toEqual({ today: null, tomorrow: null });
  });

  it('refuses an answer that is not a forecast', () => {
    expect(() => parseForecast(null)).toThrow();
    expect(() => parseForecast([])).toThrow();
    expect(() => parseForecast({ today: null })).toThrow();
    expect(() => parseForecast({ today: {}, tomorrow: null })).toThrow();
    const broken = (edit: (d: Record<string, unknown>) => void): unknown => {
      const copy = JSON.parse(JSON.stringify(fixture)) as { today: Record<string, unknown> };
      edit(copy.today);
      return copy;
    };
    expect(() => parseForecast(broken((d) => (d['startsAt'] = 'soon')))).toThrow();
    expect(() => parseForecast(broken((d) => (d['wild'] = 'no')))).toThrow();
    expect(() => parseForecast(broken((d) => delete d['boon']))).toThrow();
    expect(() => parseForecast(broken((d) => (d['omen'] = 5)))).toThrow();
    expect(() => parseForecast(broken((d) => delete d['treatTimes']))).toThrow();
    expect(() => parseForecast(broken((d) => (d['treatTimes'] = 0)))).toThrow();
    expect(() =>
      parseForecast(broken((d) => ((d['boon'] as Record<string, unknown>)['fight'] = [1]))),
    ).toThrow();
  });
});
