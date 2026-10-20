/**
 * SQL helpers for expeditions v2 (tables of migration 19): explorer progress, familiarity, the journal,
 * account stats, supplies in stock and the pending end-of-trip choices. Everything is synchronous and
 * meant to run inside a `transactionSync`. Nothing here decides game rules: the rules are in
 * `@creatures/game` and the actions in `expeditions.ts`.
 */
import {
  ACCOUNT_STATS,
  supplyDef,
  type AccountStat,
  type FamiliarityRecord,
} from '@creatures/game';
import * as v from 'valibot';

const STAT_SET: ReadonlySet<string> = new Set(ACCOUNT_STATS);

// --- Explorer progress ---

export type ExplorerRow = { xp: number; trips: number };

/** A creature's explorer XP and finished trips (zero for a creature that never explored). */
export function explorerOf(sql: SqlStorage, userId: string, creatureId: string): ExplorerRow {
  return (
    sql
      .exec<ExplorerRow>(
        'SELECT xp, trips FROM explorer_progress WHERE user_id = ? AND creature_id = ?',
        userId,
        creatureId,
      )
      .toArray()[0] ?? { xp: 0, trips: 0 }
  );
}

/** Every explorer row of a player by creature id. */
export function explorersByCreature(sql: SqlStorage, userId: string): Map<string, ExplorerRow> {
  return new Map(
    sql
      .exec<{ creature_id: string; xp: number; trips: number }>(
        'SELECT creature_id, xp, trips FROM explorer_progress WHERE user_id = ?',
        userId,
      )
      .toArray()
      .map((r) => [r.creature_id, { xp: r.xp, trips: r.trips }]),
  );
}

/** Adds XP and one finished trip to a creature. Returns the new totals. */
export function addExplorerTrip(
  sql: SqlStorage,
  userId: string,
  creatureId: string,
  xp: number,
): ExplorerRow {
  if (!Number.isSafeInteger(xp) || xp < 0) throw new Error('invalid xp');
  return sql
    .exec<ExplorerRow>(
      `INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, creature_id) DO UPDATE SET xp = xp + excluded.xp, trips = trips + 1
       RETURNING xp, trips`,
      userId,
      creatureId,
      xp,
    )
    .one();
}

// --- Familiarity ---

const FoundSchema = v.array(v.pipe(v.string(), v.maxLength(32)));

function parseFound(json: string): string[] {
  const parsed = v.safeParse(FoundSchema, JSON.parse(json));
  if (!parsed.success) throw new Error('stored familiarity is invalid');
  return parsed.output;
}

export function familiarityOf(
  sql: SqlStorage,
  userId: string,
  creatureId: string,
  destinationId: string,
): FamiliarityRecord {
  const row = sql
    .exec<{ trips: number; found_json: string; shiny: number }>(
      `SELECT trips, found_json, shiny FROM familiarity
       WHERE user_id = ? AND creature_id = ? AND destination_id = ?`,
      userId,
      creatureId,
      destinationId,
    )
    .toArray()[0];
  if (row === undefined) return { trips: 0, found: [], shiny: false };
  return { trips: row.trips, found: parseFound(row.found_json), shiny: row.shiny === 1 };
}

/** Every familiarity row of a player. */
export function familiarityRows(
  sql: SqlStorage,
  userId: string,
): { creatureId: string; destinationId: string; record: FamiliarityRecord }[] {
  return sql
    .exec<{
      creature_id: string;
      destination_id: string;
      trips: number;
      found_json: string;
      shiny: number;
    }>(
      `SELECT creature_id, destination_id, trips, found_json, shiny FROM familiarity
       WHERE user_id = ? ORDER BY creature_id, destination_id`,
      userId,
    )
    .toArray()
    .map((r) => ({
      creatureId: r.creature_id,
      destinationId: r.destination_id,
      record: { trips: r.trips, found: parseFound(r.found_json), shiny: r.shiny === 1 },
    }));
}

/** Writes a creature's familiarity at a destination (the whole record). */
export function saveFamiliarity(
  sql: SqlStorage,
  userId: string,
  creatureId: string,
  destinationId: string,
  record: FamiliarityRecord,
): void {
  sql.exec(
    `INSERT INTO familiarity (user_id, creature_id, destination_id, trips, found_json, shiny)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, creature_id, destination_id)
     DO UPDATE SET trips = excluded.trips, found_json = excluded.found_json, shiny = excluded.shiny`,
    userId,
    creatureId,
    destinationId,
    record.trips,
    JSON.stringify([...record.found]),
    record.shiny ? 1 : 0,
  );
}

// --- The journal ---

/** The ids of the pages a player has found. */
export function foundPages(sql: SqlStorage, userId: string): Set<string> {
  return new Set(
    sql
      .exec<{ entry_id: string }>('SELECT entry_id FROM journal WHERE user_id = ?', userId)
      .toArray()
      .map((r) => r.entry_id),
  );
}

/** The player's pages with when they were found, oldest first. */
export function journalPages(
  sql: SqlStorage,
  userId: string,
): { entryId: string; foundAt: number }[] {
  return sql
    .exec<{ entry_id: string; found_at: number }>(
      'SELECT entry_id, found_at FROM journal WHERE user_id = ? ORDER BY found_at, rowid',
      userId,
    )
    .toArray()
    .map((r) => ({ entryId: r.entry_id, foundAt: r.found_at }));
}

