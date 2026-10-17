/**
 * Migration 28: talents and the duplicate choice ("Creatures A", docs/design/gear-and-creatures-v2.md
 * section 8). Never edit a released migration.
 *
 * - `creatures` is rebuilt so a player can hold two creatures of one line (a Kept duplicate, for a line
 *   with two branches): `UNIQUE (user_id, line)` becomes `UNIQUE (user_id, line, line_slot)` with
 *   `line_slot` 1 or 2, so a line never holds more than two. SQLite cannot drop a constraint in place,
 *   so the table is copied (every column, same ids, same order); nothing else refers to a creature by
 *   anything but its id.
 * - `creature_talents` is the Talent Book: every talent a creature has held, golden or not, with the
 *   slot (1 to 3) it sits in now, or NULL when it only sits in the book. A slot holds one talent.
 * - `raid_festival_grants` is rebuilt for the same reason (its `outcome` check did not know `duplicate`) and
 *   gains `talent_json`, the talent the grant rolled and the id of its pending card.
 * - `pending_catches` are the duplicates waiting for a choice (Teach, Fuse, Release or Keep), each with
 *   the talent it rolled at the catch. Rolled once, at the claim, with live randomness.
 *
 * Existing creatures get their open talent slots rolled once, in the Durable Object right after the
 * migrations (`rollMissingTalents`): a creature with no row in `creature_talents` has not been rolled.
 */
export function creaturesAMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE creatures_v2 (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    line TEXT NOT NULL,
    species TEXT NOT NULL,
    level INTEGER NOT NULL CHECK (level >= 1),
    fusion_count INTEGER NOT NULL DEFAULT 0 CHECK (fusion_count BETWEEN 0 AND 5),
    shiny INTEGER NOT NULL DEFAULT 0,
    nickname TEXT,
    away_expedition_id TEXT,
    origin TEXT NOT NULL,
    caught_at INTEGER NOT NULL,
    quirk_id TEXT,
    line_slot INTEGER NOT NULL DEFAULT 1 CHECK (line_slot IN (1, 2)),
    UNIQUE (user_id, line, line_slot)
  )`);
  // Same order as the old table's rowid, so "the first creature of a line" never changes.
  sql.exec(`INSERT INTO creatures_v2
    (id, user_id, line, species, level, fusion_count, shiny, nickname, away_expedition_id, origin,
     caught_at, quirk_id, line_slot)
    SELECT id, user_id, line, species, level, fusion_count, shiny, nickname, away_expedition_id,
           origin, caught_at, quirk_id, 1
    FROM creatures ORDER BY rowid`);
  sql.exec('DROP TABLE creatures');
  sql.exec('ALTER TABLE creatures_v2 RENAME TO creatures');
  sql.exec('CREATE INDEX creatures_user ON creatures(user_id, caught_at)');

  sql.exec(`CREATE TABLE creature_talents (
    creature_id TEXT NOT NULL,
    talent_id TEXT NOT NULL,
    golden INTEGER NOT NULL DEFAULT 0 CHECK (golden IN (0, 1)),
    slot INTEGER CHECK (slot IS NULL OR slot BETWEEN 1 AND 3),
    gained_at INTEGER NOT NULL,
    PRIMARY KEY (creature_id, talent_id, golden)
  )`);
  sql.exec(
    'CREATE UNIQUE INDEX creature_talents_slot ON creature_talents(creature_id, slot) WHERE slot IS NOT NULL',
  );

  sql.exec(`CREATE TABLE pending_catches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    line TEXT NOT NULL,
    species TEXT NOT NULL,
    shiny INTEGER NOT NULL DEFAULT 0,
    talent_id TEXT NOT NULL,
    golden INTEGER NOT NULL DEFAULT 0 CHECK (golden IN (0, 1)),
    source TEXT NOT NULL CHECK (source IN ('expedition', 'festival')),
    source_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX pending_catches_user ON pending_catches(user_id, created_at)');

  sql.exec(`CREATE TABLE raid_festival_grants_v2 (
    week_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    species TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('new', 'duplicate', 'fused', 'converted')),
    fusion_count INTEGER,
    bait INTEGER,
    first_on_server INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    talent_json TEXT,
    PRIMARY KEY (week_id, user_id)
  )`);
  sql.exec(`INSERT INTO raid_festival_grants_v2
    (week_id, user_id, species, outcome, fusion_count, bait, first_on_server, created_at)
    SELECT week_id, user_id, species, outcome, fusion_count, bait, first_on_server, created_at
    FROM raid_festival_grants`);
  sql.exec('DROP TABLE raid_festival_grants');
  sql.exec('ALTER TABLE raid_festival_grants_v2 RENAME TO raid_festival_grants');
}
