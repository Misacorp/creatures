/**
 * The shapes the server sends for the daily dungeon (`apps/worker/src/dungeon.ts`,
 * `dungeon-routes.ts`). Types only, with no parsing: the fixtures `dungeon-*.json` in `fixtures/` are
 * real server output and the Worker's `dungeon-fixtures.test.ts` fails when the server stops sending
 * these shapes.
 *
 * What the dungeon is (`docs/design/daily-dungeon.md`): one run a day (the guild-local day) with the
 * player's own team of three, played out entirely on the server. A run is final when the request
 * returns: the client shows the stored events at any pace (`roundPlaybackMs` from `@creatures/engine`
 * paces a round exactly as the live finale does) and can show the same run again from
 * `GET /api/dungeon/run/:id`. Amounts are integers. The seed of a run is never sent.
 */
import type { FightEvent } from '@creatures/engine';
import type { ExperienceView } from './experience';
import type { GearRarity, PartsBundle } from './gear-types';

export type Element = 'tide' | 'ember' | 'grove' | 'spark';
export type Role = 'setter' | 'payoff' | 'support' | 'guard';
/** A room modifier of the day. Shown before the run: the same for everyone on the server. */
export interface DungeonModifier {
  /** The room (0-based) it applies to; the last room is the floor boss. */
  room: number;
  id: string;
  name: string;
  /** One plain line ("Tide creatures hit 20% harder."). Render it as text. */
  description: string;
}

/** `GET /api/dungeon/today`. */
export interface DungeonToday {
  serverNow: number;
  /** The guild-local calendar day, 'YYYY-MM-DD'. */
  day: string;
  /** The guild's IANA timezone. */
  timezone: string;
  /** When the game day ends and the next run opens (the next 13:37 local reset), epoch ms. */
  resetsAt: number;
  /** The depth the next run fights at (it only goes up, by 1 for every full clear). */
  depth: number;
  /** The depth is a landmark (every 7th): a full clear drops gear for certain. */
  landmark: boolean;
  /** Days in a row with a run, as of now: 0 if yesterday was missed and nothing has run today. */
  streak: number;
  modifiers: DungeonModifier[];
  attemptsToday: number;
  /** 2 on the first day a player ever runs (a lost first run may be tried once more), otherwise 1. */
  attemptsAllowed: number;
  canRun: boolean;
  /** Why a run is not possible now: today's run is used up, or the player has fewer than 3 creatures. */
  blocked: 'already_run' | 'need_creatures' | null;
  /** The newest run of today, or null before the first. */
  last: DungeonRunSummary | null;
  /**
   * The creature ids of the player's most recent run on any day, left to right, or null before the
   * first run. The setup opens with them in the same places. Only ever the caller's own.
   */
  lastTeam: string[] | null;
  /**
   * The row the player left unfinished on the setup screen (saved by `PUT /api/dungeon/team`),
   * left to right, null for an empty place; null when there is none. Parsed as null when the server
   * does not send it. A run deletes it.
   */
  draftTeam: (string | null)[] | null;
  /**
   * Set when the next run is a landmark: the depth and the floor boss's content id, announced before
   * the run. Null otherwise; an older server leaves it out (read as null).
   */
  landmarkBoss: { depth: number; foeId: string } | null;
  /**
   * Today's map (`docs/design/dungeon-paths.md`): the same for everyone on the server, with foe HP at
   * this player's depth. Absent from an older server (read as null).
   */
  map?: DungeonMapView | null;
  /** The player's run that is still open today, or null. `canRun` is false while one is open. */
  active?: DungeonRunState | null;
}

/** What a room on the map is. */
export type DungeonNodeKind =
  'fight' | 'elite' | 'mystery' | 'cache' | 'camp' | 'boss' | 'door' | 'epic';

/**
 * One room on the map. Ids look like `f2l1` (floor 2, lane 1), or `u1f0l0` on an Undercroft level (level
 * 1, floor 0, lane 0). A `door` is a carved door (no foe, no modifier); an `epic` room is a fierce foe at
 * boss strength (its foe is `elite` too).
 */
export interface DungeonMapNode {
  id: string;
  /** 0 (the entrance) to `floors - 1` (the floor boss). */
  floor: number;
  /** 0 (left) to 2 (right). */
  lane: number;
  kind: DungeonNodeKind;
  /** The rooms on the next floor this room leads to. */
  next: string[];
  /** Fights, elites and the boss: the foe at the player's depth (an elite's HP includes its boost). */
  foe?: {
    id: string;
    name: string;
    element: Element;
    kind: 'foe' | 'boss';
    hpMax: number;
    elite: boolean;
  };
  /** Fights, elites and the boss: the room's modifier. */
  modifier?: { id: string; name: string; description: string };
  /** A mystery room: its name only; the scene and the options show once the run steps in. */
  event?: { id: string; name: string };
}

