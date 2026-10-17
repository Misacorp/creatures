/**
 * The one-time level reset at the switch to training by activity (decisions.md, 2026-10-17: "creature
 * levels halved at the switch, Bait refunded"; spec docs/design/gear-and-creatures-v2.md section 12).
 *
 * Bait used to buy levels; from migration 30 levels come from what a creature does. So, once per player,
 * in the guild's Durable Object right after the migrations (`GuildCore.migrate`), every creature's level
 * becomes `max(1, floor(old / 2))` with no experience banked, and the Bait the removed levels cost comes
 * back as one credit.
 *
 * - **Refund.** The old training price was `3 + 2 x L` Bait for the step from level L to L + 1 (full
 *   price, the catch-up discount ignored). The refund is the sum of that price for every L from the new
 *   level up to the old level minus one. Level 30 becomes 15 and gets back 705 Bait (L = 15 to 29); level 12
 *   becomes 6 and gets back 120 (L = 6 to 11). The numbers are written out here on purpose: the old
 *   `RULES.training` is gone, and a one-time conversion must not change when the rules are tuned.
 * - **Ribbons** follow the new level (`ribbonsForLevel`: Bronze above level 10, Silver above 20), not the
 *   old one. A creature that is now at a gate waits for its ribbon like any other.
 * - **Evolution** stays: the species is not touched, so an evolved creature stays evolved below level 15.
 * - **Gear:** a worn item the creature may no longer wear (its item level or its slot is above the new
 *   level) goes back to the bag. Worn items already count against the bag cap, so taking one off never
 *   overflows it.
 * - **Talents:** a talent in a slot the new level does not open goes back to the creature's Talent Book
 *   (slot NULL): it is kept, not lost.
 * - Teams and drafts hold creature ids only and fights read the level live, so nothing else is cached.
 *
 * Who is converted: the players who own creatures the first time this code runs on a guild (the table
 * `level_reset` does not exist yet; it is created and filled in one transaction). A player who arrives
 * later is never listed. A player is converted in one transaction that also stamps the table and credits
 * the Bait under its own ledger key (`level-reset:<user>`), so a crash leaves the player pending whole
 * and a second call changes nothing. One bad player never stops the guild from starting.
 *
 * Order with the gear conversion (migration 27): this runs after it. If the gear conversion already
 * ran, the wear check above fixes any item the halved level cannot wear. If it failed for a player and
 * runs later, it reads the halved level itself. Either way the wear rule holds at the end.
 */
import { content, ribbonsForLevel, slotsOpen, wearBlock } from '@creatures/game';
import type { Analytics } from './analytics';
import { rowToItem, type GearRow } from './gear-store';
import { credit, type LedgerStorage } from './ledger';

/** The old training price from level L to L + 1: `OLD_TRAINING_BASE + OLD_TRAINING_PER_LEVEL x L`. */
export const OLD_TRAINING_BASE = 3;
export const OLD_TRAINING_PER_LEVEL = 2;

/** The level a creature of `level` has after the reset: half, rounded down, never below 1. */
export function halvedLevel(level: number): number {
  return Math.max(1, Math.floor(level / 2));
}

/**
 * The Bait the levels between the halved level and `level` cost under the old price (zero for level 1).
 * Level 30: 705. Level 12: 120.
 */
export function levelResetRefund(level: number): number {
  let bait = 0;
  for (let l = halvedLevel(level); l < level; l++) {
    bait += OLD_TRAINING_BASE + OLD_TRAINING_PER_LEVEL * l;
  }
  return bait;
}

/** What the one-time card tells the player. Counts only. */
export interface LevelResetNotice {
  /** How many creatures had their level halved. */
  creatures: number;
  /** The Bait given back. */
  bait: number;
  /** Worn items that went back to the bag because their creature may no longer wear them. */
  unequipped: number;
  /** Talents that went back to a Talent Book because their slot is not open any more. */
  talentsToBook: number;
}

type CreatureRow = { id: string; species: string; level: number };

export interface LevelResetDeps {
  storage: LedgerStorage;
  now: () => number;
  analytics?: Analytics | undefined;
}

/** True when the table of the conversion exists (a database that has already seen this code). */
function tableExists(sql: SqlStorage): boolean {
  return (
    sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'level_reset'").toArray()
      .length > 0
  );
}

/**
 * Creates the list of players to convert the first time it is called on a database: every player who
 * owns a creature then. Later calls find the table and do nothing, so a new player is never listed.
 * Returns true when the list was made now.
 */
function listPlayers(deps: LevelResetDeps): boolean {
  const sql = deps.storage.sql;
  if (tableExists(sql)) return false;
  deps.storage.transactionSync(() => {
    sql.exec(`CREATE TABLE level_reset (
      user_id TEXT PRIMARY KEY,
      converted_at INTEGER,
      notice_json TEXT,
      seen_at INTEGER
    )`);
    sql.exec('INSERT INTO level_reset (user_id) SELECT DISTINCT user_id FROM creatures');
  });
  return true;
}

