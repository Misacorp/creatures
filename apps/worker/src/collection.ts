/**
 * The collection game logic of a guild: starters, creatures, expeditions, training, nicknames and
 * "first on server" records. Everything here is synchronous and runs inside `transactionSync`, so
 * a check and the writes that depend on it can never be interleaved with another request.
 *
 * The user is always an argument supplied from the verified session, never from a request body.
 */
import {
  applyCatchToCollection,
  applyGear,
  canTrain,
  RULES,
  content,
  discountedTrainingCost,
  effectiveStats,
  expeditionCost,
  expeditionDurationMs,
  expeditionRolls,
  pickQuirk,
  quirkText,
  recallCatches,
  rollCatches,
  sanitizeNickname,
  type CreatureSpecies,
  type DurationId,
  type GearRarity,
  type Rng,
  type Stats,
  type SuppliesId,
} from '@creatures/game';
import type { Analytics, CatchProps } from './analytics';
import { grantExpeditionLoot, type GrantView } from './gear-grants';
import {
  equippedByCreature,
  openJobOf,
  openJobsByCreature,
  rowToItem,
  type GearRow,
} from './gear-store';
import {
  credit,
  getBalances,
  lookupSpend,
  spend,
  type Currency,
  type LedgerStorage,
} from './ledger';
import { recordServerFirst, type ServerFirstKind } from './server-firsts';

/** Expedition slots per player. */
export const EXPEDITION_SLOTS = 3;
/** Finished expeditions shown in the state besides the active ones. */
const RECENT_CLAIMED = 5;

const SPECIES = new Map<string, CreatureSpecies>(content.creatures.map((c) => [c.id, c]));

export function speciesOf(id: string): CreatureSpecies {
  const species = SPECIES.get(id);
  if (species === undefined) throw new Error('stored creature has an unknown species');
  return species;
}

export type ErrorStatus = 400 | 404 | 409;

export type Outcome<T> =
  { ok: true; value: T } | { ok: false; status: ErrorStatus; error: string; reason?: string };

/** Thrown inside a transaction to roll it back and answer with an error. */
class CollectionError extends Error {
  constructor(
    readonly status: ErrorStatus,
    readonly code: string,
    readonly reason?: string,
  ) {
    super(code);
    this.name = 'CollectionError';
  }
}

type CreatureRow = {
  id: string;
  user_id: string;
  line: string;
  species: string;
  level: number;
  fusion_count: number;
  shiny: number;
  nickname: string | null;
  away_expedition_id: string | null;
  origin: string;
  caught_at: number;
  quirk_id: string | null;
};

type ExpeditionRow = {
  id: string;
  user_id: string;
  creature_id: string;
  duration: DurationId;
  supplies: SuppliesId;
  rolls: number;
  cost: number;
  started_at: number;
  ends_at: number;
  status: 'active' | 'claimed';
  claimed_at: number | null;
  result: string | null;
};

export interface CreatureView {
  id: string;
  species: string;
  line: string;
  level: number;
  levelCap: number;
  fusionCount: number;
  shiny: boolean;
  nickname: string | null;
  away: boolean;
  origin: string;
  caughtAt: number;
  /**
   * The creature's cosmetic personality quirk: an id into the shared lore data (`lore.quirks`),
   * whose text the client looks up. It changes nothing in the game. Null only for an id that is
   * missing or no longer in the data.
   */
  quirk: string | null;
  stats: Stats;
  /**
   * The stats a fight uses: `stats` with the equipped item folded in (capped). Equal to `stats` for a
   * creature without gear. Gear changes nothing else about the creature.
   */
  statsWithGear: Stats;
  /** The item the creature wears (one slot), or null. The full item is in the gear view. */
  gear: {
    id: string;
    baseId: string;
    rarity: GearRarity;
    level: number;
    enchantId: string | null;
  } | null;
  /**
   * What the creature is doing, or null: on an expedition or on a workshop job. A busy creature
   * cannot start the other; it still fights in raids. `away` is true for an expedition only.
   */
  busy: { kind: 'expedition' | 'job'; id: string } | null;
  /** Bait for the next level (discount applied), or null at the level cap. */
  trainCost: number | null;
  /**
   * The evolution this creature could reach. `available` is true when the evolution level is
   * reached and the player holds enough Essence right now.
   */
  evolution?: { toSpecies: string; level: number; essence: number; available: boolean };
  /**
   * The creature's finale ability (null for a species without one). `unlocked` once the creature
   * has reached `unlockLevel`. `nextId` is the stronger ability of the evolved form, if the
   * creature can still evolve into a species that has one.
   */
  ability: { id: string; unlocked: boolean; unlockLevel: number; nextId?: string } | null;
}

