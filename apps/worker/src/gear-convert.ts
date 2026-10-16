/**
 * The one-time conversion of a player's old gear to gear v2 (docs/design/gear-and-creatures-v2.md
 * section 12, as amended by the decision "converted gear matches a fresh drop"). Migration 27 only
 * moved the old items to `gear_legacy` and listed every player who had gear, blueprints or open jobs
 * in `gear_conversion`; this module does the rest, in the Durable Object right after migrations
 * (`GuildCore.migrate`), with live randomness, once per player:
 *
 * - **Worn items** become a new item of the same rarity (slot by the old stat focus, tag from the old
 *   tint, the same id), at the item level a fresh drop would have for this player today (the higher of
 *   `3 + Boss Rank` and their best dungeon depth's drop level, at most 12), with lines rolled once at
 *   tier II or better. An item that its wearer cannot wear under the new rules (the wearer's level is
 *   below the item's level or the slot's opening level) goes into the bag, and the notice says so.
 * - **Unworn items** are refunded: their old dismantle yield, plus the scrap and Essence their upgrades
 *   cost. Enchants refund their glimmer and shards. Worn items get their upgrade and enchant costs back too.
 * - **Blueprints** map to the new base of the same slot and tint; ones that land on a known base add a mark.
 * - **Jobs in progress** finish: a craft makes a new-model item from the mapped base; an Improve or Enchant
 *   job still gives its Crafting XP when claimed, and the parts it cost are returned (the job no longer exists).
 *
 * Idempotent: a player is converted in one transaction that stamps `gear_conversion.converted_at`, so
 * a second call changes and draws nothing. The Essence refund has its own ledger key as well.
 */
import {
  RULES,
  addParts,
  baseForTint,
  convertedItemLevel,
  legacyBase,
  legacyDismantleYield,
  legacyEnchant,
  legacyEnchantSpent,
  legacyUpgradeSpent,
  rollItem,
  wearBlock,
  content,
  type GearRarity,
  type GearSlot,
  type PartsBundle,
  type Rng,
} from '@creatures/game';
import type { Analytics } from './analytics';
import { creditParts, insertItem } from './gear-store';
import { credit, type LedgerStorage } from './ledger';
import { readLadder } from './raid-ladder';

export interface ConvertDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness for the new lines. Crypto in production. */
  rng: Rng;
  analytics?: Analytics | undefined;
}

/** A worn item the conversion took off its creature because the creature may not wear it. */
export interface UnequippedItem {
  id: string;
  baseId: string;
  slot: GearSlot;
  itemLevel: number;
  /** Why: the creature's level is below the item's, or below the slot's opening level, or the role is wrong. */
  reason: 'item_level' | 'slot_locked' | 'role';
  /** The creature level it would need. */
  needs: number | null;
}

/** What the one-time notice card tells the player. */
export interface ConversionNotice {
  /** Worn items that became new items (all of them, including the ones in `unequipped`). */
  converted: number;
  /** Items that went into the bag because their wearer could not wear them. */
  unequipped: UnequippedItem[];
  /** Unworn items that were refunded as parts instead. */
  refundedItems: number;
  /** Everything refunded as parts (items, upgrades, enchants). */
  parts: PartsBundle;
  /** Essence the upgrades cost, returned. */
  essence: number;
  /** Blueprints mapped to the new bases. */
  blueprints: number;
  /** Improve and Enchant jobs that were still running (they finish, and their parts are returned). */
  retiredJobs: number;
}

type LegacyItem = {
  id: string;
  user_id: string;
  base_id: string;
  rarity: GearRarity;
  level: number;
  enchant_id: string | null;
  equipped_on: string | null;
  source: string;
  created_at: number;
};

/** The Boss Rank a converted item level is based on: the server's rank, or 1 before it has one. */
function serverRank(sql: SqlStorage): number {
  return Math.max(1, readLadder(sql).rank ?? 1);
}

/** The deepest dungeon depth a player has cleared (0: none); a lost run does not count. */
function bestDepth(sql: SqlStorage, userId: string): number {
  return (
    sql
      .exec<{
        depth: number | null;
      }>('SELECT MAX(depth) AS depth FROM dungeon_runs WHERE user_id = ? AND cleared = 1', userId)
      .toArray()[0]?.depth ?? 0
  );
}

