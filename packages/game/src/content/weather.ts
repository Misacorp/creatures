import destinationsJson from './data/destinations.json';
import reactionsJson from './data/reactions.json';
import weatherJson from './data/weather.json';
import { loadWeather, type WeatherDef } from './weather-schema';

/**
 * The shipped Boons and Omens, validated against the reactions and the destinations at module load (the
 * ids are read from the same data files the rest of the content is loaded from).
 */
export const weatherContent: readonly WeatherDef[] = loadWeather(
  weatherJson,
  { reactions: reactionsJson.map((r) => ({ id: r.id })) },
  new Set(destinationsJson.map((d) => d.id)),
);

const BY_ID = new Map<string, WeatherDef>(weatherContent.map((d) => [d.id, d]));

/** A Boon or Omen by id, or undefined. */
export function weatherDef(id: string): WeatherDef | undefined {
  return BY_ID.get(id);
}
