import type { Rng } from '@creatures/game';
import type { KitName, Resource, Rules } from './rules';
import type { PlayerProfile } from './schema';
import type { BossDial, Policy } from './servers';

export const R = {
  acorns: 0,
  scrap: 1,
  shards: 2,
  essence: 3,
} as const satisfies Record<Resource, number>;
export const N_RES = 4;
export const HOURS_PER_WEEK = 168;

export interface Creature {
  species: number;
  element: number;
  /** The hour it joined the roster (T-1: a creature owned for a week or more should be close to the best). */
  arrived: number;
  xp: number;
  level: number;
  /** Honours held (0 none, 1 Bronze, 2 Silver, 3 Gold): never a gate. */
  honour: number;
  /** The boxes of the trials (ticked as the creature lives): fights and the work it has done, in effective hours. */
  dungeonClears: number;
  undercroftClears: number;
  raidClears: number;
  scoutHours: number;
  smithHours: number;
  brought: boolean;
  canEvolve: boolean;
  evolved: boolean;
  /** The level it cannot pass now, and the XP it banks at most. */
  ceiling: number;
  capXp: number;
  /** V-BON-2: the multiplier fixed at the last visit, and the hour it stops. */
  catchMult: number;
  catchTarget: number;
  /** Item level worn in each slot (0 = empty). */
  gear: number[];
}

/** A scout seat (V-SCOUT-1): the store holds effective hours of work not yet brought home. */
export interface Seat {
  dest: number;
  store: number;
  wasted: number;
  mastery: number;
}

/** An anvil (V-FORGE-1): a smith working on one piece at a time. */
export interface Anvil {
  working: boolean;
  progress: number;
  need: number;
  element: number;
  rarity: number;
  mastery: number;
}

export interface Piece {
  ilvl: number;
  rarity: number;
  element: number;
}

/** Why an anvil-hour was not spent on a piece (T-4): the index into `WeekRecord.forge`. */
export const FORGE_BUCKETS = ['work', 'scrap', 'shard', 'floor', 'nothing'] as const;
export type ForgeBucket = (typeof FORGE_BUCKETS)[number];

/** What one player did in one week (plus a snapshot of the state at the end of it). */
export interface WeekRecord {
  week: number;
  inn: number[];
  out: number[];
  waste: number[];
  stock: number[];
  xpIdle: number;
  xpCatch: number;
  xpDungeon: number;
  xpRaid: number;
  xpLost: number;
  /** Effective hours of idle gain this week (the away steps), and what the scouts' stores brought home or lost. */
  effHours: number;
  /** Creature-hours of the week (creatures owned, summed over the hours). */
  creatureHours: number;
  storeHours: number;
  storeLost: number;
  levels: number[];
  size: number;
  /** Lines owned (the scout pool), the forms owned (lines plus the forms they evolved into), and what is available of each. */
  species: number;
  forms: number;
  available: number;
  availableForms: number;
  arrivals: number;
  duplicates: number;
  scoutSeats: number;
  anvils: number;
  kit: number;
  /** Creatures holding at least Bronze, Silver and Gold at the end of the week (honours: they never gate anything). */
  honours: number[];
  /** Kinds owned by rarity (common, rare, epic), the kinds available, and the starting pool's commons owned. */
  kindsByRarity: number[];
  availableByRarity: number[];
  startCommons: number;
  /** T-1: of the creatures owned a week or more at the end of the week, how many, the largest gap to the 3rd best and the median gap. */
  benchCount: number;
  /** How many of them are within `THRESHOLDS.benchWithin` levels of the 3rd best. */
  benchWithin: number;
  benchWorst: number;
  benchMedian: number;
  /** The largest of those gaps among creatures not held at the evolution level (waiting on Essence). */
  benchOpenWorst: number;
  /** Creatures held at their evolution level at the end of the week. */
  waitingEvolve: number;
  forge: number[];
  piecesMade: number;
  piecesWorn: number;
  piecesDismantled: number;
  /** Shard exchanges made this week and how many of them were crits. */
  exchanges: number;
  exchangeCrits: number;
  bag: number;
  bagNever: number;
  avgGear: number;
  gifts: number;
  visits: number;
  visitDays: number;
  choices: number[];
  choiceVisits: number;
  choicesTotal: number;
  nextDaysSum: number[];
  nextDaysCount: number[];
  zeroDays: number[];
  daysSampled: number;
  masters: number;
  rowsRead: number;
  rowsWritten: number;
  blueprints: number;
  pages: number;
}

