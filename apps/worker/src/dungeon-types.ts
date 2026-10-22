/**
 * The shapes of the map runs of the daily dungeon (docs/design/dungeon-paths.md, "Shapes"): what the
 * server sends for a run that is played step by step. The client mirrors them by hand in
 * `apps/activity/src/dungeon-types.ts`, and `test/dungeon-fixtures.test.ts` checks that the server
 * still sends what the captured fixtures have. Types only. No seed is ever part of any of them.
 */
import type {
  DungeonMapView,
  Element,
  GearRarity,
  GearSlot,
  PartsBundle,
  Role,
} from '@creatures/game';
import type { EventNames, FightEvent } from '@creatures/engine';
import type { ExperienceView } from './creature-exp';
import type { GearItemView } from './gear-types';

export type { DungeonMapView };

export type DungeonOutcome = 'cleared' | 'home' | 'defeat';

/** Loot carried in the pack: kept whole when the run goes home or clears, half (rounded up) on a defeat. */
export interface DungeonPack {
  bait: number;
  essence: number;
  scrap: number;
  /** Shards the rooms dropped, by part kind (`ember-shard`); absent when none. */
  shards?: Partial<Record<`${Element}-shard`, number>>;
}

/** A creature in the row of a run that is open. */
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
  /**
   * What it wears in this run, frozen when it joined (the run's own copy: a later change on the Creatures tab
   * never reaches it), each item with the text of its lines. Empty for a run stored before seats.
   */
  gear: DungeonRunGear[];
}

/** One item a creature of a run wears: what the gear list draws. */
export interface DungeonRunGear {
  baseId: string;
  slot: GearSlot;
  rarity: GearRarity;
  itemLevel: number;
  lines: string[];
}

export interface DungeonKeepsakeView {
  id: string;
  name: string;
  description: string;
}

/**
 * A rare room's treasure as the player sees it, before the choice and again on the end screen. A gear piece
 * is the actual rolled item (its base, rarity and level); a blueprint is a base the player does not know.
 */
export type DungeonTreasureView =
  | {
      kind: 'gear';
      baseId: string;
      rarity: GearRarity;
      itemLevel: number;
      /** The full card of the piece (its real stats and lines: the item the run grants), only while the room waits for the choice. */
      card?: GearItemView;
    }
  | { kind: 'blueprint'; baseId: string }
  | { kind: 'supplies'; supplyId: string; count: number }
  | { kind: 'shards'; parts: PartsBundle };

/** A mystery room's scene, once the run is in it. Exactly two options; `description` is the exact outcome. */
export interface DungeonEventView {
  id: string;
  name: string;
  text: string;
  /** `blocked` is why the option cannot be picked right now (absent when it can). */
  options: { label: string; description: string; blocked?: string }[];
  /** The prize of a rare room, rolled when it opened. Absent in a room with none. */
  treasure?: DungeonTreasureView;
}

/** What the boss chest already gave (the Undercroft's descent card shows it): gear and supplies are in the player's stock, shards and glimmer in their parts. */
export interface DungeonBankedView {
  gear: { baseId: string; rarity: GearRarity; itemLevel?: number }[];
  supplies: string[];
  parts: PartsBundle;
}

export type DungeonPendingView =
  | null
  | { kind: 'event'; event: DungeonEventView }
  | { kind: 'camp'; offers: DungeonKeepsakeView[]; restBp: number }
  | {
      /**
       * The floor boss (or an Undercroft keeper with a cracked floor) is down: head home with the pack, or
       * descend. What is known of the level below: its number, its floors (the keeper's included), that
       * its foes are fiercer (`depthBonus` more depth per level), the breath the team catches on the way
       * (`catchBreathBp` of max HP, and `reviveBp` for a fallen one that gets back up) and what the chest banked. The pack stays at risk all the way down.
       */
      kind: 'descend';
      level: number;
      floors: number;
      depthBonus: number;
      catchBreathBp: number;
      /** The share of max HP a fallen creature gets back up with. */
      reviveBp: number;
      /** The depth the player is at now (locked in when the main boss fell). */
      newDepth: number;
      banked: DungeonBankedView;
    };

