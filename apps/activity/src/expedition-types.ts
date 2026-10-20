/**
 * The shapes the server sends for expeditions v2 (`apps/worker/src/expeditions.ts`, `expedition-routes.ts`
 * and the Workshop's supply jobs). Types only, with no parsing: the fixtures `expedition-*.json` and
 * `workshop-*-supply.json` in `fixtures/` are real server output and the Worker's
 * `expeditions-fixtures.test.ts` fails when the server stops sending these shapes.
 *
 * Times are UTC epoch milliseconds. Odds and bonuses are basis points (10000 is 100%). Names, texts and
 * art for places, supplies, goals and journal pages are content (`@creatures/game`: `expeditionContent`),
 * looked up by id; the server sends ids and numbers only.
 */

import type { ExperienceView, XpBoost } from './experience';
import type { GrantLoot, PartKind } from './gear-types';
import type { ChoiceResult, TalentView } from './talent-types';

export type ExpeditionLength = 'short' | 'medium' | 'long' | 'day';
export type SupplyTier = 'basic' | 'good' | 'great';
export type GoalRisk = 'safe' | 'risky';

/**
 * One supply chosen for a trip, taken from the player's stock. Supplies cannot be bought any more
 * (2026-10-16); the server still parses the old `buy` shape only to refuse it with a clear error.
 */
export interface SupplyPick {
  id: string;
  source: 'owned';
}

/** The body of POST /api/expeditions. Supplies are optional: a trip is always free. */
export interface SendBody {
  creatureId: string;
  destination: string;
  duration: ExpeditionLength;
  supplies: SupplyPick[];
  /** Pack a treat for the explorer (Bait, paid when the trip starts): double experience for the trip. */
  treat?: boolean;
  idempotencyKey: string;
}

/** A goal offered when a trip ends, with its exact odds (10000 for a safe goal). */
export interface OfferedGoal {
  id: string;
  risk: GoalRisk;
  extraHours: number;
  oddsBp: number;
}

export interface Trip {
  id: string;
  creatureId: string;
  duration: ExpeditionLength;
  /** The best tier of the supplies carried (the old v1 field, kept for older clients). */
  supplies: SupplyTier;
  /** Supply ids carried. */
  kit: string[];
  /** Destination id. */
  destination: string;
  /** The weekly twist that applies to this trip, or null. */
  twist: string | null;
  rolls: number;
  /** Bait paid for supplies: 0 for every trip sent since supplies stopped being sold (older trips may have paid). */
  cost: number;
  /** A treat was packed for the explorer: the trip pays double creature experience. */
  treat: boolean;
  startedAt: number;
  /** When the trip itself ends. */
  endsAt: number;
  /** When it can be claimed in full: the end of the chosen goal, else `endsAt`. */
  readyAt: number;
  status: 'active' | 'claimed';
  claimedAt: number | null;
  result: TripResult | null;
  /** The choice rolled when the trip ended (null: none came up, or the trip has not ended). */
  offer: { goals: OfferedGoal[] } | null;
  /** The chosen goal; its time counts from the choice. */
  pushOn: { goalId: string; startedAt: number; endsAt: number; oddsBp: number } | null;
}

/** A trip cancelled when the slots were reset (no reward; the Bait it cost was given back). */
export interface CancelledTrip {
  id: string;
  creatureId: string;
  destination: string;
  duration: ExpeditionLength;
  startedAt: number;
  reason: string;
}

export interface Slots {
  total: number;
  used: number;
  /** The sum of the explorer ranks above 1 of all the player's creatures. */
  rankSum: number;
  tripsFinished: number;
  /** What opens the next slot (finish this many trips, or reach this rank sum); null when all are open. */
  next: { kind: 'trips' | 'rank_sum'; at: number } | null;
}

/** What a creature has earned as an explorer. */
export interface ExplorerView {
  rank: number;
  xp: number;
  /** The XP of the next rank; null at the top rank. */
  nextRankXp: number | null;
  trips: number;
}

/**
 * `new`: a species the player lacked, now a creature. `duplicate`: a waiting card (see `pendingId`) to
 * answer with Teach, Fuse, Release or Keep. `fused` and `converted` only appear in trips claimed before
 * the duplicate choice existed (a duplicate then fused by itself, or turned into Bait).
 */
