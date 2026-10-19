/**
 * The shapes the expedition routes answer with (trips, results, profile, destinations) and the send
 * request as the code reads it. Types only; `expeditions.ts` re-exports them. The client mirrors them by
 * hand in `apps/activity/src/expedition-types.ts`, and `test/expeditions-fixtures.test.ts` checks the
 * captured fixtures.
 */
import type {
  AccountStat,
  ClosedReason,
  ExpeditionLength,
  PartsBundle,
  SuppliesId,
  XpBoost,
} from '@creatures/game';
import type { PushOnOutcome } from './analytics';
import type { ChoiceResult } from './catch-choices';
import type { ExperienceView } from './creature-exp';
import type { GrantView } from './gear-grants';
import type { TalentView } from './talent-view';

export interface CatchView {
  species: string;
  shiny: boolean;
  /**
   * `new`: a species the player lacked, now a creature. `duplicate`: it waits as a pending card (see
   * `pendingId`) for Teach, Fuse, Release or Keep. `fused` and `converted` only appear in results stored
   * before the duplicate choice (a duplicate then fused by itself, or turned into Bait).
   */
  outcome: 'new' | 'duplicate' | 'fused' | 'converted';
  /** The talent the catch rolled (absent in results stored before talents). */
  talent?: TalentView;
  /** Only for outcome 'duplicate': the id of the pending card. */
  pendingId?: string;
  /** Only for the old outcome 'fused': the creature's fusion count after this catch. */
  fusionCount?: number;
  /** Only for the old outcome 'converted': the Bait granted. */
  bait?: number;
  firstOnServer: boolean;
  /** The catch came from the destination's deeper area (absent when it did not). */
  deep?: true;
  /** The explorer's Second look rolled this duplicate's talent twice and kept the better (absent when it did not). */
  secondLook?: true;
}

export interface PushOnResultView {
  goalId: string;
  risk: 'safe' | 'risky';
  /** The exact chance (basis points) the player was shown. */
  oddsBp: number;
  outcome: PushOnOutcome;
}

export interface JournalFindView {
  entryId: string;
  /** The set the page belongs to, if any, and whether this page completed it. */
  set: string | null;
  setComplete: boolean;
}

export interface ExpeditionResult {
  /** True if the player recalled before the expedition ended. */
  recalled: boolean;
  catches: CatchView[];
  /**
   * Parts, supplies, gear and maybe a blueprint the trip brought back (a recall brings back the share
   * of the scrap that was caught). Absent in results stored before gear existed, and when the trip failed.
   */
  loot?: GrantView;
  /** Catch rolls that brought no creature this time (each brought a small find of scrap instead). */
  noCatch?: number;
  /** Pending duplicates the server settled with Recommended because the queue was full (oldest first). */
  autoSettled?: ChoiceResult[];
  /** True when a risky push-on goal failed: the whole trip brought nothing back. */
  failed?: boolean;
  /** What became of the push-on choice, if the trip had one. */
  pushOn?: PushOnResultView;
  /** Explorer XP gained, and the explorer's totals and rank after the trip. */
  xp?: {
    gained: number;
    total: number;
    rank: number;
    rankBefore: number;
    /** What added to it (milestones, the week's twist, a push-on goal, Trail XP) and the total; absent when nothing did. */
    boost?: XpBoost;
  };
  /**
   * Creature experience the trip paid its explorer (doubled by a treat), and what it did to the level.
   * Absent for a recall, a failed trip and results stored before training by activity.
   */
  experience?: ExperienceView;
  /** The explorer's stars at the destination after the trip. */
  familiarity?: { stars: number; starsBefore: number; trips: number };
  /** Journal pages found (usually none or one). */
  journal?: JournalFindView[];
  /** Set when the trip unlocked another expedition slot. */
  slotUnlocked?: { total: number };
  /** The one-time gifts of the ranks this trip reached (lowest first); absent when the rank did not rise. */
  rankGifts?: RankGiftView[];
}

export interface RankGiftView {
  rank: number;
  bait: number;
  /** Scrap and glimmer. */
  parts: PartsBundle;
  /** Supplies, one content id each. */
  supplies: string[];
}

export interface OfferGoalView {
  id: string;
  risk: 'safe' | 'risky';
  extraHours: number;
  /** The exact chance (basis points) that it works out after this trip. */
  oddsBp: number;
}