export interface DungeonMapView {
  /** 7 on the day's map (floor 3 is the camp, the last floor the floor boss); an Undercroft level has its own count, the keeper's floor included. */
  floors: number;
  nodes: DungeonMapNode[];
  /** An Undercroft level only: 1 to 3 (absent on the day's map). */
  level?: number;
  /** An Undercroft level only: its name on the map ("Undercroft 1"). Server text, drawn as text. */
  label?: string;
  /** An Undercroft level only: the keeper's floor is cracked (present only when true). Beating it opens a deeper level. */
  crack?: boolean;
}

/** Loot carried in the pack: kept whole when the run heads home or clears, half (rounded up) on a defeat. */
export interface DungeonPack {
  bait: number;
  essence: number;
  scrap: number;
}

/** A creature in the row of an open run. */
export interface DungeonRunCreature {
  id: string;
  name: string;
  speciesId: string;
  element: Element;
  role: Role;
  level: number;
  /** HP now (0: knocked out) and at most. */
  hp: number;
  hpMax: number;
  /** It carries a treat (double experience). A creature swapped in at the camp never does. */
  treat: boolean;
}

/** A buff for the rest of the run. `description` is the exact effect, one plain line. */
export interface DungeonKeepsakeView {
  id: string;
  name: string;
  description: string;
}

/** A mystery room's scene, once the run is in it. Exactly two options; `description` is the exact outcome. */
export interface DungeonEventView {
  id: string;
  name: string;
  text: string;
  options: { label: string; description: string }[];
}

/** What the boss chest already gave (the descent card shows it): gear and supplies are in the player's stock, shards and glimmer in their parts. */
export interface DungeonBanked {
  gear: { baseId: string; rarity: GearRarity; itemLevel?: number }[];
  /** Supply content ids, one each. */
  supplies: string[];
  parts: PartsBundle;
}

export type DungeonPending =
  | null
  | { kind: 'event'; event: DungeonEventView }
  | { kind: 'camp'; offers: DungeonKeepsakeView[]; restBp: number }
  | {
      /**
       * The floor boss (or an Undercroft keeper with a cracked floor) is down: head home with the pack
       * (`{type:'home'}`) or go down (`{type:'descend'}`). `level` is the level it opens (1, or 2 and 3
       * after a cracked floor), `floors` its floors with the keeper's, `depthBonus` how many depths
       * harder its foes are, `catchBreathBp` the HP the standing creatures recover on the way and `reviveBp`
       * the HP a fallen creature gets back up with, `newDepth`
       * the player's depth now (locked in) and `banked` what the chest already paid.
       */
      kind: 'descend';
      level: number;
      floors: number;
      depthBonus: number;
      catchBreathBp: number;
      reviveBp: number;
      newDepth: number;
      banked: DungeonBanked;
    };

/** The state of a run, open or done. Every act answers with it. */
export interface DungeonRunState {
  id: string;
  day: string;
  attempt: number;
  depth: number;
  landmark: boolean;
  status: 'active' | 'done';
  outcome: DungeonOutcome | null;
  /** Sent back with the next act; a mismatch is `stale_step`. */
  step: number;
  /** The day's main map (always). */
  map: DungeonMapView;
  /** The level the run stands in: 0 is the main map, 1 and up the Undercroft's (the last of `undercroft.maps`). */
  level: number;
  /**
   * The Undercroft levels drawn so far, in order, each with its `label` (and `crack`). Null until a carved
   * door added a room or the run went down. `marks` is how many rooms the carved door added (not which).
   */
  undercroft: { maps: DungeonMapView[]; marks: number } | null;
  /** The room the run stands in, or null before the entrance (of the main map or of a level just entered). */
  at: string | null;
  /** The rooms visited, in order. */
  path: string[];
  /** The rooms a move may go to now (empty while something is pending or the run is done). */
  reachable: string[];
  pending: DungeonPending;
  /** The row now, left to right. */
  team: DungeonRunCreature[];
  keepsakes: DungeonKeepsakeView[];
  /** At risk until the run heads home or clears. */
  pack: DungeonPack;
  roomsCleared: number;
  /** The run's supply is earned (it is safe: never in the pack). */
  supply: boolean;
  /** What the last mystery room did, in plain words, or null. */
  lastEvent: { name: string; option: string; outcome: string } | null;
  /**
   * What happened in each room the run has been through, in order (one entry per visited node). Absent
   * from an older server (read as an empty list).
   */
  history?: DungeonStepLog[];
}

