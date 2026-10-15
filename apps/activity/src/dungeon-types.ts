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
import type { GearRarity, PartsBundle } from './gear-types';

export type Element = 'tide' | 'ember' | 'grove' | 'spark';
export type Role = 'setter' | 'payoff' | 'support' | 'guard';
/** A room modifier of the day. Shown before the run: the same for everyone on the server. */
export interface DungeonModifier {
  /** The room (0-based) it applies to; the last room is the room boss. */
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
  /**
   * Set when the next run is a landmark: its depth and the content id of the fixed room boss it
   * fights. Null on any other depth. (Type only for now: the setup card renders it.)
   */
  landmarkBoss: { depth: number; foeId: string } | null;
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
   * Set when the next run is a landmark: the depth and the room boss's content id, announced before
   * the run. Null otherwise; an older server leaves it out (read as null).
   */
  landmarkBoss: { depth: number; foeId: string } | null;
}

export interface DungeonRewards {
  /** Paid by the rooms and the full clear. */
  bait: number;
  essence: number;
  /** All the parts the run's grant paid, including those of items that did not fit the bag. */
  parts: PartsBundle;
  /** Gear items now in the inventory. */
  gear: { id: string; baseId: string; rarity: GearRarity }[];
  /** Items that did not fit the bag and became parts (already counted in `parts`). */
  converted: { baseId: string; rarity: GearRarity }[];
  /** A fully cleared landmark depth. */
  landmark: boolean;
  /** The streak bonus of the day (the 3rd and 7th day of a 7 day cycle), or null. Not in the amounts above. */
  streak: { day: number; bait: number; essence: number; parts: PartsBundle } | null;
}

export interface DungeonRoomSummary {
  index: number;
  kind: 'foe' | 'boss';
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
  /** The depth after this run: one deeper after a full clear, otherwise the same. */
  newDepth: number;
  /** All rooms were cleared. */
  cleared: boolean;
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
}

/** `POST /api/dungeon/run` answers with this. Refresh the collection and gear views afterwards: balances and parts changed. */
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

export interface DungeonReplayRoom {
  index: number;
  kind: 'foe' | 'boss';
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
  row: {
    position: number;
    id: string;
    name: string;
    species: string;
    element: Element;
    role: Role;
    level: number;
  }[];
  rooms: DungeonReplayRoom[];
}

/**
 * The body of `POST /api/dungeon/run`. Strict: any other key is `invalid_body`. The user comes from
 * the session; the seed, the stats and the rooms are the server's.
 */
export interface DungeonRunRequest {
  /**
   * The three creatures (ids of the player's own, all different), in the order they stand in the
   * one row, left to right: `team[i]` is position i. There is no formation: the order is it.
   * There is no ability choice either (an old body with `abilities` is `invalid_body`): unlocked
   * creature abilities fire at their default round.
   */
  team: [string, string, string];
  /** A fresh key for every new run (8 to 64 characters of A-Z a-z 0-9 _ -); a retry reuses it. */
  idempotencyKey: string;
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
} as const;
export type DungeonErrorCode = keyof typeof DUNGEON_ERRORS;