/**
 * What a room on the path gave or took, one entry per visited room, in order (no fight events: the
 * replay holds those). `loot` is what went into the pack there (zeros when nothing). A mystery room or the
 * camp is `pending` while its choice waits, and the entry is replaced when it is answered. Free text in it
 * (`detail` names a creature, which is player text) is plain text to render as text.
 */
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
      /** A curse the option put on the run (a name and its plain effect line). */
      curse?: DungeonKeepsakeView;
      /** The name of the creature the option sent home (plain text). */
      sentHome?: string;
      /** The treasure the option took (paid at the run's end unless the run ended in a defeat). */
      treasure?: DungeonTreasureView;
      /** The option was a fall: the whole team fell and the run ended. */
      fell?: true;
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
  | { node: string; kind: 'camp'; result: 'pending' }
  | { node: string; kind: 'mystery'; result: 'pending'; event: string }
  | {
      /**
       * A carved door was walked through. `added`: it added a room to the Undercroft (false when the run
       * already had `maxMarks`). Which room is NOT said: the player finds out when the Undercroft is drawn.
       */
      node: string;
      kind: 'door';
      result: 'door';
      added: boolean;
    }
  | {
      /** A boss chest opened: the main boss's (level 0) or an Undercroft keeper's. Gear and supply are banked at once. */
      node: string;
      kind: 'boss';
      result: 'chest';
      level: number;
      /** What the chest itself added to the pack (the main chest: the full clear's and a landmark's extras; a keeper's chest: nothing, its Essence and scrap are on its fight entry). The boss's own loot is always on its fight entry. */
      loot: DungeonPack;
      gear: { baseId: string; rarity: GearRarity; itemLevel?: number }[];
    }
  | { node: string; kind: 'descend'; result: 'pending'; level: number }
  | {
      node: string;
      kind: 'descend';
      result: 'descend';
      level: number;
      /** HP the row recovered on the way down, all creatures together. */
      healed: number;
      /** How many fallen creatures got back up on the way down (absent on a run stored before they could). */
      revived?: number;
    }
  | { node: string; kind: 'descend'; result: 'home'; level: number };

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
  map: DungeonMapView;
  /** The level the run stands in: 0 is the main map, 1 and up are the Undercroft's levels (the last of `undercroft.maps`). */
  level: number;
  /**
   * The Undercroft levels drawn so far, in order, each labelled (`label`, and `crack` on a keeper's cracked
   * floor). Null until the run has a carved door's room or a level. `marks` is how many rooms the carved
   * door added (not which: that shows when the level is drawn).
   */
  undercroft: { maps: DungeonMapView[]; marks: number } | null;
  /** The room the run stands in, or null before the entrance (of the main map or of the level the run just went down into). */
  at: string | null;
  /** The rooms visited, in order. */
  path: string[];
  /** The rooms a move may go to now (empty while something is pending or the run is done). */
  reachable: string[];
  pending: DungeonPendingView;
  /** The row now, left to right. */
  team: DungeonRunCreature[];
  keepsakes: DungeonKeepsakeView[];
  /** The curses the run carries (shown beside the keepsakes as "Curse"). */
  curses: DungeonKeepsakeView[];
  /** At risk until the run goes home or clears. */
  pack: DungeonPack;
  roomsCleared: number;
  /** The run's supply is earned (it is safe: never in the pack). */
  supply: boolean;
  /** What the last mystery room did, in plain words, or null. */
  lastEvent: { name: string; option: string; outcome: string } | null;
  /** What happened in each room the run has been through, in order. Empty for a run stored before the log. */
  history: DungeonStepLog[];
}

/**
 * What a run paid one creature in experience, with what changed the plain amount. `boost` (on the
 * `ExperienceView`, since 2026-10-19) says it all for the multiplier chip; `treatTimes` and `dayEffects` are
 * the older form, kept for one release for clients that still read them, and the only form in runs stored
 * between their start and 2026-10-19. Both are absent in runs stored before they were added.
 */
export interface DungeonExperienceView extends ExperienceView {
  /** What the treat multiplied the experience by (2, or 3 on a day that changes it), or null when no treat was packed for this creature. */
  treatTimes: number | null;
  /** The day's Boons and Omens that changed creature experience: their names and the change in basis points (negative: less). */
  dayEffects: { name: string; bp: number }[];
}

