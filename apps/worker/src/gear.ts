/**
 * Gear and the workshop of a guild: the player's items, parts, blueprints, jobs and Crafting skill, and
 * the actions on them (equip, upgrade, dismantle, start and claim a job). Everything is synchronous and
 * runs inside `transactionSync`, so a check and the writes that depend on it can never be interleaved
 * with another request. The user is always an argument from the verified session.
 *
 * Idempotency: upgrade, dismantle, start job and claim job carry the client's key. `gear_actions`
 * stores the result under (player, key) with a fingerprint of what the action was, so a retry returns
 * the stored result, and the same key on a different action is a `key_conflict`. The Essence an upgrade
 * costs goes through the ledger's `spend` (balance check, debit and upgrade in one transaction).
 *
 * Randomness: improve and craft results are drawn with the live RNG at the moment the job is claimed,
 * never when it starts, and a claimed job stores its result and never rolls again.
 */
import {
  RULES,
  craftCost,
  craftRarity,
  dismantleYield,
  gearBase,
  enchantCost,
  enchantDef,
  improveCost,
  itemEnchantActive,
  jobDuration,
  jobXp,
  nextSkillXp,
  rerollSecondary,
  rollGear,
  skillLevel,
  supplyDef,
  supplyJobMs,
  supplyJobXp,
  partsOfSpec,
  upgradeCost,
  PART_KINDS,
  type GearJobKind,
  type GearRarity,
  type GearStat,
  type JobKind,
  type PartKind,
  type PartsBundle,
  type Rng,
} from '@creatures/game';
import type { Analytics } from './analytics';
import { speciesOf } from './collection';
import { runKeyed, settleSpend } from './keyed-action';
import { GameError, atomically, type Outcome } from './outcome';
import { addSupply } from './expedition-store';
import { grantWelcomeKit, recentGrants, type GrantRecord } from './gear-grants';
import {
  addCreatureXp,
  countItems,
  creatureXp,
  creditParts,
  debitParts,
  findItem,
  getParts,
  hasParts,
  hasRoom,
  insertItem,
  knowsBlueprint,
  knownBlueprints,
  openJobCount,
  openJobOf,
  ownedItems,
  parseRolls,
  primaryOf,
  rowToItem,
  type GearRow,
  type JobRow,
} from './gear-store';
import { getBalances, spend, type Currency, type LedgerStorage } from './ledger';

/** The gear rarity a supply tier is logged as (analytics) and a supply job is sized as. */
const SUPPLY_RARITY = { basic: 'common', good: 'rare', great: 'epic' } as const;

function failSupply(): never {
  throw new Error('stored supply job has an unknown supply');
}

/** Finished jobs shown besides the open ones. */
const RECENT_CLAIMED_JOBS = 5;
/** Recent grants shown (the loot reveals read from them). */
const RECENT_GRANTS = 20;
/** Stored action results are kept this long; a retry comes within minutes. */
const ACTION_RETENTION_MS = 30 * 86_400_000;

export interface GearDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness for job results and the welcome kit. Crypto in production. */
  rng: Rng;
  analytics?: Analytics | undefined;
}

// --- Views ---

export interface GearItemView {
  id: string;
  baseId: string;
  rarity: GearRarity;
  level: number;
  maxLevel: number;
  /** The main stat now: the roll plus the upgrade steps, in basis points (crit stats: crit points x 100). */
  primary: { stat: GearStat; bp: number };
  secondaries: { stat: GearStat; bp: number }[];
  enchantId: string | null;
  /** Whether the enchant works for the wearer; null when nobody wears the item or it has no enchant. */
  enchantActive: boolean | null;
  equippedOn: string | null;
  /** The open workshop job that has this item (improve or enchant), or null. */
  jobId: string | null;
  /** The next upgrade's price, or null at the top level. */
  upgradeCost: { essence: number; scrap: number } | null;
  /** What dismantling it returns now. */
  dismantle: PartsBundle;
  source: string;
  createdAt: number;
}

export interface EquippedSummary {
  id: string;
  baseId: string;
  rarity: GearRarity;
  level: number;
  enchantId: string | null;
}

export interface JobCommon {
  /** XP this job gave to the creature's Crafting skill. */
  xp: number;
  /** Total Crafting XP and level after it. */
  skillXp: number;
  skillLevel: number;
  leveledUp: boolean;
}