export interface CatchView {
  species: string;
  shiny: boolean;
  outcome: 'new' | 'fused' | 'converted';
  /** Only for outcome 'fused': the creature's fusion count after this catch. */
  fusionCount?: number;
  /** Only for outcome 'converted': the Bait granted. */
  bait?: number;
  firstOnServer: boolean;
}

export interface ExpeditionResult {
  /** True if the player recalled before the expedition ended. */
  recalled: boolean;
  catches: CatchView[];
  /**
   * Parts and maybe a blueprint the trip brought back (a recall brings back the share of the scrap
   * that was caught). Absent in results stored before gear existed.
   */
  loot?: GrantView;
}

export interface ExpeditionView {
  id: string;
  creatureId: string;
  duration: DurationId;
  supplies: SuppliesId;
  rolls: number;
  cost: number;
  startedAt: number;
  endsAt: number;
  status: 'active' | 'claimed';
  claimedAt: number | null;
  result: ExpeditionResult | null;
}

export interface ServerFirstView {
  kind: Exclude<ServerFirstKind, 'jackpot'>;
  species: string;
  at: number;
  /** True if the signed-in player shares this record. */
  mine: boolean;
  /** Display names of everyone who got the species in the first drop. */
  holders: string[];
}

export interface PlayerState {
  serverNow: number;
  balances: Record<Currency, number>;
  starterChosen: boolean;
  /** Species ids the player may pick from; only present until a starter is chosen. */
  starterOptions?: string[];
  creatures: CreatureView[];
  expeditions: ExpeditionView[];
  slots: { total: number; used: number };
  /** Median over players of their highest creature level; null while nobody has a creature. */
  trainingMedianLevel: number | null;
  serverFirsts: ServerFirstView[];
}