/** What a room on the path gave or took. `loot` is what went into the pack there (zeros when nothing). */
export type DungeonStepLog =
  | {
      node: string;
      kind: 'fight' | 'elite' | 'boss' | 'epic';
      result: 'fight';
      cleared: boolean;
      rounds: number;
      /** The foe's HP when the fight ended (0 when cleared) and at most. */
      foeHpEnd: number;
      foeHpMax: number;
      loot: DungeonPack;
      /** An elite's or an epic fight's keepsake. */
      keepsake?: DungeonKeepsakeView;
      /** This fight earned the run's supply (the first fight cleared). */
      supply?: boolean;
    }
  | { node: string; kind: 'cache'; result: 'cache'; loot: DungeonPack }
  | {
      node: string;
      kind: 'mystery';
      result: 'event';
      event: string;
      /** The option label picked, and the plain line of what it did. */
      option: string;
      outcome: string;
      loot: DungeonPack;
      keepsake?: DungeonKeepsakeView;
    }
  | {
      node: string;
      kind: 'camp';
      result: 'camp';
      /** `home` when the run headed home from the camp. */
      choice: 'rest' | 'swap' | 'keepsake' | 'home';
      /** The plain line of what was done ("Rested: standing creatures recovered 40% HP."). */
      detail: string;
      keepsake?: DungeonKeepsakeView;
    }
  /** The run stepped into the camp and its choice is still waiting. */
  | { node: string; kind: 'camp'; result: 'pending' }
  /** The run stepped into a mystery room and its choice is still waiting. */
  | { node: string; kind: 'mystery'; result: 'pending'; event: string }
  /** A carved door was walked through. `added`: it added a room to the Undercroft (false past the limit). Which room is not said. */
  | { node: string; kind: 'door'; result: 'door'; added: boolean }
  /** A boss chest opened: the main boss's (level 0) or an Undercroft keeper's. `loot` went into the pack, `gear` is banked. */
  | {
      node: string;
      kind: 'boss';
      result: 'chest';
      level: number;
      loot: DungeonPack;
      gear: { baseId: string; rarity: GearRarity; itemLevel?: number }[];
    }
  /** The descent card is waiting at a boss that fell (`level` is the level it opens). */
  | { node: string; kind: 'descend'; result: 'pending'; level: number }
  /**
   * The run went down; `healed` is the HP the row recovered on the way, all creatures together, and
   * `revived` how many fallen ones got back up (absent on a run stored before they could).
   */
  | {
      node: string;
      kind: 'descend';
      result: 'descend';
      level: number;
      healed: number;
      revived?: number;
    }
  /** The run headed home from the descent card. */
  | { node: string; kind: 'descend'; result: 'home'; level: number };

export type DungeonOutcome = 'cleared' | 'home' | 'defeat';

/**
 * The body of `POST /api/dungeon/start`. Strict: any other key is `invalid_body`. The user comes from
 * the session; the seed, the stats and the rooms are the server's.
 */
export interface DungeonStartRequest {
  /**
   * The three creatures (ids of the player's own, all different), in the order they stand in the
   * one row, left to right: `team[i]` is position i. There is no formation: the order is it.
   */
  team: [string, string, string];
  /**
   * The creatures of the team that get a treat (Bait, paid with the run): they earn double experience.
   * Each is in `team`, once. Left out when there are none.
   */
  treats?: string[];
  /** A fresh key for every new run (8 to 64 characters of A-Z a-z 0-9 _ -); a retry reuses it. */
  idempotencyKey: string;
}

export interface DungeonStartResponse {
  state: DungeonRunState;
  today: DungeonToday;
}

export type DungeonAct =
  | { type: 'move'; node: string }
  | { type: 'event'; option: 0 | 1 }
  | {
      type: 'camp';
      choice: 'rest' | 'swap' | 'keepsake';
      /** The row reordered first (a permutation of the row's ids). */
      order?: [string, string, string];
      /** Swap: the creature in the row that goes home, and the player's creature that comes in. */
      out?: string;
      in?: string;
      /** Keepsake: one of the two offers. */
      keepsake?: string;
    }
  | { type: 'home' }
  /** Only while the descent card is pending: go down into the Undercroft. */
  | { type: 'descend' };

