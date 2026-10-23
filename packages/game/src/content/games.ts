import gamesJson from './data/games-events.json';
import { loadGames, type GamesEventDef, type GamesKind, type GamesPack } from './games-schema';

/** The shipped Valley Games pool and commentary, validated at module load. */
export const gamesContent: GamesPack = loadGames(gamesJson);

const BY_ID = new Map<string, GamesEventDef>(gamesContent.events.map((e) => [e.id, e]));

/** A Games event by id, or undefined. */
export function gamesEventDef(id: string): GamesEventDef | undefined {
  return BY_ID.get(id);
}

/** What a stored day still needs to know about an event: enough to show it, never to run it. */
export type GamesEventInfo = Pick<
  GamesEventDef,
  'id' | 'name' | 'kind' | 'scene' | 'team' | 'tickMs' | 'line' | 'favours' | 'favourNotes'
> & {
  teamScore?: 'best' | 'sum' | undefined;
  /** A swim's laps (a replay reads them for the finish). */
  laps?: number | undefined;
};

/**
 * Events taken out of the pool (2026-10-23: team events must not grow longer with more teammates).
 * Stored days, records and replays may still name them, so they keep a name and the numbers a replay
 * reads; they are never drawn or run again. Ids are never reused.
 */
export const GAMES_RETIRED: Readonly<Record<string, GamesEventInfo>> = {
  'sauna-stack': {
    id: 'sauna-stack',
    name: 'Sauna Stack',
    kind: 'endure',
    scene: 'sauna',
    team: 3,
    teamScore: 'best',
    tickMs: 400,
    line: 'Bring three friends to the bench. Your team lasts as long as its last sitter.',
    favours: ['guard', 'hp', 'ember', 'small', 'support'],
    favourNotes: {
      guard: 'Guards shelter the sitters stacked beside them.',
      hp: 'Hardy sitters last longest up near the ceiling.',
      ember: 'Ember creatures shrug off the heat.',
      small: 'Small ones stack neatly, low and cool.',
      support: 'Supports fan the sitters stacked around them.',
    },
  },
  'shark-relay': {
    id: 'shark-relay',
    name: 'Shark Relay',
    kind: 'swim',
    scene: 'shark-lake',
    team: 3,
    teamScore: 'sum',
    laps: 2,
    tickMs: 400,
    line: 'Three swimmers a team, every length counts. Keep away from the rubber sharks.',
    favours: ['spd', 'tide', 'small', 'setter', 'hp'],
    favourNotes: {
      spd: 'Fast swimmers bring the lap home quicker.',
      tide: 'Tide creatures cut through the water.',
      small: 'Small swimmers are hard for the sharks to spot.',
      setter: 'A Setter swims first and sets the pace.',
      hp: "Hardy swimmers shrug off a shark's bonk.",
    },
  },
};

/** An event live or retired (a stored day's event), or undefined for an id the game never had. */
export function gamesEventInfo(id: string): GamesEventInfo | undefined {
  return BY_ID.get(id) ?? (Object.hasOwn(GAMES_RETIRED, id) ? GAMES_RETIRED[id] : undefined);
}

/**
 * What a favour means in one event (its `favourNotes` line, live or retired), or undefined for an
 * unknown event or a favour it does not have.
 */
export function gamesFavourNote(eventId: string, favour: string): string | undefined {
  const notes = gamesEventInfo(eventId)?.favourNotes;
  return notes !== undefined && Object.hasOwn(notes, favour) ? notes[favour] : undefined;
}

/** An event's name: the live or retired event's, else the id itself. */
export function gamesEventName(id: string): string {
  return gamesEventInfo(id)?.name ?? id;
}

/** The kind of a live or retired event (undefined for an unknown id). */
export function gamesEventKind(id: string): GamesKind | undefined {
  return gamesEventInfo(id)?.kind;
}
