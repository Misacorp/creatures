/**
 * What every dev tool gets (see `dev-tools.ts`): the caller, the game clock read once, the guild's
 * timezone and the storage. Tools are plain functions over this, so each is small and testable.
 */
import type { Rng } from '@creatures/game';
import type { DevState } from './dev-state';
import type { LedgerStorage } from './ledger';
import type { Raid } from './raid';

/** A tool that refuses: rolls the tool's transaction back and becomes `{ error }` with this status. */
export class DevError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 501,
    readonly code: string,
  ) {
    super(code);
    this.name = 'DevError';
  }
}

export interface ToolCtx {
  /** The session's player. Tools never act on anybody else (guests of the raid roster aside). */
  userId: string;
  storage: LedgerStorage;
  sql: SqlStorage;
  /** The game clock, read once when the tool started. */
  now: number;
  /** The real clock. */
  realNow: number;
  /** The guild's timezone. */
  tz: string;
  state: DevState;
  raid: Raid;
  /** Crypto randomness for the things the tools roll (guest teams, gear, the day's seed). */
  rng: Rng;
  gearRng: Rng;
  quirkRng: Rng;
  talentRng: Rng;
  /** The dev clock offset: read, and write (a non-negative integer of ms). */
  offset: { get(): number; set(ms: number): void };
}

/** Tables that are about the guild or about sign-in, never about one player's game. */
const KEEP_TABLES: ReadonlySet<string> = new Set([
  'schema_version',
  'guild_meta',
  'sessions',
  'dev_state',
  'players',
]);

/**
 * Deletes everything the game stored about one player: every table with a `user_id` column except sign-in
 * and guild tables. With `keepPlayer` false the player row goes too (a simulated guest). Table names come
 * from the schema itself, never from a request.
 */
export function purgeUser(sql: SqlStorage, userId: string, keepPlayer: boolean): void {
  const tables = sql
    .exec<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
    )
    .toArray();
  for (const { name } of tables) {
    if (KEEP_TABLES.has(name)) continue;
    const hasUser =
      sql.exec("SELECT 1 FROM pragma_table_info(?) WHERE name = 'user_id'", name).toArray().length >
      0;
    if (hasUser) sql.exec(`DELETE FROM "${name.replaceAll('"', '""')}" WHERE user_id = ?`, userId);
  }
  if (!keepPlayer) {
    sql.exec('DELETE FROM sessions WHERE user_id = ?', userId);
    sql.exec('DELETE FROM players WHERE user_id = ?', userId);
  }
}

/** Throws a 409 `DevError` unless the caller owns the creature; returns its row. */
export function ownCreature(
  ctx: ToolCtx,
  creatureId: string,
): { id: string; species: string; line: string; level: number; fusion_count: number } {
  const row = ctx.sql
    .exec<{ id: string; species: string; line: string; level: number; fusion_count: number }>(
      'SELECT id, species, line, level, fusion_count FROM creatures WHERE id = ? AND user_id = ?',
      creatureId,
      ctx.userId,
    )
    .toArray()[0];
  // The same answer for "does not exist" and "belongs to someone else".
  if (row === undefined) throw new DevError(404, 'not_found');
  return row;
}