export interface ExpeditionView {
  id: string;
  creatureId: string;
  /** The trip length: `short` (2 h), `medium` (6 h), `long` (12 h) or `day` (24 h). */
  duration: ExpeditionLength;
  /** The best tier of the supplies carried (`basic` when none): kept for the first client. See `kit`. */
  supplies: SuppliesId;
  /** The supplies carried (content ids). */
  kit: string[];
  /** The destination (content id). A trip from before expeditions v2 counts as `old-crossroads`. */
  destination: string;
  /** The weekly twist that applied, if the trip went to the special destination that week. */
  twist: string | null;
  rolls: number;
  /** Bait paid for supplies (always 0 now: supplies cannot be bought). */
  cost: number;
  /** True when a treat was packed for this trip: it doubles the explorer's creature experience. */
  treat: boolean;
  startedAt: number;
  endsAt: number;
  /** When the trip can be claimed in full: the end of the push-on once one is chosen, else `endsAt`. */
  readyAt: number;
  status: 'active' | 'claimed';
  claimedAt: number | null;
  result: ExpeditionResult | null;
  /** The goals on offer (a finished trip that was offered a choice and has not chosen), else null. */
  offer: { goals: OfferGoalView[] } | null;
  /** The chosen push-on goal, while it runs. */
  pushOn: { goalId: string; startedAt: number; endsAt: number; oddsBp: number } | null;
}

export interface CancelledView {
  id: string;
  creatureId: string;
  destination: string;
  duration: ExpeditionLength;
  startedAt: number;
  /** Why it was cancelled: `slot_wipe` when expeditions v2 started everybody over with one slot. */
  reason: string;
}

export interface ExplorerView {
  rank: number;
  xp: number;
  /** Total XP of the next rank, or null at the top. */
  nextRankXp: number | null;
  trips: number;
}

export interface SlotsView {
  total: number;
  used: number;
  /** The sum of the ranks above 1 of all the player's creatures. */
  rankSum: number;
  /** Trips the player has finished (the second slot opens after 3). */
  tripsFinished: number;
  /**
   * What opens the next slot: `trips` (finish this many trips) or `rank_sum` (reach this rank sum), or
   * null when every slot is open.
   */
  next: { kind: 'trips' | 'rank_sum'; at: number } | null;
}

export interface TripsState {
  expeditions: ExpeditionView[];
  cancelled: CancelledView[];
  slots: SlotsView;
  /** Supplies in stock: supply id to amount. */
  supplies: Record<string, number>;
}

export interface SendInput {
  creatureId: string;
  destination: string;
  duration: ExpeditionLength;
  /**
   * The supplies to carry, all from stock (`owned`). `buy` is still a valid shape on the wire so an old
   * client gets a clear refusal (`supplies_not_for_sale`) instead of a schema error.
   */
  supplies: readonly { id: string; source: 'buy' | 'owned' }[];
  /** Pack a treat for the explorer: Bait, paid when the trip starts. Absent: no treat. */
  treat?: boolean;
  idempotencyKey: string;
}

export interface ProfileView {
  stats: Record<AccountStat, number>;
  milestones: {
    id: string;
    stat: AccountStat;
    at: number;
    value: number;
    reached: boolean;
    bonus: { kind: string; bp: number };
  }[];
  /** The permanent bonuses the reached milestones give, in basis points. */
  bonuses: { rarityBp: number; partsBp: number; offerBp: number; xpBp: number };
  journal: {
    found: { entryId: string; foundAt: number }[];
    total: number;
    sets: { id: string; found: number; total: number }[];
  };
  explorers: ({ creatureId: string } & ExplorerView)[];
  slots: SlotsView;
}

export interface DestinationsView {
  serverNow: number;
  special: { destination: string; twist: string; description: string; festival: boolean };
  /** True in a Festival raid week: the Festival Grounds are open. */
  festivalWeek: boolean;
  /** True at night by the guild's local time: night-only places are open. */
  night: boolean;
  destinations: {
    id: string;
    minRank: number;
    nightOnly: boolean;
    festivalOnly: boolean;
    /** Why it is closed to everybody right now (`night`, `festival`); rank is per creature. */
    closed: ClosedReason[];
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