/** The new base id an old base id maps to (the same slot and tint); a base the table does not know becomes the neutral Hat. */
export function mapBase(oldId: string): { id: string; slot: GearSlot } {
  const old = legacyBase(oldId);
  const base =
    old === undefined
      ? baseForTint('hat', null)
      : baseForTint(old.slot, old.tint, old.festival === true);
  return { id: base.id, slot: base.slot };
}

function addTo(total: PartsBundle, more: PartsBundle): PartsBundle {
  return addParts(total, more);
}

/** Converts one player. Call inside a transaction (it is wrapped in one here as well). */
function convertPlayer(deps: ConvertDeps, userId: string, rank: number): void {
  const { storage } = deps;
  const sql = storage.sql;
  const now = deps.now();
  const depth = bestDepth(sql, userId);
  const level = convertedItemLevel(rank, depth);
  const notice: ConversionNotice = {
    converted: 0,
    unequipped: [],
    refundedItems: 0,
    parts: {},
    essence: 0,
    blueprints: 0,
    retiredJobs: 0,
  };
  const legacy = sql
    .exec<LegacyItem>(
      'SELECT * FROM gear_legacy WHERE user_id = ? ORDER BY created_at, rowid',
      userId,
    )
    .toArray();
  let parts: PartsBundle = {};
  for (const row of legacy) {
    // The upgrades and the enchant are gone: what they cost comes back, whether or not the item stays.
    const spent = legacyUpgradeSpent(row.rarity, row.level);
    notice.essence += spent.essence;
    parts = addTo(parts, { scrap: spent.scrap });
    const enchant = row.enchant_id === null ? undefined : legacyEnchant(row.enchant_id);
    if (enchant !== undefined) parts = addTo(parts, legacyEnchantSpent(enchant.shard));

    const wearer =
      row.equipped_on === null
        ? undefined
        : sql
            .exec<{
              id: string;
              species: string;
              level: number;
            }>(
              'SELECT id, species, level FROM creatures WHERE id = ? AND user_id = ?',
              row.equipped_on,
              userId,
            )
            .toArray()[0];
    if (wearer === undefined) {
      // Not worn: refunded as parts.
      const old = legacyBase(row.base_id);
      parts = addTo(parts, legacyDismantleYield(row.rarity, old?.tint ?? null));
      notice.refundedItems += 1;
      continue;
    }
    const target = mapBase(row.base_id);
    const item = rollItem(deps.rng, {
      baseId: target.id,
      rarity: row.rarity,
      itemLevel: level,
      minTier: RULES.gear.itemLevel.convert.minTier,
    });
    const species = content.creatures.find((c) => c.id === wearer.species);
    if (species === undefined) throw new Error('a creature has an unknown species');
    const block = wearBlock(item, { level: wearer.level, role: species.role });
    insertItem(sql, userId, item, {
      source: 'converted',
      now: row.created_at,
      origin: { kind: 'converted' },
      id: row.id,
    });
    notice.converted += 1;
    if (block === null) {
      sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', wearer.id, row.id);
    } else {
      notice.unequipped.push({
        id: row.id,
        baseId: item.baseId,
        slot: item.slot,
        itemLevel: item.itemLevel,
        reason: block.reason,
        needs: block.reason === 'role' ? null : block.needs,
      });
    }
  }
  // The old rows stay in `gear_legacy` (the player's `gear_conversion` row, stamped below, is what
  // marks them as converted: they are never read again).

  // Blueprints: each old one becomes the base of the same slot and tint; overlaps add a mark.
  const oldBlueprints = sql
    .exec<{ base_id: string; learned_at: number }>(
      'SELECT base_id, learned_at FROM blueprints WHERE user_id = ? ORDER BY learned_at, base_id',
      userId,
    )
    .toArray();
  sql.exec('DELETE FROM blueprints WHERE user_id = ?', userId);
  for (const bp of oldBlueprints) {
    const target = mapBase(bp.base_id);
    const inserted = sql
      .exec(
        `INSERT INTO blueprints (user_id, base_id, rarity, learned_at, marks) VALUES (?, ?, 'common', ?, 0)
         ON CONFLICT(user_id, base_id) DO UPDATE SET marks = marks + 1 RETURNING base_id`,
        userId,
        target.id,
        bp.learned_at,
      )
      .toArray();
    if (inserted.length > 0) notice.blueprints += 1;
  }

  // Jobs in progress. A craft makes a new-model item from the mapped base; an Improve or Enchant job
  // has nothing left to work on, so it is let go of the item (it still finishes, pays its XP and
  // returns its cost when claimed, see `Gear.claimJob`).
  const jobs = sql
    .exec<{ id: string; kind: string; input_json: string }>(
      'SELECT id, kind, input_json FROM workshop_jobs WHERE user_id = ? AND claimed_at IS NULL',
      userId,
    )
    .toArray();
  for (const job of jobs) {
    if (job.kind === 'craft') {
      const input = JSON.parse(job.input_json) as { baseId?: string };
      if (input.baseId !== undefined) {
        const next = { ...input, baseId: mapBase(input.baseId).id };
        sql.exec(
          'UPDATE workshop_jobs SET input_json = ? WHERE id = ?',
          JSON.stringify(next),
          job.id,
        );
      }
    } else if (job.kind === 'improve' || job.kind === 'enchant') {
      sql.exec('UPDATE workshop_jobs SET gear_id = NULL WHERE id = ?', job.id);
      notice.retiredJobs += 1;
    }
  }

  creditParts(sql, userId, parts);
  notice.parts = parts;
  if (notice.essence > 0) {
    credit(
      storage,
      {
        userId,
        currency: 'essence',
        amount: notice.essence,
        source: 'gear_refund',
        idempotencyKey: `gear-v2:${userId}`,
        meta: { items: notice.refundedItems, converted: notice.converted },
      },
      now,
    );
  }
  sql.exec(
    'UPDATE gear_conversion SET converted_at = ?, notice_json = ? WHERE user_id = ? AND converted_at IS NULL',
    now,
    JSON.stringify(notice),
    userId,
  );
}