/** Records a page once. Returns false if the player already had it (nothing changes then). */
export function addPage(
  sql: SqlStorage,
  userId: string,
  entryId: string,
  now: number,
  expeditionId: string | null,
): boolean {
  return (
    sql
      .exec(
        `INSERT INTO journal (user_id, entry_id, found_at, expedition_id) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, entry_id) DO NOTHING RETURNING entry_id`,
        userId,
        entryId,
        now,
        expeditionId,
      )
      .toArray().length > 0
  );
}

// --- Account stats ---

/** Adds to a counter. `by` must be a non-negative integer; the stat must be a known one. */
export function bumpStat(sql: SqlStorage, userId: string, stat: AccountStat, by: number): void {
  if (!STAT_SET.has(stat)) throw new Error('unknown account stat');
  if (!Number.isSafeInteger(by) || by < 0) throw new Error('invalid stat amount');
  if (by === 0) return;
  sql.exec(
    `INSERT INTO account_stats (user_id, stat, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, stat) DO UPDATE SET value = value + excluded.value`,
    userId,
    stat,
    by,
  );
}

/** All of a player's counters (a stat that was never counted is absent). */
export function statsOf(sql: SqlStorage, userId: string): Partial<Record<AccountStat, number>> {
  const out: Partial<Record<AccountStat, number>> = {};
  for (const row of sql
    .exec<{ stat: string; value: number }>(
      'SELECT stat, value FROM account_stats WHERE user_id = ?',
      userId,
    )
    .toArray()) {
    if (STAT_SET.has(row.stat)) out[row.stat as AccountStat] = row.value;
  }
  return out;
}

/** Records that the player finished a trip at a place; true the first time. */
export function visitPlace(
  sql: SqlStorage,
  userId: string,
  destinationId: string,
  now: number,
): boolean {
  return (
    sql
      .exec(
        `INSERT INTO places_visited (user_id, destination_id, first_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id, destination_id) DO NOTHING RETURNING destination_id`,
        userId,
        destinationId,
        now,
      )
      .toArray().length > 0
  );
}

// --- Supplies in stock ---

/** What a player holds: supply id to amount (only the ones they have). */
export function supplyStock(sql: SqlStorage, userId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of sql
    .exec<{ supply_id: string; amount: number }>(
      'SELECT supply_id, amount FROM supplies WHERE user_id = ? AND amount > 0 ORDER BY supply_id',
      userId,
    )
    .toArray()) {
    if (supplyDef(row.supply_id) !== undefined) out[row.supply_id] = row.amount;
  }
  return out;
}

export function addSupply(sql: SqlStorage, userId: string, supplyId: string, amount: number): void {
  if (supplyDef(supplyId) === undefined) throw new Error('unknown supply');
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('invalid supply amount');
  if (amount === 0) return;
  sql.exec(
    `INSERT INTO supplies (user_id, supply_id, amount) VALUES (?, ?, ?)
     ON CONFLICT(user_id, supply_id) DO UPDATE SET amount = amount + excluded.amount`,
    userId,
    supplyId,
    amount,
  );
}

/** Takes one supply. Returns false and changes nothing if the player has none (it can never go below 0). */
export function takeSupply(sql: SqlStorage, userId: string, supplyId: string): boolean {
  return (
    sql
      .exec(
        `UPDATE supplies SET amount = amount - 1
         WHERE user_id = ? AND supply_id = ? AND amount >= 1 RETURNING amount`,
        userId,
        supplyId,
      )
      .toArray().length > 0
  );
}

/**
 * Takes `amount` of one supply, all or nothing. Returns false and changes nothing if the player has fewer
 * (it can never go below 0).
 */
export function takeSupplies(
  sql: SqlStorage,
  userId: string,
  supplyId: string,
  amount: number,
): boolean {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('invalid supply amount');
  return (
    sql
      .exec(
        `UPDATE supplies SET amount = amount - ?
         WHERE user_id = ? AND supply_id = ? AND amount >= ? RETURNING amount`,
        amount,
        userId,
        supplyId,
        amount,
      )
      .toArray().length > 0
  );
}

// --- Offers ---

export function offerOf(sql: SqlStorage, expeditionId: string): string[] | null {
  const row = sql
    .exec<{ goals_json: string }>(
      'SELECT goals_json FROM expedition_offers WHERE expedition_id = ?',
      expeditionId,
    )
    .toArray()[0];
  if (row === undefined) return null;
  const parsed = v.safeParse(v.array(v.string()), JSON.parse(row.goals_json));
  if (!parsed.success) throw new Error('stored offer is invalid');
  return parsed.output;
}

/** Stores the offer of a trip, once. Returns false if one was stored already. */
export function saveOffer(
  sql: SqlStorage,
  userId: string,
  expeditionId: string,
  goals: readonly string[],
  now: number,
): boolean {
  return (
    sql
      .exec(
        `INSERT INTO expedition_offers (expedition_id, user_id, goals_json, offered_at)
         VALUES (?, ?, ?, ?) ON CONFLICT(expedition_id) DO NOTHING RETURNING expedition_id`,
        expeditionId,
        userId,
        JSON.stringify(goals),
        now,
      )
      .toArray().length > 0
  );
}
