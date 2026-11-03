/**
 * SQL helpers for the v2 Talent Book (R20, `docs/design/combat/proposals/001-combat-v2.md`; tables of
 * migration 51). Synchronous and meant for a `transactionSync`. Nothing here decides game rules beyond the
 * rolls: the pools and the role test are in `@creatures/game/combat-v2`, the actions in `creature-v2.ts`.
 *
 * - `line_talents` is the line's book, one per player and line: every talent found on the line.
 * - `creature_talents_v2` is what a creature has learned from its line's book, and the slot it sits in.
 *
 * A catch (and a duplicate catch, and a role change's roll) records its talent in the book. A new creature
 * also learns it and slots it in slot 1. Live randomness is drawn at the moment of the roll, from the rng
 * the caller passes (the talent rng: crypto on the server, seeded in tests).
 */
import type { Rng, Role } from '@creatures/game';
import { rollShippedV2Talent, v2TalentWorksFor, type V2Roll } from '@creatures/game/combat-v2';

/** One talent in a line's book. */
export interface BookEntry {
  talentId: string;
  golden: boolean;
  foundAt: number;
}

/** A talent a creature has learned, and its slot (null: learned, not slotted). */
export interface LearnedTalent {
  talentId: string;
  slot: number | null;
}

/** What a role change did to one slot: the talent that was idle, and the roll that replaced it (null: nothing was left to roll). */
export interface TalentReplacement {
  slot: number;
  from: string;
  to: string | null;
  golden: boolean;
}

type BookRow = { line: string; talent_id: string; golden: number; found_at: number };

/** A player's whole Talent Book: every line's entries, by line (one query, the primary key answers it). */
export function booksByLine(sql: SqlStorage, userId: string): Map<string, BookEntry[]> {
  const map = new Map<string, BookEntry[]>();
  const rows = sql
    .exec<BookRow>(
      'SELECT line, talent_id, golden, found_at FROM line_talents WHERE user_id = ?',
      userId,
    )
    .toArray();
  for (const row of rows) {
    const list = map.get(row.line) ?? [];
    list.push({ talentId: row.talent_id, golden: row.golden === 1, foundAt: row.found_at });
    map.set(row.line, list);
  }
  return map;
}

/** One line's book, oldest find first. */
export function lineBook(sql: SqlStorage, userId: string, line: string): BookEntry[] {
  return sql
    .exec<BookRow>(
      'SELECT line, talent_id, golden, found_at FROM line_talents WHERE user_id = ? AND line = ?',
      userId,
      line,
    )
    .toArray()
    .map((row) => ({ talentId: row.talent_id, golden: row.golden === 1, foundAt: row.found_at }));
}

/** What the creatures of a player have learned, by creature id (one query over the player's creatures). */
export function learnedByCreature(sql: SqlStorage, userId: string): Map<string, LearnedTalent[]> {
  const map = new Map<string, LearnedTalent[]>();
  const rows = sql
    .exec<{ creature_id: string; talent_id: string; slot: number | null }>(
      `SELECT t.creature_id, t.talent_id, t.slot FROM creature_talents_v2 t
       JOIN creatures c ON c.id = t.creature_id
       WHERE c.user_id = ? ORDER BY t.learned_at, t.talent_id`,
      userId,
    )
    .toArray();
  for (const row of rows) {
    const list = map.get(row.creature_id) ?? [];
    list.push({ talentId: row.talent_id, slot: row.slot });
    map.set(row.creature_id, list);
  }
  return map;
}

/** What one creature has learned (the primary key answers it). */
export function learnedOf(sql: SqlStorage, creatureId: string): LearnedTalent[] {
  return sql
    .exec<{ talent_id: string; slot: number | null }>(
      'SELECT talent_id, slot FROM creature_talents_v2 WHERE creature_id = ? ORDER BY learned_at, talent_id',
      creatureId,
    )
    .toArray()
    .map((row) => ({ talentId: row.talent_id, slot: row.slot }));
}

/**
 * Records a found talent in the line's book. A talent already in the book stays (once per line); a golden
 * find makes the book's entry golden. Returns whether the book gained a new talent.
 */
export function recordFound(
  sql: SqlStorage,
  userId: string,
  line: string,
  roll: V2Roll,
  now: number,
): boolean {
  const had =
    sql
      .exec(
        'SELECT 1 FROM line_talents WHERE user_id = ? AND line = ? AND talent_id = ?',
        userId,
        line,
        roll.talentId,
      )
      .toArray().length > 0;
  sql.exec(
    `INSERT INTO line_talents (user_id, line, talent_id, golden, found_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, line, talent_id) DO UPDATE SET golden = MAX(golden, excluded.golden)`,
    userId,
    line,
    roll.talentId,
    roll.golden ? 1 : 0,
    now,
  );
  return !had;
}

