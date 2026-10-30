import type { Rng } from '@creatures/game';
import type { KitName, Resource, Rules } from './rules';
import type { PlayerProfile } from './schema';
import type { BossDial, Policy } from './servers';

export const R = {
  acorns: 0,
  scrap: 1,
  shards: 2,
  glimmer: 3,
  essence: 4,
} as const satisfies Record<Resource, number>;
export const N_RES = 5;
export const HOURS_PER_WEEK = 168;

export interface Creature {
  species: number;
  element: number;
  xp: number;
  level: number;
  ribbons: number;
  canEvolve: boolean;
  evolved: boolean;
  /** The level it cannot pass now, and the XP it banks at most. */
  ceiling: number;
  capXp: number;
  /** V-BON-2: the multiplier fixed at the last visit, and the hour it stops. */
  catchMult: number;
  catchUntil: number;
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
  storeHours: number;
  storeLost: number;
  levels: number[];
  size: number;
  species: number;
  arrivals: number;
  duplicates: number;
  scoutSeats: number;
  anvils: number;
  kit: number;
  ribbons: number;
  /** Creatures held at a ribbon gate, and at their evolution level, at the end of the week. */
  waitingRibbon: number;
  waitingEvolve: number;
  forge: number[];
  piecesMade: number;
  piecesWorn: number;
  piecesDismantled: number;
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
  seats: Seat[];
  anvils: Anvil[];
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
  progress: number;
  size: number;
  cosmetic: number;
  openedAt: number;
}

export interface Server {
  config: { id: string; bossKills: BossDial; communalSeats: boolean };
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
  /** Sockets filled in each place's collection: [everyday filled, keystones filled]. */
  sockets: { everyday: number; keystones: number }[];
  collectionsDone: number;
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
}
