/**
 * Migration 67: player housing (`docs/design/housing.md` 3.2). Additive: every table is empty until the `HOUSING` flag is on and a player
 * opens the House (or a reward path drops a luxury material). Never edit a released migration. Times are UTC epoch milliseconds, amounts are
 * integers, and the game day (`day`) is the allowance's (`gameDay` in `time.ts`).
 *
 * - `houses`: one row per house; the exterior skins. `houses_updated` finds the visit list's most recently changed houses.
 * - `house_parts`: the parts a player has started or built; `paid_json` is what was paid so far (`PaidLines`).
 * - `house_rooms`: one row per built room; the wallpaper and floor and the placed pieces (`spots_json`).
 * - `house_items`: everything a player holds for housing (pieces, skins, luxury materials, stamps, learned blueprints).
 * - `house_trophies`: written at the moment of a raid finale (the hook); the trophy hall reads it.
 * - `house_guestbook`: one stamp per (owner, visitor, game day); the owner's latest rows are kept.
 * - `house_mail`: gifts waiting in the owner's mailbox; one gift a day per giver (the partial unique index), a few a day per receiver.
 * - `house_drops`: one row per paid reward moment (idempotency and the "recent finds"); old rows go in the hook's own write.
 *
 * Every table carries `user_id` or `owner_id`, so the account reset's wipe can clear a player.
 */
export function housingMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE houses (
    user_id TEXT PRIMARY KEY,
    roof TEXT NOT NULL,
    walls TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX houses_updated ON houses (updated_at)');

  sql.exec(`CREATE TABLE house_parts (
    user_id TEXT NOT NULL,
    part_id TEXT NOT NULL,
    paid_json TEXT NOT NULL,
    built_at INTEGER,
    PRIMARY KEY (user_id, part_id)
  )`);

  sql.exec(`CREATE TABLE house_rooms (
    user_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    wall TEXT NOT NULL,
    floor TEXT NOT NULL,
    spots_json TEXT NOT NULL,
    PRIMARY KEY (user_id, room_id)
  )`);

  sql.exec(`CREATE TABLE house_items (
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('piece', 'skin', 'material', 'stamp', 'blueprint')),
    item_id TEXT NOT NULL,
    count INTEGER NOT NULL CHECK (count >= 0),
    fresh INTEGER NOT NULL DEFAULT 0 CHECK (fresh >= 0),
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, kind, item_id)
  )`);

  sql.exec(`CREATE TABLE house_trophies (
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('raid', 'festival')),
    ref TEXT NOT NULL,
    best INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    last_week TEXT NOT NULL,
    PRIMARY KEY (user_id, kind, ref)
  )`);

  sql.exec(`CREATE TABLE house_guestbook (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id TEXT NOT NULL,
    visitor_id TEXT NOT NULL,
    stamp_id TEXT NOT NULL,
    day TEXT NOT NULL,
    at INTEGER NOT NULL
  )`);
  sql.exec(
    'CREATE UNIQUE INDEX house_guestbook_once ON house_guestbook (owner_id, visitor_id, day)',
  );
  sql.exec('CREATE INDEX house_guestbook_owner ON house_guestbook (owner_id, id)');
  sql.exec('CREATE INDEX house_guestbook_visitor ON house_guestbook (visitor_id, day)');

  sql.exec(`CREATE TABLE house_mail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id TEXT NOT NULL,
    from_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('gift')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    day TEXT NOT NULL,
    at INTEGER NOT NULL,
    claimed_at INTEGER
  )`);
  sql.exec(
    "CREATE UNIQUE INDEX house_mail_gift_once ON house_mail (from_id, day) WHERE kind = 'gift'",
  );
  sql.exec('CREATE INDEX house_mail_open ON house_mail (owner_id, claimed_at)');
  sql.exec('CREATE INDEX house_mail_day ON house_mail (owner_id, day)');

  sql.exec(`CREATE TABLE house_drops (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    at INTEGER NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  )`);
  sql.exec('CREATE INDEX house_drops_at ON house_drops (user_id, at)');
}

/** The eight housing tables, for the dev tool that wipes a player and for tests. */
export const HOUSING_TABLES = [
  'houses',
  'house_parts',
  'house_rooms',
  'house_items',
  'house_trophies',
  'house_guestbook',
  'house_mail',
  'house_drops',
] as const;