/**
 * A creature caught or granted: rolls its talent from the line's v2 pool, records it in the line's book,
 * and has the creature learn it in slot 1 (free: it is the talent it was found with). Returns the roll.
 */
export function grantFirstTalent(
  sql: SqlStorage,
  rng: Rng,
  input: { creatureId: string; userId: string; line: string; now: number },
): V2Roll {
  const roll = rollShippedV2Talent(rng, input.line) as V2Roll;
  recordFound(sql, input.userId, input.line, roll, input.now);
  sql.exec(
    'INSERT INTO creature_talents_v2 (creature_id, talent_id, slot, learned_at) VALUES (?, ?, 1, ?)',
    input.creatureId,
    roll.talentId,
    input.now,
  );
  return roll;
}

/** A duplicate catch: rolls a talent from the line's pool and records it in the book (no creature learns it). */
export function recordDuplicateTalent(
  sql: SqlStorage,
  rng: Rng,
  input: { userId: string; line: string; now: number },
): V2Roll {
  const roll = rollShippedV2Talent(rng, input.line) as V2Roll;
  recordFound(sql, input.userId, input.line, roll, input.now);
  return roll;
}

/** Whether the creature has learned any v2 talent (the conversion tool rolls for those that have none). */
export function hasLearned(sql: SqlStorage, creatureId: string): boolean {
  return (
    sql
      .exec('SELECT 1 FROM creature_talents_v2 WHERE creature_id = ? LIMIT 1', creatureId)
      .toArray().length > 0
  );
}

/** The creature learns a talent from the book (not slotted). Returns false when it already has. */
export function learnTalent(
  sql: SqlStorage,
  creatureId: string,
  talentId: string,
  now: number,
): boolean {
  const had =
    sql
      .exec(
        'SELECT 1 FROM creature_talents_v2 WHERE creature_id = ? AND talent_id = ?',
        creatureId,
        talentId,
      )
      .toArray().length > 0;
  if (had) return false;
  sql.exec(
    'INSERT INTO creature_talents_v2 (creature_id, talent_id, slot, learned_at) VALUES (?, ?, NULL, ?)',
    creatureId,
    talentId,
    now,
  );
  return true;
}

/**
 * Puts a learned talent in `slot` (1 to 3) or takes it out of its slot (`null`). Whatever sat in the slot
 * goes back to being learned only; a talent already slotted elsewhere moves. The caller has checked the
 * creature has learned the talent and that the slot is open.
 */
export function setTalentSlot(
  sql: SqlStorage,
  creatureId: string,
  talentId: string,
  slot: number | null,
): void {
  sql.exec(
    'UPDATE creature_talents_v2 SET slot = NULL WHERE creature_id = ? AND (talent_id = ? OR slot = ?)',
    creatureId,
    talentId,
    slot,
  );
  if (slot !== null) {
    sql.exec(
      'UPDATE creature_talents_v2 SET slot = ? WHERE creature_id = ? AND talent_id = ?',
      slot,
      creatureId,
      talentId,
    );
  }
}

/**
 * A role-changing evolution (R20.8): each slotted talent that is idle for `role` leaves its slot (it stays
 * learned and in the book) and a roll takes the slot: a talent from the line's pool that works for the new
 * role and is not in the book yet, recorded in the book and learned. When no such talent is left, the slot
 * stays empty. Returns what happened per slot, in slot order, so the client can reveal it later.
 */
export function replaceIdleTalents(
  sql: SqlStorage,
  rng: Rng,
  input: { creatureId: string; userId: string; line: string; role: Role; now: number },
): TalentReplacement[] {
  const slotted = sql
    .exec<{ talent_id: string; slot: number }>(
      'SELECT talent_id, slot FROM creature_talents_v2 WHERE creature_id = ? AND slot IS NOT NULL ORDER BY slot',
      input.creatureId,
    )
    .toArray();
  const replaced: TalentReplacement[] = [];
  for (const held of slotted) {
    if (v2TalentWorksFor(held.talent_id, input.role)) continue;
    const inBook = new Set(lineBook(sql, input.userId, input.line).map((e) => e.talentId));
    const roll = rollShippedV2Talent(rng, input.line, { exclude: inBook, role: input.role });
    setTalentSlot(sql, input.creatureId, held.talent_id, null);
    if (roll !== null) {
      recordFound(sql, input.userId, input.line, roll, input.now);
      learnTalent(sql, input.creatureId, roll.talentId, input.now);
      setTalentSlot(sql, input.creatureId, roll.talentId, held.slot);
    }
    replaced.push({
      slot: held.slot,
      from: held.talent_id,
      to: roll?.talentId ?? null,
      golden: roll?.golden === true,
    });
  }
  return replaced;
}
