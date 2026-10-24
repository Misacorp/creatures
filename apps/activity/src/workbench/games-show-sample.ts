/**
 * Sample Valley Games shows for the workbench and the tests: rosters built from the shipped species,
 * run through the real engine (`runGamesEvent`) with a seeded Rng, so every preset is a show the server
 * could produce. Fixture code only; the game never imports it.
 */
import {
  type GamesEntrant,
  type GamesEventResult,
  gamesEntrantFrom,
  runGamesEvent,
} from '@creatures/engine';
import {
  content,
  createSeededRng,
  gamesContent,
  int,
  RULES,
  type GamesEventDef,
  type Rng,
} from '@creatures/game';

/** Player names for the samples (plain, short, a long one to test the commentary's ellipsis). */
const PLAYER_NAMES = [
  'Misa',
  'Aino',
  'Eero',
  'Kaisa',
  'Lauri',
  'Noora',
  'Oskari',
  'Pinja',
  'Ville',
  'Saara',
  'Tuomas',
  'Iida',
  'Juho',
  'Elina',
  'Mikko',
  'Henna',
  'Antti',
  'Sofia',
  'Topi',
  'Venla',
  'Arttu',
  'Emmi',
  'Kalle',
  'Ronja',
];

/** A few nicknames, so a show has some named creatures among the species names. */
const NICKNAMES = ['Sir Puddle', 'Toasty', 'Mr Wobbles', 'Pip', 'Big Biscuit', 'Lady Fizz'];

/** The worst case for the commentary and the board: long player names and long creature nicknames. */
const LONG_PLAYER_NAMES = [
  'Kristiina Marjatta',
  'Aleksandra Heikkinen',
  'Maximilian Virtanen',
  'Annamaria Korhonen',
  'Wilhelmiina Laine',
  'Konstantinos Niemi',
];
const LONG_NICKNAMES = [
  'Sir Bubbles of Wobble',
  'Lady Marmalade Fizz',
  'Professor Puddlesworth',
  'Big Biscuit the Third',
  'Captain Toastbeard',
];

export interface SamplePlayer {
  id: string;
  name: string;
  bot: boolean;
  /** Long names (workbench worst case): the player's and the creatures'. */
  long?: boolean;
}

export interface SampleShow {
  events: GamesEventResult[];
  players: SamplePlayer[];
  /** Display names by player id. */
  names: Record<string, string>;
  /** The viewer (the first human player). */
  youId: string;
}

/** The pool's event ids, in content order. */
export const SAMPLE_EVENT_IDS: readonly string[] = gamesContent.events.map((e) => e.id);

function eventDef(id: string): GamesEventDef {
  const def = gamesContent.events.find((e) => e.id === id);
  if (def === undefined) throw new Error(`No games event ${id}`);
  return def;
}

/** `humans` players plus `bots` dev bots (ids `dev-guest-*`, like the worker's dev guests). */
export function samplePlayers(humans: number, bots: number, long = false): SamplePlayer[] {
  const out: SamplePlayer[] = [];
  for (let i = 0; i < humans; i++) {
    const name = long
      ? (LONG_PLAYER_NAMES[i % LONG_PLAYER_NAMES.length] ?? 'Kristiina Marjatta')
      : (PLAYER_NAMES[i] ?? `Player ${String(i + 1)}`);
    out.push({
      id: `player-${String(i + 1)}`,
      name,
      bot: false,
      ...(long ? { long: true } : {}),
    });
  }
  for (let i = 0; i < bots; i++) {
    out.push({ id: `dev-guest-${String(i + 1)}`, name: `Bot ${String(i + 1)}`, bot: true });
  }
  return out;
}

/** One creature of a player for an event: a random species (the Games read no level), now and then a gear line. */
function sampleEntrant(rng: Rng, player: SamplePlayer, slot: string): GamesEntrant {
  const pool = content.creatures.filter((s) => s.festival !== true);
  const species = pool[int(rng, pool.length)] ?? content.creatures[0];
  if (species === undefined) throw new Error('No species');
  // The level draw stays so the samples' later draws are as they were; the Games read no level.
  int(rng, Math.min(species.levelCap, 30));
  const nick = int(rng, 6) === 0 ? NICKNAMES[int(rng, NICKNAMES.length)] : undefined;
  const lucky = int(rng, 8);
  return gamesEntrantFrom({
    id: `${player.id}-${slot}`,
    playerId: player.id,
    name:
      player.long === true
        ? (LONG_NICKNAMES[
            (slot.length + player.id.length + player.name.length) % LONG_NICKNAMES.length
          ] ?? species.name)
        : (nick ?? species.name),
    species,
    // A few gear lines now and then, so stars (Stubborn, Momentum) show up in the samples.
    mods:
      lucky === 0
        ? { stubborn: 1 }
        : lucky === 1
          ? { sidestepBp: 1500, momentumBp: 3000 }
          : lucky === 2
            ? { secondWindBp: 2500, echoBp: 2000 }
            : undefined,
    shiny: int(rng, 12) === 0,
    bot: player.bot,
  });
}

/** Every player's entrants for one event (three each in a team event). */
export function sampleEntrants(
  def: GamesEventDef,
  players: readonly SamplePlayer[],
  rng: Rng,
): GamesEntrant[] {
  const per = def.team === 3 ? 3 : 1;
  // A team event takes at most 16 full teams (`RULES.games.maxTeamEntrants`).
  const cap = Math.floor(
    (def.team === 3 ? RULES.games.maxTeamEntrants : RULES.games.maxEntrants) / per,
  );
  return players
    .slice(0, cap)
    .flatMap((p) =>
      Array.from({ length: per }, (_, i) => sampleEntrant(rng, p, `${def.id}-${String(i)}`)),
    );
}

/** One event run by the real engine on a sample roster. Deterministic for a seed. */
export function sampleEvent(
  eventId: string,
  players: readonly SamplePlayer[],
  seed: string,
): GamesEventResult {
  const def = eventDef(eventId);
  const rng = createSeededRng(`${seed}:${eventId}:${String(players.length)}`);
  return runGamesEvent(def, sampleEntrants(def, players, rng), rng);
}

/** The default day: three solo events and the team closer, like `chooseLineup` gives on a bonus day. */
export const SAMPLE_DAY: readonly string[] = [
  'sauna-showdown',
  'melon-run',
  'floe-sumo',
  'log-carry',
];

/** A show of `eventIds` for `humans` players and `bots` bots. */
export function sampleShow(
  eventIds: readonly string[],
  humans: number,
  bots: number,
  seed: string,
  long = false,
): SampleShow {
  const players = samplePlayers(humans, bots, long);
  const names = Object.fromEntries(players.map((p) => [p.id, p.name]));
  return {
    events: eventIds.map((id) => sampleEvent(id, players, seed)),
    players,
    names,
    youId: players[0]?.id ?? 'player-1',
  };
}
