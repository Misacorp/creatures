/**
 * SQL helpers for gear, parts, blueprints, jobs and skills (tables of migration 17). Everything is
 * synchronous and meant to run inside a `transactionSync`. Nothing here decides game rules: the rules
 * are in `@creatures/game` and the actions in `gear.ts` and `gear-grants.ts`.
 */
import {
  GEAR_RARITIES,
  GEAR_STATS,
  PART_KINDS,
  RULES,
  type GearItem,
  type GearRarity,
  type GearRolls,
  type PartKind,
  type PartsBundle,
} from '@creatures/game';
import * as v from 'valibot';

export type GearRow = {
  id: string;
  user_id: string;
  base_id: string;
  rarity: GearRarity;
  level: number;
  rolls_json: string;
  enchant_id: string | null;
  equipped_on: string | null;
  source: string;
  created_at: number;
};

const RollsSchema = v.strictObject({
  primary: v.pipe(v.number(), v.integer(), v.minValue(0)),
  secondary: v.array(
    v.strictObject({
      stat: v.picklist(GEAR_STATS),
      bp: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
  ),
});

/** The rolls stored with an item. Written only by this module; a damaged value throws. */
export function parseRolls(json: string): GearRolls {
  const parsed = v.safeParse(RollsSchema, JSON.parse(json));
  if (!parsed.success) throw new Error('stored gear rolls are invalid');
  return parsed.output;
}

export function rowToItem(row: GearRow): GearItem {
  return {
    baseId: row.base_id,
    rarity: row.rarity,
    level: row.level,
    rolls: parseRolls(row.rolls_json),
    enchantId: row.enchant_id,
  };
}

export const RARITY_SET: ReadonlySet<string> = new Set(GEAR_RARITIES);

// --- Items ---

export function ownedItems(sql: SqlStorage, userId: string): GearRow[] {
  return sql
    .exec<GearRow>('SELECT * FROM gear_items WHERE user_id = ? ORDER BY created_at, rowid', userId)
    .toArray();
}

export function findItem(sql: SqlStorage, userId: string, id: string): GearRow | undefined {
  return sql
    .exec<GearRow>('SELECT * FROM gear_items WHERE id = ? AND user_id = ?', id, userId)
    .toArray()[0];
}

export function countItems(sql: SqlStorage, userId: string): number {
  return sql
    .exec<{ n: number }>('SELECT COUNT(*) AS n FROM gear_items WHERE user_id = ?', userId)
    .one().n;
}

/** Crafts that have not been claimed yet: each holds a place in the inventory for its item. */
export function countPendingCrafts(sql: SqlStorage, userId: string): number {
  return sql
    .exec<{
      n: number;
    }>(
      "SELECT COUNT(*) AS n FROM workshop_jobs WHERE user_id = ? AND kind = 'craft' AND claimed_at IS NULL",
      userId,
    )
    .one().n;
}

/** True if an item can take one more: items and crafts still to be claimed are below the cap. */
export function hasRoom(sql: SqlStorage, userId: string): boolean {
  return countItems(sql, userId) + countPendingCrafts(sql, userId) < RULES.gear.inventoryCap;
}

export function insertItem(
  sql: SqlStorage,
  userId: string,
  item: { baseId: string; rarity: GearRarity; rolls: GearRolls },
  source: string,
  now: number,
): string {
  const id = crypto.randomUUID();
  sql.exec(
    `INSERT INTO gear_items (id, user_id, base_id, rarity, level, rolls_json, enchant_id, equipped_on, source, created_at)
     VALUES (?, ?, ?, ?, 0, ?, NULL, NULL, ?, ?)`,
    id,
    userId,
    item.baseId,
    item.rarity,
    JSON.stringify(item.rolls),
    source,
    now,
  );
  return id;
}

/** The player's equipped items by creature id. */
export function equippedByCreature(sql: SqlStorage, userId: string): Map<string, GearRow> {
  const map = new Map<string, GearRow>();
  for (const row of sql
    .exec<GearRow>('SELECT * FROM gear_items WHERE user_id = ? AND equipped_on IS NOT NULL', userId)
    .toArray()) {
    if (row.equipped_on !== null) map.set(row.equipped_on, row);
  }
  return map;
}

// --- Parts ---

export function getParts(sql: SqlStorage, userId: string): Record<PartKind, number> {
  const out = Object.fromEntries(PART_KINDS.map((k) => [k, 0])) as Record<PartKind, number>;
  for (const row of sql
    .exec<{ kind: string; amount: number }>(
      'SELECT kind, amount FROM parts WHERE user_id = ?',
      userId,
    )
    .toArray()) {
    if ((PART_KINDS as readonly string[]).includes(row.kind))
      out[row.kind as PartKind] = row.amount;
  }
  return out;
}

export function partsTotal(bundle: PartsBundle): number {
  return PART_KINDS.reduce((total, kind) => total + (bundle[kind] ?? 0), 0);
}

/** Adds parts. Amounts must be non-negative integers; zero amounts write nothing. */
export function creditParts(sql: SqlStorage, userId: string, bundle: PartsBundle): void {
  for (const kind of PART_KINDS) {
    const amount = bundle[kind] ?? 0;
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('invalid parts amount');
    if (amount === 0) continue;
    sql.exec(
      `INSERT INTO parts (user_id, kind, amount) VALUES (?, ?, ?)
       ON CONFLICT(user_id, kind) DO UPDATE SET amount = amount + excluded.amount`,
      userId,
      kind,
      amount,
    );
  }
}

/** True if the player holds at least this much of every kind. */
export function hasParts(sql: SqlStorage, userId: string, bundle: PartsBundle): boolean {
  const held = getParts(sql, userId);
  return PART_KINDS.every((kind) => held[kind] >= (bundle[kind] ?? 0));
}

/**
 * Takes parts away. Returns false and changes nothing if the player does not hold enough (the
 * table's CHECK is the last line of defence: it can never go below zero).
 */
export function debitParts(sql: SqlStorage, userId: string, bundle: PartsBundle): boolean {
  if (!hasParts(sql, userId, bundle)) return false;
  for (const kind of PART_KINDS) {
    const amount = bundle[kind] ?? 0;
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('invalid parts amount');
    if (amount === 0) continue;
    sql.exec(
      'UPDATE parts SET amount = amount - ? WHERE user_id = ? AND kind = ?',
      amount,
      userId,
      kind,
    );
  }
  return true;
}

// --- Blueprints ---

export function knownBlueprints(
  sql: SqlStorage,
  userId: string,
): { baseId: string; rarity: GearRarity; learnedAt: number }[] {
  return sql
    .exec<{ base_id: string; rarity: GearRarity; learned_at: number }>(
      'SELECT base_id, rarity, learned_at FROM blueprints WHERE user_id = ? ORDER BY learned_at, base_id',
      userId,
    )
    .toArray()
    .map((r) => ({ baseId: r.base_id, rarity: r.rarity, learnedAt: r.learned_at }));
}

export function knowsBlueprint(sql: SqlStorage, userId: string, baseId: string): boolean {
  return (
    sql.exec('SELECT 1 FROM blueprints WHERE user_id = ? AND base_id = ?', userId, baseId).toArray()
      .length > 0
  );
}

/** Learns a blueprint. Returns false if the player already knew it. */
export function learnBlueprint(
  sql: SqlStorage,
  userId: string,
  baseId: string,
  rarity: GearRarity,
  now: number,
): boolean {
  return (
    sql
      .exec(
        `INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, base_id) DO NOTHING RETURNING base_id`,
        userId,
        baseId,
        rarity,
        now,
      )
      .toArray().length > 0
  );
}

// --- Jobs and skills ---

export type JobRow = {
  id: string;
  user_id: string;
  creature_id: string;
  kind: 'craft' | 'improve' | 'enchant' | 'supply';
  gear_id: string | null;
  input_json: string;
  started_at: number;
  ends_at: number;
  claimed_at: number | null;
  result_json: string | null;
};

export function openJobCount(sql: SqlStorage, userId: string): number {
  return sql
    .exec<{
      n: number;
    }>('SELECT COUNT(*) AS n FROM workshop_jobs WHERE user_id = ? AND claimed_at IS NULL', userId)
    .one().n;
}

/** The id of the open job a creature is on, or null. */
export function openJobOf(sql: SqlStorage, creatureId: string): string | null {
  return (
    sql
      .exec<{ id: string }>(
        'SELECT id FROM workshop_jobs WHERE creature_id = ? AND claimed_at IS NULL',
        creatureId,
      )
      .toArray()[0]?.id ?? null
  );
}

/** The player's open jobs by creature id. */
export function openJobsByCreature(sql: SqlStorage, userId: string): Map<string, string> {
  return new Map(
    sql
      .exec<{ id: string; creature_id: string }>(
        'SELECT id, creature_id FROM workshop_jobs WHERE user_id = ? AND claimed_at IS NULL',
        userId,
      )
      .toArray()
      .map((r) => [r.creature_id, r.id]),
  );
}

export function creatureXp(sql: SqlStorage, userId: string, creatureId: string): number {
  return (
    sql
      .exec<{ xp: number }>(
        'SELECT xp FROM crafting_skill WHERE user_id = ? AND creature_id = ?',
        userId,
        creatureId,
      )
      .toArray()[0]?.xp ?? 0
  );
}

/** Adds XP to a creature's Crafting skill and returns the new total. */
export function addCreatureXp(
  sql: SqlStorage,
  userId: string,
  creatureId: string,
  xp: number,
): number {
  if (!Number.isSafeInteger(xp) || xp < 0) throw new Error('invalid xp');
  return sql
    .exec<{ xp: number }>(
      `INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, ?)
       ON CONFLICT(user_id, creature_id) DO UPDATE SET xp = xp + excluded.xp RETURNING xp`,
      userId,
      creatureId,
      xp,
    )
    .one().xp;
}
