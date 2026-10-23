/**
 * SQL helpers for talents, the Talent Book and new creatures (tables of migration 28). Synchronous and
 * meant for a `transactionSync`. Nothing here decides game rules: the rules are in `@creatures/game`
 * (`rules/talents.ts`, `rules/duplicates.ts`) and the actions in `catch-choices.ts` and `collection.ts`.
 *
 * Every creature is made through `insertCreature`, which gives it a quirk and its first talent, drawn at
 * that moment from live randomness. A creature without a row in `creature_talents` has not been rolled
 * yet (only creatures that existed before migration 28, rolled once by `rollMissingTalents`).
 */
import {
  activeTalents,
  content,
  pickQuirk,
  rollTalent,
  slotsOpen,
  type FoldTalent,
  type HeldTalent,
  type Rng,
  type TalentRoll,
} from '@creatures/game';
import type { Analytics } from './analytics';
import { speciesOf } from './species';

type TalentRow = {
  creature_id: string;
  talent_id: string;
  golden: number;
  slot: number | null;
  gained_at: number;
};

const toHeld = (row: TalentRow): HeldTalent => ({
  talentId: row.talent_id,
  golden: row.golden === 1,
  slot: row.slot,
});

/** Every talent a creature has held, in the order it got them (its Talent Book). */
export function bookOf(sql: SqlStorage, creatureId: string): HeldTalent[] {
  return sql
    .exec<TalentRow>(
      'SELECT * FROM creature_talents WHERE creature_id = ? ORDER BY gained_at, rowid',
      creatureId,
    )
    .toArray()
    .map(toHeld);
}

/**
 * The Talent Books of all of a player's creatures, by creature id (one query). Empty while the table does
 * not exist yet: an older migration (the raid board repair) reads creatures before migration 28 has run.
 */
export function booksByCreature(sql: SqlStorage, userId: string): Map<string, HeldTalent[]> {
  const map = new Map<string, HeldTalent[]>();
  let found: TalentRow[];
  try {
    found = sql
      .exec<TalentRow>(
        `SELECT t.* FROM creature_talents t JOIN creatures c ON c.id = t.creature_id
         WHERE c.user_id = ? ORDER BY t.gained_at, t.rowid`,
        userId,
      )
      .toArray();
  } catch (err) {
    // Asking `sqlite_master` first read the whole schema (about 150 rows) on every call.
    if (err instanceof Error && err.message.includes('no such table')) return map;
    throw err;
  }
  for (const row of found) {
    const list = map.get(row.creature_id) ?? [];
    list.push(toHeld(row));
    map.set(row.creature_id, list);
  }
  return map;
}

/** The talents that are active on a creature now (its signature and the open slots), for the fold. */
export function foldTalentsOf(
  creature: { species: string; level: number },
  book: readonly HeldTalent[] | undefined,
): FoldTalent[] {
  const species = speciesOf(creature.species);
  return activeTalents(species.line, species.rarity, creature.level, book ?? []);
}

/** The active talents of one creature, read from the database (trips and the Workshop use this). */
export function activeTalentsOf(
  sql: SqlStorage,
  creature: { id: string; species: string; level: number },
): FoldTalent[] {
  return foldTalentsOf(creature, bookOf(sql, creature.id));
}

/**
 * Puts a talent in a creature's book, in `slot` (1 to 3) or in the book only (`null`). A slot holds one
 * talent: whatever sat in it goes back to being a book entry. Returns false (changing nothing) when the
 * book already has that talent at that quality.
 */
export function holdTalent(
  sql: SqlStorage,
  creatureId: string,
  roll: TalentRoll,
  slot: number | null,
  now: number,
): boolean {
  const have = sql
    .exec(
      'SELECT 1 FROM creature_talents WHERE creature_id = ? AND talent_id = ? AND golden = ?',
      creatureId,
      roll.talentId,
      roll.golden ? 1 : 0,
    )
    .toArray();
  if (have.length > 0) return false;
  if (slot !== null) {
    sql.exec(
      'UPDATE creature_talents SET slot = NULL WHERE creature_id = ? AND slot = ?',
      creatureId,
      slot,
    );
  }
  sql.exec(
    `INSERT INTO creature_talents (creature_id, talent_id, golden, slot, gained_at)
     VALUES (?, ?, ?, ?, ?)`,
    creatureId,
    roll.talentId,
    roll.golden ? 1 : 0,
    slot,
    now,
  );
  return true;
}

