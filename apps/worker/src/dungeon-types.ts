/**
 * The shapes of the map runs of the daily dungeon (docs/design/dungeon-paths.md, "Shapes"): what the
 * server sends for a run that is played step by step. The client mirrors them by hand in
 * `apps/activity/src/dungeon-types.ts`, and `test/dungeon-fixtures.test.ts` checks that the server
 * still sends what the captured fixtures have. Types only. No seed is ever part of any of them.
 */
import type { DungeonMapView, Element, GearRarity, PartsBundle, Role } from '@creatures/game';

export type { DungeonMapView };

export type DungeonOutcome = 'cleared' | 'home' | 'defeat';

/** Loot carried in the pack: kept whole when the run goes home or clears, half (rounded up) on a defeat. */
export interface DungeonPack {
  bait: number;
  essence: number;
  scrap: number;
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
}

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
