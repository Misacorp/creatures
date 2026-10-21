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
  destinationDef,
  expeditionContent,
  explorerRank,
  familiarityBonus,
  isNightHour,
  ACCOUNT_STATS,
  familiarityStars,
  goalDef,
  goalOddsBp,
  kitOf,
  kitProblem,
  lengthOpen,
  milestoneBonuses,
  milestoneProgress,
  nextRankXp,
  nextSlot,
  rankSum,
  pushWorks,
  rollOffer,
  slotsFor,
  tripMs,
  tripTicks,
  tripWeather,
  weatherDef,
  weatherTimeMs,
  NO_TRIP_WEATHER,
  treatCost,
  weeklySpecial,
  closedReasons,
  dayParts,
  dayXpEffects,
  legacyDayParts,
  type AccountStat,
  type PushOnGoalDef,
  type ExpeditionLength,
  type Rng,
  type SupplyDef,
  type SuppliesId,
  type TripWeather,
  type XpBoostPart,
} from '@creatures/game';
import * as v from 'valibot';
import type { Analytics, PushOnOutcome } from './analytics';
import {
  addSupply,
  bumpStat,
  explorerOf,
  explorersByCreature,
  familiarityRows,
  journalPages,
  offerOf,
  saveOffer,
  statsOf,
  supplyStock,
  takeSupply,
} from './expedition-store';
import { gearRulesOf, minusBp } from './gear-worn';
import { openJobOf } from './gear-store';
import { devKey, type DevFlags } from './dev-state';
import { spend, type LedgerStorage } from './ledger';
import { runKeyed, settleSpend } from './keyed-action';
import { GameError, atomically, type Outcome } from './outcome';
import type { CatchChoices } from './catch-choices';
import { weekIdFor, weekIndex } from './raid-schedule';
import type { Weather } from './weather';
import { zonedHour } from './time';
import {
  HOUR_MS,
  twistOf,
  failTrip,
  payTrip,
  sentTicks,
  vanishedGoal,
  type ClaimEnv,
} from './expedition-claim';
import type {
  DestinationsView,
  ExpeditionResult,
  ExpeditionView,
  ExplorerView,
  OfferGoalView,
  ProfileView,
  SendInput,
  SlotsView,
  TripsState,
  TripWeatherView,
} from './expedition-types';

export type {
  CancelledView,
  CatchView,
  DestinationsView,
  ExpeditionResult,
  ExpeditionView,
  ExplorerView,
  JournalFindView,
  OfferGoalView,
  ProfileView,
  PushOnResultView,
  RankGiftView,
  TripWeatherView,
  SendInput,
  SlotsView,
  TripsState,
} from './expedition-types';

/** Finished expeditions shown in the state besides the active ones. */
const RECENT_CLAIMED = 5;
/** Cancelled trips shown (the slot wipe), newest first. */
const RECENT_CANCELLED = 3;

export type ExpeditionRow = {
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

export type CreatureLite = {
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
  /** Each Boon's and Omen's change to creature experience (absent on trips sent before 2026-10-19). */
  xpEffects: v.optional(
    v.pipe(v.array(v.strictObject({ id: v.string(), bp: v.number() })), v.maxLength(4)),
  ),
});

/** True when a day's effect changes nothing about a trip. */
function noTripWeather(fx: TripWeather): boolean {
  return (Object.keys(NO_TRIP_WEATHER) as (keyof TripWeather)[]).every(
    (k) => fx[k] === NO_TRIP_WEATHER[k],
  );
}

export class Expeditions {
  /** What the claim pipeline (`expedition-claim.ts`) reads of this class. */
  private readonly env: ClaimEnv;

  constructor(private readonly deps: ExpeditionsDeps) {
    this.env = {
      get sql() {
        return deps.storage.sql;
      },
      deps,
      tripWeatherOf: (row) => this.tripWeatherOf(row),
      tripDayXpOf: (row) => this.tripDayXpOf(row),
      kitIds: (row) => this.kitIds(row),
      explorerView: (userId, creatureId) => this.explorerView(userId, creatureId),
      rankSumOf: (userId) => this.rankSumOf(userId),
      devPushOutcome: (userId) => this.devPushOutcome(userId),
    };
  }

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

  /**
   * The Boons and Omens that changed the creature experience of a trip, by name, from what was stored when it
   * was sent (the same numbers its claim pays with). Nothing for a trip with no weather stored.
   */
  private tripDayXpOf(row: ExpeditionRow): XpBoostPart[] {
    if (row.weather_json === null) return [];
    try {
      const parsed = v.safeParse(StoredTripWeatherSchema, JSON.parse(row.weather_json));
      if (!parsed.success) return [];
      const o = parsed.output;
      return o.xpEffects === undefined ? legacyDayParts(o) : dayParts(o.xpEffects);
    } catch {
      return [];
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

  /**
   * The Boon and Omen that changed this trip, by name, from what was stored when it was sent. Null for a trip
   * that no weather touched (nothing is stored then), from before the weather, or with a damaged value.
   */
  private tripWeatherView(row: ExpeditionRow): TripWeatherView | null {
    if (row.weather_json === null) return null;
    try {
      const parsed = v.safeParse(StoredTripWeatherSchema, JSON.parse(row.weather_json));
      if (!parsed.success) return null;
      const boon = weatherDef(parsed.output.boon);
      if (boon === undefined) return null;
      const omen = parsed.output.omen === null ? undefined : weatherDef(parsed.output.omen);
      return {
        boon: { id: boon.id, name: boon.name },
        omen: omen === undefined ? null : { id: omen.id, name: omen.name },
      };
    } catch {
      return null;
    }
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
      weather: this.tripWeatherView(row),
      rolls: sentTicks(row),
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
   * counted from the moment the player chooses (pushing on carries its price in time: a player who
   * opens the app late waits the full extra hours from then; the creature stays busy until then). Choosing the same goal again returns the same
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
          now,
          now + goal.extraHours * HOUR_MS,
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
    // What the explorer's gear does on a trip is fixed now: Quick feet changes the time (with the day's
    // weather), and the Crossroads Wanderer set adds a tick to a 24 hour trip. The trip's `rolls` are its
    // whole ticks (the length's, the twist's, the day's and the gear's); the map's ticks are rolled at the
    // claim, and a worked push-on adds its hours then.
    const gear = gearRulesOf(this.sql, creature);
    const rolls =
      tripTicks(input.duration, twistOf(special)) +
      fx.extraRolls +
      (input.duration === 'day' ? gear.dayTripRolls : 0);
    const ms = weatherTimeMs(
      minusBp(tripMs(input.duration, explorer.rank), gear.quickFeetBp),
      fx.timeBp,
    );
    const weatherJson =
      day === null || noTripWeather(fx)
        ? null
        : JSON.stringify({ boon: day.boon, omen: day.omen, ...fx, xpEffects: dayXpEffects(day) });

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
          goalDef(expedition.push_goal) ?? vanishedGoal(expedition.push_goal, expedition);
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
          ? failTrip(this.env, userId, expedition, dest, push.goal)
          : payTrip(this.env, userId, expedition, explorer, dest, now, finished, push);
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
