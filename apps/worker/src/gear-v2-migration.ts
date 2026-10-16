/**
 * Migration 27: gear v2 (Hat, Scarf, Charm; see `gear-items.ts` in `@creatures/game` and
 * `docs/design/gear-and-creatures-v2.md`). Never edit a released migration.
 *
 * This migration only changes the shape of the data. The old items are copied to `gear_legacy` and
 * the new `gear_items` starts empty; the conversion itself (new lines are rolled with live
 * randomness, parts and Essence are refunded, blueprints are mapped) runs in the Durable Object right
 * after migrations, once per player (`gear-convert.ts`), and is idempotent: a player's row in
 * `gear_conversion` is stamped when it is done. Nothing is rolled here and nothing is lost: the
 * legacy rows stay until their owner is converted.
 */
export function gearV2Migration(sql: SqlStorage): void {
  // The old items, as they were (no constraints), waiting for their owner's conversion.
  sql.exec('CREATE TABLE gear_legacy AS SELECT * FROM gear_items');
  sql.exec('DROP TABLE gear_items');

  // One row per item a player owns. `equipped_on` is the creature wearing it. The unique index lets a
  // creature wear one item per slot (and an item is on at most one creature because it is one row).
  // `lines_json` holds the rolled lines (`[{ id, tier }]`, tier 0 to 4); the base line and the Festival
  // glow come from the base. `made_by` is the creature that crafted it (its name at the time is kept
  // as plain text) and `made_at` when; `origin_json` says where else it came from (a boss and rank, a
  // dungeon depth, a trip's place).
  sql.exec(`CREATE TABLE gear_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    base_id TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('hat', 'scarf', 'charm')),
    tag TEXT NOT NULL,
    rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'festival')),
    item_level INTEGER NOT NULL CHECK (item_level BETWEEN 1 AND 20),
    lines_json TEXT NOT NULL,
    made_by TEXT,
    made_by_name TEXT,
    made_at INTEGER,
    origin_json TEXT NOT NULL DEFAULT '{}',
    equipped_on TEXT,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX gear_items_user ON gear_items(user_id, created_at)');
  sql.exec(
    'CREATE UNIQUE INDEX gear_items_worn ON gear_items(equipped_on, slot) WHERE equipped_on IS NOT NULL',
  );

  // Marks on a blueprint: finds of a blueprint the player already knows (a count the crafting loop
  // will use; the conversion adds one for each old blueprint that maps onto a known one).
  sql.exec('ALTER TABLE blueprints ADD COLUMN marks INTEGER NOT NULL DEFAULT 0');

  // The conversion of each player's old gear. `converted_at` NULL means not done yet; `notice_json` is
  // what the one-time notice card says; `seen_at` is set when the player has dismissed it.
  sql.exec(`CREATE TABLE gear_conversion (
    user_id TEXT PRIMARY KEY,
    converted_at INTEGER,
    notice_json TEXT,
    seen_at INTEGER
  )`);
  sql.exec(`INSERT INTO gear_conversion (user_id)
    SELECT user_id FROM gear_legacy
    UNION SELECT user_id FROM blueprints
    UNION SELECT user_id FROM workshop_jobs WHERE claimed_at IS NULL`);
}
