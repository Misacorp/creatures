/**
 * Expeditions v2 of a guild (docs/design/expeditions-v2.md): sending a creature to a destination with
 * optional supplies, the end-of-trip push-on choice, claiming (catches, loot, explorer XP, familiarity,
 * the journal, account stats) and the views of all of it. Everything is synchronous and runs inside
 * `transactionSync`, so a check and the writes that depend on it can never be interleaved with another
 * request. The user is always an argument from the verified session, never from a request body.
 *
 * Idempotency and races:
 * - A send carries the client's key. `gear_actions` stores the result under (player, key) with a
 *   fingerprint of what was asked, so a retry returns the stored trip, and the same key on a different
 *   send is a `key_conflict`. Supplies cannot be bought (they come from stock): the supplies taken
 *   from stock and the new trip are one transaction, so a failed send takes nothing.
 * - A claim stores its result and never rolls again; claiming a claimed trip returns it.
 * - The end-of-trip offer is rolled once per trip (`expedition_offers`), so reloading cannot re-roll it.
 *
 * Randomness: all live. Catches use `rng`, parts and gear `gearRng` (through the grant), the offer, the
 * push-on result and the journal `tripRng`; each is drawn at the moment it is needed, never earlier.
 */
import {
  RULES,
  applyCatchToCollection,
  content,
  destinationDef,
  expeditionContent,
  explorerRank,
  familiarityBonus,
  isNightHour,
  ACCOUNT_STATS,
  familiarityStars,
  foundSupplyId,
  goalDef,
  goalOddsBp,
  journalEntry,
  journalChanceBp,
  kitOf,
  kitProblem,
  lengthOpen,
  lengthRules,
  milestoneBonuses,
  milestoneProgress,
  nextRankXp,
  nextSlot,
  partsOfSpec,
  rankGiftsBetween,
  rankSum,
  pushWorks,
  recallCatches,
  rollGearDrop,
  rollJournal,
  rollOffer,
  rollTripCatches,
  rollTripLoot,
  rollBlueprint,
  slotsFor,
  tripMs,
  tripExperience,
  tripRolls,
  tripWeather,
  tripXp,
  weatherTimeMs,
  NO_TRIP_WEATHER,
  treatCost,
  weeklySpecial,
  closedReasons,
  chance,
  allSpecies,
  type AccountStat,
  type ClosedReason,
  type DestinationDef,
  type PushOnGoalDef,
  type TripCatch,
  type ExpeditionLength,
  type FamiliarityRecord,
  type PartsBundle,
  type Rng,
  type SupplyDef,
  type SuppliesId,
  type TripWeather,
  type TwistEffect,
} from '@creatures/game';
import * as v from 'valibot';
import type { Analytics, CatchProps, PushOnOutcome } from './analytics';
import {
  addExplorerTrip,
  addPage,
  addSupply,
  bumpStat,
  explorerOf,
  explorersByCreature,
  familiarityOf,
  familiarityRows,
  foundPages,
  journalPages,
  offerOf,
  saveFamiliarity,
  saveOffer,
  statsOf,
  supplyStock,
  takeSupply,
  visitPlace,
} from './expedition-store';
import { grantRankGift, grantTripLoot, type DraftItem, type GrantView } from './gear-grants';
import { gearRulesOf, minusBp } from './gear-worn';
import { openJobOf } from './gear-store';
import { devKey, type DevFlags } from './dev-state';
import { spend, type LedgerStorage } from './ledger';
import { awardExperience, type ExperienceView } from './creature-exp';
import { runKeyed, settleSpend } from './keyed-action';
import { GameError, atomically, type Outcome } from './outcome';
import type { CatchChoices, ChoiceResult } from './catch-choices';
import { weekIdFor, weekIndex } from './raid-schedule';
import type { Weather } from './weather';
import { recordServerFirst } from './server-firsts';
import { speciesOf } from './species';
import { insertCreature } from './talent-store';
import { talentViewOf, type TalentView } from './talent-view';
import { zonedHour } from './time';

const HOUR_MS = 3_600_000;
/** Finished expeditions shown in the state besides the active ones. */
const RECENT_CLAIMED = 5;
/** Cancelled trips shown (the slot wipe), newest first. */
const RECENT_CANCELLED = 3;

// --- Views ---

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
  xp?: { gained: number; total: number; rank: number; rankBefore: number };
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

type ExpeditionRow = {
  id: string;
  user_id: string;
  creature_id: string;
  duration: ExpeditionLength;
  supplies: SuppliesId;
  rolls: number;
  cost: number;
  started_at: number;
  ends_at: number;
  status: 'active' | 'claimed' | 'cancelled';
  claimed_at: number | null;
  result: string | null;
  destination_id: string;
  supplies_json: string | null;
  special_id: string | null;
  push_goal: string | null;
  push_started_at: number | null;
  push_ends_at: number | null;
  push_odds_bp: number | null;
  cancel_reason: string | null;
  treat: number;
  weather_json: string | null;
};

type CreatureLite = {
  id: string;
  species: string;
  line: string;
  level: number;
  fusion_count: number;
  shiny: number;
  away_expedition_id: string | null;
};

export interface ExpeditionsDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness for catches. */
  rng: Rng;
  /** Live randomness for offers, push-on results and the journal. Separate, so none of them eats a catch draw. */
  tripRng: Rng;
  /** Live randomness for parts, supplies, blueprints and gear (through the grant). */
  gearRng: Rng;
  /** Live randomness for the quirk of a new creature. */
  quirkRng: Rng;
  /** Live randomness for the first talent of a new creature (and the pending duplicates' talents). */
  talentRng: Rng;
  /** The duplicate choice: a duplicate catch becomes a pending card here. */
  choices: CatchChoices;
  analytics?: Analytics | undefined;
  /**
   * The dev tools' force flags (staging only, see `dev-state.ts`): a forced push-on offer and result,
   * forced night and Festival. Absent in production, where none of them exists.
   */
  dev?: DevFlags | undefined;
  /** The valley's weather: a trip is sent under the day's Boon and Omen and keeps what they did. */
  weather?: Weather | undefined;
}

const TIER_ORDER = ['basic', 'good', 'great'] as const;

/** The best tier among supplies, `basic` for none: the legacy `supplies` field of the trip view. */
function bestTier(kit: readonly SupplyDef[]): SuppliesId {
  let best = 0;
  for (const s of kit) best = Math.max(best, TIER_ORDER.indexOf(s.tier));
  return TIER_ORDER[best] as SuppliesId;
}

function twistOf(id: string | null): TwistEffect | null {
  if (id === null) return null;
  return expeditionContent.specials.twists.find((t) => t.id === id)?.effect ?? null;
}