/** `POST /api/dungeon/act`. */
export interface DungeonActRequest {
  runId: string;
  step: number;
  idempotencyKey: string;
  act: DungeonAct;
}

export interface DungeonActResponse {
  state: DungeonRunState;
  /** The fight the move just played: play it at once. */
  room?: DungeonReplayRoom;
  /** Only when the run ended: the summary (with rewards) and the fresh day. Refresh balances then. */
  summary?: DungeonRunSummary;
  today?: DungeonToday;
}

export interface DungeonRewards {
  /** Paid by the rooms and the full clear. */
  bait: number;
  essence: number;
  /** All the parts the run's grant paid, including those of items that did not fit the bag. */
  parts: PartsBundle;
  /** Gear items now in the inventory. */
  gear: { id: string; baseId: string; rarity: GearRarity; itemLevel?: number }[];
  /** Items that did not fit the bag and became parts (already counted in `parts`). */
  converted: { baseId: string; rarity: GearRarity; itemLevel?: number }[];
  /**
   * The supplies the run dropped, one content id each (a Lure, a Map scrap...). They are in the stock
   * now. Absent in runs from before the dungeon dropped supplies (read as none).
   */
  supplies?: string[];
  /**
   * What the run paid each creature of the team in creature experience (a treat doubles it) and what it
   * did to their levels. Absent in runs from before training by activity.
   */
  experience?: ExperienceView[];
  /** A fully cleared landmark depth. */
  landmark: boolean;
  /** The streak bonus of the day (the 3rd and 7th day of a 7 day cycle), or null. Not in the amounts above. */
  streak: { day: number; bait: number; essence: number; parts: PartsBundle } | null;
}

export interface DungeonRoomSummary {
  index: number;
  kind: 'foe' | 'boss';
  /** A fiercer foe (path runs only; absent otherwise). An epic fight is one too. */
  elite?: boolean;
  /** An Undercroft epic fight (one fierce foe at boss strength; also `elite`). */
  epic?: boolean;
  /** `hpMax` is the foe's HP when the room started (after its modifier). */
  foe: { id: string; name: string; element: Element; hpMax: number };
  modifier: { id: string; name: string; description: string };
  /** False for the rooms after the one that was lost: they were never fought. */
  played: boolean;
  cleared: boolean;
  rounds: number;
  /** The foe's HP when the room ended (0 when it was cleared). */
  foeHpEnd: number;
}

export interface DungeonTeamMember {
  id: string;
  name: string;
  speciesId: string;
  element: Element;
  role: Role;
  level: number;
  /** HP at the start of the run, and when it ended (0: knocked out). HP carries from room to room. */
  hpMax: number;
  hpEnd: number;
}

export interface DungeonRunSummary {
  id: string;
  day: string;
  /** 1, or 2 for the retry of a first day. */
  attempt: number;
  depth: number;
  /** The depth after this run: one deeper after the floor boss fell (also when the run was then lost in the Undercroft), otherwise the same. */
  newDepth: number;
  /** The floor boss was beaten (all rooms for an old three-room run). It stays true when the run was lost below. */
  cleared: boolean;
  /** Undercroft levels cleared (keepers beaten): 0 for a run that never went down. Absent in older runs (read as 0). */
  deepest?: number;
  roomsCleared: number;
  landmark: boolean;
  /** Days in a row after this run. */
  streak: number;
  createdAt: number;
  /** The team in its row, left to right. */
  team: DungeonTeamMember[];
  /** All the rooms of the run, played or not. */
  rooms: DungeonRoomSummary[];
  rewards: DungeonRewards;
  /** The Boon and Omen (content ids) the run was fought under. Absent: none, and in runs from before the weather. */
  weather?: { boon: string; omen: string | null };
  /** How a path run ended. Absent in three-room runs from before the map (read: `cleared` decides). */
  outcome?: DungeonOutcome;
  /** The node kinds of the path taken, in order. Absent in older runs. */
  path?: DungeonNodeKind[];
  /** What the pack held when the run ended, and what of it came home. Absent in older runs. */
  pack?: { found: DungeonPack; kept: DungeonPack };
  /** The keepsakes the run held at the end. Absent in older runs. */
  keepsakes?: DungeonKeepsakeView[];
  /**
   * The map of the run, the nodes visited in order and what each did: the results screen can show the
   * route. Absent in older runs.
   */
  route?: {
    map: DungeonMapView;
    path: string[];
    history: DungeonStepLog[];
    /** The Undercroft levels the run went down into, in order (absent when it never did). */
    undercroft?: DungeonMapView[];
  };
}

