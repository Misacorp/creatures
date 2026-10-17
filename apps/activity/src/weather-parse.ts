/**
 * Shape check for the forecast the Worker answers (`GET /api/weather`, `weather-routes.ts`). An answer that
 * does not match is an error, never a half-drawn calendar; nothing here repairs or guesses.
 */
import { isArrayOf, isBool, isInt, isRecord, isStr } from './parse-core';
import type { Forecast, WeatherDay, WeatherEntry } from './weather-types';

function isEntry(value: unknown): value is WeatherEntry {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isStr(value['flavor']) &&
    isArrayOf(value['bubbles'], isStr) &&
    isArrayOf(value['fight'], isStr) &&
    isArrayOf(value['trips'], isStr)
  );
}

function isDay(value: unknown): value is WeatherDay {
  return (
    isRecord(value) &&
    isStr(value['day']) &&
    isInt(value['startsAt']) &&
    isInt(value['endsAt']) &&
    isEntry(value['boon']) &&
    (value['omen'] === null || isEntry(value['omen'])) &&
    isBool(value['wild'])
  );
}

const isNullableDay = (value: unknown): value is WeatherDay | null =>
  value === null || isDay(value);

/** The forecast, or an `Error` for an answer that is not one. */
export function parseForecast(raw: unknown): Forecast {
  if (!isRecord(raw) || !isNullableDay(raw['today']) || !isNullableDay(raw['tomorrow'])) {
    throw new Error('The forecast is not what the game expected.');
  }
  return { today: raw['today'], tomorrow: raw['tomorrow'] };
}
