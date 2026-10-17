import { apiFetch } from './api';
import { parseForecast } from './weather-parse';
import type { Forecast } from './weather-types';

/** Today's and tomorrow's Boon and Omen. A plain read: nothing is sent, nothing changes. */
export async function fetchForecast(): Promise<Forecast> {
  return parseForecast(await apiFetch('/api/weather'));
}
