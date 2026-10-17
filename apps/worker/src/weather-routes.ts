import { json, type Routes } from './http';
import type { Weather } from './weather';

/** What these routes need from the request context (GuildCore's context satisfies it). */
export interface WeatherRouteContext {
  core: { weather: Weather };
}

/**
 * The forecast: today's and tomorrow's Boon and Omen of the whole valley, the same for every player.
 * Read-only and takes nothing from the request; a day that has no weather (a server that has none yet)
 * is null. The numbers in the lines are the real ones at the day's strength.
 */
export const weatherRoutes: Routes<WeatherRouteContext> = {
  '/api/weather': {
    GET: (_request, ctx) => json(ctx.core.weather.forecast()),
  },
};
