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
 *   send is a `key_conflict`. The Bait of bought supplies goes through the ledger's `spend`, so the
 *   balance check, the debit, the supplies taken from stock and the new trip are one transaction.
 * - A claim stores its result and never rolls again; claiming a claimed trip returns it.
 * - The end-of-trip offer is rolled once per trip (`expedition_offers`), so reloading cannot re-roll it.
 *
 * Randomness: all live. Catches use `rng`, parts and gear `gearRng` (through the grant), the offer, the
 * push-on result and the journal `tripRng`; each is drawn at the moment it is needed, never earlier.
 */
import {
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
  goalWorks,
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
  expeditionConvertBait,
  partsOfSpec,
  pickQuirk,
  rankSum,
  recallCatches,
  rollGearDrop,
  rollJournal,
  rollOffer,
  rollTripCatches,
  rollTripLoot,
  rollBlueprint,
  slotsFor,
  tripMs,
  tripRolls,
  tripXp,
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
  type GearRarity,
  type PartsBundle,
  type Rng,
  type SupplyDef,
  type SuppliesId,
  type TwistEffect,
} from '@creatures/game';
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
import { grantTripLoot, type GrantView } from './gear-grants';
import { openJobOf } from './gear-store';
import { credit, lookupSpend, spend, type LedgerStorage } from './ledger';
import { CollectionError, atomically, type Outcome } from './outcome';
import { weekIdFor, weekIndex } from './raid-schedule';
import { recordServerFirst } from './server-firsts';
import { speciesOf } from './species';
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
  outcome: 'new' | 'fused' | 'converted';
  /** Only for outcome 'fused': the creature's fusion count after this catch. */
  fusionCount?: number;
  /** Only for outcome 'converted': the Bait granted. */
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
  /** True when a risky push-on goal failed: the whole trip brought nothing back. */
  failed?: boolean;
  /** What became of the push-on choice, if the trip had one. */
  pushOn?: PushOnResultView;
  /** Explorer XP gained, and the explorer's totals and rank after the trip. */
  xp?: { gained: number; total: number; rank: number; rankBefore: number };
  /** The explorer's stars at the destination after the trip. */
  familiarity?: { stars: number; starsBefore: number; trips: number };
  /** Journal pages found (usually none or one). */
  journal?: JournalFindView[];
  /** Set when the trip unlocked another expedition slot. */
  slotUnlocked?: { total: number };
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
  /** Bait paid for supplies. */
  cost: number;
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
  /** The supplies to carry: bought for Bait now, or taken from stock. */
  supplies: readonly { id: string; source: 'buy' | 'owned' }[];
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
};

