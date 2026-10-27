/**
 * SQL helpers for gear, parts, blueprints, jobs and skills (tables of migrations 17 and 27).
 * Everything is synchronous and meant to run inside a `transactionSync`. Nothing here decides game
 * rules: the rules are in `@creatures/game` and the actions in `gear.ts` and `gear-grants.ts`.
 */
import {
  GEAR_SLOTS,
  PART_KINDS,
  RULES,
  gearLine,
  itemOf,
  type GearItem,
  type GearRarity,
  type GearSlot,
  type PartKind,
  type PartsBundle,
  type Wearer,
} from '@creatures/game';
import * as v from 'valibot';
import { normaliseRarity } from './gear-normalise';

export type GearRow = {
  id: string;
  user_id: string;
  base_id: string;
  slot: GearSlot;
  tag: string;
  rarity: GearRarity;
  item_level: number;
  lines_json: string;
  made_by: string | null;
  made_by_name: string | null;
  made_at: number | null;
  origin_json: string;
  equipped_on: string | null;
  source: string;
  created_at: number;
};

const LinesSchema = v.array(
  v.strictObject({
    id: v.pipe(v.string(), v.maxLength(64)),
    tier: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(4)),
  }),
);

/**
 * The rolled lines stored with an item. Written only by this module; a damaged value throws. A line whose
 * id the content no longer has (a database from an earlier shape that was not normalised yet, see
 * `gear-normalise.ts`) is left out, so one old line never makes the whole item or view unreadable.
 */
export function parseLines(json: string): { id: string; tier: number }[] {
  const parsed = v.safeParse(LinesSchema, JSON.parse(json));
  if (!parsed.success) throw new Error('stored gear lines are invalid');
  return parsed.output.filter((line) => gearLine(line.id) !== undefined);
}

/** Where an item came from besides its source, for the card's "From:" line. Content ids and numbers only. */
export type ItemOrigin =
  | { kind: 'raid'; boss: string; rank: number }
  | { kind: 'festival'; boss: string; rank: number }
  | { kind: 'dungeon'; depth: number }
  | { kind: 'trip'; place: string; rank: number }
  | { kind: 'craft' }
  | { kind: 'welcome' }
  | { kind: 'converted' }
  /** Bought at the Valley Games' Prize Stall. */
  | { kind: 'games' };

const OriginSchema = v.variant('kind', [
  v.strictObject({
    kind: v.literal('raid'),
    boss: v.pipe(v.string(), v.maxLength(32)),
    rank: v.pipe(v.number(), v.integer()),
  }),
  v.strictObject({
    kind: v.literal('festival'),
    boss: v.pipe(v.string(), v.maxLength(32)),
    rank: v.pipe(v.number(), v.integer()),
  }),
  v.strictObject({ kind: v.literal('dungeon'), depth: v.pipe(v.number(), v.integer()) }),
  v.strictObject({
    kind: v.literal('trip'),
    place: v.pipe(v.string(), v.maxLength(32)),
    rank: v.pipe(v.number(), v.integer()),
  }),
  v.strictObject({ kind: v.literal('craft') }),
  v.strictObject({ kind: v.literal('welcome') }),
  v.strictObject({ kind: v.literal('converted') }),
  v.strictObject({ kind: v.literal('games') }),
]);

/** The origin stored with an item, or null for `{}` (items made before it was recorded). */
export function parseOrigin(json: string): ItemOrigin | null {
  const parsed = v.safeParse(OriginSchema, JSON.parse(json));
  return parsed.success ? parsed.output : null;
}

export function rowToItem(row: GearRow): GearItem {
  return itemOf(
    row.base_id,
    // A row not normalised yet may still say `festival` (it was a rarity once); it reads as Epic.
    normaliseRarity(row.rarity),
    row.item_level,
    parseLines(row.lines_json),
  );
}

