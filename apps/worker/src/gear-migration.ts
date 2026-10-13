/**
 * Migration 17: gear and crafting (see `gear.ts` and `docs/design/gear.md`). Like the other game
 * tables there are no foreign keys: rows are only written by the gear code, always inside a
 * transaction. Never edit a released migration. Times are UTC epoch milliseconds, every amount is an
 * integer, and no amount can be negative.
 */
export function gearMigration(sql: SqlStorage): void {
  // One row per item a player owns. `equipped_on` is the creature wearing it: UNIQUE, so a creature
  // wears at most one item (NULLs do not collide), and an item is on at most one creature because it
  // is one row.
  sql.exec(`CREATE TABLE gear_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    base_id TEXT NOT NULL,
    rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'festival')),
    level INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 5),
    rolls_json TEXT NOT NULL,
    enchant_id TEXT,
    equipped_on TEXT UNIQUE,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX gear_items_user ON gear_items(user_id, created_at)');

  // Parts a player holds, by kind.
  sql.exec(`CREATE TABLE parts (
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    PRIMARY KEY (user_id, kind)
  )`);

  // Blueprints a player has learned: one per base, learned once.
  sql.exec(`CREATE TABLE blueprints (
    user_id TEXT NOT NULL,
    base_id TEXT NOT NULL,
    rarity TEXT NOT NULL,
    learned_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, base_id)
  )`);

  // Workshop jobs. A job is open until `claimed_at` is set. `gear_id` is the item an improve or
  // enchant works on (NULL for a craft). The partial unique indexes make the busy rules a database
  // fact: a creature is on at most one open job, and an item is in at most one open job.
  sql.exec(`CREATE TABLE workshop_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('craft', 'improve', 'enchant')),
    gear_id TEXT,
    input_json TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    claimed_at INTEGER,
    result_json TEXT
  )`);
  sql.exec(
    'CREATE UNIQUE INDEX workshop_jobs_creature_open ON workshop_jobs(creature_id) WHERE claimed_at IS NULL',
  );
  sql.exec(
    'CREATE UNIQUE INDEX workshop_jobs_gear_open ON workshop_jobs(gear_id) WHERE claimed_at IS NULL AND gear_id IS NOT NULL',
  );
  sql.exec('CREATE INDEX workshop_jobs_user ON workshop_jobs(user_id, claimed_at)');

  // The Crafting skill of each creature: total XP (the level is computed).
  sql.exec(`CREATE TABLE crafting_skill (
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    xp INTEGER NOT NULL CHECK (xp >= 0),
    PRIMARY KEY (user_id, creature_id)
  )`);

  // Grant ledger: one row per (player, key), so a drop (a raid phase, a finale, a Festival, an
  // expedition claim, the welcome kit) is applied once and a repeat returns what it gave.
  sql.exec(`CREATE TABLE gear_grants (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    source TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  )`);
  sql.exec('CREATE INDEX gear_grants_recent ON gear_grants(user_id, created_at)');

  // Idempotency of the player's own actions (upgrade, dismantle, start and claim a job): the client's
  // key, what the action was (`fingerprint`) and the stored result a retry gets back.
  sql.exec(`CREATE TABLE gear_actions (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    kind TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  )`);
  sql.exec('CREATE INDEX gear_actions_at ON gear_actions(created_at)');
}