type CreatureLite = {
  id: string;
  species: string;
  line: string;
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
  analytics?: Analytics | undefined;
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

export class Expeditions {
  constructor(private readonly deps: ExpeditionsDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  // --- Reads ---

  private expeditionRow(userId: string, id: string): ExpeditionRow {
    const row = this.sql
      .exec<ExpeditionRow>('SELECT * FROM expeditions WHERE id = ? AND user_id = ?', id, userId)
      .toArray()[0];
    if (row === undefined) throw new CollectionError(404, 'not_found');
    return row;
  }

  private ownedCreature(userId: string, creatureId: string): CreatureLite {
    const row = this.sql
      .exec<CreatureLite>(
        `SELECT id, species, line, fusion_count, shiny, away_expedition_id FROM creatures
         WHERE id = ? AND user_id = ?`,
        creatureId,
        userId,
      )
      .toArray()[0];
    // Same answer for "does not exist" and "belongs to someone else".
    if (row === undefined) throw new CollectionError(404, 'not_found');
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
        const goals = rollOffer(this.deps.tripRng, {
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
      if (row.status !== 'active') throw new CollectionError(409, 'not_active');
      if (row.push_goal !== null) {
        if (row.push_goal === goalId) return this.view(row, now);
        throw new CollectionError(409, 'already_chosen');
      }
      if (now < row.ends_at) throw new CollectionError(409, 'not_ready');
      const offered = offerOf(this.sql, row.id);
      if (offered === null || offered.length === 0) throw new CollectionError(409, 'no_offer');
      const goal = goalDef(goalId);
      if (goal === undefined || !offered.includes(goalId)) {
        throw new CollectionError(409, 'not_offered');
      }
      const oddsBp = goalOddsBp(goal, row.duration);
      if (oddsBp === undefined) throw new CollectionError(409, 'not_offered');
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
      if (updated === undefined) throw new CollectionError(409, 'already_chosen');
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
   * Runs an action once per (player, key). A repeat of the same action returns the stored result and
   * does nothing else; the same key on a different action, or one already used by a ledger spend, is a
   * `key_conflict`.
   */
  private keyed<T>(userId: string, key: string, fingerprint: string, run: () => T): T {
    const prior = this.sql
      .exec<{
        kind: string;
        fingerprint: string;
        result_json: string;
      }>(
        'SELECT kind, fingerprint, result_json FROM gear_actions WHERE user_id = ? AND key = ?',
        userId,
        key,
      )
      .toArray()[0];
    if (prior !== undefined) {
      if (prior.kind !== 'expedition_send' || prior.fingerprint !== fingerprint) {
        throw new CollectionError(409, 'key_conflict');
      }
      return JSON.parse(prior.result_json) as T;
    }
    if (lookupSpend(this.sql, userId, key) !== null) throw new CollectionError(409, 'key_conflict');
    const result = run();
    this.sql.exec(
      `INSERT INTO gear_actions (user_id, key, kind, fingerprint, result_json, created_at)
       VALUES (?, ?, 'expedition_send', ?, ?, ?)`,
      userId,
      key,
      fingerprint,
      JSON.stringify(result) ?? 'null',
      this.deps.now(),
    );
    return result;
  }

  /**
   * Sends a creature to a destination. Checks, in order: the creature is the caller's and free, there
   * is a free slot, the explorer's rank allows the trip length and the place, the place is open (night in
   * the guild's timezone, a Festival week), the supplies are valid. Supplies are optional: a trip without
   * any is free. Bought supplies are paid in Bait through the ledger, supplies from stock are taken, and
   * the trip is created, all in one transaction.
   */
  send(userId: string, input: SendInput, timezone: string): Outcome<ExpeditionView> {
    const fingerprint = JSON.stringify([
      input.creatureId,
      input.destination,
      input.duration,
      [...input.supplies].map((s) => `${s.id}:${s.source}`).sort(),
    ]);
    return atomically(this.deps.storage, () => {
      const sent = this.keyed(userId, input.idempotencyKey, fingerprint, () =>
        this.startTrip(userId, input, timezone),
      );
      return this.view(this.expeditionRow(userId, sent.expeditionId), this.deps.now());
    });
  }

  private startTrip(userId: string, input: SendInput, timezone: string): { expeditionId: string } {
    const creature = this.ownedCreature(userId, input.creatureId);
    if (creature.away_expedition_id !== null) throw new CollectionError(409, 'creature_away');
    // One activity at a time: a creature on a workshop job cannot go on an expedition.
    if (openJobOf(this.sql, creature.id) !== null)
      throw new CollectionError(409, 'creature_on_job');
    const dest = destinationDef(input.destination);
    if (dest === undefined) throw new CollectionError(400, 'invalid_destination');
    const now = this.deps.now();

    const slots = this.slotsView(userId);
    if (slots.used >= slots.total) throw new CollectionError(409, 'slots_full');

    const explorer = this.explorerView(userId, creature.id);
    if (!lengthOpen(input.duration, explorer.rank)) {
      throw new CollectionError(409, 'rank_too_low', 'length');
    }
    const week = weeklySpecialFor(now, timezone);
    const closed = closedReasons(dest, {
      rank: explorer.rank,
      localHour: zonedHour(now, timezone),
      festivalWeek: week.festival,
    });
    const reason = closed[0];
    if (reason !== undefined) throw new CollectionError(409, 'destination_closed', reason);

    const ids = input.supplies.map((s) => s.id);
    const problem = kitProblem(ids);
    if (problem !== null) throw new CollectionError(400, 'invalid_supplies', problem);
    const kit = kitOf(ids);
    const stock = supplyStock(this.sql, userId);
    let cost = 0;
    let bought = 0;
    for (const pick of input.supplies) {
      if (pick.source === 'buy') {
        cost += kit.find((s) => s.id === pick.id)?.price ?? 0;
        bought++;
      } else if ((stock[pick.id] ?? 0) < 1) {
        throw new CollectionError(409, 'supply_missing', pick.id);
      }
    }

    const special = week.destination === dest.id ? week.twistId : null;
    const rolls = tripRolls(input.duration, kit, twistOf(special));
    const ms = tripMs(input.duration, explorer.rank);

    const create = (): { expeditionId: string } => {
      // Stock is taken inside the same transaction as the spend, so a failed payment takes nothing.
      for (const pick of input.supplies) {
        if (pick.source === 'owned' && !takeSupply(this.sql, userId, pick.id)) {
          throw new Error('supply vanished inside the send transaction');
        }
      }
      const id = crypto.randomUUID();
      this.sql.exec(
        `INSERT INTO expeditions
           (id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at, status,
            destination_id, supplies_json, special_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        id,
        userId,
        creature.id,
        input.duration,
        bestTier(kit),
        rolls,
        cost,
        now,
        now + ms,
        dest.id,
        JSON.stringify(ids),
        special,
      );
      this.sql.exec('UPDATE creatures SET away_expedition_id = ? WHERE id = ?', id, creature.id);
      bumpStat(this.sql, userId, 'supplies_used', kit.length);
      this.deps.analytics?.record(
        {
          kind: 'expedition_send',
          species: creature.species,
          duration: input.duration,
          destination: dest.id,
          supplies: ids,
          bought,
          cost,
          rank: explorer.rank,
        },
        userId,
      );
      return { expeditionId: id };
    };

    if (cost === 0) return create();
    const spent = spend(
      this.deps.storage,
      {
        userId,
        currency: 'bait',
        amount: cost,
        purpose: 'expedition',
        idempotencyKey: input.idempotencyKey,
        apply: create,
      },
      now,
    );
    switch (spent.status) {
      case 'insufficient_funds':
        throw new CollectionError(409, 'insufficient_funds');
      case 'key_conflict':
      case 'replayed':
        throw new CollectionError(409, 'key_conflict');
      case 'ok':
        return spent.result;
    }
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
      if (expedition.status === 'cancelled') throw new CollectionError(409, 'cancelled');
      const now = this.deps.now();
      const explorer = this.ownedCreature(userId, expedition.creature_id);
      const dest = destinationDef(expedition.destination_id);
      if (dest === undefined) throw new Error('stored trip has an unknown destination');

      const finished = now >= expedition.ends_at;
      const goal = expedition.push_goal === null ? undefined : goalDef(expedition.push_goal);
      let push: { goal: NonNullable<typeof goal>; outcome: PushOnOutcome } | null = null;
      if (finished && goal !== undefined) {
        const pushDone = expedition.push_ends_at !== null && now >= expedition.push_ends_at;
        push = {
          goal,
          outcome: !pushDone
            ? 'declined'
            : goalWorks(this.deps.tripRng, goal, expedition.duration)
              ? 'worked'
              : 'failed',
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
    const worked = push?.outcome === 'worked' ? push.goal : null;
    const extraRolls = worked?.reward.catchRolls ?? 0;
    const totalRolls = expedition.rolls + extraRolls;
    const count = finished
      ? totalRolls
      : recallCatches(expedition.rolls, expedition.started_at, expedition.ends_at, now);

    const stats = statsOf(this.sql, userId);
    const milestones = milestoneBonuses(stats);
    const explorerBefore = this.explorerView(userId, explorer.id);
    const famBefore = familiarityOf(this.sql, userId, explorer.id, dest.id);
    const starsBefore = familiarityStars(dest, famBefore);
    const progress = this.sql
      .exec<{ expeditions_claimed: number; dupe_streak: number }>(
        'SELECT expeditions_claimed, dupe_streak FROM player_progress WHERE user_id = ?',
        userId,
      )
      .toArray()[0] ?? { expeditions_claimed: 0, dupe_streak: 0 };
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
      milestoneRarityBp: milestones.rarityBp,
      twist,
      ownedLines: owned,
      dupeStreak: progress.dupe_streak,
      firstExpedition: progress.expeditions_claimed === 0,
    });
    const catches = rolled.results.map((caught, index) =>
      this.applyCatch(userId, expedition.id, index, caught, now),
    );

    // A claim that brought nothing back (an early recall) must not use up the first-expedition
    // guarantee, so it is not counted.
    this.sql.exec(
      `INSERT INTO player_progress (user_id, expeditions_claimed, dupe_streak) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         expeditions_claimed = expeditions_claimed + excluded.expeditions_claimed,
         dupe_streak = excluded.dupe_streak`,
      userId,
      count > 0 ? 1 : 0,
      rolled.dupeStreak,
    );

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
          },
          { completed: finished, caught: count, rolls: expedition.rolls },
        );
        const parts: PartsBundle = { ...drawn.parts };
        const blueprints = drawn.blueprint === null ? [] : [drawn.blueprint];
        const supplies = [...drawn.supplies];
        const gear: {
          baseId: string;
          rarity: GearRarity;
          rolls: ReturnType<typeof rollGearDrop>['rolls'];
        }[] = [];
        if (worked !== null) {
          for (const [kind, amount] of Object.entries(partsOfSpec(worked.reward.parts)) as [
            keyof PartsBundle,
            number,
          ][]) {
            parts[kind] = (parts[kind] ?? 0) + amount;
          }
          if (worked.reward.supply === true) supplies.push(foundSupplyId(rng, rank));
          if (worked.reward.blueprint === true) blueprints.push(rollBlueprint(rng));
          if (worked.reward.gear !== undefined) gear.push(rollGearDrop(rng, worked.reward.gear));
        }
        return { parts, blueprints, supplies, gear };
      },
    );

    const result: ExpeditionResult = { recalled: !finished, catches, loot };
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
      p.milestoneXpBp + (p.twist?.kind === 'xp' ? p.twist.bp : 0) + (p.worked?.reward.xpBp ?? 0);
    const gained = tripXp(expedition.duration, bonusBp);
    const after = addExplorerTrip(this.sql, userId, explorer.id, gained);
    const rankAfter = explorerRank(after.xp);
    p.result.xp = {
      gained,
      total: after.xp,
      rank: rankAfter,
      rankBefore: p.explorerBefore.rank,
    };
    if (rankAfter > p.explorerBefore.rank) {
      analytics?.record(
        { kind: 'explorer_rank', species: explorer.species, rank: rankAfter },
        userId,
      );
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
      chance(this.deps.tripRng, journalChanceBp(expedition.duration, twist), 10_000),
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

  private applyCatch(
    userId: string,
    expeditionId: string,
    index: number,
    caught: TripCatch,
    now: number,
  ): CatchView {
    const species = caught.species;
    const existing = this.sql
      .exec<CreatureLite>(
        `SELECT id, species, line, fusion_count, shiny, away_expedition_id FROM creatures
         WHERE user_id = ? AND line = ?`,
        userId,
        species.line,
      )
      .toArray()[0];
    const outcome = applyCatchToCollection(
      existing === undefined
        ? undefined
        : { fusionCount: existing.fusion_count, shiny: existing.shiny === 1 },
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
    const base = {
      species: species.id,
      shiny: caught.shiny,
      firstOnServer,
      ...(caught.deep ? { deep: true as const } : {}),
    };

    switch (outcome.kind) {
      case 'new':
        this.sql.exec(
          `INSERT INTO creatures (id, user_id, line, species, level, shiny, origin, caught_at, quirk_id)
           VALUES (?, ?, ?, ?, 1, ?, 'expedition', ?, ?)`,
          crypto.randomUUID(),
          userId,
          species.line,
          species.id,
          caught.shiny ? 1 : 0,
          now,
          // Drawn now from live randomness, after the catch itself is decided; cosmetic only.
          pickQuirk(species.id, this.deps.quirkRng),
        );
        return { ...base, outcome: 'new' };
      case 'fused':
        if (existing === undefined) throw new Error('fusion without a creature');
        this.sql.exec(
          'UPDATE creatures SET fusion_count = ?, shiny = ? WHERE id = ?',
          outcome.newFusionCount,
          existing.shiny === 1 || outcome.becameShiny ? 1 : 0,
          existing.id,
        );
        this.deps.analytics?.record(
          {
            kind: 'fuse',
            species: species.id,
            rarity: species.rarity,
            converted: false,
            fusionCount: outcome.newFusionCount,
            bait: 0,
          },
          userId,
        );
        return { ...base, outcome: 'fused', fusionCount: outcome.newFusionCount };
      case 'converted': {
        if (existing === undefined) throw new Error('conversion without a creature');
        if (outcome.becameShiny) {
          this.sql.exec('UPDATE creatures SET shiny = 1 WHERE id = ?', existing.id);
        }
        // Nested inside the claim transaction: the credit rolls back with it, and the key makes a
        // repeat a no-op.
        // Trips are free, so what a duplicate turns into is a share of the usual Bait (`convertBp`).
        const bait = expeditionConvertBait(outcome.bait);
        credit(
          this.deps.storage,
          {
            userId,
            currency: 'bait',
            amount: bait,
            source: 'fusion',
            idempotencyKey: `fusion:${expeditionId}:${String(index)}`,
            meta: { species: species.id },
          },
          now,
        );
        this.deps.analytics?.record(
          {
            kind: 'fuse',
            species: species.id,
            rarity: species.rarity,
            converted: true,
            fusionCount: existing.fusion_count,
            bait,
          },
          userId,
        );
        return { ...base, outcome: 'converted', bait };
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
    const hour = zonedHour(now, timezone);
    const twist = expeditionContent.specials.twists.find((t) => t.id === week.twistId);
    return {
      serverNow: now,
      special: {
        destination: week.destination,
        twist: week.twistId,
        description: twist?.description ?? '',
        festival: week.festival,
      },
      festivalWeek: week.festival,
      night: isNightHour(hour),
      destinations: expeditionContent.destinations.map((d) => ({
        id: d.id,
        minRank: d.access.minRank,
        nightOnly: d.access.night === true,
        festivalOnly: d.access.festival === true,
        closed: closedReasons(d, {
          rank: d.access.minRank,
          localHour: hour,
          festivalWeek: week.festival,
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