/**
 * The items a creature wears as the state view and the living room show them. The full lines are
 * only in the owner's gear view; this is what any guild-mate may see.
 */
export interface WornGear {
  id: string;
  baseId: string;
  slot: GearSlot;
  rarity: GearRarity;
  itemLevel: number;
}

export function wornGearView(row: GearRow): WornGear {
  return {
    id: row.id,
    baseId: row.base_id,
    slot: row.slot,
    rarity: normaliseRarity(row.rarity),
    itemLevel: row.item_level,
  };
}

/** The wearer facts the gear rules need, from a species. */
export function wearerOf(species: { role: Wearer['role']; element: Wearer['element'] }): Wearer {
  return { role: species.role, element: species.element };
}

/**
 * Builds one entry of a view, or nothing when its stored row cannot be read: the rest of the view still
 * goes out (one odd row must never take a whole screen down). The kind and the error name are logged,
 * never anything about the player.
 */
export function viewOrSkip<T>(kind: string, make: () => T): T[] {
  try {
    return [make()];
  } catch (err) {
    console.error(`gear view: ${kind} skipped`, err instanceof Error ? err.name : 'unknown');
    return [];
  }
}

// --- Items ---

/** A row with a rarity today's code knows (a row of an earlier shape not normalised yet may say `festival`). */
const withKnownRarity = (row: GearRow): GearRow => ({
  ...row,
  rarity: normaliseRarity(row.rarity),
});

export function ownedItems(sql: SqlStorage, userId: string): GearRow[] {
  return sql
    .exec<GearRow>('SELECT * FROM gear_items WHERE user_id = ? ORDER BY created_at, rowid', userId)
    .toArray()
    .map(withKnownRarity);
}

/** The base ids of every item the player owns, in the bag or worn (a worn item stays in `gear_items`). */
export function ownedBaseIds(sql: SqlStorage, userId: string): Set<string> {
  return new Set(
    sql
      .exec<{ base_id: string }>(
        'SELECT DISTINCT base_id FROM gear_items WHERE user_id = ?',
        userId,
      )
      .toArray()
      .map((r) => r.base_id),
  );
}