export type JobResult =
  | ({
      kind: 'craft';
      gearId: string;
      baseId: string;
      rarity: GearRarity;
      /** The craft came out one rarity above its blueprint. */
      upgraded: boolean;
    } & JobCommon)
  | ({
      kind: 'improve';
      gearId: string;
      baseId: string;
      secondaryIndex: number;
      from: { stat: GearStat; bp: number };
      to: { stat: GearStat; bp: number };
    } & JobCommon)
  | ({ kind: 'enchant'; gearId: string; baseId: string; enchantId: string } & JobCommon)
  | ({
      kind: 'supply';
      /** The supply crafted and how many came out. */
      supplyId: string;
      amount: number;
    } & JobCommon);

export interface JobView {
  id: string;
  creatureId: string;
  kind: JobKind;
  /** What the job works on: the base crafted, or the item and the choice made. */
  input: {
    baseId?: string;
    gearId?: string;
    enchantId?: string;
    secondaryIndex?: number;
    supplyId?: string;
  };
  /** The parts it cost when it started. */
  cost: PartsBundle;
  startedAt: number;
  endsAt: number;
  status: 'running' | 'ready' | 'claimed';
  claimedAt: number | null;
  result: JobResult | null;
}

export interface SkillView {
  creatureId: string;
  xp: number;
  level: number;
  /** Total XP of the next level, or null at the top. */
  nextLevelXp: number | null;
}

export interface GearState {
  serverNow: number;
  balances: Record<Currency, number>;
  inventory: { cap: number; used: number; reserved: number };
  items: GearItemView[];
  parts: Record<PartKind, number>;
  blueprints: { baseId: string; rarity: GearRarity; learnedAt: number }[];
  jobs: JobView[];
  slots: { total: number; used: number };
  skills: SkillView[];
  /** Newest loot first: keys are `raid:<week>:<phase>`, `festival:<week>`, `expedition:<id>` and `welcome`. */
  grants: GrantRecord[];
}

export type StartJobInput =
  | { kind: 'craft'; creatureId: string; blueprintId: string; idempotencyKey: string }
  | {
      kind: 'improve';
      creatureId: string;
      gearId: string;
      secondaryIndex: number;
      idempotencyKey: string;
    }
  | {
      kind: 'enchant';
      creatureId: string;
      gearId: string;
      enchantId: string;
      idempotencyKey: string;
    }
  | { kind: 'supply'; creatureId: string; supplyId: string; idempotencyKey: string };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

interface StoredInput {
  baseId?: string;
  /** The rarity the duration and XP follow: the blueprint's, or the item's. */
  rarity: GearRarity;
  gearId?: string;
  enchantId?: string;
  secondaryIndex?: number;
  supplyId?: string;
  cost: PartsBundle;
}

const sumShards = (bundle: PartsBundle): number =>
  PART_KINDS.filter((k) => k.endsWith('-shard')).reduce((n, k) => n + (bundle[k] ?? 0), 0);