export interface Player {
  id: number;
  profile: PlayerProfile;
  policy: Policy;
  rng: Rng;
  joinHour: number;
  visitAt: Uint8Array;
  creatures: Creature[];
  speciesCount: number[];
  /** How many species are available now (content drops). */
  available: number;
  seats: Seat[];
  anvils: Anvil[];
  /** Which creature stands at each scout seat and each anvil (an index into `creatures`, -1: nobody yet). */
  scoutOcc: number[];
  anvilOcc: number[];
  stock: number[];
  shards: number[];
  kitOwned: Record<KitName, boolean>;
  scoutKit: KitName | null;
  anvilKit: KitName | null;
  allowance: number;
  allowanceWasted: number;
  communalStore: number;
  lastVisit: number;
  passes: number;
  floor: Piece[];
  bag: number[];
  bagNever: number;
  weakByElement: number[];
  pendingByElement: number[];
  giftBudget: number[];
  hoardDone: boolean;
  forgeCursor: number;
  /** The element an anvil last waited for shards of (-1: none): the one-tap fix of a set-and-forget player. */
  waitingShard: number;
  raidThisWeek: boolean;
  blueprints: number;
  pages: number;
  masters: number;
  /** Visit days in the last 7 days, one flag per day. */
  visitDays: number[];
  visitedToday: boolean;
  /** Income of the last 7 days per resource, one slot per day (for "days to the next thing"). */
  income: number[][];
  incomeDay: number;
  weeks: WeekRecord[];
  wk: WeekRecord;
  sources: Map<string, number>;
  /** The first day (since joining) that 1, 3 and 10 creatures stood at the top level, and the creature levels' history. */
  day30: (number | null)[];
  /** For a returner: the day count after coming back until within `agreeWithin` of the server's middle (null: not yet). */
  backAt: number | null;
  catchUpDays: number | null;
  /** Rolling counter of rare finds etc. for the journey. */
  firsts: Record<string, number>;
  rules: Rules;
}

export interface Place {
  id: string;
  level: number;
  open: boolean;
  /** The hour the next project opens (after a level, build days run first). */
  opensAt: number;
  /** What is filled, in Acorns' worth, and the project's size in the same unit. */
  progress: number;
  size: number;
  /** The units each part needs and has (Acorns, scrap, shards: Q33). */
  need: number[];
  have: number[];
  cosmetic: number;
  openedAt: number;
}

/** The server's dials (see `ServerConfig`). */
export interface ServerOptions {
  bossKills: BossDial;
  communalSeats: boolean;
  /** Whether the Forge's shard exchange exists (Q34: 3 shards of any element for 1 of the one needed). */
  shardExchange: boolean;
}

export interface Server {
  config: ServerOptions & { id: string };
  rng: Rng;
  places: Place[];
  /** V-COM-13: warmth by source, summed (fire = start + warmth, unless the time floor is higher). */
  warmth: Record<string, number>;
  fire: number;
  /** The weekly boss: kills so far. */
  kills: number;
  middle: number;
  weight: number;
  /** V-SCOUT-9: the hour each destination's keystone is ready. */
  keystoneReady: number[];
  keystonesFound: number;
  /** Which sockets of each place's collection board are filled (in the order of `rules.collections.boards`). */
  sockets: boolean[][];
  collectionsDone: number;
  /** The hour the first collection was completed. */
  firstCollectionHour: number | null;
  thresholds: (number | null)[];
  /** Gifts in Acorn value by player. */
  gifts: number[];
  log: ServerWeek[];
  levelUps: { hour: number; place: string; level: number }[];
  projectDurations: number[];
  mastersTotal: number;
  communal: number;
}

export interface ServerWeek {
  week: number;
  levels: number[];
  progress: number[];
  fire: number;
  warmth: Record<string, number>;
  kills: number;
  middle: number;
  weight: number;
  gifts: number;
  communal: number;
  keystones: number;
  collections: number;
  visits: number;
  /** Server coverage (Q38): the share of each rarity's available species (common, rare, epic) that at least one player owns. */
  coverage: number[];
  /** The same counted in forms: a line is owned as its stage 1, and its evolved form once some player has evolved one. */
  formCoverage: number[];
  /** The same for the launch lines only (the lines the scouts find from the start), so content drops do not make it dip. */
  launchCoverage: number[];
}