/**
 * A creature that earned experience in a run, for the end screen's recap (what it was paid is in its
 * `DungeonExperienceView`). It names the creature, so a creature sent home at a camp can be listed.
 */
export interface DungeonExperienceRecap {
  creatureId: string;
  name: string;
  speciesId: string;
}

/** What a run paid. The streak bonus is listed apart from what the rooms paid. */
export interface DungeonRewards {
  bait: number;
  essence: number;
  /** All the parts the run's grant paid, including those of items that did not fit the bag. */
  parts: PartsBundle;
  gear: { id: string; baseId: string; rarity: GearRarity }[];
  /** Items that did not fit the bag and became parts (already counted in `parts`). */
  converted: { baseId: string; rarity: GearRarity }[];
  /** The supplies the run dropped, one content id each (absent in runs stored before supplies dropped here). */
  supplies?: string[];
  /** Blueprints the run's grant taught (a rare room's treasure), as the grant gave them. Absent when none. */
  blueprints?: { baseId: string; duplicate: boolean; marks?: number }[];
  /** A rare room's treasure that was taken but lost because the run ended in a defeat. Absent otherwise. */
  treasureLost?: DungeonTreasureView;
  /**
   * The creature experience the run paid each creature that stood in the row (a treat doubles it) and
   * what it did to their levels. Absent in runs stored before training by activity.
   */
  experience?: DungeonExperienceView[];
  /**
   * The recap behind `experience`: for each creature that earned any, what paid it (absent in runs
   * stored before experience was paid per room).
   */
  recap?: DungeonExperienceRecap[];
  /** A fully cleared landmark depth: its gear drop was certain. */
  landmark: boolean;
  streak: { day: number; bait: number; essence: number; parts: PartsBundle } | null;
}

export interface DungeonRoomSummary {
  index: number;
  kind: 'foe' | 'boss';
  /** A fiercer foe (map runs only; absent otherwise). An epic fight is one too. */
  elite?: boolean;
  /** An Undercroft epic fight (also `elite`, so it shows as "Fierce"). */
  epic?: boolean;
  foe: { id: string; name: string; element: Element; hpMax: number };
  modifier: { id: string; name: string; description: string };
  /** False for the rooms after the one that was lost (three-room runs only: a map run lists the fights it played). */
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
  hpMax: number;
  /** HP when the run ended; 0 for a creature that was knocked out. */
  hpEnd: number;
}

export interface DungeonRunSummary {
  id: string;
  day: string;
  attempt: number;
  depth: number;
  /** The depth the player is at after this run (one deeper after a clear). */
  newDepth: number;
  /** The floor boss was beaten. */
  cleared: boolean;
  /** Fights cleared. */
  roomsCleared: number;
  landmark: boolean;
  /** Days in a row after this run. */
  streak: number;
  createdAt: number;
  /** The row at the end, left to right. */
  team: DungeonTeamMember[];
  /** The fights played (a three-room run: all three rooms, played or not). */
  rooms: DungeonRoomSummary[];
  rewards: DungeonRewards;
  /** The Boon and Omen the run was fought under (absent: none, and in runs stored before the weather). */
  weather?: { boon: string; omen: string | null };
  /**
   * Undercroft levels the run cleared (keepers beaten): 0 for a run that never went down. Absent in
   * summaries stored before the Undercroft.
   */
  deepest?: number;
  /** Map runs only: how it ended (absent while it is open), the node kinds of the path, the pack and the keepsakes. */
  outcome?: DungeonOutcome;
  path?: string[];
  pack?: { found: DungeonPack; kept: DungeonPack };
  keepsakes?: DungeonKeepsakeView[];
  /** The curses the run carried at its end (absent: none). */
  curses?: DungeonKeepsakeView[];
  /** Map runs that ended: the run's map at its depth, the rooms visited in order and what each did. Absent in older summaries. */
  route?: {
    map: DungeonMapView;
    path: string[];
    history: DungeonStepLog[];
    /** The Undercroft levels the run went down into, in order (absent when it never did). */
    undercroft?: DungeonMapView[];
  };
}