export function findItem(sql: SqlStorage, userId: string, id: string): GearRow | undefined {
  const row = sql
    .exec<GearRow>('SELECT * FROM gear_items WHERE id = ? AND user_id = ?', id, userId)
    .toArray()[0];
  return row === undefined ? undefined : withKnownRarity(row);
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

/** Facts stored with a new item besides the item itself. */
export interface ItemMeta {
  source: string;
  now: number;
  origin?: ItemOrigin;
  /** The creature that crafted it, and its name at the time (plain text). */
  madeBy?: { creatureId: string; name: string };
  /** Keep this id (the conversion keeps the old item's id). */
  id?: string;
}

/** Inserts an item (not worn). Returns its id. */
export function insertItem(
  sql: SqlStorage,
  userId: string,
  item: GearItem,
  meta: ItemMeta,
): string {
  const id = meta.id ?? crypto.randomUUID();
  sql.exec(
    `INSERT INTO gear_items
       (id, user_id, base_id, slot, tag, rarity, item_level, lines_json, made_by, made_by_name, made_at,
        origin_json, equipped_on, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    id,
    userId,
    item.baseId,
    item.slot,
    item.tag,
    item.rarity,
    item.itemLevel,
    JSON.stringify(item.lines),
    meta.madeBy?.creatureId ?? null,
    meta.madeBy?.name ?? null,
    meta.madeBy === undefined ? null : meta.now,
    JSON.stringify(meta.origin ?? {}),
    meta.source,
    meta.now,
  );
  return id;
}

/** What a creature wears, in each slot. */
export type WornBySlot = Partial<Record<GearSlot, GearRow>>;

/** The player's equipped items by creature id, then slot. */
export function equippedByCreature(sql: SqlStorage, userId: string): Map<string, WornBySlot> {
  const map = new Map<string, WornBySlot>();
  for (const row of sql
    .exec<GearRow>('SELECT * FROM gear_items WHERE user_id = ? AND equipped_on IS NOT NULL', userId)
    .toArray()) {
    if (row.equipped_on === null) continue;
    const worn = map.get(row.equipped_on) ?? {};
    worn[row.slot] = row;
    map.set(row.equipped_on, worn);
  }
  return map;
}

/** The worn items of some creatures (any owner) by creature id, in one query. */
export function wornOnCreatures(
  sql: SqlStorage,
  creatureIds: readonly string[],
): Map<string, WornBySlot> {
  const map = new Map<string, WornBySlot>();
  if (creatureIds.length === 0) return map;
  for (const row of sql
    .exec<GearRow>(
      `SELECT * FROM gear_items WHERE equipped_on IN (${creatureIds.map(() => '?').join(', ')})`,
      ...creatureIds,
    )
    .toArray()) {
    if (row.equipped_on === null) continue;
    const worn = map.get(row.equipped_on) ?? {};
    worn[row.slot] = row;
    map.set(row.equipped_on, worn);
  }
  return map;
}

/** The rows a creature wears, in slot order. */
export function wornRows(worn: WornBySlot | undefined): GearRow[] {
  if (worn === undefined) return [];
  return GEAR_SLOTS.flatMap((slot) => {
    const row = worn[slot];
    return row === undefined ? [] : [row];
  });
}

/** The items a creature wears, as the rules see them. */
export function wornItems(worn: WornBySlot | undefined): GearItem[] {
  return wornRows(worn).flatMap((row) => {
    try {
      return [rowToItem(row)];
    } catch (err) {
      // An item that cannot be read adds nothing to its wearer; it must not break a fight or a view.
      console.error('worn gear skipped', err instanceof Error ? err.name : 'unknown');
      return [];
    }
  });
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
): { baseId: string; learnedAt: number; marks: number }[] {
  return sql
    .exec<{ base_id: string; learned_at: number; marks: number }>(
      'SELECT base_id, learned_at, marks FROM blueprints WHERE user_id = ? ORDER BY learned_at, base_id',
      userId,
    )
    .toArray()
    .map((r) => ({ baseId: r.base_id, learnedAt: r.learned_at, marks: r.marks }));
}

/** The marks on a blueprint (finds of it the player already knew), or null when the blueprint is not known. */
export function blueprintMarks(sql: SqlStorage, userId: string, baseId: string): number | null {
  return (
    sql
      .exec<{
        marks: number;
      }>('SELECT marks FROM blueprints WHERE user_id = ? AND base_id = ?', userId, baseId)
      .toArray()[0]?.marks ?? null
  );
}

/**
 * Adds one well-thumbed mark to a known blueprint, at most `RULES.gear.craft.marks.max`. Returns the new
 * count, or null when the blueprint is unknown or already at the most (nothing changes then).
 */
export function addMark(sql: SqlStorage, userId: string, baseId: string): number | null {
  return (
    sql
      .exec<{ marks: number }>(
        `UPDATE blueprints SET marks = marks + 1
         WHERE user_id = ? AND base_id = ? AND marks < ? RETURNING marks`,
        userId,
        baseId,
        RULES.gear.craft.marks.max,
      )
      .toArray()[0]?.marks ?? null
  );
}

/** Learns a blueprint. Returns false if the player already knew it. Blueprints have no rarity any more (stored as common). */
export function learnBlueprint(
  sql: SqlStorage,
  userId: string,
  baseId: string,
  now: number,
): boolean {
  return (
    sql
      .exec(
        `INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, ?, 'common', ?)
         ON CONFLICT(user_id, base_id) DO NOTHING RETURNING base_id`,
        userId,
        baseId,
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
  kind: 'craft' | 'improve' | 'enchant' | 'supply' | 'dismantle' | 'convert';
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