/** What the day did to a trip, as stored when it was sent: the numbers, and the ids for the log. */
const StoredTripWeatherSchema = v.strictObject({
  boon: v.string(),
  omen: v.nullable(v.string()),
  timeBp: v.number(),
  partsBp: v.number(),
  shardsBp: v.number(),
  supplyBp: v.number(),
  extraRolls: v.number(),
  rarityBp: v.number(),
  journalBp: v.number(),
  reefOpen: v.boolean(),
  xpBp: v.number(),
  treatMultiplier: v.nullable(v.number()),
});

/** True when a day's effect changes nothing about a trip. */
function noTripWeather(fx: TripWeather): boolean {
  return (Object.keys(NO_TRIP_WEATHER) as (keyof TripWeather)[]).every(
    (k) => fx[k] === NO_TRIP_WEATHER[k],
  );
}

export class Expeditions {
  constructor(private readonly deps: ExpeditionsDeps) {}

  /**
   * What the weather of the day a trip was sent did to it. A trip from before the weather, or one sent
   * under none, has nothing stored and reads as no weather at all; a damaged value does too (a claim
   * never fails on it).
   */
  private tripWeatherOf(row: ExpeditionRow): TripWeather {
    if (row.weather_json === null) return NO_TRIP_WEATHER;
    try {
      const parsed = v.safeParse(StoredTripWeatherSchema, JSON.parse(row.weather_json));
      if (!parsed.success) return NO_TRIP_WEATHER;
      const o = parsed.output;
      return {
        timeBp: o.timeBp,
        partsBp: o.partsBp,
        shardsBp: o.shardsBp,
        supplyBp: o.supplyBp,
        extraRolls: o.extraRolls,
        rarityBp: o.rarityBp,
        journalBp: o.journalBp,
        reefOpen: o.reefOpen,
        xpBp: o.xpBp,
        treatMultiplier: o.treatMultiplier,
      };
    } catch {
      return NO_TRIP_WEATHER;
    }
  }

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  // --- Reads ---

  private expeditionRow(userId: string, id: string): ExpeditionRow {
    const row = this.sql
      .exec<ExpeditionRow>('SELECT * FROM expeditions WHERE id = ? AND user_id = ?', id, userId)
      .toArray()[0];
    if (row === undefined) throw new GameError(404, 'not_found');
    return row;
  }

  private ownedCreature(userId: string, creatureId: string): CreatureLite {
    const row = this.sql
      .exec<CreatureLite>(
        `SELECT id, species, line, level, fusion_count, shiny, away_expedition_id FROM creatures
         WHERE id = ? AND user_id = ?`,
        creatureId,
        userId,
      )
      .toArray()[0];
    // Same answer for "does not exist" and "belongs to someone else".
    if (row === undefined) throw new GameError(404, 'not_found');
    return row;
  }

