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
  chance,
  craftCostFor,
  craftHours,
  craftItemLevel,
  craftOdds,
  craftable,
  dismantleBundleError,
  dismantleHours,
  dismantleLearnBp,
  dismantleRange,
  dismantleXp,
  effectiveStats,
  gearBase,
  itemLines,
  jobDuration,
  jobXp,
  nextSkillXp,
  partsOfSpec,
  planEquipBest,
  reachMinLevel,
  rollCraftItem,
  rollDismantle,
  skillLevel,
  stepUpBp,
  supplyDef,
  supplyJobMs,
  supplyJobXp,
  treatCost,
  jobWeather,
  weatherTimeMs,
  wearBlock,
  workshopExperience,
  workshopMods,
  wornEffects,
  PART_KINDS,
  REACH_IDS,
  type CraftOdds,
  type DismantleRange,
  type GearRarity,
  type GearSlot,
  type GearTag,
  type JobKind,
  type PartKind,
  type PartsBundle,
  type ReachId,
  type Rng,
  type Role,
  type WearBlock,
  type WorkshopMods,
} from '@creatures/game';
import type { Analytics } from './analytics';
import { awardExperience, type ExperienceView } from './creature-exp';
import { runKeyed, settleSpend } from './keyed-action';
import { GameError, atomically, type Outcome } from './outcome';
import { addSupply } from './expedition-store';
import {
  conversionPending,
  dismissNotice,
  mapBase,
  pendingNotice,
  type ConversionNotice,
} from './gear-convert';
import { grantWelcomeKit, recentGrants, type GrantRecord } from './gear-grants';
import {
  addCreatureXp,
  addMark,
  blueprintMarks,
  countItems,
  creatureXp,
  creditParts,
  debitParts,
  findItem,
  getParts,
  hasParts,
  hasRoom,
  insertItem,
  learnBlueprint,
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
import { credit, getBalances, spend, type Currency, type LedgerStorage } from './ledger';
import { speciesOf } from './species';
import type { Weather } from './weather';

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
  /**
   * The day's Workshop modifiers (Market Day, built by the Boons step): asked when a craft or a
   * dismantle job is priced, and stored with the job, so what was shown is what is rolled. None today.
   */
  workshopMods?: ((userId: string, job: 'craft' | 'dismantle') => WorkshopMods) | undefined;
  /**
   * The valley's weather: a job is started under the day's Boon and Omen (time, experience and Market Day's
   * first-of-the-day boosts) and keeps what they did. Without one, none. `workshopMods`, when given, wins.
   */
  weather?: Weather | undefined;
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
  /** What dismantling it can return, as a range (rolled when the job is claimed). */
  dismantle: DismantleRange;
  source: string;
  createdAt: number;
  /** The creature that made it and when; null for items that were not crafted. */
  madeBy: { name: string; at: number } | null;
  origin: ItemOrigin | null;
}

/** What "Equip best" did: the slots it changed, and the creatures it left alone because they are busy. */
export interface EquipBestResult {
  changes: { creatureId: string; slot: GearSlot; itemId: string }[];
  skipped: { creatureId: string; reason: 'away' | 'job' }[];
}

export interface EquippedSummary {
  id: string;
  baseId: string;
  slot: GearSlot;
  rarity: GearRarity;
  itemLevel: number;
}

