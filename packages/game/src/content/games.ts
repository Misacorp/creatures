import gamesJson from './data/games-events.json';
import { loadGames, type GamesEventDef, type GamesPack } from './games-schema';

/** The shipped Valley Games pool and commentary, validated at module load. */
export const gamesContent: GamesPack = loadGames(gamesJson);

const BY_ID = new Map<string, GamesEventDef>(gamesContent.events.map((e) => [e.id, e]));

/** A Games event by id, or undefined. */
export function gamesEventDef(id: string): GamesEventDef | undefined {
  return BY_ID.get(id);
}