  /** The supplies a trip carries: the stored list, or for a trip from before v2 the lure its tier meant. */
  private kitIds(row: ExpeditionRow): string[] {
    if (row.supplies_json !== null) {
      const parsed: unknown = JSON.parse(row.supplies_json);
      if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
        throw new Error('stored supplies are invalid');
      }
      return parsed;
    }
    if (row.supplies === 'good') return ['lure-good'];
    if (row.supplies === 'great') return ['lure-great'];
    return [];
  }

  /** Every creature's explorer rank (a creature that never explored is rank 1). */
  private ranksOf(userId: string): Map<string, number> {
    const explorers = explorersByCreature(this.sql, userId);
    const ranks = new Map<string, number>();
    for (const row of this.sql
      .exec<{ id: string }>('SELECT id FROM creatures WHERE user_id = ?', userId)
      .toArray()) {
      ranks.set(row.id, explorerRank(explorers.get(row.id)?.xp ?? 0));
    }
    return ranks;
  }

  /** The sum of the ranks above 1 of all of a player's creatures. */
  rankSumOf(userId: string): number {
    return rankSum([...this.ranksOf(userId).values()]);
  }

  private activeCount(userId: string): number {
    return this.sql
      .exec<{
        n: number;
      }>("SELECT COUNT(*) AS n FROM expeditions WHERE user_id = ? AND status = 'active'", userId)
      .one().n;
  }

  slotsView(userId: string): SlotsView {
    const sum = this.rankSumOf(userId);
    const trips = statsOf(this.sql, userId).trips_finished ?? 0;
    return {
      total: slotsFor(sum, trips),
      used: this.activeCount(userId),
      rankSum: sum,
      tripsFinished: trips,
      next: nextSlot(sum, trips),
    };
  }

  /** The explorer rank, XP and trips of a creature. */
  explorerView(userId: string, creatureId: string): ExplorerView {
    const row = explorerOf(this.sql, userId, creatureId);
    const rank = explorerRank(row.xp);
    return { rank, xp: row.xp, nextRankXp: nextRankXp(rank), trips: row.trips };
  }

  /** The explorer views of all of a player's creatures by creature id (one query for the XP). */
  explorerViews(userId: string, creatureIds: readonly string[]): Map<string, ExplorerView> {
    const explorers = explorersByCreature(this.sql, userId);
    return new Map(
      creatureIds.map((id) => {
        const row = explorers.get(id) ?? { xp: 0, trips: 0 };
        const rank = explorerRank(row.xp);
        return [id, { rank, xp: row.xp, nextRankXp: nextRankXp(rank), trips: row.trips }];
      }),
    );
  }

  private parseResult(row: ExpeditionRow): ExpeditionResult | null {
    if (row.result === null) return null;
    try {
      return JSON.parse(row.result) as ExpeditionResult;
    } catch {
      return null;
    }
  }

  private offerGoals(row: ExpeditionRow): OfferGoalView[] {
    const ids = offerOf(this.sql, row.id) ?? [];
    const goals: OfferGoalView[] = [];
    for (const id of ids) {
      const goal = goalDef(id);
      const oddsBp = goal === undefined ? undefined : goalOddsBp(goal, row.duration);
      if (goal === undefined || oddsBp === undefined) continue;
      goals.push({ id: goal.id, risk: goal.risk, extraHours: goal.extraHours, oddsBp });
    }
    return goals;
  }

  private view(row: ExpeditionRow, now: number): ExpeditionView {
    const kit = this.kitIds(row);
    const pushing = row.push_goal !== null && row.push_ends_at !== null;
    const goals =
      row.status === 'active' && !pushing && now >= row.ends_at ? this.offerGoals(row) : [];
    return {
      id: row.id,
      creatureId: row.creature_id,
      duration: row.duration,
      supplies: bestTier(kitOf(kit)),
      kit,
      destination: row.destination_id,
      twist: row.special_id,
      rolls: row.rolls,
      cost: row.cost,
      treat: row.treat === 1,
      startedAt: row.started_at,
      endsAt: row.ends_at,
      readyAt: row.push_ends_at ?? row.ends_at,
      status: row.status === 'claimed' ? 'claimed' : 'active',
      claimedAt: row.claimed_at,
      result: this.parseResult(row),
      offer: goals.length > 0 ? { goals } : null,
      pushOn:
        row.push_goal !== null &&
        row.push_started_at !== null &&
        row.push_ends_at !== null &&
        row.push_odds_bp !== null
          ? {
              goalId: row.push_goal,
              startedAt: row.push_started_at,
              endsAt: row.push_ends_at,
              oddsBp: row.push_odds_bp,
            }
          : null,
    };
  }

  /** One trip as the player sees it. */
  viewOf(userId: string, expeditionId: string): ExpeditionView {
    return this.view(this.expeditionRow(userId, expeditionId), this.deps.now());
  }

  /**
   * Everything the Activity needs of the player's trips: active and recent ones, the cancelled ones, slots
   * and supplies in stock. First rolls the end-of-trip choice of every finished trip that has none yet
   * (once each), so what the player sees is what was decided.
   */
  state(userId: string): TripsState {
    this.rollPendingOffers(userId);
    const now = this.deps.now();
    const active = this.sql
      .exec<ExpeditionRow>(
        "SELECT * FROM expeditions WHERE user_id = ? AND status = 'active' ORDER BY ends_at, rowid",
        userId,
      )
      .toArray();
    const claimed = this.sql
      .exec<ExpeditionRow>(
        `SELECT * FROM expeditions WHERE user_id = ? AND status = 'claimed'
         ORDER BY claimed_at DESC, rowid DESC LIMIT ?`,
        userId,
        RECENT_CLAIMED,
      )
      .toArray();
    const cancelled = this.sql
      .exec<ExpeditionRow>(
        `SELECT * FROM expeditions WHERE user_id = ? AND status = 'cancelled'
         ORDER BY started_at DESC, rowid DESC LIMIT ?`,
        userId,
        RECENT_CANCELLED,
      )
      .toArray();
    return {
      expeditions: [...active, ...claimed].map((row) => this.view(row, now)),
      cancelled: cancelled.map((row) => ({
        id: row.id,
        creatureId: row.creature_id,
        destination: row.destination_id,
        duration: row.duration,
        startedAt: row.started_at,
        reason: row.cancel_reason ?? 'slot_wipe',
      })),
      slots: this.slotsView(userId),
      supplies: supplyStock(this.sql, userId),
    };
  }

  // --- The end-of-trip choice: the offer ---

  /**
   * Rolls the choice of every trip that has ended and has none yet: the chance, then the goals, with
   * live randomness, stored once per trip. Trips that were never looked at before being claimed get no
   * offer (claiming without looking is coming home).
   */
  private rollPendingOffers(userId: string): void {
    const now = this.deps.now();
    const pending = this.sql
      .exec<ExpeditionRow>(
        `SELECT * FROM expeditions
         WHERE user_id = ? AND status = 'active' AND ends_at <= ? AND push_goal IS NULL
           AND id NOT IN (SELECT expedition_id FROM expedition_offers WHERE user_id = ?)
         ORDER BY ends_at, rowid`,
        userId,
        now,
        userId,
      )
      .toArray();
    if (pending.length === 0) return;
    this.deps.storage.transactionSync(() => {
      const milestones = milestoneBonuses(statsOf(this.sql, userId));
      for (const row of pending) {
        const rank = this.explorerView(userId, row.creature_id).rank;
        const goals =
          this.devOffer(userId, row.duration) ??
          rollOffer(this.deps.tripRng, {
            goals: expeditionContent.goals,
            length: row.duration,
            rank,
            kit: kitOf(this.kitIds(row)),
            milestoneOfferBp: milestones.offerBp,
          });
        if (!saveOffer(this.sql, userId, row.id, goals, now)) continue;
        this.deps.analytics?.record(
          {
            kind: 'push_on_offer',
            destination: row.destination_id,
            duration: row.duration,
            rank,
            goals,
          },
          userId,
        );
      }
    });
  }

  /**
   * Dev tools only: the push-on goal the next offer is forced to be, if one is set and the goal can be
   * offered after a trip of this length (the flag is used up then). Null otherwise, and always null in
   * production, where there are no flags.
   */
  private devOffer(userId: string, length: ExpeditionLength): string[] | null {
    const dev = this.deps.dev;
    if (dev === undefined) return null;
    const goalId = dev.get(devKey.pushOffer(userId));
    if (goalId === null) return null;
    const goal = goalDef(goalId);
    if (goal === undefined || goalOddsBp(goal, length) === undefined) return null;
    dev.take(devKey.pushOffer(userId));
    return [goal.id];
  }

  /** Dev tools only: whether the next push-on result is forced, and to what (the flag is used up). */
  private devPushOutcome(userId: string): boolean | null {
    const forced = this.deps.dev?.take(devKey.pushOutcome(userId)) ?? null;
    return forced === null ? null : forced === 'success';
  }

  /** The guild-local hour that decides whether it is night: the real one unless the dev tools force it. */
  private gateHour(userId: string, now: number, timezone: string): number {
    const forced = this.deps.dev?.get(devKey.night(userId)) ?? null;
    if (forced === 'on') return 23;
    if (forced === 'off') return 12;
    return zonedHour(now, timezone);
  }

  /** Whether a Festival week opens the Festival places: the real calendar unless the dev tools force it. */
  private gateFestival(userId: string, real: boolean): boolean {
    const forced = this.deps.dev?.get(devKey.festival(userId)) ?? null;
    return forced === null ? real : forced === 'on';
  }

  /**
   * Chooses a push-on goal of a finished trip's offer: the trip goes on for the goal's extra hours,
   * counted from the moment the trip ended (so a player who opens the app late loses no time: the
   * push-on is already over and can be claimed at once). Choosing the same goal again returns the same
   * trip; another goal after one was chosen is refused. The result (a risky goal can fail) is rolled when
   * the trip is claimed after the push-on's end, with live randomness.
   */
  choosePushOn(userId: string, expeditionId: string, goalId: string): Outcome<ExpeditionView> {
    return atomically(this.deps.storage, () => {
      const row = this.expeditionRow(userId, expeditionId);
      const now = this.deps.now();
      if (row.status !== 'active') throw new GameError(409, 'not_active');
      if (row.push_goal !== null) {
        if (row.push_goal === goalId) return this.view(row, now);
        throw new GameError(409, 'already_chosen');
      }
      if (now < row.ends_at) throw new GameError(409, 'not_ready');
      const offered = offerOf(this.sql, row.id);
      if (offered === null || offered.length === 0) throw new GameError(409, 'no_offer');
      const goal = goalDef(goalId);
      if (goal === undefined || !offered.includes(goalId)) {
        throw new GameError(409, 'not_offered');
      }
      const oddsBp = goalOddsBp(goal, row.duration);
      if (oddsBp === undefined) throw new GameError(409, 'not_offered');
      const updated = this.sql
        .exec<ExpeditionRow>(
          `UPDATE expeditions SET push_goal = ?, push_started_at = ?, push_ends_at = ?, push_odds_bp = ?
           WHERE id = ? AND status = 'active' AND push_goal IS NULL RETURNING *`,
          goal.id,
          row.ends_at,
          row.ends_at + goal.extraHours * HOUR_MS,
          oddsBp,
          row.id,
        )
        .toArray()[0];
      if (updated === undefined) throw new GameError(409, 'already_chosen');
      bumpStat(this.sql, userId, 'pushons_taken', 1);
      this.deps.analytics?.record(
        {
          kind: 'push_on_choose',
          goal: goal.id,
          risk: goal.risk,
          destination: row.destination_id,
          duration: row.duration,
          oddsBp,
        },
        userId,
      );
      return this.view(updated, now);
    });
  }

  // --- Sending ---

  /**
   * Sends a creature to a destination. Checks, in order: the creature is the caller's and free, there
   * is a free slot, the explorer's rank allows the trip length and the place, the place is open (night in
   * the guild's timezone, a Festival week), the supplies are valid. Supplies are optional: a trip without
   * any is free. Supplies cannot be bought: they come from stock, are taken, and the trip is created,
   * all in one transaction. An old client asking to buy one is refused (`supplies_not_for_sale`). A treat
   * costs Bait (`treatCost` of the explorer's level), paid in the same transaction under a key derived from
   * the trip's own id, so a retry of the send never pays it twice.
   */
  send(userId: string, input: SendInput, timezone: string): Outcome<ExpeditionView> {
    const fingerprint = JSON.stringify([
      input.creatureId,
      input.destination,
      input.duration,
      [...input.supplies].map((s) => `${s.id}:${s.source}`).sort(),
      input.treat === true,
    ]);
    return atomically(this.deps.storage, () => {
      const sent = runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: input.idempotencyKey, kind: 'expedition_send', fingerprint },
        () => this.startTrip(userId, input, timezone),
      );
      return this.view(this.expeditionRow(userId, sent.expeditionId), this.deps.now());
    });
  }

  private startTrip(userId: string, input: SendInput, timezone: string): { expeditionId: string } {
    const creature = this.ownedCreature(userId, input.creatureId);
    if (creature.away_expedition_id !== null) throw new GameError(409, 'creature_away');
    // One activity at a time: a creature on a workshop job cannot go on an expedition.
    if (openJobOf(this.sql, creature.id) !== null) throw new GameError(409, 'creature_on_job');
    const dest = destinationDef(input.destination);
    if (dest === undefined) throw new GameError(400, 'invalid_destination');
    const now = this.deps.now();

    const slots = this.slotsView(userId);
    if (slots.used >= slots.total) throw new GameError(409, 'slots_full');

    const explorer = this.explorerView(userId, creature.id);
    if (!lengthOpen(input.duration, explorer.rank)) {
      throw new GameError(409, 'rank_too_low', 'length');
    }
    const week = weeklySpecialFor(now, timezone);
    // The day's weather: fixed now and stored with the trip, so the claim never reads the weather again.
    const day = this.deps.weather?.at(now) ?? null;
    const fx = tripWeather(day, { destination: dest.id, length: input.duration });
    const closed = closedReasons(dest, {
      rank: explorer.rank,
      localHour: this.gateHour(userId, now, timezone),
      festivalWeek: this.gateFestival(userId, week.festival),
      nightOpen: fx.reefOpen,
    });
    const reason = closed[0];
    if (reason !== undefined) throw new GameError(409, 'destination_closed', reason);

    // Supplies are not for sale any more (2026-10-16): only stock goes on a trip, whatever was asked.
    if (input.supplies.some((pick) => pick.source !== 'owned')) {
      throw new GameError(400, 'supplies_not_for_sale');
    }
    const ids = input.supplies.map((s) => s.id);
    const problem = kitProblem(ids);
    if (problem !== null) throw new GameError(400, 'invalid_supplies', problem);
    const kit = kitOf(ids);
    const stock = supplyStock(this.sql, userId);
    for (const id of ids) {
      if ((stock[id] ?? 0) < 1) throw new GameError(409, 'supply_missing', id);
    }

    const special = week.destination === dest.id ? week.twistId : null;
    const rolls = tripRolls(input.duration, kit, twistOf(special)) + fx.extraRolls;
    // Quick feet lines on the explorer's gear and the day's weather change the time (fixed when it is sent).
    const ms = weatherTimeMs(
      minusBp(tripMs(input.duration, explorer.rank), gearRulesOf(this.sql, creature).quickFeetBp),
      fx.timeBp,
    );
    const weatherJson =
      day === null || noTripWeather(fx)
        ? null
        : JSON.stringify({ boon: day.boon, omen: day.omen, ...fx });

    for (const pick of input.supplies) {
      if (!takeSupply(this.sql, userId, pick.id)) {
        throw new Error('supply vanished inside the send transaction');
      }
    }
    const id = crypto.randomUUID();
    const treat = input.treat === true;
    this.sql.exec(
      `INSERT INTO expeditions
         (id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at, status,
          destination_id, supplies_json, special_id, treat, weather_json)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      id,
      userId,
      creature.id,
      input.duration,
      bestTier(kit),
      rolls,
      now,
      now + ms,
      dest.id,
      JSON.stringify(ids),
      special,
      treat ? 1 : 0,
      weatherJson,
    );
    if (weatherJson !== null && day !== null) {
      this.deps.analytics?.record(
        { kind: 'weather_use', where: 'trip', boon: day.boon, omen: day.omen },
        userId,
      );
    }
    if (treat) {
      // The treat is paid with the trip: short Bait fails the whole send, and the key is the trip's own.
      const cost = treatCost(creature.level);
      settleSpend(
        spend(
          this.deps.storage,
          {
            userId,
            currency: 'bait',
            amount: cost,
            purpose: 'treat',
            idempotencyKey: `treat:trip:${id}`,
            apply: () => ({ expeditionId: id }),
          },
          now,
        ),
      );
      this.deps.analytics?.record(
        { kind: 'treat', source: 'trip', species: creature.species, level: creature.level, cost },
        userId,
      );
    }
    this.sql.exec('UPDATE creatures SET away_expedition_id = ? WHERE id = ?', id, creature.id);
    bumpStat(this.sql, userId, 'supplies_used', kit.length);
    this.deps.analytics?.record(
      {
        kind: 'expedition_send',
        species: creature.species,
        duration: input.duration,
        destination: dest.id,
        supplies: ids,
        rank: explorer.rank,
      },
      userId,
    );
    return { expeditionId: id };
  }

  // --- Claiming ---

  /**
   * Finishes (or recalls) an expedition and rolls everything in one transaction. Claiming again returns
   * the stored result: no second roll, no second payout.
   *
   * - Before the trip ends: a recall. The catches earned so far and the share of the scrap come home;
   *   no XP, no stars, no journal, no choice.
   * - After it ends: the full reward. If a push-on goal was chosen and has run its time, the goal is
   *   resolved first: a risky goal that fails makes the whole trip bring nothing (no catches, no loot, no
   *   XP); one that works adds its reward. Claiming before the push-on ends is coming home instead.
   */
  claim(userId: string, expeditionId: string): Outcome<ExpeditionResult> {
    return atomically(this.deps.storage, () => {
      const expedition = this.expeditionRow(userId, expeditionId);
      if (expedition.status === 'claimed') {
        const stored = this.parseResult(expedition);
        if (stored === null) throw new Error('claimed expedition has no stored result');
        return stored;
      }
      if (expedition.status === 'cancelled') throw new GameError(409, 'cancelled');
      const now = this.deps.now();
      const explorer = this.ownedCreature(userId, expedition.creature_id);
      const dest = destinationDef(expedition.destination_id);
      if (dest === undefined) throw new Error('stored trip has an unknown destination');

      const finished = now >= expedition.ends_at;
      let push: { goal: PushOnGoalDef; outcome: PushOnOutcome } | null = null;
      if (finished && expedition.push_goal !== null) {
        // The odds stored when the goal was chosen decide the roll, never the current content; a goal
        // that has since left the content still resolves, from what was stored.
        const goal =
          goalDef(expedition.push_goal) ?? this.vanishedGoal(expedition.push_goal, expedition);
        const oddsBp = expedition.push_odds_bp ?? goalOddsBp(goal, expedition.duration) ?? 0;
        const pushDone = expedition.push_ends_at !== null && now >= expedition.push_ends_at;
        const works = (): boolean =>
          this.devPushOutcome(userId) ?? pushWorks(this.deps.tripRng, goal.risk, oddsBp);
        push = {
          goal,
          outcome: !pushDone ? 'declined' : works() ? 'worked' : 'failed',
        };
      }

      const result =
        push?.outcome === 'failed'
          ? this.failTrip(userId, expedition, dest, push.goal)
          : this.payTrip(userId, expedition, explorer, dest, now, finished, push);
      this.sql.exec(
        `UPDATE expeditions SET status = 'claimed', claimed_at = ?, result = ?
         WHERE id = ? AND status = 'active'`,
        now,
        JSON.stringify(result),
        expedition.id,
      );
      this.sql.exec(
        'UPDATE creatures SET away_expedition_id = NULL WHERE id = ? AND away_expedition_id = ?',
        explorer.id,
        expedition.id,
      );
      return result;
    });
  }

  /**
   * A stand-in for a push-on goal that is no longer in the content. Only the stored odds survive, so
   * the stand-in is risky when they are below certain and adds no reward when it works.
   */
  private vanishedGoal(id: string, expedition: ExpeditionRow): PushOnGoalDef {
    const oddsBp = expedition.push_odds_bp ?? 0;
    return {
      id,
      name: id,
      flavor: '',
      risk: oddsBp >= 10_000 ? 'safe' : 'risky',
      minRank: 1,
      extraHours: 1,
      lengths: {},
      reward: {},
    };
  }

  private pushView(
    expedition: ExpeditionRow,
    goal: PushOnGoalDef,
    outcome: PushOnOutcome,
  ): PushOnResultView {
    return {
      goalId: goal.id,
      risk: goal.risk,
      oddsBp: expedition.push_odds_bp ?? goalOddsBp(goal, expedition.duration) ?? 0,
      outcome,
    };
  }

  /** A risky goal that failed: nothing comes back, and the creature learns nothing. */
  private failTrip(
    userId: string,
    expedition: ExpeditionRow,
    dest: DestinationDef,
    goal: PushOnGoalDef,
  ): ExpeditionResult {
    const pushOn = this.pushView(expedition, goal, 'failed');
    bumpStat(this.sql, userId, 'trips_failed', 1);
    const analytics = this.deps.analytics;
    analytics?.record(
      {
        kind: 'push_on_result',
        goal: goal.id,
        risk: goal.risk,
        outcome: 'failed',
        destination: dest.id,
        duration: expedition.duration,
        oddsBp: pushOn.oddsBp,
      },
      userId,
    );
    analytics?.record(
      {
        kind: 'expedition_claim',
        duration: expedition.duration,
        destination: dest.id,
        supplies: this.kitIds(expedition),
        waitedMin: this.waitedMin(expedition, this.deps.now()),
        catches: [],
        pushOn: 'failed',
        xp: 0,
        stars: 0,
      },
      userId,
    );
    return { recalled: false, catches: [], failed: true, pushOn };
  }

  private waitedMin(expedition: ExpeditionRow, now: number): number {
    const readyAt = expedition.push_ends_at ?? expedition.ends_at;
    return Math.max(0, Math.floor((now - readyAt) / 60_000));
  }

  /** The catches, loot and progress of a trip that comes home. */
  private payTrip(
    userId: string,
    expedition: ExpeditionRow,
    explorer: CreatureLite,
    dest: DestinationDef,
    now: number,
    finished: boolean,
    push: { goal: PushOnGoalDef; outcome: PushOnOutcome } | null,
  ): ExpeditionResult {
    const species = speciesOf(explorer.species);
    const kit = kitOf(this.kitIds(expedition));
    const twist = twistOf(expedition.special_id);
    // What the day did to this trip when it was sent: the claim reads this, never the weather.
    const wx = this.tripWeatherOf(expedition);
    const worked = push?.outcome === 'worked' ? push.goal : null;
    const extraRolls = worked?.reward.catchRolls ?? 0;
    const totalRolls = expedition.rolls + extraRolls;
    const count = finished
      ? totalRolls
      : recallCatches(expedition.rolls, expedition.started_at, expedition.ends_at, now);

    const stats = statsOf(this.sql, userId);
    const milestones = milestoneBonuses(stats);
    // What the explorer's gear does on trips (Lucky find, Keen nose, Packer, Trail XP), as it is worn now.
    const gearRules = gearRulesOf(this.sql, explorer);
    const explorerBefore = this.explorerView(userId, explorer.id);
    const famBefore = familiarityOf(this.sql, userId, explorer.id, dest.id);
    const starsBefore = familiarityStars(dest, famBefore);
    const progress = this.sql
      .exec<{
        expeditions_claimed: number;
        dupe_streak: number;
        pity_new: number;
        pity_creature: number;
      }>(
        'SELECT expeditions_claimed, dupe_streak, pity_new, pity_creature FROM player_progress WHERE user_id = ?',
        userId,
      )
      .toArray()[0] ?? { expeditions_claimed: 0, dupe_streak: 0, pity_new: 0, pity_creature: 0 };
    const owned = new Set(
      this.sql
        .exec<{ line: string }>('SELECT line FROM creatures WHERE user_id = ?', userId)
        .toArray()
        .map((r) => r.line),
    );

    // Rolled now, at claim time, from the live RNG: nothing is decided earlier.
    const rolled = rollTripCatches(this.deps.rng, count, {
      content,
      destination: dest,
      length: expedition.duration,
      explorer: { element: species.element, role: species.role },
      kit,
      stars: starsBefore,
      milestoneRarityBp: milestones.rarityBp + gearRules.luckyFindBp + wx.rarityBp,
      twist,
      ownedLines: owned,
      dupeStreak: progress.dupe_streak,
      firstExpedition: progress.expeditions_claimed === 0,
      // The pity: the counters move with this claim and are stored below, in the same transaction.
      pity: { sinceNew: progress.pity_new, sinceCreature: progress.pity_creature },
    });
    const settled: ChoiceResult[] = [];
    const catches = rolled.results.map((caught) => {
      const made = this.applyCatch(userId, expedition.id, caught, now);
      if (made.settled !== null) settled.push(made.settled);
      return made.view;
    });

    // A claim that brought nothing back (an early recall) must not use up the first-expedition
    // guarantee, so it is not counted (a trip whose rolls all came up empty did bring a roll).
    this.sql.exec(
      `INSERT INTO player_progress
         (user_id, expeditions_claimed, dupe_streak, pity_new, pity_creature) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         expeditions_claimed = expeditions_claimed + excluded.expeditions_claimed,
         dupe_streak = excluded.dupe_streak,
         pity_new = excluded.pity_new,
         pity_creature = excluded.pity_creature`,
      userId,
      count > 0 ? 1 : 0,
      rolled.dupeStreak,
      rolled.pity.sinceNew,
      rolled.pity.sinceCreature,
    );
    // What the pity forced is logged by kind (no counters, no player data beyond the species).
    for (const forced of rolled.forced) {
      this.deps.analytics?.record(
        { kind: 'catch_pity', pity: forced.pity, species: forced.species },
        userId,
      );
    }

    // Parts, supplies, gear and maybe a blueprint, from their own live RNG (the catches used `rng`).
    const rank = explorerBefore.rank;
    const loot = grantTripLoot(
      {
        storage: this.deps.storage,
        now: this.deps.now,
        rng: this.deps.gearRng,
        analytics: this.deps.analytics,
      },
      userId,
      expedition.id,
      (rng) => {
        const drawn = rollTripLoot(
          rng,
          {
            length: expedition.duration,
            shardElement: dest.element ?? species.element,
            role: species.role,
            kit,
            stars: starsBefore,
            milestonePartsBp: milestones.partsBp,
            twist,
            rank,
            gearPartsBp: gearRules.keenNoseBp,
            gearSupplyBp: gearRules.packerBp,
            gearGlimmerBp: gearRules.glimmerFindBp,
            weatherPartsBp: wx.partsBp,
            weatherShardsBp: wx.shardsBp,
            weatherSupplyBp: wx.supplyBp,
            emptyRolls: rolled.empty,
          },
          { completed: finished, caught: count, rolls: expedition.rolls },
        );
        const parts: PartsBundle = { ...drawn.parts };
        const blueprints = drawn.blueprint === null ? [] : [drawn.blueprint];
        const supplies = [...drawn.supplies];
        const gear: DraftItem[] = [];
        if (worked !== null) {
          for (const [kind, amount] of Object.entries(partsOfSpec(worked.reward.parts)) as [
            keyof PartsBundle,
            number,
          ][]) {
            parts[kind] = (parts[kind] ?? 0) + amount;
          }
          if (worked.reward.supply === true) supplies.push(foundSupplyId(rng, rank));
          if (worked.reward.blueprint === true) blueprints.push(rollBlueprint(rng));
          if (worked.reward.gear !== undefined) {
            // The place's element is the tag, the Old Crossroads gives explorer pieces, and the item
            // level is twice the finder's explorer rank.
            const item = rollGearDrop(
              rng,
              worked.reward.gear,
              { element: dest.element ?? null, crossroads: dest.id === RULES.gear.compassPlace },
              rank,
            );
            gear.push({ item, origin: { kind: 'trip', place: dest.id, rank } });
          }
        }
        return { parts, blueprints, supplies, gear };
      },
    );

    const result: ExpeditionResult = { recalled: !finished, catches, loot };
    if (rolled.empty > 0) result.noCatch = rolled.empty;
    if (settled.length > 0) result.autoSettled = settled;
    if (push !== null) result.pushOn = this.pushView(expedition, push.goal, push.outcome);

    // A recall brings what was caught and nothing more: no XP, no stars, no journal, no stats.
    if (finished) {
      this.finishProgress(userId, expedition, explorer, dest, now, {
        result,
        catches: rolled.results,
        views: catches,
        explorerBefore,
        famBefore,
        starsBefore,
        worked,
        milestoneXpBp: milestones.xpBp,
        twist,
        stats,
      });
    }
    this.logClaim(userId, expedition, result, now, dest);
    if (push !== null) {
      this.deps.analytics?.record(
        {
          kind: 'push_on_result',
          goal: push.goal.id,
          risk: push.goal.risk,
          outcome: push.outcome,
          destination: dest.id,
          duration: expedition.duration,
          oddsBp: result.pushOn?.oddsBp ?? 0,
        },
        userId,
      );
      if (push.outcome === 'worked') bumpStat(this.sql, userId, 'pushons_won', 1);
    }
    return result;
  }

  /** XP, familiarity, journal and stats of a trip that finished (not a recall, not a failure). */
  private finishProgress(
    userId: string,
    expedition: ExpeditionRow,
    explorer: CreatureLite,
    dest: DestinationDef,
    now: number,
    p: {
      result: ExpeditionResult;
      catches: readonly TripCatch[];
      views: readonly CatchView[];
      explorerBefore: ExplorerView;
      famBefore: FamiliarityRecord;
      starsBefore: number;
      worked: PushOnGoalDef | null;
      milestoneXpBp: number;
      twist: TwistEffect | null;
      stats: Partial<Record<AccountStat, number>>;
    },
  ): void {
    const analytics = this.deps.analytics;

    // Explorer XP and rank (and the slot it may unlock).
    const sumBefore = this.rankSumOf(userId);
    const tripsBefore = p.stats.trips_finished ?? 0;
    const bonusBp =
      p.milestoneXpBp +
      (p.twist?.kind === 'xp' ? p.twist.bp : 0) +
      (p.worked?.reward.xpBp ?? 0) +
      gearRulesOf(this.sql, explorer).trailXpBp;
    const gained = tripXp(expedition.duration, bonusBp);
    const after = addExplorerTrip(this.sql, userId, explorer.id, gained);
    const rankAfter = explorerRank(after.xp);
    p.result.xp = {
      gained,
      total: after.xp,
      rank: rankAfter,
      rankBefore: p.explorerBefore.rank,
    };
    // Creature experience (training by activity): the explorer earns the trip's by its length, doubled
    // by the treat packed when it was sent. A recall and a failed trip never get here.
    const wx = this.tripWeatherOf(expedition);
    const experience = awardExperience(
      this.sql,
      analytics,
      userId,
      explorer.id,
      tripExperience(expedition.duration, expedition.treat === 1, {
        bp: wx.xpBp,
        treatMultiplier: wx.treatMultiplier,
      }),
      'trip',
      expedition.treat === 1,
    );
    if (experience !== null) p.result.experience = experience;
    if (rankAfter > p.explorerBefore.rank) {
      analytics?.record(
        { kind: 'explorer_rank', species: explorer.species, rank: rankAfter },
        userId,
      );
      // One-time gifts for every rank reached, inside the claim's transaction. Each is keyed by
      // (creature, rank), so a rank can never pay twice.
      const gifts: RankGiftView[] = [];
      for (const { rank, gift } of rankGiftsBetween(p.explorerBefore.rank, rankAfter)) {
        const granted = grantRankGift(
          {
            storage: this.deps.storage,
            now: this.deps.now,
            rng: this.deps.gearRng,
            analytics: this.deps.analytics,
          },
          userId,
          explorer.id,
          rank,
          gift,
        );
        if (granted.fresh) {
          gifts.push({
            rank,
            bait: gift.bait,
            parts: { ...gift.parts },
            supplies: [...gift.supplies],
          });
        }
      }
      if (gifts.length > 0) p.result.rankGifts = gifts;
    }
    // This trip counts as finished and may raise the rank: a slot may open.
    const sumAfter = sumBefore + (rankAfter - p.explorerBefore.rank);
    const slotsAfter = slotsFor(sumAfter, tripsBefore + 1);
    if (slotsAfter > slotsFor(sumBefore, tripsBefore)) {
      p.result.slotUnlocked = { total: slotsAfter };
      analytics?.record({ kind: 'slot_unlock', slots: slotsAfter, rankSum: sumAfter }, userId);
    }

    // Familiarity: the trip, the species caught here, a shiny.
    const found = new Set(p.famBefore.found);
    const here = new Set(allSpecies(dest));
    for (const c of p.catches) if (here.has(c.species.id)) found.add(c.species.id);
    const record: FamiliarityRecord = {
      trips: p.famBefore.trips + 1,
      found: [...found],
      shiny: p.famBefore.shiny || p.catches.some((c) => c.shiny),
    };
    saveFamiliarity(this.sql, userId, explorer.id, dest.id, record);
    const stars = familiarityStars(dest, record);
    p.result.familiarity = { stars, starsBefore: p.starsBefore, trips: record.trips };
    if (stars > p.starsBefore) {
      analytics?.record({ kind: 'familiarity_star', destination: dest.id, stars }, userId);
    }

    // The journal: a chance per trip, and a sure page from a goal that gives one.
    const pages = this.rollPages(
      userId,
      expedition,
      dest,
      now,
      p.twist,
      p.worked?.reward.journal === true,
    );
    if (pages.length > 0) p.result.journal = pages;

    // Account stats.
    bumpStat(this.sql, userId, 'trips_finished', 1);
    bumpStat(
      this.sql,
      userId,
      'trip_hours',
      Math.round(lengthRules(expedition.duration).ms / HOUR_MS),
    );
    if (visitPlace(this.sql, userId, dest.id, now)) bumpStat(this.sql, userId, 'places_visited', 1);
    bumpStat(this.sql, userId, 'species_found', p.views.filter((c) => c.outcome === 'new').length);
    bumpStat(this.sql, userId, 'shinies_found', p.catches.filter((c) => c.shiny).length);
  }

  /** Journal pages for a finished trip. Never repeats a page, and stops when none are left. */
  private rollPages(
    userId: string,
    expedition: ExpeditionRow,
    dest: DestinationDef,
    now: number,
    twist: TwistEffect | null,
    sure: boolean,
  ): JournalFindView[] {
    const entries = expeditionContent.journal.entries;
    const found = foundPages(this.sql, userId);
    const finds: JournalFindView[] = [];
    const attempts: boolean[] = [
      chance(
        this.deps.tripRng,
        journalChanceBp(expedition.duration, twist, this.tripWeatherOf(expedition).journalBp),
        10_000,
      ),
    ];
    if (sure) attempts.push(true);
    for (const wanted of attempts) {
      if (!wanted) continue;
      const entryId = rollJournal(this.deps.tripRng, entries, dest.id, found);
      if (entryId === null) continue;
      if (!addPage(this.sql, userId, entryId, now, expedition.id)) continue;
      found.add(entryId);
      bumpStat(this.sql, userId, 'journal_pages', 1);
      const entry = journalEntry(entryId);
      const setId = entry?.set ?? null;
      let setComplete = false;
      if (setId !== null) {
        const members = entries.filter((e) => e.set === setId);
        setComplete = members.every((e) => found.has(e.id));
        if (setComplete) bumpStat(this.sql, userId, 'journal_sets', 1);
      }
      finds.push({ entryId, set: setId, setComplete });
      this.deps.analytics?.record(
        {
          kind: 'journal_find',
          entry: entryId,
          place: entry?.place ?? 'any',
          set: setId,
          setComplete,
        },
        userId,
      );
    }
    return finds;
  }

  /** One `expedition_claim` or `expedition_recall` event per claim that actually paid out. */
  private logClaim(
    userId: string,
    expedition: ExpeditionRow,
    result: ExpeditionResult,
    now: number,
    dest: DestinationDef,
  ): void {
    const analytics = this.deps.analytics;
    if (analytics === undefined) return;
    const catches: CatchProps[] = result.catches.map((c) => ({
      species: c.species,
      rarity: speciesOf(c.species).rarity,
      shiny: c.shiny,
      result: c.outcome,
      ...(c.talent === undefined ? {} : { talent: c.talent.id, golden: c.talent.golden }),
    }));
    const base = {
      duration: expedition.duration,
      destination: dest.id,
      supplies: this.kitIds(expedition),
      catches,
    };
    if (result.recalled) {
      const length = Math.max(1, expedition.ends_at - expedition.started_at);
      const elapsedPct = Math.floor(((now - expedition.started_at) * 100) / length);
      analytics.record({ kind: 'expedition_recall', ...base, elapsedPct }, userId);
    } else {
      analytics.record(
        {
          kind: 'expedition_claim',
          ...base,
          waitedMin: this.waitedMin(expedition, now),
          pushOn: result.pushOn?.outcome ?? 'none',
          xp: result.xp?.gained ?? 0,
          stars: result.familiarity?.stars ?? 0,
        },
        userId,
      );
    }
  }

  /**
   * Turns one catch into a creature (a species the player lacks) or a pending duplicate card. Either way
   * the catch has rolled its talent now, from live randomness: a new creature's goes in its first slot, a
   * duplicate's waits on the card. A shiny duplicate makes the creature the player owns shiny at once.
   */
  private applyCatch(
    userId: string,
    expeditionId: string,
    caught: TripCatch,
    now: number,
  ): { view: CatchView; settled: ChoiceResult | null } {
    const species = caught.species;
    const owned = this.sql
      .exec<CreatureLite>(
        `SELECT id, species, line, level, fusion_count, shiny, away_expedition_id FROM creatures
         WHERE user_id = ? AND line = ? ORDER BY line_slot`,
        userId,
        species.line,
      )
      .toArray();
    const existing = owned[0];
    const outcome = applyCatchToCollection(
      existing === undefined
        ? undefined
        : { fusionCount: existing.fusion_count, shiny: owned.some((c) => c.shiny === 1) },
      caught,
    );
    const firstOnServer = recordServerFirst(
      this.sql,
      'catch',
      species.id,
      userId,
      expeditionId,
      now,
    );
    const wearer = { role: species.role, element: species.element };
    const base = {
      species: species.id,
      shiny: caught.shiny,
      firstOnServer,
      ...(caught.deep ? { deep: true as const } : {}),
    };

    switch (outcome.kind) {
      case 'new': {
        // Drawn now from live randomness, after the catch itself is decided: the quirk (cosmetic) and
        // the talent.
        const made = insertCreature(
          this.sql,
          { quirk: this.deps.quirkRng, talent: this.deps.talentRng },
          { userId, species: species.id, origin: 'expedition', shiny: caught.shiny, now },
          this.deps.analytics,
        );
        const talent = talentViewOf(made.talent, wearer);
        return {
          view: { ...base, outcome: 'new', ...(talent === null ? {} : { talent }) },
          settled: null,
        };
      }
      case 'duplicate': {
        if (existing === undefined) throw new Error('a duplicate without a creature');
        if (outcome.becameShiny) {
          this.sql.exec('UPDATE creatures SET shiny = 1 WHERE id = ?', existing.id);
        }
        const pending = this.deps.choices.addPending(
          userId,
          { species: species.id, shiny: caught.shiny },
          { kind: 'expedition', id: expeditionId },
        );
        const talent = talentViewOf(pending.talent, wearer);
        return {
          view: {
            ...base,
            outcome: 'duplicate',
            pendingId: pending.id,
            ...(talent === null ? {} : { talent }),
          },
          settled: pending.settled,
        };
      }
    }
  }

  // --- The profile and the destinations ---

  /** The caller's account stats, milestones, journal and explorers. */
  profile(userId: string): ProfileView {
    const stats = statsOf(this.sql, userId);
    const found = journalPages(this.sql, userId);
    const foundIds = new Set(found.map((f) => f.entryId));
    const entries = expeditionContent.journal.entries;
    const creatureIds = this.sql
      .exec<{ id: string }>(
        'SELECT id FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
        userId,
      )
      .toArray()
      .map((r) => r.id);
    const explorers = this.explorerViews(userId, creatureIds);
    return {
      stats: Object.fromEntries(ACCOUNT_STATS.map((k) => [k, stats[k] ?? 0])) as Record<
        AccountStat,
        number
      >,
      milestones: milestoneProgress(stats).map((m) => ({
        id: m.id,
        stat: m.stat,
        at: m.at,
        value: Math.min(m.value, m.at),
        reached: m.reached,
        bonus: m.bonus,
      })),
      bonuses: milestoneBonuses(stats),
      journal: {
        found,
        total: entries.length,
        sets: expeditionContent.journal.sets.map((s) => {
          const members = entries.filter((e) => e.set === s.id);
          return {
            id: s.id,
            found: members.filter((e) => foundIds.has(e.id)).length,
            total: members.length,
          };
        }),
      },
      explorers: creatureIds.map((id) => ({
        creatureId: id,
        ...(explorers.get(id) as ExplorerView),
      })),
      slots: this.slotsView(userId),
    };
  }

  /**
   * The destinations as this guild sees them now: the weekly special, whether it is night or a Festival
   * week (the two things that open a place for everybody at once), and the caller's familiarity for
   * every creature and place it has been to. A creature's rank gate is on its explorer view.
   */
  destinations(userId: string, timezone: string): DestinationsView {
    const now = this.deps.now();
    const week = weeklySpecialFor(now, timezone);
    const hour = this.gateHour(userId, now, timezone);
    const festival = this.gateFestival(userId, week.festival);
    const twist = expeditionContent.specials.twists.find((t) => t.id === week.twistId);
    const day = this.deps.weather?.at(now) ?? null;
    return {
      serverNow: now,
      special: {
        destination: week.destination,
        twist: week.twistId,
        description: twist?.description ?? '',
        festival,
      },
      festivalWeek: festival,
      night: isNightHour(hour),
      destinations: expeditionContent.destinations.map((d) => ({
        id: d.id,
        minRank: d.access.minRank,
        nightOnly: d.access.night === true,
        festivalOnly: d.access.festival === true,
        closed: closedReasons(d, {
          rank: d.access.minRank,
          localHour: hour,
          festivalWeek: festival,
          nightOpen: tripWeather(day, { destination: d.id, length: 'short' }).reefOpen,
        }),
      })),
      familiarity: familiarityRows(this.sql, userId).flatMap((r) => {
        const dest = destinationDef(r.destinationId);
        if (dest === undefined) return [];
        return [
          {
            creatureId: r.creatureId,
            destination: r.destinationId,
            trips: r.record.trips,
            found: [...r.record.found],
            shiny: r.record.shiny,
            stars: familiarityStars(dest, r.record),
            deepChanceBp: familiarityBonus(familiarityStars(dest, r.record)).deepChanceBp,
          },
        ];
      }),
    };
  }

  /** Supplies a player gets from a finished workshop job (called by the Workshop). */
  addCraftedSupplies(userId: string, supplyId: string, amount: number): void {
    addSupply(this.sql, userId, supplyId, amount);
  }
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

/** The weekly special at an instant, by the guild's raid week. */
function weeklySpecialFor(
  now: number,
  timezone: string,
): { destination: string; twistId: string; festival: boolean } {
  const special = weeklySpecial(weekIndex(weekIdFor(now, timezone)));
  return {
    destination: special.destination,
    twistId: special.twist.id,
    festival: special.festival,
  };
}
