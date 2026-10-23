import type { Element, GamesKind, Role } from '@creatures/game';
import type { SlotMods } from '../types';

/** The gear lines the Games read (the same numbers as the fight sheet, `SlotMods`). */
export type GamesMods = Pick<
  SlotMods,
  | 'sidestepBp'
  | 'stubborn'
  | 'secondWindBp'
  | 'echoBp'
  | 'paybackBp'
  | 'lastStandBp'
  | 'momentumBp'
  | 'riposteBp'
  | 'warmHeartBp'
>;

/**
 * One creature entered in one event, snapshotted at the lock (`gamesEntrantFrom` builds it). No level
 * in the Games (Misa, 2026-10-23): the stats are the species' base strengths (its current form's level-1
 * stats, no growth, no fusion, no gear stat lines); only the gear's chance and trigger lines count.
 */
export interface GamesEntrant {
  /** Unique within the event (the creature id). */
  id: string;
  playerId: string;
  /** The player's team; `teamId === playerId` in a solo event. */
  teamId: string;
  name: string;
  speciesId: string;
  shiny?: boolean;
  element: Element;
  role: Role;
  stage: 1 | 2;
  hp: number;
  atk: number;
  spd: number;
  /** Dodge chance in basis points (`dodgeChanceBp(spd, flat)`). */
  dodgeBp: number;
  /** Crit chance and crit damage in basis points (`creatureCritStats`). */
  critBp: number;
  critDmgBp: number;
  mods?: GamesMods;
  /** A dev bot (it appears in the show; the worker gives it no prize). */
  bot?: boolean;
}

export type GamesFx =
  | 'steam'
  | 'splash'
  | 'flame'
  | 'spark'
  | 'squash'
  | 'gulp'
  | 'shove'
  | 'hop'
  | 'stumble'
  | 'heal'
  | 'shield'
  | 'sweat'
  | 'ko'
  | 'cheer'
  | 'duck'
  | 'burp'
  | 'chill'
  | 'zap'
  | 'bonk'
  | 'star';

export type GamesActorState =
  'idle' | 'run' | 'swim' | 'eat' | 'sweat' | 'flame' | 'flat' | 'dizzy' | 'cheer' | 'out';

/**
 * One step of the show. Positions are an actor's feet centre in scene pixels (the scene is 192 x 112;
 * a chase's x grows past 192 and the client's camera follows the pack). `t` is in ticks.
 */
export type GamesBeat =
  /** The actor arrives at x, y at tick t (the client moves it there from its previous position). */
  | { t: number; k: 'pos'; a: number; x: number; y: number }
  | { t: number; k: 'fx'; fx: GamesFx; a?: number; x?: number; y?: number }
  /** 0 to 100: heat taken, fullness, stamina, as a tiny bar. */
  | { t: number; k: 'meter'; a: number; v: number }
  /** The running score (peppers eaten, laps, metres). */
  | { t: number; k: 'score'; a: number; v: number }
  | { t: number; k: 'state'; a: number; s: GamesActorState }
  /** Eliminated; `cause` is a short id (`heat`, `squash`, `burst`, `shark`, `splash`). */
  | { t: number; k: 'out'; a: number; cause: string }
  /**
   * A moving or changing prop: `melon`, `shark:<i>`, `floe` (f = x-radius in px), `pepper:<a>` (f = heat
   * tier 0 to 2), `heat` (f = 0 to 100).
   */
  | { t: number; k: 'prop'; p: string; x: number; y: number; f?: number }
  /** A commentary key (the content holds the template); a and b are actors, n a number. */
  | { t: number; k: 'say'; line: string; a?: number; b?: number; n?: number };

export interface GamesActor {
  a: number;
  entrantId: string;
  playerId: string;
  teamId: string;
  name: string;
  speciesId: string;
  shiny?: boolean;
  element: Element;
  /** Start position. */
  x: number;
  y: number;
}

export interface GamesStanding {
  teamId: string;
  /** 1 is best; a tie shares the place and the next place is skipped (1, 1, 3). */
  place: number;
  score: number;
  actors: number[];
}

export interface GamesEventResult {
  eventId: string;
  kind: GamesKind;
  scene: string;
  team: 1 | 3;
  tickMs: number;
  /** The show's length in ticks (every beat has t < ticks). */
  ticks: number;
  actors: GamesActor[];
  /** Sorted by t. */
  beats: GamesBeat[];
  /** Best first. */
  standings: GamesStanding[];
  /** Notable beats: reactions, gulps, squashes, splashes, ducks, gear procs. */
  moments: number;
  /** The tick of each moment, in order (the show's highlights; the simulator checks there are no long quiet stretches). */
  momentTicks: number[];
  /** Each actor's own score and its tick of elimination (null: still in at the end), by actor index. */
  scores: number[];
  outAt: (number | null)[];
}
