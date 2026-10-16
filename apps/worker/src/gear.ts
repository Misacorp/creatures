/**
 * Gear and the workshop of a guild: the player's items, parts, blueprints, jobs and Crafting skill, and
 * the actions on them (equip, Equip best, dismantle, start and claim a job). Everything is synchronous
 * and runs inside `transactionSync`, so a check and the writes that depend on it can never be
 * interleaved with another request. The user is always an argument from the verified session.
 *
 * Idempotency: dismantle, start job and claim job carry the client's key. `gear_actions` stores the
 * result under (player, key) with a fingerprint of what the action was, so a retry returns the stored
 * result, and the same key on a different action is a `key_conflict`. Equip and Equip best change no
 * balance and repeat harmlessly, so they carry no key.
 *
 * Randomness: a craft's rarity, lines and tiers are drawn with the live RNG at the moment the job is
 * claimed, never when it starts, and a claimed job stores its result and never rolls again.
 *
 * Gear v2 (docs/design/gear-and-creatures-v2.md): three slots, items with levels and rolled lines, no
 * upgrades, Improve or enchants. A creature wears an item only if the wear rule allows it (the slot is
 * open, the item's level is not above the creature's, a role-locked Charm fits the role).
 */
import {
  RULES,
  craftCost,
  craftable,
  dismantleYield,
  effectiveStats,
  gearBase,
  itemLines,
  jobDuration,
  jobXp,
  nextSkillXp,
  partsOfSpec,
  planEquipBest,
  rollCraft,
  skillLevel,
  supplyDef,
  supplyJobMs,
  supplyJobXp,
  wearBlock,
  wornEffects,
  PART_KINDS,
  type GearRarity,
  type GearSlot,
  type GearTag,
  type JobKind,
  type PartKind,
  type PartsBundle,
  type Rng,
  type Role,
  type WearBlock,
} from '@creatures/game';
import type { Analytics } from './analytics';
import { runKeyed, settleSpend } from './keyed-action';
import { GameError, atomically, type Outcome } from './outcome';
import { addSupply } from './expedition-store';
import { dismissNotice, pendingNotice, type ConversionNotice } from './gear-convert';
import { grantWelcomeKit, recentGrants, type GrantRecord } from './gear-grants';
import {
  addCreatureXp,
  countItems,
  creatureXp,
  creditParts,
  debitParts,
  findItem,
  getParts,
  hasRoom,
  insertItem,
  knowsBlueprint,
  knownBlueprints,
  openJobCount,
  openJobOf,
  ownedItems,
  parseOrigin,
  rowToItem,
  wearerOf,
  type GearRow,
  type ItemOrigin,
  type JobRow,
} from './gear-store';
import { gearRulesOf, minusBp, plusBp } from './gear-worn';
import { getBalances, spend, type Currency, type LedgerStorage } from './ledger';
import { speciesOf } from './species';

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
/** Most creatures one Equip best call may plan for. */
export const EQUIP_BEST_MAX_CREATURES = 24;

export interface GearDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness for job results and the welcome kit. Crypto in production. */
  rng: Rng;
  analytics?: Analytics | undefined;
}

// --- Views ---

/** One line of an item as a card shows it. The text and the numbers are the server's. */
export interface GearLineView {
  id: string;
  name: string;
  /** "Attack +6%", "Area ward −9%", "Unbothered". */
  text: string;
  about: string;
  source: 'base' | 'fixed' | 'rolled';
  /** Tier I to V as 1 to 5; null for a base line and lines without tiers. */
  tier: number | null;
  /** The best tier this item level could roll (1 to 5); null where tiers do not apply. */
  bestTier: number | null;
  /** False when the line does nothing for the wearer; null when nobody wears the item. */
  active: boolean | null;
}

export interface GearItemView {
  id: string;
  baseId: string;
  slot: GearSlot;
  tag: GearTag;
  rarity: GearRarity;
  itemLevel: number;
  lines: GearLineView[];
  /** What a creature needs to wear it: its level (the slot's opening level or the item's, the higher) and the role of a role-locked Charm. */
  needs: { level: number; role: Role | null };
  equippedOn: string | null;
  /** What dismantling it returns. */
  dismantle: PartsBundle;
  source: string;
  createdAt: number;
  /** The creature that made it and when; null for items that were not crafted. */
  madeBy: { name: string; at: number } | null;
  origin: ItemOrigin | null;
}

