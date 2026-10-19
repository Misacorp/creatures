/**
 * The valley's sky for today and tomorrow (Boons and Omens): loaded with the game, and again a
 * moment after the day turns over (the server draws the next one at the daily reset), so the
 * calendar and the cards never show yesterday's sky.
 */
import { useEffect, useState } from 'preact/hooks';
import { fetchForecast } from './weather-api';
import type { Forecast } from './weather-types';
import { forecastRecheckDelay } from './weather-view';

/**
 * `enabled`: the game is on screen. `offset`: server clock minus local clock, for the day turn.
 * `forecast` is null until the first load (or when it failed).
 */
export function useForecast(enabled: boolean, offset: number) {
  const [forecast, setForecast] = useState<Forecast | null>(null);

  /** Loads the forecast (a plain read: a failure keeps the one on screen, the next call tries again). */
  function load(): void {
    fetchForecast().then(setForecast, () => undefined);
  }

  useEffect(() => {
    if (enabled) load();
  }, [enabled]);
  const ends = forecast?.today?.endsAt ?? null;
  useEffect(() => {
    const wait = forecastRecheckDelay(forecast, Date.now() + offset);
    if (wait === null) return undefined;
    const timer = setTimeout(load, wait);
    return () => {
      clearTimeout(timer);
    };
  }, [ends, offset]);

  return { forecast, load };
}
