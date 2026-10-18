/**
 * The shapes of the map runs of the daily dungeon (docs/design/dungeon-paths.md, "Shapes"): what the
 * server sends for a run that is played step by step. The client mirrors them by hand in
 * `apps/activity/src/dungeon-types.ts`, and `test/dungeon-fixtures.test.ts` checks that the server
 * still sends what the captured fixtures have. Types only. No seed is ever part of any of them.
 */
import type { DungeonMapView, Element, Role } from '@creatures/game';

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

export type DungeonPendingView =
  | null
  | { kind: 'event'; event: DungeonEventView }
  | { kind: 'camp'; offers: DungeonKeepsakeView[]; restBp: number };

/**
 * What a room on the path gave or took, one entry per visited room, in order (no fight events: the
 * replay holds those). `loot` is what went into the pack there (zeros when nothing). A mystery room or the
 * camp is `pending` while its choice waits, and the entry is replaced when it is answered. Free text in it
 * (`detail` names a creature, which is player text) is plain text to render as text.
 */
export type DungeonStepLog =
  | {
      node: string;
      kind: 'fight' | 'elite' | 'boss';
      result: 'fight';
      cleared: boolean;
      rounds: number;
      /** The foe's HP when the fight ended (0 when cleared) and at most. */
      foeHpEnd: number;
      foeHpMax: number;
      loot: DungeonPack;
      /** An elite's keepsake. */
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
  | { node: string; kind: 'mystery'; result: 'pending'; event: string };

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
  /** The room the run stands in, or null before the entrance. */
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