export class Gear {
  constructor(private readonly deps: GearDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private atomically<T>(fn: () => T): Outcome<T> {
    return atomically(this.deps.storage, fn);
  }

  /** Deletes stored action results older than 30 days. Called from the guild alarm. */
  prune(): void {
    this.sql.exec(
      'DELETE FROM gear_actions WHERE created_at < ?',
      this.deps.now() - ACTION_RETENTION_MS,
    );
  }

  // --- Reads ---

  private jobRow(userId: string, id: string): JobRow {
    const row = this.sql
      .exec<JobRow>('SELECT * FROM workshop_jobs WHERE id = ? AND user_id = ?', id, userId)
      .toArray()[0];
    // Same answer for "does not exist" and "belongs to someone else".
    if (row === undefined) throw new GameError(404, 'not_found');
    return row;
  }

  private ownedItem(userId: string, id: string): GearRow {
    const row = findItem(this.sql, userId, id);
    if (row === undefined) throw new GameError(404, 'not_found');
    return row;
  }

  private ownedCreature(
    userId: string,
    id: string,
  ): { id: string; species: string; away_expedition_id: string | null } {
    const row = this.sql
      .exec<{ id: string; species: string; away_expedition_id: string | null }>(
        'SELECT id, species, away_expedition_id FROM creatures WHERE id = ? AND user_id = ?',
        id,
        userId,
      )
      .toArray()[0];
    if (row === undefined) throw new GameError(404, 'not_found');
    return row;
  }

  private itemView(row: GearRow, jobId: string | null): GearItemView {
    const item = rowToItem(row);
    const wearerSpecies =
      row.equipped_on === null ? null : speciesOf(wearerSpeciesId(this.sql, row.equipped_on));
    return {
      id: row.id,
      baseId: row.base_id,
      rarity: row.rarity,
      level: row.level,
      maxLevel: RULES.gear.maxLevel,
      primary: primaryOf(item),
      secondaries: item.rolls.secondary.map((s) => ({ ...s })),
      enchantId: row.enchant_id,
      enchantActive:
        row.enchant_id === null || wearerSpecies === null
          ? null
          : itemEnchantActive(item, wearerSpecies.role, wearerSpecies.element),
      equippedOn: row.equipped_on,
      jobId,
      upgradeCost: upgradeCost(item),
      dismantle: dismantleYield(item),
      source: row.source,
      createdAt: row.created_at,
    };
  }

  private jobView(row: JobRow, now: number): JobView {
    const input = JSON.parse(row.input_json) as StoredInput;
    let result: JobResult | null = null;
    if (row.result_json !== null) result = JSON.parse(row.result_json) as JobResult;
    return {
      id: row.id,
      creatureId: row.creature_id,
      kind: row.kind,
      input: {
        ...(input.baseId === undefined ? {} : { baseId: input.baseId }),
        ...(input.gearId === undefined ? {} : { gearId: input.gearId }),
        ...(input.enchantId === undefined ? {} : { enchantId: input.enchantId }),
        ...(input.secondaryIndex === undefined ? {} : { secondaryIndex: input.secondaryIndex }),
        ...(input.supplyId === undefined ? {} : { supplyId: input.supplyId }),
      },
      cost: input.cost,
      startedAt: row.started_at,
      endsAt: row.ends_at,
      status: row.claimed_at !== null ? 'claimed' : now >= row.ends_at ? 'ready' : 'running',
      claimedAt: row.claimed_at,
      result,
    };
  }

  /** The caller's gear, parts, blueprints, jobs, skills and recent loot. */
  state(userId: string): GearState {
    const now = this.deps.now();
    const rows = ownedItems(this.sql, userId);
    const open = this.sql
      .exec<JobRow>(
        'SELECT * FROM workshop_jobs WHERE user_id = ? AND claimed_at IS NULL ORDER BY ends_at, rowid',
        userId,
      )
      .toArray();
    const claimed = this.sql
      .exec<JobRow>(
        `SELECT * FROM workshop_jobs WHERE user_id = ? AND claimed_at IS NOT NULL
         ORDER BY claimed_at DESC, rowid DESC LIMIT ?`,
        userId,
        RECENT_CLAIMED_JOBS,
      )
      .toArray();
    const jobOfItem = new Map(
      open.flatMap((j) => (j.gear_id === null ? [] : [[j.gear_id, j.id] as const])),
    );
    const creatures = this.sql
      .exec<{ id: string }>(
        'SELECT id FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
        userId,
      )
      .toArray();
    const xps = new Map(
      this.sql
        .exec<{ creature_id: string; xp: number }>(
          'SELECT creature_id, xp FROM crafting_skill WHERE user_id = ?',
          userId,
        )
        .toArray()
        .map((r) => [r.creature_id, r.xp]),
    );
    return {
      serverNow: now,
      balances: getBalances(this.sql, userId),
      inventory: {
        cap: RULES.gear.inventoryCap,
        used: rows.length,
        reserved: open.filter((j) => j.kind === 'craft').length,
      },
      items: rows.map((row) => this.itemView(row, jobOfItem.get(row.id) ?? null)),
      parts: getParts(this.sql, userId),
      blueprints: knownBlueprints(this.sql, userId),
      jobs: [...open, ...claimed].map((row) => this.jobView(row, now)),
      slots: { total: RULES.gear.workshopSlots, used: open.length },
      skills: creatures.map((c) => {
        const xp = xps.get(c.id) ?? 0;
        const level = skillLevel(xp);
        return { creatureId: c.id, xp, level, nextLevelXp: nextSkillXp(level) };
      }),
      grants: recentGrants(this.sql, userId, RECENT_GRANTS),
    };
  }

  // --- The welcome kit ---

  /**
   * Gives the player their welcome kit on their first gear load: a common item, a common blueprint and
   * scrap. Once per player; later calls change nothing and draw nothing.
   */
  ensureWelcome(userId: string): void {
    const done = this.sql
      .exec("SELECT 1 FROM gear_grants WHERE user_id = ? AND key = 'welcome'", userId)
      .toArray();
    if (done.length > 0) return;
    this.deps.storage.transactionSync(() =>
      grantWelcomeKit(
        {
          storage: this.deps.storage,
          now: this.deps.now,
          rng: this.deps.rng,
          analytics: this.deps.analytics,
        },
        userId,
      ),
    );
  }

  // --- Equip ---

  /**
   * Puts an item on a creature, or takes it off with `creatureId` null. One item per creature: the
   * item that was there goes back to the inventory (a swap). An item that was on another creature
   * leaves it. Putting an item where it already is changes nothing and logs nothing.
   */
  equip(
    userId: string,
    gearId: string,
    creatureId: string | null,
  ): Outcome<{ item: GearItemView; unequipped: GearItemView | null }> {
    return this.atomically(() => {
      const row = this.ownedItem(userId, gearId);
      const creature = creatureId === null ? null : this.ownedCreature(userId, creatureId);
      let displaced: GearRow | undefined;
      if (creature === null) {
        if (row.equipped_on !== null) {
          const was = wearerSpeciesId(this.sql, row.equipped_on);
          this.sql.exec('UPDATE gear_items SET equipped_on = NULL WHERE id = ?', row.id);
          this.deps.analytics?.record(
            {
              kind: 'gear_equip',
              base: row.base_id,
              rarity: row.rarity,
              level: row.level,
              species: was,
              action: 'unequip',
              swap: false,
            },
            userId,
          );
        }
      } else if (row.equipped_on !== creature.id) {
        displaced = this.sql
          .exec<GearRow>('SELECT * FROM gear_items WHERE equipped_on = ?', creature.id)
          .toArray()[0];
        // Clear first: `equipped_on` is unique, so two items can never wear the same creature.
        if (displaced !== undefined) {
          this.sql.exec('UPDATE gear_items SET equipped_on = NULL WHERE id = ?', displaced.id);
        }
        this.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', creature.id, row.id);
        this.deps.analytics?.record(
          {
            kind: 'gear_equip',
            base: row.base_id,
            rarity: row.rarity,
            level: row.level,
            species: creature.species,
            action: 'equip',
            swap: displaced !== undefined,
          },
          userId,
        );
      }
      const fresh = this.ownedItem(userId, gearId);
      const open = openJobIds(this.sql, userId);
      return {
        item: this.itemView(fresh, open.get(fresh.id) ?? null),
        unequipped:
          displaced === undefined
            ? null
            : this.itemView(this.ownedItem(userId, displaced.id), open.get(displaced.id) ?? null),
      };
    });
  }

  // --- Upgrade ---

  /**
   * Raises an item one level for Essence and scrap. Never fails once paid. The balance check, both
   * debits and the new level happen in one transaction; a retry with the same key returns the stored
   * result.
   */
  upgrade(
    userId: string,
    gearId: string,
    idempotencyKey: string,
  ): Outcome<{ gearId: string; level: number }> {
    return this.atomically(() =>
      runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: idempotencyKey, kind: 'upgrade', fingerprint: gearId },
        () => {
          const row = this.ownedItem(userId, gearId);
          const item = rowToItem(row);
          const cost = upgradeCost(item);
          if (cost === null) throw new GameError(409, 'max_level');
          if (!hasParts(this.sql, userId, { scrap: cost.scrap })) {
            throw new GameError(409, 'insufficient_parts');
          }
          const spent = spend(
            this.deps.storage,
            {
              userId,
              currency: 'essence',
              amount: cost.essence,
              purpose: 'gear',
              idempotencyKey,
              apply: () => {
                if (!debitParts(this.sql, userId, { scrap: cost.scrap })) {
                  throw new Error('scrap vanished inside the upgrade transaction');
                }
                const updated = this.sql
                  .exec<{ level: number }>(
                    'UPDATE gear_items SET level = level + 1 WHERE id = ? AND level = ? RETURNING level',
                    row.id,
                    row.level,
                  )
                  .toArray()[0];
                if (updated === undefined) throw new Error('item changed inside the upgrade');
                this.deps.analytics?.record(
                  {
                    kind: 'gear_upgrade',
                    base: row.base_id,
                    rarity: row.rarity,
                    from: row.level,
                    to: updated.level,
                    essence: cost.essence,
                    scrap: cost.scrap,
                  },
                  userId,
                );
                return { gearId: row.id, level: updated.level };
              },
            },
            this.deps.now(),
          );
          return settleSpend(spent);
        },
      ),
    );
  }

  // --- Dismantle ---

  /**
   * Breaks an item into parts. An item that is being worn is taken off first (the in-page
   * confirmation is the safeguard), but an item in an open workshop job is refused: finish the job
   * first. Cannot be undone; a retry with the same key returns the stored result.
   */
  dismantle(
    userId: string,
    gearId: string,
    idempotencyKey: string,
  ): Outcome<{
    gearId: string;
    baseId: string;
    rarity: GearRarity;
    level: number;
    parts: PartsBundle;
    unequipped: boolean;
  }> {
    return this.atomically(() =>
      runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: idempotencyKey, kind: 'dismantle', fingerprint: gearId },
        () => {
          const row = this.ownedItem(userId, gearId);
          if (openJobIds(this.sql, userId).has(row.id)) throw new GameError(409, 'item_busy');
          const item = rowToItem(row);
          const parts = dismantleYield(item);
          this.sql.exec('DELETE FROM gear_items WHERE id = ?', row.id);
          creditParts(this.sql, userId, parts);
          this.deps.analytics?.record(
            {
              kind: 'gear_dismantle',
              base: row.base_id,
              rarity: row.rarity,
              level: row.level,
              scrap: parts.scrap ?? 0,
              shards: sumShards(parts),
              glimmer: parts.glimmer ?? 0,
              unequipped: row.equipped_on !== null,
              parts,
            },
            userId,
          );
          return {
            gearId: row.id,
            baseId: row.base_id,
            rarity: row.rarity,
            level: row.level,
            parts,
            unequipped: row.equipped_on !== null,
          };
        },
      ),
    );
  }

  // --- Workshop jobs ---

  /**
   * Starts a job on a creature that is not busy, in a free workshop slot. The parts are paid now (all
   * or nothing); the result is rolled when the job is claimed. Returns the new job's id.
   */
  startJob(userId: string, input: StartJobInput): Outcome<{ jobId: string }> {
    const fingerprint = JSON.stringify(
      input.kind === 'craft'
        ? [input.kind, input.creatureId, input.blueprintId]
        : input.kind === 'improve'
          ? [input.kind, input.creatureId, input.gearId, input.secondaryIndex]
          : input.kind === 'supply'
            ? [input.kind, input.creatureId, input.supplyId]
            : [input.kind, input.creatureId, input.gearId, input.enchantId],
    );
    return this.atomically(() =>
      runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: input.idempotencyKey, kind: 'job_start', fingerprint: fingerprint },
        () => {
          const creature = this.ownedCreature(userId, input.creatureId);
          if (creature.away_expedition_id !== null) throw new GameError(409, 'creature_away');
          if (openJobOf(this.sql, creature.id) !== null)
            throw new GameError(409, 'creature_on_job');
          if (openJobCount(this.sql, userId) >= RULES.gear.workshopSlots) {
            throw new GameError(409, 'workshop_full');
          }

          let rarity: GearRarity;
          let cost: PartsBundle;
          let baseId: string;
          let gearId: string | null = null;
          // A supply craft has its own length (its hours, less the creature's skill).
          let supplyMs: number | null = null;
          const stored: Omit<StoredInput, 'cost' | 'rarity'> = {};
          const level = skillLevel(creatureXp(this.sql, userId, creature.id));
          switch (input.kind) {
            case 'craft': {
              const base = gearBase(input.blueprintId);
              if (base === undefined) throw new GameError(400, 'invalid_blueprint');
              if (!knowsBlueprint(this.sql, userId, base.id)) {
                throw new GameError(409, 'blueprint_unknown');
              }
              if (!hasRoom(this.sql, userId)) throw new GameError(409, 'inventory_full');
              baseId = base.id;
              rarity = base.blueprint;
              cost = craftCost(base.id);
              stored.baseId = base.id;
              break;
            }
            case 'improve': {
              const row = this.ownedItem(userId, input.gearId);
              if (openJobIds(this.sql, userId).has(row.id)) throw new GameError(409, 'item_busy');
              const price = improveCost(row.rarity);
              const secondaries = parseRolls(row.rolls_json).secondary.length;
              if (price === null || secondaries === 0)
                throw new GameError(409, 'nothing_to_improve');
              if (input.secondaryIndex >= secondaries)
                throw new GameError(400, 'invalid_secondary');
              baseId = row.base_id;
              rarity = row.rarity;
              cost = price;
              gearId = row.id;
              stored.gearId = row.id;
              stored.secondaryIndex = input.secondaryIndex;
              break;
            }
            case 'enchant': {
              const row = this.ownedItem(userId, input.gearId);
              if (openJobIds(this.sql, userId).has(row.id)) throw new GameError(409, 'item_busy');
              const price = enchantCost(input.enchantId);
              if (price === null || enchantDef(input.enchantId) === undefined) {
                throw new GameError(400, 'invalid_enchant');
              }
              if (row.enchant_id === input.enchantId) throw new GameError(409, 'same_enchant');
              baseId = row.base_id;
              rarity = row.rarity;
              cost = price;
              gearId = row.id;
              stored.gearId = row.id;
              stored.enchantId = input.enchantId;
              break;
            }
            case 'supply': {
              const def = supplyDef(input.supplyId);
              if (def === undefined) throw new GameError(400, 'invalid_supply');
              // The better the supply, the higher the Crafting level its blueprint asks for.
              if (level < def.blueprint.craftingLevel) throw new GameError(409, 'skill_too_low');
              baseId = def.id;
              rarity = SUPPLY_RARITY[def.tier];
              cost = partsOfSpec(def.blueprint.parts);
              supplyMs = supplyJobMs(def, level);
              stored.supplyId = def.id;
              break;
            }
          }
          if (!debitParts(this.sql, userId, cost)) throw new GameError(409, 'insufficient_parts');

          const now = this.deps.now();
          const duration = supplyMs ?? jobDuration(input.kind as GearJobKind, rarity, level);
          const id = crypto.randomUUID();
          const row: StoredInput = { ...stored, rarity, cost };
          this.sql.exec(
            `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            id,
            userId,
            creature.id,
            input.kind,
            gearId,
            JSON.stringify(row),
            now,
            now + duration,
          );
          this.deps.analytics?.record(
            {
              kind: 'job_start',
              job: input.kind,
              base: baseId,
              rarity,
              species: creature.species,
              hours: Math.round(duration / 3_600_000),
              skillLevel: level,
              parts: cost,
            },
            userId,
          );
          return { jobId: id };
        },
      ),
    );
  }

  /**
   * Finishes a job that has run its time: rolls the result with live randomness, gives the creature
   * its Crafting XP and frees it. Claiming again (with any key) returns the stored result and rolls
   * nothing.
   */
  claimJob(userId: string, jobId: string, idempotencyKey: string): Outcome<JobResult> {
    return this.atomically(() =>
      runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: idempotencyKey, kind: 'job_claim', fingerprint: jobId },
        () => {
          const job = this.jobRow(userId, jobId);
          if (job.claimed_at !== null) {
            if (job.result_json === null) throw new Error('claimed job has no stored result');
            return JSON.parse(job.result_json) as JobResult;
          }
          const now = this.deps.now();
          if (now < job.ends_at) throw new GameError(409, 'not_ready');
          const input = JSON.parse(job.input_json) as StoredInput;
          const creature = this.ownedCreature(userId, job.creature_id);
          const before = skillLevel(creatureXp(this.sql, userId, creature.id));

          // Rolled now, at claim time, from the live RNG: nothing was decided when the job started.
          let result: DistributiveOmit<JobResult, keyof JobCommon>;
          let analyticsBase: string;
          let analyticsRarity: GearRarity;
          let upgraded = false;
          let enchant: string | null = null;
          switch (job.kind) {
            case 'craft': {
              const baseId = input.baseId;
              const base = baseId === undefined ? undefined : gearBase(baseId);
              if (base === undefined) throw new Error('stored craft has an unknown base');
              if (countItems(this.sql, userId) >= RULES.gear.inventoryCap) {
                // Cannot happen (a craft holds its place), but never lose the item if it does.
                throw new GameError(409, 'inventory_full');
              }
              const rarity = craftRarity(this.deps.rng, base.blueprint, before);
              upgraded = rarity !== base.blueprint;
              const rolls = rollGear(this.deps.rng, base.id, rarity);
              const gearId = insertItem(
                this.sql,
                userId,
                { baseId: base.id, rarity, rolls },
                'craft',
                now,
              );
              result = { kind: 'craft', gearId, baseId: base.id, rarity, upgraded };
              analyticsBase = base.id;
              analyticsRarity = rarity;
              break;
            }
            case 'improve': {
              const row =
                input.gearId === undefined ? undefined : findItem(this.sql, userId, input.gearId);
              if (row === undefined || input.secondaryIndex === undefined) {
                throw new GameError(409, 'item_gone');
              }
              const rolls = parseRolls(row.rolls_json);
              const next = rerollSecondary(this.deps.rng, row.base_id, rolls, input.secondaryIndex);
              this.sql.exec(
                'UPDATE gear_items SET rolls_json = ? WHERE id = ?',
                JSON.stringify(next),
                row.id,
              );
              result = {
                kind: 'improve',
                gearId: row.id,
                baseId: row.base_id,
                secondaryIndex: input.secondaryIndex,
                from: {
                  ...(rolls.secondary[input.secondaryIndex] as { stat: GearStat; bp: number }),
                },
                to: { ...(next.secondary[input.secondaryIndex] as { stat: GearStat; bp: number }) },
              };
              analyticsBase = row.base_id;
              analyticsRarity = row.rarity;
              break;
            }
            case 'supply': {
              const def = input.supplyId === undefined ? undefined : supplyDef(input.supplyId);
              if (def === undefined) throw new Error('stored supply job has an unknown supply');
              addSupply(this.sql, userId, def.id, def.blueprint.yield);
              result = { kind: 'supply', supplyId: def.id, amount: def.blueprint.yield };
              analyticsBase = def.id;
              analyticsRarity = SUPPLY_RARITY[def.tier];
              break;
            }
            case 'enchant': {
              const row =
                input.gearId === undefined ? undefined : findItem(this.sql, userId, input.gearId);
              if (row === undefined || input.enchantId === undefined) {
                throw new GameError(409, 'item_gone');
              }
              this.sql.exec(
                'UPDATE gear_items SET enchant_id = ? WHERE id = ?',
                input.enchantId,
                row.id,
              );
              result = {
                kind: 'enchant',
                gearId: row.id,
                baseId: row.base_id,
                enchantId: input.enchantId,
              };
              analyticsBase = row.base_id;
              analyticsRarity = row.rarity;
              enchant = input.enchantId;
              break;
            }
          }

          // XP follows the job's nominal length (the skill shortens the time, not the experience).
          const xp =
            job.kind === 'supply'
              ? supplyJobXp(supplyDef(input.supplyId ?? '') ?? failSupply())
              : jobXp(job.kind, input.rarity);
          const skillXp = addCreatureXp(this.sql, userId, creature.id, xp);
          const after = skillLevel(skillXp);
          const full = {
            ...result,
            xp,
            skillXp,
            skillLevel: after,
            leveledUp: after > before,
          };
          this.sql.exec(
            'UPDATE workshop_jobs SET claimed_at = ?, result_json = ? WHERE id = ? AND claimed_at IS NULL',
            now,
            JSON.stringify(full),
            job.id,
          );
          this.deps.analytics?.record(
            {
              kind: 'job_claim',
              job: job.kind,
              base: analyticsBase,
              rarity: analyticsRarity,
              upgraded,
              enchant,
              xp,
              skillLevel: after,
              leveledUp: after > before,
              ...(job.kind === 'supply' && result.kind === 'supply'
                ? { yield: result.amount }
                : {}),
            },
            userId,
          );
          return full;
        },
      ),
    );
  }
}

// --- Small helpers ---

function wearerSpeciesId(sql: SqlStorage, creatureId: string): string {
  const row = sql
    .exec<{ species: string }>('SELECT species FROM creatures WHERE id = ?', creatureId)
    .toArray()[0];
  if (row === undefined) throw new Error('item worn by a creature that does not exist');
  return row.species;
}

/** The player's open job ids by the item they work on. */
function openJobIds(sql: SqlStorage, userId: string): Map<string, string> {
  return new Map(
    sql
      .exec<{ id: string; gear_id: string }>(
        'SELECT id, gear_id FROM workshop_jobs WHERE user_id = ? AND claimed_at IS NULL AND gear_id IS NOT NULL',
        userId,
      )
      .toArray()
      .map((r) => [r.gear_id, r.id]),
  );
}