/**
 * Converts every player who is waiting (`gear_conversion.converted_at IS NULL`). Returns how many
 * were converted. Safe to call on every start: with nobody waiting it does nothing and draws nothing.
 */
export function convertPendingGear(deps: ConvertDeps): number {
  const sql = deps.storage.sql;
  const waiting = sql
    .exec<{ user_id: string }>(
      'SELECT user_id FROM gear_conversion WHERE converted_at IS NULL ORDER BY user_id',
    )
    .toArray();
  if (waiting.length === 0) return 0;
  const rank = serverRank(sql);
  let converted = 0;
  for (const { user_id: userId } of waiting) {
    // One bad legacy row must not stop the guild from starting: that player stays pending (their
    // transaction rolled back whole), the gear routes answer 503 `gear_conversion_pending` for them,
    // and the next start tries again. Nothing about the player goes in the log.
    try {
      deps.storage.transactionSync(() => {
        convertPlayer(deps, userId, rank);
      });
      converted += 1;
    } catch (err) {
      console.error(
        'gear conversion failed, player left pending',
        err instanceof Error ? err.name : 'unknown',
      );
    }
  }
  return converted;
}

/** True while a player's old gear has not been converted yet (their gear is not usable until then). */
export function conversionPending(sql: SqlStorage, userId: string): boolean {
  return (
    sql
      .exec('SELECT 1 FROM gear_conversion WHERE user_id = ? AND converted_at IS NULL', userId)
      .toArray().length > 0
  );
}

/** The notice a player has not dismissed yet, or null. */
export function pendingNotice(sql: SqlStorage, userId: string): ConversionNotice | null {
  const row = sql
    .exec<{
      notice_json: string | null;
      seen_at: number | null;
    }>('SELECT notice_json, seen_at FROM gear_conversion WHERE user_id = ?', userId)
    .toArray()[0];
  if (row === undefined || row.notice_json === null || row.seen_at !== null) return null;
  return JSON.parse(row.notice_json) as ConversionNotice;
}

/** Marks the player's notice as seen (repeats change nothing). */
export function dismissNotice(sql: SqlStorage, userId: string, now: number): void {
  sql.exec(
    'UPDATE gear_conversion SET seen_at = ? WHERE user_id = ? AND notice_json IS NOT NULL AND seen_at IS NULL',
    now,
    userId,
  );
}
