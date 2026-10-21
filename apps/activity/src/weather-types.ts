/**
 * What `GET /api/weather` answers (docs/design/gear-and-creatures-v2.md section 10): the valley's sky
 * for today and tomorrow, the same for every player. The words (names, lines with the real numbers at the
 * day's strength) come from the server; the client only shows them, as text.
 */

/** One Boon or Omen as the player reads it. */
export interface WeatherEntry {
  id: string;
  name: string;
  flavor: string;
  /** A few words the wall calendar may say about it. */
  bubbles: string[];
  /** What it does in the raid and the dungeon. */
  fight: string[];
  /** What it does on trips, in the Workshop and for creature experience. */
  trips: string[];
}

export interface WeatherDay {
  /** The game day, named by the guild-local date it starts on. */
  day: string;
  /** When it starts and ends, in the server's UTC epoch milliseconds (the reset times). */
  startsAt: number;
  endsAt: number;
  boon: WeatherEntry;
  /** Null: no Omen (Boss Rank 1 and 2, and every Festival week). */
  omen: WeatherEntry | null;
  /** The Omen is a wild one (shown a day ahead, at most one a week). */
  wild: boolean;
  /** What a treat multiplies creature experience by on this day (2, or a Boon's 3 or 4); the server's number. */
  treatTimes: number;
}

export interface Forecast {
  /** Null when the server has none (a day that was not drawn). */
  today: WeatherDay | null;
  tomorrow: WeatherDay | null;
}