/**
 * What the old `POST /api/dungeon/run` answered (it is `410 gone` now, and nothing sends it). Kept as
 * the type of the captured old-route fixtures (`dungeon-run-*.json`), whose `run` is the shape of an
 * old run summary and whose `today` carries it as `last`.
 */
export interface DungeonRunResponse {
  run: DungeonRunSummary;
  today: DungeonToday;
}

/** Names for `describeEvent` (`@creatures/engine`); the player key of a run is `p1`. */
interface DungeonEventNames {
  boss: string;
  creatures: Record<string, string>;
  players?: Record<string, string>;
  reactions?: Record<string, string>;
  gimmicks?: Record<string, string>;
  abilities?: Record<string, string>;
  marks?: Record<string, string>;
  elements?: Record<string, string>;
  adaptations?: Record<string, string>;
}

/** One creature of the fighting row as a replay writes it: `position` 0 is the left creature. */
export interface DungeonReplayRowEntry {
  position: number;
  id: string;
  name: string;
  species: string;
  element: Element;
  role: Role;
  level: number;
}

export interface DungeonReplayRoom {
  index: number;
  kind: 'foe' | 'boss';
  /** A fiercer foe (path runs only; absent otherwise). An epic fight is one too. */
  elite?: boolean;
  /** An Undercroft epic fight (also `elite`). */
  epic?: boolean;
  /** The map node of the room (path runs only). */
  node?: string;
  /** The run's keepsakes in that fight (path runs only). */
  keepsakes?: DungeonKeepsakeView[];
  /**
   * The row that fought this room (path runs only: a camp swap or reorder changes it). Absent: the
   * replay's top-level `row`.
   */
  row?: DungeonReplayRowEntry[];
  foe: { id: string; name: string; element: Element; hpMax: number };
  modifier: { id: string; name: string; description: string };
  cleared: boolean;
  rounds: number;
  /** Every creature's HP when the room started, and at most, by creature id. */
  hpStart: Record<string, number>;
  hpMax: Record<string, number>;
  /** The room's fight: play it with `planRounds` / `roundPlaybackMs` like a finale replay. */
  events: FightEvent[];
  names: DungeonEventNames;
}

/** `GET /api/dungeon/run/:id`: the caller's own run only (404 for anyone else's). Only the rooms that were played. */
export interface DungeonReplay {
  summary: DungeonRunSummary;
  /** The fighting row, left to right: `position` 0 is the left creature. */
  row: DungeonReplayRowEntry[];
  rooms: DungeonReplayRoom[];
}

/** `PUT /api/dungeon/team`: the body (three places, left to right, null for an empty one; the creatures all different). */
export interface DungeonTeamRequest {
  team: readonly [string | null, string | null, string | null];
}

/** What `PUT /api/dungeon/team` answers: the draft as it was stored. */
export interface DungeonTeamResponse {
  draftTeam: (string | null)[];
}

/** The error codes of the dungeon routes (`{ error }`, with these statuses). */
export const DUNGEON_ERRORS = {
  /** 400: the body is not the strict shape (wrong creature count, a bad key, unknown keys such as the old `abilities` or `formation`...). */
  invalid_body: 400,
  /** 400: the same creature twice. */
  duplicate_creature: 400,
  /** 400: the path id is not an id. */
  invalid_id: 400,
  /** 404: a creature or a run that is not the caller's (the same answer as for one that does not exist). */
  not_found: 404,
  /** 409: today's run is used up. */
  already_run: 409,
  /** 409: the key was used for another request. */
  key_conflict: 409,
  /** 400: a treat for a creature not in the team, or twice. */
  invalid_treat: 400,
  /** 409: not enough Bait for the treats. */
  insufficient_funds: 409,
  /** 409: a run is already open today (finish it first). */
  run_active: 409,
  /** 409: the run moved on since the client last looked (another tab, a retry): reload today. */
  stale_step: 409,
  /** 400: the act is not allowed now (a room not reachable, nothing pending, a bad swap...). */
  invalid_act: 400,
  /** 410: `POST /api/dungeon/run` is gone: the Activity is out of date and needs a reload. */
  gone: 410,
} as const;
export type DungeonErrorCode = keyof typeof DUNGEON_ERRORS;
