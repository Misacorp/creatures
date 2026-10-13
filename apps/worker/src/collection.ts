/**
 * The collection game logic of a guild: starters, creatures, expeditions, training, nicknames and
 * "first on server" records. Everything here is synchronous and runs inside `transactionSync`, so
 * a check and the writes that depend on it can never be interleaved with another request.
 *
 * The user is always an argument supplied from the verified session, never from a request body.
 */
import {
  applyGear,
  canTrain,
  RULES,
  content,
  discountedTrainingCost,
  effectiveStats,
  pickQuirk,
  quirkText,
  sanitizeNickname,
  type GearRarity,
  type Rng,
  type Stats,
} from '@creatures/game';
import type { Analytics } from './analytics';
import type { DevFlags } from './dev-state';
import {
  Expeditions,
  type CancelledView,
  type ExpeditionResult,
  type ExpeditionView,
  type ExplorerView,
  type SendInput,
  type SlotsView,
} from './expeditions';
import { equippedByCreature, openJobsByCreature, rowToItem, type GearRow } from './gear-store';
import { getBalances, lookupSpend, spend, type Currency, type LedgerStorage } from './ledger';
import { CollectionError, atomically, type Outcome } from './outcome';
import { recordServerFirst, type ServerFirstKind } from './server-firsts';
import { speciesOf } from './species';

export { speciesOf } from './species';
export type { ErrorStatus, Outcome } from './outcome';
export type { CatchView, ExpeditionResult, ExpeditionView, SendInput } from './expeditions';

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
  /** The creature's explorer rank, XP and finished trips (expeditions are about creatures, not the account). */
  explorer: ExplorerView;
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
  /** Trips cancelled by the slot wipe when expeditions v2 started (newest first, at most 3). */
  cancelled: CancelledView[];
  /** Expedition slots: how many there are, how many are used and what opens the next one. */
  slots: SlotsView;
  /** Supplies in stock: supply id to amount. */
  supplies: Record<string, number>;
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
  /**
   * Live randomness for the end-of-trip choice, push-on results and the journal. Separate from `rng`,
   * so none of them ever consumes the draws of a catch.
   */
  tripRng: Rng;
  /** The analytics event log. Optional: without it nothing is logged. */
  analytics?: Analytics;
  /** The dev tools' force flags (staging only); passed on to expeditions. */
  dev?: DevFlags | undefined;
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
  /** Expeditions: sending, the end-of-trip choice, claiming and their views. */
  readonly trips: Expeditions;

  constructor(private readonly deps: CollectionDeps) {
    this.trips = new Expeditions({
      storage: deps.storage,
      now: deps.now,
      rng: deps.rng,
      tripRng: deps.tripRng,
      gearRng: deps.gearRng,
      quirkRng: deps.quirkRng,
      analytics: deps.analytics,
      dev: deps.dev,
    });
  }

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private atomically<T>(fn: () => T): Outcome<T> {
    return atomically(this.deps.storage, fn);
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

  private creatureView(
    row: CreatureRow,
    medianLevel: number | null,
    essence: number,
    worn: GearRow | undefined,
    jobId: string | undefined,
    explorer: ExplorerView,
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
      explorer,
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
    const trips = this.trips.state(userId);
    const worn = equippedByCreature(this.sql, userId);
    const jobs = openJobsByCreature(this.sql, userId);
    const rows = this.creatureRows(userId);
    const explorers = this.trips.explorerViews(
      userId,
      rows.map((row) => row.id),
    );
    return {
      serverNow: this.deps.now(),
      balances,
      starterChosen,
      ...(starterChosen
        ? {}
        : { starterOptions: content.creatures.filter((c) => c.starter).map((c) => c.id) }),
      creatures: rows.map((row) =>
        this.creatureView(
          row,
          medianLevel,
          balances.essence,
          worn.get(row.id),
          jobs.get(row.id),
          explorers.get(row.id) as ExplorerView,
        ),
      ),
      expeditions: trips.expeditions,
      cancelled: trips.cancelled,
      slots: trips.slots,
      supplies: trips.supplies,
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

  /** Sends a creature on an expedition (see `Expeditions.send`). */
  startExpedition(userId: string, input: SendInput, timezone: string): Outcome<ExpeditionView> {
    return this.trips.send(userId, input, timezone);
  }

  /** Claims (or recalls) an expedition (see `Expeditions.claim`). */
  claimExpedition(userId: string, expeditionId: string): Outcome<ExpeditionResult> {
    return this.trips.claim(userId, expeditionId);
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