export interface EquippedSummary {
  id: string;
  baseId: string;
  slot: GearSlot;
  rarity: GearRarity;
  itemLevel: number;
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
      itemLevel: number;
      /** The craft came out one rarity above Common. */
      upgraded: boolean;
    } & JobCommon)
  | ({
      /** A crafted supply for expeditions: `amount` of `supplyId` went into the stock. */
      kind: 'supply';
      supplyId: string;
      amount: number;
    } & JobCommon)
  | ({
      /** An Improve or Enchant job started before gear v2: it paid its XP, and its parts came back. */
      kind: 'retired';
      was: 'improve' | 'enchant';
      refund: PartsBundle;
    } & JobCommon);

export interface JobView {
  id: string;
  creatureId: string;
  kind: JobKind | 'improve' | 'enchant';
  /** What the job works on: the base crafted, or the supply. */
  input: { baseId?: string; supplyId?: string };
  /** The parts it cost when it started. */
  cost: PartsBundle;
  /** The Bait it cost when it started (a lure): 0 for every other job. */
  bait: number;
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
  /** The creature level each slot opens at. */
  slotOpens: Record<GearSlot, number>;
  parts: Record<PartKind, number>;
  blueprints: { baseId: string; learnedAt: number; marks: number }[];
  jobs: JobView[];
  slots: { total: number; used: number };
  skills: SkillView[];
  /** Newest loot first: keys are `raid:<week>:<phase>`, `festival:<week>`, `expedition:<id>` and `welcome`. */
  grants: GrantRecord[];
  /** The one-time card about the conversion to gear v2, until the player dismisses it. */
  notice: ConversionNotice | null;
}

export type StartJobInput =
  | { kind: 'craft'; creatureId: string; blueprintId: string; idempotencyKey: string }
  | { kind: 'supply'; creatureId: string; supplyId: string; idempotencyKey: string };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

interface StoredInput {
  baseId?: string;
  /** The rarity a job was sized by before gear v2 (unused now). */
  rarity?: GearRarity;
  /** Items of removed jobs (Improve, Enchant) only. */
  gearId?: string;
  enchantId?: string;
  secondaryIndex?: number;
  supplyId?: string;
  cost: PartsBundle;
  /** Bait a lure job cost (absent for every other job). */
  bait?: number;
}

const sumShards = (bundle: PartsBundle): number =>
  PART_KINDS.filter((k) => k.endsWith('-shard')).reduce((n, k) => n + (bundle[k] ?? 0), 0);