export interface JobCommon {
  /**
   * Creature experience the job paid its worker (4 an hour of nominal work, doubled by a treat) and what it
   * did to the level. Absent in results stored before training by activity, and for a retired job.
   */
  experience?: ExperienceView;
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
      /** What the craft was aimed at. */
      reach: ReachId;
      /** The one-step-up chance raised the rarity the Reach drew. */
      upgraded: boolean;
    } & JobCommon)
  | ({
      /** Items taken apart: what came back, the blueprints learned and the marks added. */
      kind: 'dismantle';
      items: ItemSnapshot[];
      parts: PartsBundle;
      essence: number;
      learned: string[];
      marked: { baseId: string; marks: number }[];
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

/** What is kept of an item that goes into a dismantle job (the item itself is gone). */
export interface ItemSnapshot {
  baseId: string;
  rarity: GearRarity;
  itemLevel: number;
}

export interface JobView {
  id: string;
  creatureId: string;
  kind: JobKind | 'improve' | 'enchant';
  /** What the job works on: the base crafted (and the Reach), the supply, or the items taken apart. */
  input: { baseId?: string; supplyId?: string; reach?: ReachId; items?: ItemSnapshot[] };
  /** The parts it cost when it started. */
  cost: PartsBundle;
  /** The Bait it cost when it started (a lure): 0 for every other job. */
  bait: number;
  /** True when a treat was packed for the worker (the job's creature experience is doubled). */
  treat: boolean;
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
  | {
      kind: 'craft';
      creatureId: string;
      blueprintId: string;
      reach?: ReachId | undefined;
      /** Pack a treat for the worker (Bait, paid when the job starts): it doubles the job's creature experience. */
      treat?: boolean | undefined;
      idempotencyKey: string;
    }
  | {
      kind: 'supply';
      creatureId: string;
      supplyId: string;
      treat?: boolean | undefined;
      idempotencyKey: string;
    }
  | {
      kind: 'dismantle';
      creatureId: string;
      itemIds: string[];
      treat?: boolean | undefined;
      idempotencyKey: string;
    };

/** One way to start a craft, as the screen shows it before the player confirms. All numbers are the server's. */
export interface CraftOption {
  reach: ReachId;
  /** The creature's Crafting level is high enough for it. */
  unlocked: boolean;
  /** The Crafting level it asks for. */
  minLevel: number;
  /** The parts it takes (exact: shards of a base without an element come from the biggest piles). */
  parts: PartsBundle;
  essence: number;
  /** How long it takes this creature, and the nominal hours the XP follows. */
  durationMs: number;
  xp: number;
  /** The exact chances of each rarity, in basis points; they add up to 10,000. */
  oddsBp: CraftOdds;
}

export interface CraftPreview {
  kind: 'craft';
  blueprintId: string;
  creatureId: string;
  craftingLevel: number;
  /** The item level of the result: twice the Crafting level. */
  itemLevel: number;
  marks: number;
  marksMax: number;
  /** The one-step-up chance, in basis points, already counted in the odds. */
  stepUpBp: number;
  options: CraftOption[];
}

export interface DismantlePreview {
  kind: 'dismantle';
  creatureId: string;
  items: { id: string; baseId: string; rarity: GearRarity; itemLevel: number }[];
  /** The refund as a range, the same for any creature. */
  range: DismantleRange;
  durationMs: number;
  xp: number;
  /** The chance (basis points) each item that can teach a blueprint does, with this creature; null when none can. */
  learnBp: number | null;
  /** How many of the items can teach a blueprint (or add a mark). */
  teachers: number;
}

export type PreviewInput =
  | { kind: 'craft'; creatureId: string; blueprintId: string }
  | { kind: 'dismantle'; creatureId: string; itemIds: string[] };

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
  /** A treat was packed when the job started (absent: none). */
  treat?: boolean;
  /** Craft: what it was aimed at, the blueprint's marks and the Crafting level when it started, the day's mods. */
  reach?: ReachId;
  marks?: number;
  level?: number;
  mods?: WorkshopMods;
  /**
   * What the day's weather did to the job when it started (absent: nothing): the Boon and Omen for the log,
   * and the numbers its claim uses for the experience. The time is already in `ends_at`.
   */
  weather?: StoredJobWeather;
  /** Dismantle: the items taken apart (they are gone from the bag). */
  items?: ItemSnapshot[];
}

interface StoredJobWeather {
  boon: string;
  omen: string | null;
  timeBp: number;
  xpBp: number;
  treatMultiplier: number | null;
}

/** True for a stored result of a job claimed before gear v2: a craft without an item level, an Improve or an Enchant. */
function isLegacyResult(raw: unknown): boolean {
  const r = raw as { kind?: unknown; itemLevel?: unknown } | null;
  return (
    r !== null &&
    typeof r === 'object' &&
    (r.kind === 'improve' ||
      r.kind === 'enchant' ||
      (r.kind === 'craft' && r.itemLevel === undefined))
  );
}

/**
 * A stored job result as the views show it. Results claimed before gear v2 are mapped: an old craft
 * names the new base of the same slot and tint at item level 1 (like old grants), an old Improve or
 * Enchant becomes the display-only retired shape (it refunded nothing then, so the refund is empty).
 */
function normaliseJobResult(raw: unknown): JobResult {
  if (!isLegacyResult(raw)) return raw as JobResult;
  const r = raw as JobCommon & { kind: 'craft' | 'improve' | 'enchant'; baseId?: string };
  const common: JobCommon = {
    xp: r.xp,
    skillXp: r.skillXp,
    skillLevel: r.skillLevel,
    leveledUp: r.leveledUp,
  };
  if (r.kind === 'craft') {
    return {
      ...(raw as object),
      kind: 'craft',
      baseId: mapBase(r.baseId ?? '').id,
      itemLevel: 1,
    } as JobResult;
  }
  return { kind: 'retired', was: r.kind, refund: {}, ...common };
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

/** A creature row as the gear code reads it. */
type CreatureRow = {
  id: string;
  species: string;
  level: number;
  fusion_count: number;
  nickname: string | null;
  away_expedition_id: string | null;
};

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
      dismantle: dismantleRange([item]),
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
    if (row.result_json !== null) {
      const raw: unknown = JSON.parse(row.result_json);
      result = normaliseJobResult(raw);
      // A claimed craft from before gear v2 names an old base: show the new base its result shows.
      if (isLegacyResult(raw) && result.kind === 'craft') input.baseId = result.baseId;
    }
    return {
      id: row.id,
      creatureId: row.creature_id,
      kind: row.kind,
      input: {
        ...(input.baseId === undefined ? {} : { baseId: input.baseId }),
        ...(input.supplyId === undefined ? {} : { supplyId: input.supplyId }),
        ...(input.reach === undefined || input.reach === 'none' ? {} : { reach: input.reach }),
        ...(input.items === undefined ? {} : { items: input.items }),
      },
      cost: input.cost,
      bait: input.bait ?? 0,
      treat: input.treat === true,
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

  /** True while the player's old gear is waiting for its conversion (it failed on start; see `convertPendingGear`). */
  conversionPending(userId: string): boolean {
    return conversionPending(this.sql, userId);
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

  /** Why a creature's gear is frozen, or null: it is on an expedition, or running a Workshop job. */
  private busyReason(creature: {
    id: string;
    away_expedition_id: string | null;
  }): GameError | null {
    if (creature.away_expedition_id !== null) return new GameError(409, 'creature_away');
    if (openJobOf(this.sql, creature.id) !== null) return new GameError(409, 'creature_on_job');
    return null;
  }

  private assertNotBusy(creature: { id: string; away_expedition_id: string | null }): void {
    const reason = this.busyReason(creature);
    if (reason !== null) throw reason;
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
      // Trip and Workshop lines are read when a trip or job is claimed, so what a creature wears is
      // frozen while it is away or on a job: neither the new wearer nor the one losing the item may be busy.
      if (creature !== null && row.equipped_on !== creature.id) this.assertNotBusy(creature);
      if (row.equipped_on !== null && row.equipped_on !== creature?.id) {
        this.assertNotBusy(this.ownedCreature(userId, row.equipped_on));
      }
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
  equipBest(userId: string, creatureIds: readonly string[]): Outcome<EquipBestResult> {
    return this.atomically(() => {
      const requested = [...new Set(creatureIds)];
      if (requested.length === 0 || requested.length > EQUIP_BEST_MAX_CREATURES) {
        throw new GameError(400, 'invalid_body');
      }
      // A creature that is away or on a job keeps what it wears (see `equip`): it is skipped, and
      // its items stay out of the plan.
      const skipped: EquipBestResult['skipped'] = [];
      const creatures = requested.flatMap((id) => {
        const creature = this.ownedCreature(userId, id);
        const busy = this.busyReason(creature);
        if (busy !== null) {
          skipped.push({
            creatureId: id,
            reason: busy.message === 'creature_away' ? 'away' : 'job',
          });
          return [];
        }
        return [creature];
      });
      const unique = creatures.map((c) => c.id);
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
      return { changes, skipped };
    });
  }

  // --- Workshop jobs ---

  private mods(userId: string, job: 'craft' | 'dismantle'): WorkshopMods {
    const injected = this.deps.workshopMods?.(userId, job);
    if (injected !== undefined) return injected;
    const weather = this.deps.weather;
    const day = weather?.at() ?? null;
    if (weather === undefined || day === null) return {};
    // Market Day boosts only the day's first craft and first dismantle jobs: every job of that kind the
    // player started this game day counts, boosted or not (so saving up for the day pays nothing).
    const { startsAt, endsAt } = weather.dayBounds();
    const before = this.sql
      .exec<{ n: number }>(
        `SELECT COUNT(*) AS n FROM workshop_jobs
         WHERE user_id = ? AND kind = ? AND started_at >= ? AND started_at < ?`,
        userId,
        job,
        startsAt,
        endsAt,
      )
      .one().n;
    return workshopMods(day, job, before);
  }

  /** What the day's weather does to a job started now: its time and experience. Nothing without weather. */
  private weatherNow(): StoredJobWeather | null {
    const day = this.deps.weather?.at() ?? null;
    if (day === null) return null;
    const fx = jobWeather(day);
    return { boon: day.boon, omen: day.omen, ...fx };
  }

  /** A job's time under the day's weather (the screens show this one and the job is started with it). */
  private weatherMs(ms: number): number {
    return weatherTimeMs(ms, this.weatherNow()?.timeBp ?? 0);
  }

  /** The weather to store with a job, or nothing to store when the day changes nothing about it. */
  private storedWeather(userId: string): { weather: StoredJobWeather } | Record<string, never> {
    const w = this.weatherNow();
    if (w === null || (w.timeBp === 0 && w.xpBp === 0 && w.treatMultiplier === null)) return {};
    this.deps.analytics?.record(
      { kind: 'weather_use', where: 'job', boon: w.boon, omen: w.omen },
      userId,
    );
    return { weather: w };
  }

  /** The items of a dismantle request, owned and distinct, and the bundle rule checked (400 `invalid_bundle`). */
  private dismantleRows(userId: string, itemIds: readonly string[]): GearRow[] {
    if (new Set(itemIds).size !== itemIds.length) throw new GameError(400, 'invalid_bundle');
    const rows = itemIds.map((id) => this.ownedItem(userId, id));
    const error = dismantleBundleError(rows.map((r) => r.rarity));
    if (error !== null) throw new GameError(400, 'invalid_bundle', error);
    return rows;
  }

  /** The Crafting level and the Busy paws and Apprentice shares of a creature. */
  private workerOf(
    userId: string,
    creature: CreatureRow,
  ): { level: number; busyBp: number; apprenticeBp: number } {
    const rules = gearRulesOf(this.sql, creature);
    return {
      level: skillLevel(creatureXp(this.sql, userId, creature.id)),
      busyBp: rules.busyPawsBp,
      apprenticeBp: rules.apprenticeBp,
    };
  }

  /**
   * What a craft of a blueprint would cost, take and give with this creature, for every way to start it
   * (plain, Reach for Rare, Reach for Epic): exact parts and Essence, time, XP and the odds of each
   * rarity. Changes nothing and draws nothing. The screen shows these numbers and never works any out.
   */
  previewCraft(userId: string, creatureId: string, blueprintId: string): Outcome<CraftPreview> {
    return this.atomically(() => {
      const creature = this.ownedCreature(userId, creatureId);
      const base = gearBase(blueprintId);
      if (base === undefined || !craftable(base)) throw new GameError(400, 'invalid_blueprint');
      const marks = blueprintMarks(this.sql, userId, base.id);
      if (marks === null) throw new GameError(409, 'blueprint_unknown');
      const { level, busyBp, apprenticeBp } = this.workerOf(userId, creature);
      const held = getParts(this.sql, userId);
      const mods = this.mods(userId, 'craft');
      return {
        kind: 'craft' as const,
        blueprintId: base.id,
        creatureId: creature.id,
        craftingLevel: level,
        itemLevel: craftItemLevel(level),
        marks,
        marksMax: RULES.gear.craft.marks.max,
        stepUpBp: stepUpBp(level, marks, mods),
        options: REACH_IDS.map((reach): CraftOption => {
          const cost = craftCostFor(base.id, reach, held, craftItemLevel(level));
          return {
            reach,
            unlocked: level >= reachMinLevel(reach),
            minLevel: reachMinLevel(reach),
            parts: cost.parts,
            essence: cost.essence,
            durationMs: this.weatherMs(jobDuration(level, busyBp, craftHours(reach))),
            xp: jobXp(apprenticeBp, craftHours(reach)),
            oddsBp: craftOdds(reach, level, marks, mods),
          };
        }),
      };
    });
  }

  /**
   * What taking these items apart would give with this creature: the refund range (the same for any
   * creature), how long it takes this one, the XP, and the chance each item teaches its blueprint.
   * Changes nothing. Items worn by a creature that is away or on a job are not refused here (starting is).
   */
  previewDismantle(
    userId: string,
    creatureId: string,
    itemIds: readonly string[],
  ): Outcome<DismantlePreview> {
    return this.atomically(() => {
      const creature = this.ownedCreature(userId, creatureId);
      const rows = this.dismantleRows(userId, itemIds);
      const { level, busyBp, apprenticeBp } = this.workerOf(userId, creature);
      const rarity = (rows[0] as GearRow).rarity;
      const teachers = rows.filter((r) => {
        const base = gearBase(r.base_id);
        return base !== undefined && craftable(base);
      }).length;
      return {
        kind: 'dismantle' as const,
        creatureId: creature.id,
        items: rows.map((r) => ({
          id: r.id,
          baseId: r.base_id,
          rarity: r.rarity,
          itemLevel: r.item_level,
        })),
        range: dismantleRange(rows.map(rowToItem)),
        durationMs: this.weatherMs(jobDuration(level, busyBp, dismantleHours(rarity))),
        xp: dismantleXp(rarity, apprenticeBp),
        learnBp: teachers === 0 ? null : dismantleLearnBp(level),
        teachers,
      };
    });
  }

  /** Inserts the open job row; the creature and the slot were checked by the caller. */
  private insertJob(
    userId: string,
    creatureId: string,
    kind: JobKind,
    stored: StoredInput,
    durationMs: number,
  ): string {
    const now = this.deps.now();
    const id = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
      id,
      userId,
      creatureId,
      kind,
      JSON.stringify(stored),
      now,
      now + durationMs,
    );
    return id;
  }

  /**
   * Starts a job on a creature that is not busy, in a free workshop slot. A craft pays its parts (and a
   * Reach's Essence) now, all or nothing; a dismantle takes the items out of the bag now. The result is
   * rolled when the job is claimed. Busy paws lines on the creature shorten it.
   */
  startJob(userId: string, input: StartJobInput): Outcome<{ jobId: string }> {
    const fingerprint = JSON.stringify([
      ...(input.kind === 'craft'
        ? [input.kind, input.creatureId, input.blueprintId, input.reach ?? 'none']
        : input.kind === 'supply'
          ? [input.kind, input.creatureId, input.supplyId]
          : [input.kind, input.creatureId, [...input.itemIds]]),
      ...(input.treat === true ? ['treat'] : []),
    ]);
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
          const worker = this.workerOf(userId, creature);
          const started = ((): { jobId: string } => {
            switch (input.kind) {
              case 'craft':
                return this.startCraft(userId, input, creature, worker);
              case 'supply':
                return this.startSupply(userId, input, creature, worker);
              case 'dismantle':
                return this.startDismantle(userId, input, creature, worker);
            }
          })();
          if (input.treat === true) this.packTreat(userId, creature, started.jobId);
          return started;
        },
      ),
    );
  }

  /**
   * Pays the treat of a job that was just started and marks the job: the Bait is spent in the start's own
   * transaction under a key derived from the job's id, so a retry of the start never pays it twice and short
   * Bait fails the whole start.
   */
  private packTreat(userId: string, creature: CreatureRow, jobId: string): void {
    const cost = treatCost(creature.level);
    settleSpend(
      spend(
        this.deps.storage,
        {
          userId,
          currency: 'bait',
          amount: cost,
          purpose: 'treat',
          idempotencyKey: `treat:job:${jobId}`,
          apply: () => ({ jobId }),
        },
        this.deps.now(),
      ),
    );
    this.sql.exec(
      "UPDATE workshop_jobs SET input_json = json_set(input_json, '$.treat', json('true')) WHERE id = ?",
      jobId,
    );
    this.deps.analytics?.record(
      { kind: 'treat', source: 'job', species: creature.species, level: creature.level, cost },
      userId,
    );
  }

  private startCraft(
    userId: string,
    input: Extract<StartJobInput, { kind: 'craft' }>,
    creature: CreatureRow,
    worker: { level: number; busyBp: number },
  ): { jobId: string } {
    const base = gearBase(input.blueprintId);
    if (base === undefined || !craftable(base)) throw new GameError(400, 'invalid_blueprint');
    const marks = blueprintMarks(this.sql, userId, base.id);
    if (marks === null) throw new GameError(409, 'blueprint_unknown');
    if (!hasRoom(this.sql, userId)) throw new GameError(409, 'inventory_full');
    const reach = input.reach ?? 'none';
    if (worker.level < reachMinLevel(reach)) throw new GameError(409, 'skill_too_low');
    const { parts: cost, essence } = craftCostFor(
      base.id,
      reach,
      getParts(this.sql, userId),
      craftItemLevel(worker.level),
    );
    if (!hasParts(this.sql, userId, cost)) throw new GameError(409, 'insufficient_parts');
    const mods = this.mods(userId, 'craft');
    const duration = this.weatherMs(jobDuration(worker.level, worker.busyBp, craftHours(reach)));
    // The Essence, the parts and the job are one transaction: the ledger's keyed spend carries the
    // grant. A plain craft has no Essence to spend and just pays its parts.
    const commit = (): { jobId: string } => {
      if (!debitParts(this.sql, userId, cost)) throw new GameError(409, 'insufficient_parts');
      const stored: StoredInput = {
        baseId: base.id,
        cost,
        reach,
        marks,
        level: worker.level,
        ...(Object.keys(mods).length === 0 ? {} : { mods }),
        ...this.storedWeather(userId),
      };
      const jobId = this.insertJob(userId, creature.id, 'craft', stored, duration);
      this.deps.analytics?.record(
        {
          kind: 'job_start',
          job: 'craft',
          base: base.id,
          rarity: 'common',
          species: creature.species,
          hours: Math.round(duration / 3_600_000),
          skillLevel: worker.level,
          parts: cost,
          reach,
          essence,
        },
        userId,
      );
      return { jobId };
    };
    if (essence === 0) return commit();
    const spent = spend(
      this.deps.storage,
      {
        userId,
        currency: 'essence',
        amount: essence,
        purpose: 'craft',
        idempotencyKey: input.idempotencyKey,
        apply: commit,
      },
      this.deps.now(),
    );
    if (spent.status === 'insufficient_funds') throw new GameError(409, 'insufficient_essence');
    return settleSpend(spent);
  }

  private startSupply(
    userId: string,
    input: Extract<StartJobInput, { kind: 'supply' }>,
    creature: CreatureRow,
    worker: { level: number; busyBp: number },
  ): { jobId: string } {
    const def = supplyDef(input.supplyId);
    if (def === undefined) throw new GameError(400, 'invalid_supply');
    // The better the supply, the higher the Crafting level its blueprint asks for.
    if (worker.level < def.blueprint.craftingLevel) throw new GameError(409, 'skill_too_low');
    const cost = partsOfSpec(def.blueprint.parts);
    if (!debitParts(this.sql, userId, cost)) throw new GameError(409, 'insufficient_parts');
    // A lure costs Bait besides its parts: checked, debited and the job created in one transaction (a
    // failure rolls the parts back too).
    const baitCost = def.blueprint.bait ?? 0;
    if (baitCost > 0) {
      settleSpend(
        spend(
          this.deps.storage,
          {
            userId,
            currency: 'bait',
            amount: baitCost,
            purpose: 'lure',
            idempotencyKey: input.idempotencyKey,
            apply: () => ({ supplyId: input.supplyId }),
          },
          this.deps.now(),
        ),
      );
    }
    const duration = this.weatherMs(minusBp(supplyJobMs(def, worker.level), worker.busyBp));
    const jobId = this.insertJob(
      userId,
      creature.id,
      'supply',
      {
        supplyId: def.id,
        cost,
        ...(baitCost > 0 ? { bait: baitCost } : {}),
        ...this.storedWeather(userId),
      },
      duration,
    );
    this.deps.analytics?.record(
      {
        kind: 'job_start',
        job: 'supply',
        base: def.id,
        rarity: SUPPLY_RARITY[def.tier],
        species: creature.species,
        hours: Math.round(duration / 3_600_000),
        skillLevel: worker.level,
        parts: cost,
        ...(baitCost > 0 ? { bait: baitCost } : {}),
      },
      userId,
    );
    return { jobId };
  }

  private startDismantle(
    userId: string,
    input: Extract<StartJobInput, { kind: 'dismantle' }>,
    creature: CreatureRow,
    worker: { level: number; busyBp: number },
  ): { jobId: string } {
    const rows = this.dismantleRows(userId, input.itemIds);
    // An item worn by a creature that is away or on a job stays where it is (see `equip`).
    for (const wearer of new Set(
      rows.flatMap((r) => (r.equipped_on === null ? [] : [r.equipped_on])),
    )) {
      this.assertNotBusy(this.ownedCreature(userId, wearer));
    }
    const rarity = (rows[0] as GearRow).rarity;
    const items: ItemSnapshot[] = rows.map((r) => ({
      baseId: r.base_id,
      rarity: r.rarity,
      itemLevel: r.item_level,
    }));
    const mods = this.mods(userId, 'dismantle');
    const duration = this.weatherMs(
      jobDuration(worker.level, worker.busyBp, dismantleHours(rarity)),
    );
    // The items leave the bag now: a worn one is taken off with them. Nothing is refunded until the claim.
    for (const row of rows) this.sql.exec('DELETE FROM gear_items WHERE id = ?', row.id);
    const stored: StoredInput = {
      cost: {},
      items,
      level: worker.level,
      ...(Object.keys(mods).length === 0 ? {} : { mods }),
      ...this.storedWeather(userId),
    };
    const jobId = this.insertJob(userId, creature.id, 'dismantle', stored, duration);
    const first = rows[0] as GearRow;
    this.deps.analytics?.record(
      {
        kind: 'job_start',
        job: 'dismantle',
        base: first.base_id,
        rarity,
        species: creature.species,
        hours: Math.round(duration / 3_600_000),
        skillLevel: worker.level,
        items: items.length,
      },
      userId,
    );
    return { jobId };
  }

  /**
   * Finishes a job that has run its time: rolls the result with live randomness, gives the creature
   * its Crafting XP (more with Apprentice lines) and frees it. A craft is the blueprint's base at item
   * level twice the crafter's Crafting level, its rarity drawn from the Reach's odds and the one-step-up
   * chance (the odds shown when it started), made by this creature. A dismantle rolls each item's
   * refund inside its range (nothing about the worker counts), credits the parts and the Essence, and
   * gives each item that can teach a blueprint its chance to teach it or add a mark. The job also
   * records the nominal minutes it worked, for the creature experience of the creatures step. Claiming
   * again (with any key) returns the stored result and rolls nothing. An Improve or Enchant job from
   * before gear v2 still finishes: it pays its XP and returns its parts.
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
            return normaliseJobResult(JSON.parse(job.result_json));
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
          let workMinutes = 0;
          switch (job.kind) {
            case 'craft': {
              const baseId = input.baseId;
              const base = baseId === undefined ? undefined : gearBase(baseId);
              if (base === undefined) throw new Error('stored craft has an unknown base');
              if (countItems(this.sql, userId) >= RULES.gear.inventoryCap) {
                // Cannot happen (a craft holds its place), but never lose the item if it does.
                throw new GameError(409, 'inventory_full');
              }
              // A craft started before gear v2 was sized by its blueprint's rarity: it keeps that
              // promise (never less than the old rarity) and pays the XP of its old hours.
              const legacyRarity = input.rarity;
              const reach = input.reach ?? 'none';
              const made = rollCraftItem(this.deps.rng, base.id, input.level ?? before, {
                reach,
                marks: input.marks ?? 0,
                ...(legacyRarity === undefined ? {} : { floor: legacyRarity }),
                ...(input.mods === undefined ? {} : { mods: input.mods }),
              });
              upgraded = made.upgraded;
              const gearId = insertItem(this.sql, userId, made.item, {
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
                rarity: made.item.rarity,
                itemLevel: made.item.itemLevel,
                reach,
                upgraded,
              };
              analyticsBase = base.id;
              analyticsRarity = made.item.rarity;
              const hours =
                legacyRarity === undefined
                  ? craftHours(reach)
                  : RULES.gear.legacy.craftHours[legacyRarity];
              xpBase = jobXp(0, hours);
              workMinutes = Math.round(hours * 60);
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
              workMinutes = Math.round(def.blueprint.hours * 60);
              break;
            }
            case 'dismantle': {
              const items = input.items;
              const first = items?.[0];
              if (items === undefined || first === undefined) {
                throw new Error('stored dismantle has no items');
              }
              const rolled = rollDismantle(this.deps.rng, items, input.mods ?? {});
              creditParts(this.sql, userId, rolled.parts);
              if (rolled.essence > 0) {
                credit(
                  this.deps.storage,
                  {
                    userId,
                    currency: 'essence',
                    amount: rolled.essence,
                    source: 'dismantle',
                    idempotencyKey: `dismantle:${job.id}`,
                    meta: { items: items.length },
                  },
                  now,
                );
              }
              // Each item that can teach a blueprint has its chance: the worker's level counts here, not in the refund.
              const learnBp = dismantleLearnBp(input.level ?? before);
              const learned: string[] = [];
              const marked: { baseId: string; marks: number }[] = [];
              for (const item of items) {
                const base = gearBase(item.baseId);
                if (base === undefined || !craftable(base)) continue;
                if (!chance(this.deps.rng, learnBp, 10_000)) continue;
                if (learnBlueprint(this.sql, userId, base.id, now)) learned.push(base.id);
                else {
                  const marks = addMark(this.sql, userId, base.id);
                  if (marks !== null) marked.push({ baseId: base.id, marks });
                }
              }
              result = {
                kind: 'dismantle',
                items,
                parts: rolled.parts,
                essence: rolled.essence,
                learned,
                marked,
              };
              analyticsBase = first.baseId;
              analyticsRarity = first.rarity;
              xpBase = dismantleXp(first.rarity);
              workMinutes = RULES.gear.dismantle.minutes[first.rarity];
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
          // Creature experience (training by activity): 4 an hour of nominal work, doubled by a treat.
          const treat = input.treat === true;
          // The day the job started under (Hearty Breakfast, Cold Snap) is what it stored, never today's.
          const gainedExp = workshopExperience(
            workMinutes,
            treat,
            input.weather === undefined
              ? undefined
              : { bp: input.weather.xpBp, treatMultiplier: input.weather.treatMultiplier },
          );
          const experience =
            gainedExp > 0
              ? awardExperience(
                  this.sql,
                  this.deps.analytics,
                  userId,
                  creature.id,
                  gainedExp,
                  'job',
                  treat,
                )
              : null;
          const full = {
            ...result,
            ...(experience === null ? {} : { experience }),
            xp,
            skillXp,
            skillLevel: after,
            leveledUp: after > before,
          };
          this.sql.exec(
            'UPDATE workshop_jobs SET claimed_at = ?, result_json = ?, work_minutes = ? WHERE id = ? AND claimed_at IS NULL',
            now,
            JSON.stringify(full),
            workMinutes,
            job.id,
          );
          this.deps.analytics?.record(
            {
              kind: 'job_claim',
              job:
                job.kind === 'craft' || job.kind === 'supply' || job.kind === 'dismantle'
                  ? job.kind
                  : 'craft',
              base: analyticsBase,
              rarity: analyticsRarity,
              upgraded,
              xp,
              skillLevel: after,
              leveledUp: after > before,
              ...(job.kind === 'supply' && result.kind === 'supply'
                ? { yield: result.amount }
                : {}),
              ...(result.kind === 'craft' ? { reach: result.reach } : {}),
              ...(result.kind === 'dismantle' ? { items: result.items.length } : {}),
            },
            userId,
          );
          if (result.kind === 'dismantle') {
            const first = result.items[0] as ItemSnapshot;
            this.deps.analytics?.record(
              {
                kind: 'gear_dismantle',
                base: first.baseId,
                rarity: first.rarity,
                level: first.itemLevel,
                scrap: result.parts.scrap ?? 0,
                shards: sumShards(result.parts),
                glimmer: result.parts.glimmer ?? 0,
                unequipped: false,
                parts: result.parts,
                items: result.items.length,
                essence: result.essence,
                learned: result.learned.length,
                marks: result.marked.length,
              },
              userId,
            );
          }
          return full;
        },
      ),
    );
  }
}