type CatchOutcome = 'new' | 'duplicate' | 'fused' | 'converted';

export interface TripCatch {
  species: string;
  shiny: boolean;
  outcome: CatchOutcome;
  firstOnServer: boolean;
  /** The talent it rolled (absent in trips claimed before talents). */
  talent?: TalentView;
  /** For `duplicate`: the id of its waiting card. */
  pendingId?: string;
  /** The catch came from the destination's deeper area. */
  deep?: true;
  /** The explorer's Second look rolled this duplicate's talent twice and kept the better one. */
  secondLook?: true;
  /** For the old `fused`: the creature's fusions after. */
  fusionCount?: number;
  /** For the old `converted`: the Bait it became. */
  bait?: number;
}

/** What a claimed trip brought home: the usual grant, and the supplies it found (ids). */
export type TripLoot = GrantLoot;

export interface JournalFind {
  entryId: string;
  /** The set it belongs to, or null. */
  set: string | null;
  setComplete: boolean;
}

/** The result of claiming a trip. `failed` is set when a risky goal failed: nothing came home. */
export interface TripResult {
  recalled: boolean;
  catches: TripCatch[];
  /** Catch rolls that brought no creature this time (each brought a small find of scrap instead). */
  noCatch?: number;
  /** Waiting duplicates the server settled with Recommended because ten were already waiting. */
  autoSettled?: ChoiceResult[];
  loot?: TripLoot;
  failed?: true;
  pushOn?: {
    goalId: string;
    risk: GoalRisk;
    oddsBp: number;
    outcome: 'worked' | 'failed' | 'declined';
  };
  /** For a finished trip and for a recall (its ticks pay XP), not for a failure. */
  xp?: {
    gained: number;
    total: number;
    rank: number;
    rankBefore: number;
    /** What added to it (milestones, the week's twist, a push-on goal, Trail XP); absent when nothing did. */
    boost?: XpBoost;
  };
  /** The creature experience the trip paid its explorer (a finished trip only; absent in older results). */
  experience?: ExperienceView;
  familiarity?: { stars: number; starsBefore: number; trips: number };
  journal?: JournalFind[];
  /** Set when this trip opened another slot. */
  slotUnlocked?: { total: number };
  /** The one-time gifts of the ranks this trip reached, lowest first. */
  rankGifts?: RankGift[];
}

/** The gift of reaching an explorer rank: Bait, parts (scrap, glimmer) and supplies (content ids). */
export interface RankGift {
  rank: number;
  bait: number;
  parts: Partial<Record<PartKind, number>>;
  supplies: string[];
}

export interface Milestone {
  id: string;
  stat: string;
  at: number;
  value: number;
  reached: boolean;
  bonus: { kind: string; bp: number };
}

/** GET /api/profile. */
export interface Profile {
  /** Account stats by name (all present, 0 when nothing happened yet). */
  stats: Record<string, number>;
  milestones: Milestone[];
  /** The permanent bonuses the reached milestones give. */
  bonuses: { rarityBp: number; partsBp: number; offerBp: number; xpBp: number };
  journal: {
    found: { entryId: string; foundAt: number }[];
    total: number;
    sets: { id: string; found: number; total: number }[];
  };
  explorers: ({ creatureId: string } & ExplorerView)[];
  slots: Slots;
}

/** GET /api/destinations. */
export interface DestinationsView {
  serverNow: number;
  /** The weekly special: the place and its twist (a content id and a ready sentence). */
  special: { destination: string; twist: string; description: string; festival: boolean };
  /** A Festival raid week: the Festival Grounds are open. */
  festivalWeek: boolean;
  /** It is night by the guild's clock: night-only places are open. */
  night: boolean;
  destinations: {
    id: string;
    minRank: number;
    nightOnly: boolean;
    festivalOnly: boolean;
    /** Why it is closed to everybody now (`night`, `festival`); the rank gate is per creature. */
    closed: ('night' | 'festival' | 'rank')[];
  }[];
  familiarity: {
    creatureId: string;
    destination: string;
    trips: number;
    found: string[];
    shiny: boolean;
    stars: number;
    deepChanceBp: number;
  }[];
}