/** The error a wear rule breach answers with. */
function wearError(block: WearBlock): GameError {
  switch (block.reason) {
    case 'role':
      return new GameError(409, 'wrong_role', block.role);
    case 'slot_locked':
      return new GameError(409, 'slot_locked', String(block.needs));
    case 'item_level':
      return new GameError(409, 'item_level_too_high', String(block.needs));
  }
}

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
  ): {
    id: string;
    species: string;
    level: number;
    fusion_count: number;
    nickname: string | null;
    away_expedition_id: string | null;
  } {
    const row = this.sql
      .exec<{
        id: string;
        species: string;
        level: number;
        fusion_count: number;
        nickname: string | null;
        away_expedition_id: string | null;
      }>(
        'SELECT id, species, level, fusion_count, nickname, away_expedition_id FROM creatures WHERE id = ? AND user_id = ?',
        id,
        userId,
      )
      .toArray()[0];
    if (row === undefined) throw new GameError(404, 'not_found');
    return row;
  }

  /** The Ids of lines that do nothing for the wearer of an item (empty when unworn). */
  private idleLines(row: GearRow): ReadonlySet<string> {
    if (row.equipped_on === null) return new Set();
    const wearer = this.sql
      .exec<{ species: string }>('SELECT species FROM creatures WHERE id = ?', row.equipped_on)
      .toArray()[0];
    if (wearer === undefined) throw new Error('item worn by a creature that does not exist');
    return new Set(wornEffects(wearerOf(speciesOf(wearer.species)), [rowToItem(row)]).idle);
  }

  private itemView(row: GearRow): GearItemView {
    const item = rowToItem(row);
    const base = gearBase(row.base_id);
    if (base === undefined) throw new Error('stored gear has an unknown base');
    const idle = this.idleLines(row);
    const worn = row.equipped_on !== null;
    const role =
      base.tag === 'setter' ||
      base.tag === 'payoff' ||
      base.tag === 'support' ||
      base.tag === 'guard'
        ? base.tag
        : null;
    return {
      id: row.id,
      baseId: row.base_id,
      slot: row.slot,
      tag: item.tag,
      rarity: row.rarity,
      itemLevel: row.item_level,
      lines: itemLines(item).map((l) => ({
        id: l.id,
        name: l.name,
        text: l.text,
        about: l.about,
        source: l.source,
        tier: l.tier,
        bestTier: l.bestTier,
        active: worn ? !idle.has(l.id) : null,
      })),
      needs: { level: Math.max(RULES.gear.slotUnlockLevel[row.slot], row.item_level), role },
      equippedOn: row.equipped_on,
      dismantle: dismantleYield(item),
      source: row.source,
      createdAt: row.created_at,
      madeBy:
        row.made_by_name === null || row.made_at === null
          ? null
          : { name: row.made_by_name, at: row.made_at },
      origin: parseOrigin(row.origin_json),
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
        ...(input.supplyId === undefined ? {} : { supplyId: input.supplyId }),
      },
      cost: input.cost,
      bait: input.bait ?? 0,
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
      items: rows.map((row) => this.itemView(row)),
      slotOpens: { ...RULES.gear.slotUnlockLevel },
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
      notice: pendingNotice(this.sql, userId),
    };
  }

  /** Dismisses the one-time conversion card. Repeats change nothing. */
  dismissNotice(userId: string): void {
    dismissNotice(this.sql, userId, this.deps.now());
  }

  // --- The welcome kit ---

  /**
   * Gives the player their welcome kit on their first gear load: a Common Hat (item level 1), a
   * blueprint and scrap. Once per player; later calls change nothing and draw nothing. A player who
   * was converted from the first gear model has had their kit already (their grant row stands).
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

  private recordEquip(
    row: GearRow,
    species: string,
    action: 'equip' | 'unequip',
    swap: boolean,
    userId: string,
  ): void {
    this.deps.analytics?.record(
      {
        kind: 'gear_equip',
        base: row.base_id,
        rarity: row.rarity,
        level: row.item_level,
        slot: row.slot,
        species,
        action,
        swap,
      },
      userId,
    );
  }

  /**
   * Puts an item on a creature, or takes it off with `creatureId` null. One item per slot per
   * creature: the item that was in the slot goes back to the inventory (a swap). An item that was on
   * another creature leaves it. The wear rule is checked on the server: the slot must be open, the
   * item's level not above the creature's, a role-locked Charm on its role. Putting an item where it
   * already is changes nothing and logs nothing.
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
          const was = this.sql
            .exec<{ species: string }>(
              'SELECT species FROM creatures WHERE id = ?',
              row.equipped_on,
            )
            .toArray()[0];
          this.sql.exec('UPDATE gear_items SET equipped_on = NULL WHERE id = ?', row.id);
          this.recordEquip(row, was?.species ?? '', 'unequip', false, userId);
        }
      } else if (row.equipped_on !== creature.id) {
        const block = wearBlock(rowToItem(row), {
          level: creature.level,
          role: speciesOf(creature.species).role,
        });
        if (block !== null) throw wearError(block);
        displaced = this.sql
          .exec<GearRow>(
            'SELECT * FROM gear_items WHERE equipped_on = ? AND slot = ?',
            creature.id,
            row.slot,
          )
          .toArray()[0];
        // Clear first: (equipped_on, slot) is unique, so a creature can never wear two items of a slot.
        if (displaced !== undefined) {
          this.sql.exec('UPDATE gear_items SET equipped_on = NULL WHERE id = ?', displaced.id);
        }
        this.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', creature.id, row.id);
        this.recordEquip(row, creature.species, 'equip', displaced !== undefined, userId);
      }
      const fresh = this.ownedItem(userId, gearId);
      return {
        item: this.itemView(fresh),
        unequipped:
          displaced === undefined ? null : this.itemView(this.ownedItem(userId, displaced.id)),
      };
    });
  }

  /**
   * "Equip best" for one creature or a team: the server picks, for every slot of every given creature,
   * the best item it may wear from the bag and from what the given creatures wear now (never from other
   * creatures), by `itemScore` (see `docs/design/decisions.md`: a deterministic score, not a fight). A
   * slot changes only for a better item. Returns what changed.
   */
  equipBest(
    userId: string,
    creatureIds: readonly string[],
  ): Outcome<{ changes: { creatureId: string; slot: GearSlot; itemId: string }[] }> {
    return this.atomically(() => {
      const unique = [...new Set(creatureIds)];
      if (unique.length === 0 || unique.length > EQUIP_BEST_MAX_CREATURES) {
        throw new GameError(400, 'invalid_body');
      }
      const creatures = unique.map((id) => this.ownedCreature(userId, id));
      const rows = ownedItems(this.sql, userId);
      const planned = new Set(unique);
      const candidates = rows.filter((r) => r.equipped_on === null || planned.has(r.equipped_on));
      const worn = new Map<string, Partial<Record<GearSlot, string>>>();
      for (const r of rows) {
        if (r.equipped_on === null || !planned.has(r.equipped_on)) continue;
        worn.set(r.equipped_on, { ...worn.get(r.equipped_on), [r.slot]: r.id });
      }
      const moves = planEquipBest(
        creatures.map((c) => {
          const species = speciesOf(c.species);
          return {
            id: c.id,
            level: c.level,
            role: species.role,
            element: species.element,
            stats: effectiveStats(species, c.level, c.fusion_count),
            worn: worn.get(c.id) ?? {},
          };
        }),
        candidates.map((r) => ({ id: r.id, item: rowToItem(r) })),
      );
      const byId = new Map(rows.map((r) => [r.id, r]));
      const speciesOfCreature = new Map(creatures.map((c) => [c.id, c.species]));
      // Take everything that moves off first, so swaps between creatures never meet the unique index.
      for (const move of moves) {
        const old = worn.get(move.creatureId)?.[move.slot];
        if (old !== undefined)
          this.sql.exec('UPDATE gear_items SET equipped_on = NULL WHERE id = ?', old);
        if (move.itemId !== null) {
          this.sql.exec('UPDATE gear_items SET equipped_on = NULL WHERE id = ?', move.itemId);
        }
      }
      const changes: { creatureId: string; slot: GearSlot; itemId: string }[] = [];
      for (const move of moves) {
        if (move.itemId === null) continue;
        this.sql.exec(
          'UPDATE gear_items SET equipped_on = ? WHERE id = ?',
          move.creatureId,
          move.itemId,
        );
        changes.push({ creatureId: move.creatureId, slot: move.slot, itemId: move.itemId });
        const row = byId.get(move.itemId);
        if (row !== undefined) {
          this.recordEquip(
            row,
            speciesOfCreature.get(move.creatureId) ?? '',
            'equip',
            worn.get(move.creatureId)?.[move.slot] !== undefined,
            userId,
          );
        }
      }
      return { changes };
    });
  }

  // --- Dismantle ---

  /**
   * Breaks an item into parts. An item that is being worn is taken off first (the in-page
   * confirmation is the safeguard). Cannot be undone; a retry with the same key returns the stored
   * result.
   */
  dismantle(
    userId: string,
    gearId: string,
    idempotencyKey: string,
  ): Outcome<{
    gearId: string;
    baseId: string;
    rarity: GearRarity;
    itemLevel: number;
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
          const item = rowToItem(row);
          const parts = dismantleYield(item);
          this.sql.exec('DELETE FROM gear_items WHERE id = ?', row.id);
          creditParts(this.sql, userId, parts);
          this.deps.analytics?.record(
            {
              kind: 'gear_dismantle',
              base: row.base_id,
              rarity: row.rarity,
              level: row.item_level,
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
            itemLevel: row.item_level,
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
   * or nothing); the result is rolled when the job is claimed. Returns the new job's id. Busy paws
   * lines on the creature shorten it.
   */
  startJob(userId: string, input: StartJobInput): Outcome<{ jobId: string }> {
    const fingerprint = JSON.stringify(
      input.kind === 'craft'
        ? [input.kind, input.creatureId, input.blueprintId]
        : [input.kind, input.creatureId, input.supplyId],
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
          // Bait a lure costs besides its parts (the only supply that takes any).
          let baitCost = 0;
          let baseId: string;
          // A supply craft has its own length (its hours, less the creature's skill).
          let supplyMs: number | null = null;
          const stored: Omit<StoredInput, 'cost' | 'rarity'> = {};
          const level = skillLevel(creatureXp(this.sql, userId, creature.id));
          const busyBp = gearRulesOf(this.sql, creature).busyPawsBp;
          switch (input.kind) {
            case 'craft': {
              const base = gearBase(input.blueprintId);
              if (base === undefined || !craftable(base))
                throw new GameError(400, 'invalid_blueprint');
              if (!knowsBlueprint(this.sql, userId, base.id)) {
                throw new GameError(409, 'blueprint_unknown');
              }
              if (!hasRoom(this.sql, userId)) throw new GameError(409, 'inventory_full');
              baseId = base.id;
              rarity = 'common';
              cost = craftCost(base.id);
              stored.baseId = base.id;
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
              baitCost = def.blueprint.bait ?? 0;
              supplyMs = minusBp(supplyJobMs(def, level), busyBp);
              stored.supplyId = def.id;
              break;
            }
          }
          if (!debitParts(this.sql, userId, cost)) throw new GameError(409, 'insufficient_parts');
          if (baitCost > 0) {
            // Checked, debited and the job created in one transaction: a failure rolls the parts back too.
            settleSpend(
              spend(
                this.deps.storage,
                {
                  userId,
                  currency: 'bait',
                  amount: baitCost,
                  purpose: 'lure',
                  idempotencyKey: input.idempotencyKey,
                  apply: () => ({ supplyId: input.kind === 'supply' ? input.supplyId : null }),
                },
                this.deps.now(),
              ),
            );
          }

          const now = this.deps.now();
          const duration = supplyMs ?? jobDuration(level, busyBp);
          const id = crypto.randomUUID();
          const row: StoredInput = { ...stored, cost, ...(baitCost > 0 ? { bait: baitCost } : {}) };
          this.sql.exec(
            `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
            id,
            userId,
            creature.id,
            input.kind,
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
              ...(baitCost > 0 ? { bait: baitCost } : {}),
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
   * its Crafting XP (more with Apprentice lines) and frees it. A craft is a Common of the blueprint's
   * base at item level twice the crafter's Crafting level (with the small chance of one rarity up),
   * made by this creature. Claiming again (with any key) returns the stored result and rolls nothing.
   * An Improve or Enchant job from before gear v2 still finishes: it pays its XP and returns its parts.
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
          const apprenticeBp = gearRulesOf(this.sql, creature).apprenticeBp;

          // Rolled now, at claim time, from the live RNG: nothing was decided when the job started.
          let result: DistributiveOmit<JobResult, keyof JobCommon>;
          let analyticsBase: string;
          let analyticsRarity: GearRarity;
          let upgraded = false;
          let xpBase: number;
          switch (job.kind) {
            case 'craft': {
              const baseId = input.baseId;
              const base = baseId === undefined ? undefined : gearBase(baseId);
              if (base === undefined) throw new Error('stored craft has an unknown base');
              if (countItems(this.sql, userId) >= RULES.gear.inventoryCap) {
                // Cannot happen (a craft holds its place), but never lose the item if it does.
                throw new GameError(409, 'inventory_full');
              }
              const made = rollCraft(this.deps.rng, base.id, before);
              upgraded = made.rarity !== 'common';
              const gearId = insertItem(this.sql, userId, made, {
                source: 'craft',
                now,
                origin: { kind: 'craft' },
                madeBy: {
                  creatureId: creature.id,
                  name: creature.nickname ?? speciesOf(creature.species).name,
                },
              });
              result = {
                kind: 'craft',
                gearId,
                baseId: base.id,
                rarity: made.rarity,
                itemLevel: made.itemLevel,
                upgraded,
              };
              analyticsBase = base.id;
              analyticsRarity = made.rarity;
              xpBase = jobXp();
              break;
            }
            case 'supply': {
              const def = input.supplyId === undefined ? undefined : supplyDef(input.supplyId);
              if (def === undefined) throw new Error('stored supply job has an unknown supply');
              addSupply(this.sql, userId, def.id, def.blueprint.yield);
              result = { kind: 'supply', supplyId: def.id, amount: def.blueprint.yield };
              analyticsBase = def.id;
              analyticsRarity = SUPPLY_RARITY[def.tier];
              xpBase = supplyJobXp(supplyDef(input.supplyId ?? '') ?? failSupply());
              break;
            }
            case 'improve':
            case 'enchant': {
              // Started before gear v2: nothing is left to work on, so the parts come back and the
              // creature keeps its XP.
              creditParts(this.sql, userId, input.cost);
              result = { kind: 'retired', was: job.kind, refund: input.cost };
              analyticsBase = 'retired';
              analyticsRarity = 'common';
              xpBase = RULES.gear.legacy.jobHours[job.kind] * RULES.gear.skill.xpPerHour;
              break;
            }
          }

          // XP follows the job's nominal length (the skill shortens the time, not the experience).
          const xp = plusBp(xpBase, apprenticeBp);
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
              job: job.kind === 'craft' || job.kind === 'supply' ? job.kind : 'craft',
              base: analyticsBase,
              rarity: analyticsRarity,
              upgraded,
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