/**
 * Moves a talent that is already in the book into a slot, taking the talent that sat there out of it
 * (it stays in the book). Returns false when the book does not hold that talent at that quality.
 */
export function slotTalent(
  sql: SqlStorage,
  creatureId: string,
  roll: TalentRoll,
  slot: number,
): boolean {
  const have = sql
    .exec(
      'SELECT 1 FROM creature_talents WHERE creature_id = ? AND talent_id = ? AND golden = ?',
      creatureId,
      roll.talentId,
      roll.golden ? 1 : 0,
    )
    .toArray();
  if (have.length === 0) return false;
  sql.exec(
    'UPDATE creature_talents SET slot = NULL WHERE creature_id = ? AND (slot = ? OR (talent_id = ? AND golden = ?))',
    creatureId,
    slot,
    roll.talentId,
    roll.golden ? 1 : 0,
  );
  sql.exec(
    'UPDATE creature_talents SET slot = ? WHERE creature_id = ? AND talent_id = ? AND golden = ?',
    slot,
    creatureId,
    roll.talentId,
    roll.golden ? 1 : 0,
  );
  return true;
}

/** What a new creature is made of. */
export interface NewCreature {
  userId: string;
  species: string;
  origin: string;
  shiny?: boolean;
  /** 1, or 2 for a Kept duplicate of a branching line. */
  lineSlot?: 1 | 2;
  /** The talent it already has (a Kept duplicate keeps the one it rolled); absent: rolled now. */
  talent?: TalentRoll;
  now: number;
}

export interface CreatureRngs {
  /** The cosmetic quirk. */
  quirk: Rng;
  /** The first talent. */
  talent: Rng;
}

/**
 * Inserts a creature (level 1, no fusions): its quirk and its first talent are drawn now from live
 * randomness, after whatever decided to make it. The talent goes in slot 1. Returns the new id and what
 * the talent rolled.
 */
export function insertCreature(
  sql: SqlStorage,
  rngs: CreatureRngs,
  input: NewCreature,
  analytics?: Analytics,
): { id: string; talent: TalentRoll } {
  const species = speciesOf(input.species);
  const id = crypto.randomUUID();
  sql.exec(
    `INSERT INTO creatures (id, user_id, line, species, level, shiny, origin, caught_at, quirk_id, line_slot)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    id,
    input.userId,
    species.line,
    species.id,
    input.shiny === true ? 1 : 0,
    input.origin,
    input.now,
    pickQuirk(species.id, rngs.quirk),
    input.lineSlot ?? 1,
  );
  const talent = input.talent ?? rollTalent(rngs.talent, species.line);
  holdTalent(sql, id, talent, 1, input.now);
  if (input.talent === undefined) {
    analytics?.record(
      { kind: 'talent_roll', species: species.id, talent: talent.talentId, golden: talent.golden },
      input.userId,
    );
  }
  return { id, talent };
}

/**
 * Rolls the open slots of every creature that has no talent yet (one for each slot its level has opened),
 * once, with live randomness: the existing players' creatures on the first load after migration 28. A
 * creature never rolls the same talent twice. Idempotent: afterwards every creature has a row, so a
 * second call changes and draws nothing. Returns how many creatures were rolled.
 */
export function rollMissingTalents(
  storage: { sql: SqlStorage; transactionSync<T>(fn: () => T): T },
  rng: Rng,
  now: number,
  analytics?: Analytics,
): number {
  const sql = storage.sql;
  const waiting = sql
    .exec<{ id: string; user_id: string; species: string; level: number }>(
      `SELECT id, user_id, species, level FROM creatures c
       WHERE NOT EXISTS (SELECT 1 FROM creature_talents t WHERE t.creature_id = c.id)
       ORDER BY caught_at, rowid`,
    )
    .toArray();
  for (const row of waiting) {
    // A creature of a species the content does not know (only an old test database) is left alone.
    if (!content.creatures.some((c) => c.id === row.species)) continue;
    storage.transactionSync(() => {
      const species = speciesOf(row.species);
      const slots = Math.max(1, slotsOpen(species.rarity, row.level));
      const taken = new Set<string>();
      for (let slot = 1; slot <= slots; slot++) {
        const roll = rollTalent(rng, species.line, taken);
        taken.add(roll.talentId);
        holdTalent(sql, row.id, roll, slot, now);
        analytics?.record(
          {
            kind: 'talent_roll',
            species: species.id,
            talent: roll.talentId,
            golden: roll.golden,
            backfill: true,
          },
          row.user_id,
        );
      }
    });
  }
  return waiting.length;
}