export interface DungeonToday {
  serverNow: number;
  /** The guild-local calendar day ('YYYY-MM-DD'). */
  day: string;
  timezone: string;
  /** When the game day ends (the next 13:37 local reset), in epoch ms. */
  resetsAt: number;
  /** The depth the next run fights at. */
  depth: number;
  landmark: boolean;
  /**
   * Set when the next run is a landmark (`landmark` is true): the depth and the content id of the
   * floor boss it will fight, which is fixed at landmark depths. Null on any other depth.
   */
  landmarkBoss: { depth: number; foeId: string } | null;
  /** Days in a row, as of now: 0 when yesterday was missed and nothing has run today. */
  streak: number;
  attemptsToday: number;
  attemptsAllowed: number;
  /** False while a run is open (`active`). */
  canRun: boolean;
  /** Why a run is not possible now, or null. */
  blocked: 'already_run' | 'need_creatures' | null;
  /** The newest finished run of today, or null. */
  last: DungeonRunSummary | null;
  /**
   * The creature ids of the player's most recent run on any day, in the order they stood in the
   * row (left to right), or null before their first run. Only the caller's own run is ever read.
   */
  lastTeam: string[] | null;
  /**
   * The row the player saved while setting up (`PUT /api/dungeon/team`), left to right, `teamSize`
   * entries: each a creature id, or null for an empty slot (and for a creature the player no longer
   * owns). Null when there is no draft; an explicitly empty draft is all nulls, not null. A run
   * clears it. Only the caller's own draft is ever read.
   */
  draftTeam: (string | null)[] | null;
  /** Today's map, the same for everyone on the server, with foe HP at this player's depth. */
  map: DungeonMapView;
  /** The player's run that is still open today, or null. */
  active: DungeonRunState | null;
}

/** The light read behind the Activity's notification pip (`Dungeon.attention`). */
export interface DungeonAttention {
  /** Exactly `DungeonToday.canRun`. */
  canRun: boolean;
  /** A run is open today: an open run is a reason to come back, so the pip stays on for it. */
  active: boolean;
  /** When the game day ends: the answer can change then on its own. */
  resetsAt: number;
}

export interface DungeonStartResponse {
  state: DungeonRunState;
  today: DungeonToday;
}

export interface DungeonActResponse {
  state: DungeonRunState;
  /** The fight the move just played: the client plays it at once. */
  room?: DungeonReplayRoom;
  /** Only when the run ended: the summary (with rewards) and the fresh day. */
  summary?: DungeonRunSummary;
  today?: DungeonToday;
}

export interface DungeonReplayRoom {
  index: number;
  kind: 'foe' | 'boss';
  /** A fiercer foe (map runs only; absent otherwise). An epic fight is one too. */
  elite?: boolean;
  /** An Undercroft epic fight (also `elite`, so it shows as "Fierce"). */
  epic?: boolean;
  /** The map node of the fight (map runs only). */
  node?: string;
  /** The run's keepsakes in that fight (map runs only; absent when it held none). */
  keepsakes?: DungeonKeepsakeView[];
  /** The row that fought this room (map runs only: a camp swap or reorder changes it; absent: `DungeonReplayView.row`). */
  row?: ReplayRowEntry[];
  foe: { id: string; name: string; element: Element; hpMax: number };
  modifier: { id: string; name: string; description: string };
  cleared: boolean;
  rounds: number;
  /** Every creature's HP when the room started, and at most, by creature id. */
  hpStart: Record<string, number>;
  hpMax: Record<string, number>;
  events: FightEvent[];
  /** For `describeEvent`. */
  names: EventNames;
}

export interface ReplayRowEntry {
  position: number;
  id: string;
  name: string;
  species: string;
  element: Element;
  role: Role;
  level: number;
}

export interface DungeonReplayView {
  summary: DungeonRunSummary;
  /** The fighting row, left to right (`position` 0 is the left creature). A map run: the starting row (see `DungeonReplayRoom.row`). */
  row: ReplayRowEntry[];
  rooms: DungeonReplayRoom[];
}
