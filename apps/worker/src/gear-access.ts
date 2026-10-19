/**
 * What the equip side of `Gear` (`gear.ts`) and the Workshop (`workshop.ts`) share: the deps, the
 * ownership reads (an item or creature of the player, 404 for anyone else's), the busy rule, the item
 * and job views, and the stored job input. Plain functions over `sql`: they run inside the caller's
 * transaction and never open one.
 */
import {
  RULES,
  dismantleRange,
  gearBase,
  itemLines,
  itemStats,
  statText,
  wornEffects,
  type DayXpEffect,
  type GearRarity,
  type PartsBundle,
  type ReachId,
  type Rng,
  type WorkshopMods,
} from '@creatures/game';
import type { Analytics } from './analytics';
import { GameError } from './outcome';
import { mapBase } from './gear-convert';
import {
  findItem,
  openJobOf,
  parseOrigin,
  rowToItem,
  wearerOf,
  type GearRow,
  type JobRow,
} from './gear-store';
import { fixFestivalRarity } from './gear-normalise';
import type { LedgerStorage } from './ledger';
import type { GearItemView, ItemSnapshot, JobCommon, JobResult, JobView } from './gear-types';
import { speciesOf } from './species';
import type { Weather } from './weather';

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

/** A creature row as the gear code reads it. */
export type CreatureRow = {
  id: string;
  species: string;
  level: number;
  fusion_count: number;
  nickname: string | null;
  away_expedition_id: string | null;
};

/** An item of the player's, or 404 (the same answer for "does not exist" and "belongs to someone else"). */
export function ownedItem(sql: SqlStorage, userId: string, id: string): GearRow {
  const row = findItem(sql, userId, id);
  if (row === undefined) throw new GameError(404, 'not_found');
  return row;
}

/** A creature of the player's, or 404. */
export function ownedCreature(sql: SqlStorage, userId: string, id: string): CreatureRow {
  const row = sql
    .exec<CreatureRow>(
      'SELECT id, species, level, fusion_count, nickname, away_expedition_id FROM creatures WHERE id = ? AND user_id = ?',
      id,
      userId,
    )
    .toArray()[0];
  if (row === undefined) throw new GameError(404, 'not_found');
  return row;
}

/** The ids of lines that do nothing for the wearer of an item (empty when unworn). */
function idleLines(sql: SqlStorage, row: GearRow): ReadonlySet<string> {
  if (row.equipped_on === null) return new Set();
  const wearer = sql
    .exec<{ species: string }>('SELECT species FROM creatures WHERE id = ?', row.equipped_on)
    .toArray()[0];
  if (wearer === undefined) throw new Error('item worn by a creature that does not exist');
  return new Set(wornEffects(wearerOf(speciesOf(wearer.species)), [rowToItem(row)]).idle);
}

export function itemView(sql: SqlStorage, row: GearRow): GearItemView {
  const item = rowToItem(row);
  const base = gearBase(row.base_id);
  if (base === undefined) throw new Error('stored gear has an unknown base');
  const idle = idleLines(sql, row);
  const stats = itemStats(item);
  const worn = row.equipped_on !== null;
  const role =
    base.tag === 'setter' || base.tag === 'payoff' || base.tag === 'support' || base.tag === 'guard'
      ? base.tag
      : null;
  return {
    id: row.id,
    baseId: row.base_id,
    slot: row.slot,
    tag: item.tag,
    rarity: row.rarity,
    festival: base.festival === true,
    itemLevel: row.item_level,
    stats: stats.map((s) => ({
      stat: s.stat,
      value: s.value,
      base: s.base,
      text: statText(s.stat, s.value),
    })),
    lines: itemLines(item).map((l) => ({
      id: l.id,
      name: l.name,
      text: l.text,
      about: l.about,
      source: l.source,
      tier: l.tier,
      bestTier: l.bestTier,
      local: l.local,
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

/** A stored job row as the views show it. */
export function jobView(row: JobRow, now: number): JobView {
  const input = parseStoredInput(row.input_json);
  let result: JobResult | null = null;
  if (row.result_json !== null) {
    const raw: unknown = JSON.parse(row.result_json);
    fixFestivalRarity(raw);
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

/** Why a creature's gear is frozen, or null: it is on an expedition, or running a Workshop job. */
export function busyReason(
  sql: SqlStorage,
  creature: { id: string; away_expedition_id: string | null },
): GameError | null {
  if (creature.away_expedition_id !== null) return new GameError(409, 'creature_away');
  if (openJobOf(sql, creature.id) !== null) return new GameError(409, 'creature_on_job');
  return null;
}

export function assertNotBusy(
  sql: SqlStorage,
  creature: { id: string; away_expedition_id: string | null },
): void {
  const reason = busyReason(sql, creature);
  if (reason !== null) throw reason;
}

export interface StoredInput {
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

export interface StoredJobWeather {
  boon: string;
  omen: string | null;
  timeBp: number;
  xpBp: number;
  treatMultiplier: number | null;
  /** Each Boon's and Omen's change to creature experience (absent on jobs started before 2026-10-19). */
  xpEffects?: DayXpEffect[];
}

/**
 * A job's stored input. Item snapshots of a dismantle job started under the first gear v2 may name the
 * rarity `festival` (it was one then); it reads as Epic, as the normalisation at start makes it.
 */
export function parseStoredInput(json: string): StoredInput {
  const input = JSON.parse(json) as StoredInput;
  fixFestivalRarity(input);
  return input;
}

/** True for a stored result of a job claimed before gear v2: a craft without an item level, an Improve or an Enchant. */
export function isLegacyResult(raw: unknown): boolean {
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
export function normaliseJobResult(raw: unknown): JobResult {
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