export interface CollectionDeps {
  storage: LedgerStorage;
  now: () => number;
  rng: Rng;
  /**
   * Live randomness for the quirk of a new creature. Separate from `rng`, so a quirk never
   * consumes the draws of a catch.
   */
  quirkRng: Rng;
  /**
   * Live randomness for the loot of an expedition (parts, blueprints). Separate from `rng`, so loot
   * never consumes the draws of a catch.
   */
  gearRng: Rng;
  /** The analytics event log. Optional: without it nothing is logged. */
  analytics?: Analytics;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  const lower = sorted[mid - 1];
  if (upper === undefined) return null;
  if (sorted.length % 2 === 1 || lower === undefined) return upper;
  return (lower + upper) / 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A stored apply-result is trusted only as far as the fields the replay check reads. */
function storedString(result: unknown, key: string): string | undefined {
  if (!isRecord(result)) return undefined;
  const value = result[key];
  return typeof value === 'string' ? value : undefined;
}

export class Collection {
  constructor(private readonly deps: CollectionDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private atomically<T>(fn: () => T): Outcome<T> {
    try {
      return { ok: true, value: this.deps.storage.transactionSync(fn) };
    } catch (err) {
      if (err instanceof CollectionError) {
        return {
          ok: false,
          status: err.status,
          error: err.code,
          ...(err.reason === undefined ? {} : { reason: err.reason }),
        };
      }
      throw err;
    }
  }

  // --- Reads ---

  private creatureRows(userId: string): CreatureRow[] {
    return this.sql
      .exec<CreatureRow>(
        'SELECT * FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
        userId,
      )
      .toArray();
  }

  private ownedCreature(userId: string, creatureId: string): CreatureRow {
    const row = this.sql
      .exec<CreatureRow>('SELECT * FROM creatures WHERE id = ? AND user_id = ?', creatureId, userId)
      .toArray()[0];
    // Same answer for "does not exist" and "belongs to someone else".
    if (row === undefined) throw new CollectionError(404, 'not_found');
    return row;
  }

  private starterSpecies(userId: string): string | null {
    const row = this.sql
      .exec<{
        starter_species: string | null;
      }>('SELECT starter_species FROM player_progress WHERE user_id = ?', userId)
      .toArray()[0];
    return row?.starter_species ?? null;
  }

  /** Median of each player's highest creature level, or null when nobody has a creature. */
  trainingMedianLevel(): number | null {
    const tops = this.sql
      .exec<{ top: number }>('SELECT MAX(level) AS top FROM creatures GROUP BY user_id')
      .toArray()
      .map((r) => r.top);
    return median(tops);
  }

  private activeCount(userId: string): number {
    return this.sql
      .exec<{
        n: number;
      }>("SELECT COUNT(*) AS n FROM expeditions WHERE user_id = ? AND status = 'active'", userId)
      .one().n;
  }

  private creatureView(
    row: CreatureRow,
    medianLevel: number | null,
    essence: number,
    worn: GearRow | undefined,
    jobId: string | undefined,
  ): CreatureView {
    const species = speciesOf(row.species);
    const away = row.away_expedition_id !== null;
    const stats = effectiveStats(species, row.level, row.fusion_count);
    const trainable = canTrain({ level: row.level, levelCap: species.levelCap, away: false });
    const abilityId = species.ability?.id;
    const nextAbilityId =
      species.evolvesTo === undefined
        ? undefined
        : speciesOf(species.evolvesTo.species).ability?.id;
    return {
      id: row.id,
      species: species.id,
      line: species.line,
      level: row.level,
      levelCap: species.levelCap,
      fusionCount: row.fusion_count,
      shiny: row.shiny === 1,
      nickname: row.nickname,
      away,
      origin: row.origin,
      caughtAt: row.caught_at,
      quirk: row.quirk_id !== null && quirkText(row.quirk_id) !== undefined ? row.quirk_id : null,
      stats,
      statsWithGear: applyGear(
        stats,
        species.crit,
        species.role,
        species.element,
        worn === undefined ? null : rowToItem(worn),
      ).stats,
      gear:
        worn === undefined
          ? null
          : {
              id: worn.id,
              baseId: worn.base_id,
              rarity: worn.rarity,
              level: worn.level,
              enchantId: worn.enchant_id,
            },
      busy: away
        ? { kind: 'expedition', id: row.away_expedition_id as string }
        : jobId === undefined
          ? null
          : { kind: 'job', id: jobId },
      ability:
        abilityId === undefined
          ? null
          : {
              id: abilityId,
              unlocked: row.level >= RULES.abilities.unlockLevel,
              unlockLevel: RULES.abilities.unlockLevel,
              ...(nextAbilityId === undefined ? {} : { nextId: nextAbilityId }),
            },
      trainCost: trainable
        ? discountedTrainingCost(row.level, medianLevel ?? Number.NEGATIVE_INFINITY)
        : null,
      ...(species.evolvesTo === undefined
        ? {}
        : {
            evolution: {
              toSpecies: species.evolvesTo.species,
              level: species.evolvesTo.level,
              essence: species.evolvesTo.essence,
              available:
                row.level >= species.evolvesTo.level && essence >= species.evolvesTo.essence,
            },
          }),
    };
  }

  private expeditionView(row: ExpeditionRow): ExpeditionView {
    let result: ExpeditionResult | null = null;
    if (row.result !== null) {
      try {
        result = JSON.parse(row.result) as ExpeditionResult;
      } catch {
        result = null;
      }
    }
    return {
      id: row.id,
      creatureId: row.creature_id,
      duration: row.duration,
      supplies: row.supplies,
      rolls: row.rolls,
      cost: row.cost,
      startedAt: row.started_at,
      endsAt: row.ends_at,
      status: row.status,
      claimedAt: row.claimed_at,
      result,
    };
  }

  private expeditionRow(userId: string, id: string): ExpeditionRow {
    const row = this.sql
      .exec<ExpeditionRow>('SELECT * FROM expeditions WHERE id = ? AND user_id = ?', id, userId)
      .toArray()[0];
    if (row === undefined) throw new CollectionError(404, 'not_found');
    return row;
  }

  /** The jackpot record is stored but never listed: the jackpot is hidden from players. */
  private serverFirsts(userId: string): ServerFirstView[] {
    const rows = this.sql
      .exec<{
        kind: Exclude<ServerFirstKind, 'jackpot'>;
        species: string;
        user_id: string;
        at: number;
        display_name: string | null;
      }>(
        `SELECT f.kind, f.species, f.user_id, f.at, p.display_name
         FROM server_firsts f LEFT JOIN players p ON p.user_id = f.user_id
         WHERE f.kind != 'jackpot'
         ORDER BY f.at, f.kind, f.species, f.user_id`,
      )
      .toArray();
    const groups = new Map<string, ServerFirstView>();
    for (const row of rows) {
      const key = `${row.kind}:${row.species}`;
      let group = groups.get(key);
      if (group === undefined) {
        group = { kind: row.kind, species: row.species, at: row.at, mine: false, holders: [] };
        groups.set(key, group);
      }
      group.holders.push(row.display_name ?? 'Unknown');
      if (row.user_id === userId) group.mine = true;
    }
    return [...groups.values()];
  }

  /** Everything the Activity needs to draw the player's game. Never includes other players' creatures. */
  state(userId: string): PlayerState {
    const medianLevel = this.trainingMedianLevel();
    const starterChosen = this.starterSpecies(userId) !== null;
    const balances = getBalances(this.sql, userId);
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
    const worn = equippedByCreature(this.sql, userId);
    const jobs = openJobsByCreature(this.sql, userId);
    return {
      serverNow: this.deps.now(),
      balances,
      starterChosen,
      ...(starterChosen
        ? {}
        : { starterOptions: content.creatures.filter((c) => c.starter).map((c) => c.id) }),
      creatures: this.creatureRows(userId).map((row) =>
        this.creatureView(row, medianLevel, balances.essence, worn.get(row.id), jobs.get(row.id)),
      ),
      expeditions: [...active, ...claimed].map((row) => this.expeditionView(row)),
      slots: { total: EXPEDITION_SLOTS, used: active.length },
      trainingMedianLevel: medianLevel,
      serverFirsts: this.serverFirsts(userId),
    };
  }

  // --- Starter ---

  /**
   * Picks the starter (once per player). Not a "catch": it does not create a first-on-server
   * record. The caller has already checked that `species` is a starter.
   */
  chooseStarter(userId: string, speciesId: string): Outcome<{ creatureId: string }> {
    return this.atomically(() => {
      const species = speciesOf(speciesId);
      if (!species.starter) throw new CollectionError(400, 'invalid_species');
      if (this.starterSpecies(userId) !== null) {
        throw new CollectionError(409, 'starter_already_chosen');
      }
      const creatureId = crypto.randomUUID();
      this.sql.exec(
        `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at, quirk_id)
         VALUES (?, ?, ?, ?, 1, 'starter', ?, ?)`,
        creatureId,
        userId,
        species.line,
        species.id,
        this.deps.now(),
        pickQuirk(species.id, this.deps.quirkRng),
      );
      this.sql.exec(
        `INSERT INTO player_progress (user_id, starter_species) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET starter_species = excluded.starter_species`,
        userId,
        species.id,
      );
      this.deps.analytics?.record({ kind: 'starter_chosen', species: species.id }, userId);
      return { creatureId };
    });
  }

  // --- Expeditions ---

  startExpedition(
    userId: string,
    input: {
      creatureId: string;
      duration: DurationId;
      supplies: SuppliesId;
      idempotencyKey: string;
    },
  ): Outcome<ExpeditionView> {
    return this.atomically(() => {
      const creature = this.ownedCreature(userId, input.creatureId);
      const prior = lookupSpend(this.sql, userId, input.idempotencyKey);
      if (prior === null) {
        if (creature.away_expedition_id !== null) throw new CollectionError(409, 'creature_away');
        // One activity at a time: a creature on a workshop job cannot go on an expedition.
        if (openJobOf(this.sql, creature.id) !== null) {
          throw new CollectionError(409, 'creature_on_job');
        }
        if (this.activeCount(userId) >= EXPEDITION_SLOTS) {
          throw new CollectionError(409, 'slots_full');
        }
      }
      const now = this.deps.now();
      const cost = expeditionCost(input.duration, input.supplies);
      const spent = spend(
        this.deps.storage,
        {
          userId,
          currency: 'bait',
          amount: cost,
          purpose: 'expedition',
          idempotencyKey: input.idempotencyKey,
          apply: () => {
            const id = crypto.randomUUID();
            this.sql.exec(
              `INSERT INTO expeditions
                 (id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
              id,
              userId,
              creature.id,
              input.duration,
              input.supplies,
              expeditionRolls(input.duration),
              cost,
              now,
              now + expeditionDurationMs(input.duration),
            );
            this.sql.exec(
              'UPDATE creatures SET away_expedition_id = ? WHERE id = ?',
              id,
              creature.id,
            );
            // Only a first execution gets here: a replayed key returns the stored result unlogged.
            this.deps.analytics?.record(
              {
                kind: 'expedition_send',
                species: creature.species,
                duration: input.duration,
                supplies: input.supplies,
                cost,
              },
              userId,
            );
            return { expeditionId: id, creatureId: creature.id };
          },
        },
        now,
      );
      switch (spent.status) {
        case 'insufficient_funds':
          throw new CollectionError(409, 'insufficient_funds');
        case 'key_conflict':
          throw new CollectionError(409, 'key_conflict');
        case 'replayed': {
          // Same key, different request: refuse instead of returning an unrelated expedition.
          const view = this.expeditionView(this.expeditionRow(userId, spent.result.expeditionId));
          if (
            view.creatureId !== creature.id ||
            view.duration !== input.duration ||
            view.supplies !== input.supplies
          ) {
            throw new CollectionError(409, 'key_conflict');
          }
          return view;
        }
        case 'ok':
          return this.expeditionView(this.expeditionRow(userId, spent.result.expeditionId));
      }
    });
  }

  /**
   * Finishes (or recalls) an expedition and rolls its catches in one transaction. Claiming again
   * returns the stored result: no second roll, no second payout.
   */
  claimExpedition(userId: string, expeditionId: string): Outcome<ExpeditionResult> {
    return this.atomically(() => {
      const expedition = this.expeditionRow(userId, expeditionId);
      if (expedition.status === 'claimed') {
        const stored = this.expeditionView(expedition).result;
        if (stored === null) throw new Error('claimed expedition has no stored result');
        return stored;
      }

      const now = this.deps.now();
      const explorer = this.ownedCreature(userId, expedition.creature_id);
      const count = recallCatches(expedition.rolls, expedition.started_at, expedition.ends_at, now);
      const progress = this.sql
        .exec<{ expeditions_claimed: number; dupe_streak: number }>(
          'SELECT expeditions_claimed, dupe_streak FROM player_progress WHERE user_id = ?',
          userId,
        )
        .toArray()[0] ?? { expeditions_claimed: 0, dupe_streak: 0 };
      const owned = new Set(this.creatureRows(userId).map((c) => c.line));

      // Rolled now, at claim time, from the live RNG: nothing is decided earlier.
      const rolled = rollCatches(this.deps.rng, count, {
        content,
        supplies: expedition.supplies,
        explorerElement: speciesOf(explorer.species).element,
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
      this.sql.exec(
        'UPDATE creatures SET away_expedition_id = NULL WHERE id = ? AND away_expedition_id = ?',
        explorer.id,
        expedition.id,
      );
      const recalled = now < expedition.ends_at;
      // Parts and maybe a blueprint, from their own live RNG (the catches above used `rng`).
      const loot = grantExpeditionLoot(
        {
          storage: this.deps.storage,
          now: this.deps.now,
          rng: this.deps.gearRng,
          analytics: this.deps.analytics,
        },
        userId,
        expedition.id,
        expedition.duration,
        speciesOf(explorer.species).element,
        { completed: !recalled, caught: count, rolls: expedition.rolls },
      );
      const result: ExpeditionResult = { recalled, catches, loot };
      this.sql.exec(
        `UPDATE expeditions SET status = 'claimed', claimed_at = ?, result = ?
         WHERE id = ? AND status = 'active'`,
        now,
        JSON.stringify(result),
        expedition.id,
      );
      this.logClaim(userId, expedition, result, now);
      return result;
    });
  }

  /** One `expedition_claim` or `expedition_recall` event per claim that actually paid out. */
  private logClaim(
    userId: string,
    expedition: ExpeditionRow,
    result: ExpeditionResult,
    now: number,
  ): void {
    const analytics = this.deps.analytics;
    if (analytics === undefined) return;
    const catches: CatchProps[] = result.catches.map((c) => ({
      species: c.species,
      rarity: speciesOf(c.species).rarity,
      shiny: c.shiny,
      result: c.outcome,
    }));
    const base = { duration: expedition.duration, supplies: expedition.supplies, catches };
    if (result.recalled) {
      const length = Math.max(1, expedition.ends_at - expedition.started_at);
      const elapsedPct = Math.floor(((now - expedition.started_at) * 100) / length);
      analytics.record({ kind: 'expedition_recall', ...base, elapsedPct }, userId);
    } else {
      const waitedMin = Math.floor((now - expedition.ends_at) / 60_000);
      analytics.record({ kind: 'expedition_claim', ...base, waitedMin }, userId);
    }
  }

  private applyCatch(
    userId: string,
    expeditionId: string,
    index: number,
    caught: { species: CreatureSpecies; shiny: boolean },
    now: number,
  ): CatchView {
    const { species } = caught;
    const existing = this.sql
      .exec<CreatureRow>(
        'SELECT * FROM creatures WHERE user_id = ? AND line = ?',
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
    const firstOnServer = this.recordFirst('catch', species.id, userId, expeditionId, now);
    const base = { species: species.id, shiny: caught.shiny, firstOnServer };

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
      case 'converted':
        if (existing === undefined) throw new Error('conversion without a creature');
        if (outcome.becameShiny) {
          this.sql.exec('UPDATE creatures SET shiny = 1 WHERE id = ?', existing.id);
        }
        // Nested inside the claim transaction: the credit rolls back with it, and the key makes a
        // repeat a no-op.
        credit(
          this.deps.storage,
          {
            userId,
            currency: 'bait',
            amount: outcome.bait,
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
            bait: outcome.bait,
          },
          userId,
        );
        return { ...base, outcome: 'converted', bait: outcome.bait };
    }
  }

  /** See `recordServerFirst`. Returns true if this user holds the record now. */
  private recordFirst(
    kind: ServerFirstKind,
    species: string,
    userId: string,
    dropId: string,
    at: number,
  ): boolean {
    return recordServerFirst(this.sql, kind, species, userId, dropId, at);
  }

  // --- Training ---

  train(userId: string, creatureId: string, idempotencyKey: string): Outcome<{ level: number }> {
    return this.atomically(() => {
      const creature = this.ownedCreature(userId, creatureId);
      const species = speciesOf(creature.species);
      const prior = lookupSpend(this.sql, userId, idempotencyKey);
      let amount: number;
      if (prior === null) {
        if (creature.away_expedition_id !== null) throw new CollectionError(409, 'creature_away');
        if (!canTrain({ level: creature.level, levelCap: species.levelCap, away: false })) {
          throw new CollectionError(409, 'level_cap');
        }
        amount = discountedTrainingCost(
          creature.level,
          this.trainingMedianLevel() ?? Number.NEGATIVE_INFINITY,
        );
      } else {
        // A retry is not re-priced: the level (and so the price) has moved on since.
        amount = prior.amount;
      }
      const spent = spend(
        this.deps.storage,
        {
          userId,
          currency: 'bait',
          amount,
          purpose: 'training',
          idempotencyKey,
          apply: () => {
            const row = this.sql
              .exec<{
                level: number;
              }>('UPDATE creatures SET level = level + 1 WHERE id = ? RETURNING level', creature.id)
              .one();
            this.deps.analytics?.record(
              { kind: 'train', species: creature.species, level: row.level, cost: amount },
              userId,
            );
            return { creatureId: creature.id, level: row.level };
          },
        },
        this.deps.now(),
      );
      switch (spent.status) {
        case 'insufficient_funds':
          throw new CollectionError(409, 'insufficient_funds');
        case 'key_conflict':
          throw new CollectionError(409, 'key_conflict');
        case 'replayed':
          if (
            prior?.purpose !== 'training' ||
            storedString(spent.result, 'creatureId') !== creature.id
          ) {
            throw new CollectionError(409, 'key_conflict');
          }
          return { level: spent.result.level };
        case 'ok':
          return { level: spent.result.level };
      }
    });
  }

  // --- Evolution ---

  /**
   * Evolves a stage-1 creature at its evolution level for Essence. The species switches to the
   * stage-2 species; level, fusion, shininess, nickname and quirk stay. The first evolution of a line on
   * the server records "first on server" (kind `evolve`, keyed by the stage-2 species). A retry
   * with the same key returns the stored result and charges nothing.
   */
  evolve(
    userId: string,
    creatureId: string,
    idempotencyKey: string,
  ): Outcome<{ creatureId: string; species: string; firstOnServer: boolean }> {
    return this.atomically(() => {
      const creature = this.ownedCreature(userId, creatureId);
      const prior = lookupSpend(this.sql, userId, idempotencyKey);
      let amount: number;
      let target: string | null = null;
      if (prior === null) {
        const evolvesTo = speciesOf(creature.species).evolvesTo;
        if (evolvesTo === undefined) throw new CollectionError(409, 'not_evolvable');
        if (creature.level < evolvesTo.level) throw new CollectionError(409, 'level_too_low');
        amount = evolvesTo.essence;
        target = evolvesTo.species;
      } else {
        // A retry is not re-checked: the creature has already evolved.
        amount = prior.amount;
      }
      const now = this.deps.now();
      const spent = spend(
        this.deps.storage,
        {
          userId,
          currency: 'essence',
          amount,
          purpose: 'evolution',
          idempotencyKey,
          apply: () => {
            if (target === null) throw new Error('evolution without a target');
            this.sql.exec('UPDATE creatures SET species = ? WHERE id = ?', target, creature.id);
            const firstOnServer = this.recordFirst(
              'evolve',
              target,
              userId,
              `evolve:${creature.id}`,
              now,
            );
            this.deps.analytics?.record(
              { kind: 'evolve', from: creature.species, to: target, cost: amount },
              userId,
            );
            return { creatureId: creature.id, species: target, firstOnServer };
          },
        },
        now,
      );
      switch (spent.status) {
        case 'insufficient_funds':
          throw new CollectionError(409, 'insufficient_funds');
        case 'key_conflict':
          throw new CollectionError(409, 'key_conflict');
        case 'replayed':
          if (
            prior?.purpose !== 'evolution' ||
            storedString(spent.result, 'creatureId') !== creature.id
          ) {
            throw new CollectionError(409, 'key_conflict');
          }
          return spent.result;
        case 'ok':
          return spent.result;
      }
    });
  }

  // --- Nicknames ---

  /** `null` or empty clears the nickname. Only the sanitised text is stored. */
  setNickname(
    userId: string,
    creatureId: string,
    raw: string | null,
  ): Outcome<{ nickname: string | null }> {
    return this.atomically(() => {
      const creature = this.ownedCreature(userId, creatureId);
      let value: string | null = null;
      if (raw !== null) {
        const clean = sanitizeNickname(raw);
        if (!clean.ok) throw new CollectionError(400, 'invalid_nickname', clean.reason);
        value = clean.value;
      }
      this.sql.exec('UPDATE creatures SET nickname = ? WHERE id = ?', value, creature.id);
      return { nickname: value };
    });
  }
}