/** Converts one player. Call inside a transaction. */
function resetPlayer(deps: LevelResetDeps, userId: string): void {
  const { storage } = deps;
  const sql = storage.sql;
  const now = deps.now();
  const creatures = sql
    .exec<CreatureRow>(
      'SELECT id, species, level FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
      userId,
    )
    .toArray();
  const notice: LevelResetNotice = { creatures: 0, bait: 0, unequipped: 0, talentsToBook: 0 };
  let levelsRemoved = 0;
  for (const creature of creatures) {
    const level = halvedLevel(creature.level);
    if (level < creature.level) notice.creatures += 1;
    levelsRemoved += creature.level - level;
    notice.bait += levelResetRefund(creature.level);
    sql.exec(
      'UPDATE creatures SET level = ?, exp = 0, ribbons = ? WHERE id = ?',
      level,
      ribbonsForLevel(level),
      creature.id,
    );
    // A species the content does not know (an old test database) keeps its talents and gear.
    const species = content.creatures.find((c) => c.id === creature.species);
    if (species === undefined) continue;

    const open = Math.max(1, slotsOpen(species.rarity, level));
    notice.talentsToBook += sql
      .exec(
        'UPDATE creature_talents SET slot = NULL WHERE creature_id = ? AND slot > ? RETURNING talent_id',
        creature.id,
        open,
      )
      .toArray().length;

    const worn = sql
      .exec<GearRow>('SELECT * FROM gear_items WHERE equipped_on = ?', creature.id)
      .toArray();
    for (const row of worn) {
      if (wearBlock(rowToItem(row), { level, role: species.role }) === null) continue;
      sql.exec('UPDATE gear_items SET equipped_on = NULL WHERE id = ?', row.id);
      notice.unequipped += 1;
    }
  }
  if (notice.bait > 0) {
    credit(
      storage,
      {
        userId,
        currency: 'bait',
        amount: notice.bait,
        source: 'level_reset',
        idempotencyKey: `level-reset:${userId}`,
        meta: { creatures: creatures.length, levels: levelsRemoved },
      },
      now,
    );
  }
  // A player whose creatures are all at level 1 lost nothing: stamped, but no card and no event.
  const changed = notice.creatures > 0;
  sql.exec(
    'UPDATE level_reset SET converted_at = ?, notice_json = ? WHERE user_id = ? AND converted_at IS NULL',
    now,
    changed ? JSON.stringify(notice) : null,
    userId,
  );
  if (!changed) return;
  deps.analytics?.record(
    {
      kind: 'level_reset',
      creatures: notice.creatures,
      levels: levelsRemoved,
      bait: notice.bait,
      unequipped: notice.unequipped,
      talentsToBook: notice.talentsToBook,
    },
    userId,
  );
}

/**
 * Converts every player who is waiting. Returns how many were converted. Safe to call on every start:
 * with nobody waiting it does nothing.
 */
export function convertPendingLevels(deps: LevelResetDeps): number {
  const sql = deps.storage.sql;
  listPlayers(deps);
  const waiting = sql
    .exec<{ user_id: string }>(
      'SELECT user_id FROM level_reset WHERE converted_at IS NULL ORDER BY user_id',
    )
    .toArray();
  let converted = 0;
  for (const { user_id: userId } of waiting) {
    // One bad row must not stop the guild from starting: the player stays pending (their transaction
    // rolled back whole) and the next start tries again. Nothing about the player goes in the log.
    try {
      deps.storage.transactionSync(() => {
        resetPlayer(deps, userId);
      });
      converted += 1;
    } catch (err) {
      console.error(
        'level reset failed, player left pending',
        err instanceof Error ? err.name : 'unknown',
      );
    }
  }
  return converted;
}

/** The notice a player has not dismissed yet, or null (also null before the table exists). */
export function pendingLevelReset(sql: SqlStorage, userId: string): LevelResetNotice | null {
  if (!tableExists(sql)) return null;
  const row = sql
    .exec<{
      notice_json: string | null;
      seen_at: number | null;
    }>('SELECT notice_json, seen_at FROM level_reset WHERE user_id = ?', userId)
    .toArray()[0];
  if (row === undefined || row.notice_json === null || row.seen_at !== null) return null;
  return JSON.parse(row.notice_json) as LevelResetNotice;
}

/** Marks the player's notice as seen (repeats change nothing). */
export function dismissLevelReset(sql: SqlStorage, userId: string, now: number): void {
  if (!tableExists(sql)) return;
  sql.exec(
    'UPDATE level_reset SET seen_at = ? WHERE user_id = ? AND notice_json IS NOT NULL AND seen_at IS NULL',
    now,
    userId,
  );
}
