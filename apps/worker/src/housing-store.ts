/**
 * Row reads and writes of the housing tables (`docs/design/housing.md` 3.2), and nothing else: the rules live in `housing.ts` and in
 * `@creatures/game`. Every statement goes through a primary key or one of the migration's indexes (the query plan audit checks them).
 * All functions are synchronous and run inside the caller's transaction where they write.
 */
import type { PaidLines } from '@creatures/game';
import * as v from 'valibot';

export type ItemKind = 'piece' | 'skin' | 'material' | 'stamp' | 'blueprint';

export type HouseRow = {
  user_id: string;
  roof: string;
  walls: string;
  created_at: number;
  updated_at: number;
};

export type PartRow = {
  part_id: string;
  paid_json: string;
  built_at: number | null;
};

export type RoomRow = {
  room_id: string;
  wall: string;
  floor: string;
  spots_json: string;
};

export type ItemRow = {
  kind: ItemKind;
  item_id: string;
  count: number;
  fresh: number;
  at: number;
};

/** What a room holds: per spot id, the placed piece and, on a bed, the creature that sleeps there. */
export type Spots = Record<string, { p: string; m?: string }>;

const SpotsSchema = v.record(v.string(), v.object({ p: v.string(), m: v.optional(v.string()) }));
const PaidSchema = v.record(v.string(), v.union([v.number(), v.record(v.string(), v.number())]));

/**
 * The layers a column carries besides its first value, with no migration (`docs/design/housing-interior.md`): a room's `wall` column
 * is `<wallpaper>` or `<wallpaper>;trim=<look>;ceiling=<look>`, a house's `walls` column `<walls>` or `<walls>;frame=<look>`. A column
 * with nothing extra is the plain value it always was, so a house that never chose a trim, a ceiling or a frame reads and writes as
 * before. Unknown keys are ignored; a look value never holds `;` or `=`.
 */
export interface Layered {
  first: string;
  extra: Readonly<Record<string, string>>;
}

export function readLayered(column: string): Layered {
  const [first = '', ...rest] = column.split(';');
  const extra: Record<string, string> = {};
  for (const pair of rest) {
    const at = pair.indexOf('=');
    if (at > 0) extra[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return { first, extra };
}

/** The column for a first value and its extra layers (a null layer is left out, in a fixed key order). */
export function packLayered(first: string, extra: Readonly<Record<string, string | null>>): string {
  const pairs = Object.keys(extra)
    .sort()
    .flatMap((k) => {
      const value = extra[k];
      return value === null || value === undefined ? [] : [`${k}=${value}`];
    });
  return [first, ...pairs].join(';');
}

/** A room's wallpaper, trim and ceiling from its `wall` column. */
export function roomLayers(row: Pick<RoomRow, 'wall'>): {
  wall: string;
  trim: string | null;
  ceiling: string | null;
} {
  const { first, extra } = readLayered(row.wall);
  return { wall: first, trim: extra.trim ?? null, ceiling: extra.ceiling ?? null };
}

/** A house's walls skin and frame from its `walls` column. */
export function houseLayers(row: Pick<HouseRow, 'walls'>): { walls: string; frame: string | null } {
  const { first, extra } = readLayered(row.walls);
  return { walls: first, frame: extra.frame ?? null };
}

export function parseSpots(json: string): Spots {
  const parsed = v.safeParse(SpotsSchema, JSON.parse(json));
  return parsed.success ? (parsed.output as Spots) : {};
}

export function parsePaid(json: string): PaidLines {
  const parsed = v.safeParse(PaidSchema, JSON.parse(json));
  return parsed.success ? parsed.output : {};
}

// --- Houses ---

export function getHouse(sql: SqlStorage, userId: string): HouseRow | null {
  return (
    sql
      .exec<HouseRow>(
        'SELECT user_id, roof, walls, created_at, updated_at FROM houses WHERE user_id = ?',
        userId,
      )
      .toArray()[0] ?? null
  );
}

export function insertHouse(
  sql: SqlStorage,
  userId: string,
  roof: string,
  walls: string,
  now: number,
): void {
  sql.exec(
    'INSERT INTO houses (user_id, roof, walls, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    userId,
    roof,
    walls,
    now,
    now,
  );
}

export function touchHouse(sql: SqlStorage, userId: string, now: number): void {
  sql.exec('UPDATE houses SET updated_at = ? WHERE user_id = ?', now, userId);
}

/** Sets the house-wide skins; `frame` null takes the frame off (the posts and slabs as built). `house` is the row as read. */
export function setExterior(
  sql: SqlStorage,
  house: HouseRow,
  skins: { roof?: string; walls?: string; frame?: string | null },
  now: number,
): void {
  const userId = house.user_id;
  if (skins.roof !== undefined)
    sql.exec('UPDATE houses SET roof = ? WHERE user_id = ?', skins.roof, userId);
  if (skins.walls !== undefined || skins.frame !== undefined) {
    const was = houseLayers(house);
    const walls = packLayered(skins.walls ?? was.walls, {
      frame: skins.frame === undefined ? was.frame : skins.frame,
    });
    sql.exec('UPDATE houses SET walls = ? WHERE user_id = ?', walls, userId);
  }
  touchHouse(sql, userId, now);
}

/** The most recently changed houses (the visit list), newest first. */
export function recentHouses(sql: SqlStorage, limit: number): HouseRow[] {
  return sql
    .exec<HouseRow>(
      'SELECT user_id, roof, walls, created_at, updated_at FROM houses ORDER BY updated_at DESC LIMIT ?',
      limit,
    )
    .toArray();
}

// --- Parts ---

export function listParts(sql: SqlStorage, userId: string): PartRow[] {
  return sql
    .exec<PartRow>('SELECT part_id, paid_json, built_at FROM house_parts WHERE user_id = ?', userId)
    .toArray();
}

export function getPart(sql: SqlStorage, userId: string, partId: string): PartRow | null {
  return (
    sql
      .exec<PartRow>(
        'SELECT part_id, paid_json, built_at FROM house_parts WHERE user_id = ? AND part_id = ?',
        userId,
        partId,
      )
      .toArray()[0] ?? null
  );
}

export function upsertPart(
  sql: SqlStorage,
  userId: string,
  partId: string,
  paid: PaidLines,
  builtAt: number | null,
): void {
  sql.exec(
    `INSERT INTO house_parts (user_id, part_id, paid_json, built_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, part_id) DO UPDATE SET paid_json = excluded.paid_json, built_at = excluded.built_at`,
    userId,
    partId,
    JSON.stringify(paid),
    builtAt,
  );
}

// --- Rooms ---

export function listRooms(sql: SqlStorage, userId: string): RoomRow[] {
  return sql
    .exec<RoomRow>(
      'SELECT room_id, wall, floor, spots_json FROM house_rooms WHERE user_id = ?',
      userId,
    )
    .toArray();
}

export function getRoom(sql: SqlStorage, userId: string, roomId: string): RoomRow | null {
  return (
    sql
      .exec<RoomRow>(
        'SELECT room_id, wall, floor, spots_json FROM house_rooms WHERE user_id = ? AND room_id = ?',
        userId,
        roomId,
      )
      .toArray()[0] ?? null
  );
}

export function insertRoom(
  sql: SqlStorage,
  userId: string,
  roomId: string,
  wall: string,
  floor: string,
  spots: Spots,
): void {
  sql.exec(
    `INSERT INTO house_rooms (user_id, room_id, wall, floor, spots_json) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, room_id) DO NOTHING`,
    userId,
    roomId,
    wall,
    floor,
    JSON.stringify(spots),
  );
}

export function setRoomSpots(sql: SqlStorage, userId: string, roomId: string, spots: Spots): void {
  sql.exec(
    'UPDATE house_rooms SET spots_json = ? WHERE user_id = ? AND room_id = ?',
    JSON.stringify(spots),
    userId,
    roomId,
  );
}

/**
 * Sets a room's layers; `trim` or `ceiling` null takes it off. `row` is the room as read (the trim and ceiling share the `wall`
 * column with the wallpaper, see `readLayered`).
 */
export function setRoomSkins(
  sql: SqlStorage,
  userId: string,
  row: RoomRow,
  skins: { wall?: string; floor?: string; trim?: string | null; ceiling?: string | null },
): RoomRow {
  const roomId = row.room_id;
  let wall = row.wall;
  if (skins.wall !== undefined || skins.trim !== undefined || skins.ceiling !== undefined) {
    const was = roomLayers(row);
    wall = packLayered(skins.wall ?? was.wall, {
      trim: skins.trim === undefined ? was.trim : skins.trim,
      ceiling: skins.ceiling === undefined ? was.ceiling : skins.ceiling,
    });
    sql.exec(
      'UPDATE house_rooms SET wall = ? WHERE user_id = ? AND room_id = ?',
      wall,
      userId,
      roomId,
    );
  }
  if (skins.floor !== undefined)
    sql.exec(
      'UPDATE house_rooms SET floor = ? WHERE user_id = ? AND room_id = ?',
      skins.floor,
      userId,
      roomId,
    );
  return { ...row, wall, floor: skins.floor ?? row.floor };
}

// --- Items ---

/** Every item row of a player (a house holds at most a few hundred). */
export function listItems(sql: SqlStorage, userId: string): ItemRow[] {
  return sql
    .exec<ItemRow>(
      'SELECT kind, item_id, count, fresh, at FROM house_items WHERE user_id = ?',
      userId,
    )
    .toArray();
}

/** The rows of one kind (the primary key's prefix). */
export function listItemsOf(sql: SqlStorage, userId: string, kind: ItemKind): ItemRow[] {
  return sql
    .exec<ItemRow>(
      'SELECT kind, item_id, count, fresh, at FROM house_items WHERE user_id = ? AND kind = ?',
      userId,
      kind,
    )
    .toArray();
}

export function getItem(
  sql: SqlStorage,
  userId: string,
  kind: ItemKind,
  itemId: string,
): ItemRow | null {
  return (
    sql
      .exec<ItemRow>(
        'SELECT kind, item_id, count, fresh, at FROM house_items WHERE user_id = ? AND kind = ? AND item_id = ?',
        userId,
        kind,
        itemId,
      )
      .toArray()[0] ?? null
  );
}

/** Adds `count` of an item (and `fresh` to its "+N"); the first row is stamped with `now`. */
export function addItem(
  sql: SqlStorage,
  userId: string,
  kind: ItemKind,
  itemId: string,
  count: number,
  fresh: number,
  now: number,
): void {
  sql.exec(
    `INSERT INTO house_items (user_id, kind, item_id, count, fresh, at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, kind, item_id) DO UPDATE SET count = count + excluded.count, fresh = fresh + excluded.fresh`,
    userId,
    kind,
    itemId,
    count,
    fresh,
    now,
  );
}

/** Marks a one-of item (a skin, a stamp, a blueprint) as held; a second call changes nothing. */
export function grantOnce(
  sql: SqlStorage,
  userId: string,
  kind: ItemKind,
  itemId: string,
  now: number,
): boolean {
  return (
    sql
      .exec(
        `INSERT INTO house_items (user_id, kind, item_id, count, fresh, at) VALUES (?, ?, ?, 1, 0, ?)
         ON CONFLICT(user_id, kind, item_id) DO NOTHING RETURNING item_id`,
        userId,
        kind,
        itemId,
        now,
      )
      .toArray().length > 0
  );
}

/** Takes `count` of an item; false (nothing changed) when the player holds fewer. The "+N" never exceeds what is held. */
export function takeItem(
  sql: SqlStorage,
  userId: string,
  kind: ItemKind,
  itemId: string,
  count: number,
): boolean {
  const changed = sql
    .exec(
      `UPDATE house_items SET count = count - ?, fresh = MIN(fresh, count - ?)
       WHERE user_id = ? AND kind = ? AND item_id = ? AND count >= ? RETURNING item_id`,
      count,
      count,
      userId,
      kind,
      itemId,
      count,
    )
    .toArray();
  return changed.length > 0;
}

export function clearFresh(sql: SqlStorage, userId: string): void {
  sql.exec(
    "UPDATE house_items SET fresh = 0 WHERE user_id = ? AND kind = 'material' AND fresh > 0",
    userId,
  );
}

// --- Trophies ---

export type TrophyRow = {
  ref: string;
  best: number;
  wins: number;
  last_week: string;
};

export function listTrophies(
  sql: SqlStorage,
  userId: string,
  kind: 'raid' | 'festival',
): TrophyRow[] {
  return sql
    .exec<TrophyRow>(
      'SELECT ref, best, wins, last_week FROM house_trophies WHERE user_id = ? AND kind = ?',
      userId,
      kind,
    )
    .toArray();
}

/** One win: the best rank only goes up, the wins count once per call. */
export function addTrophy(
  sql: SqlStorage,
  userId: string,
  kind: 'raid' | 'festival',
  ref: string,
  rank: number,
  week: string,
): void {
  sql.exec(
    `INSERT INTO house_trophies (user_id, kind, ref, best, wins, last_week) VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT(user_id, kind, ref) DO UPDATE SET best = MAX(best, excluded.best), wins = wins + 1, last_week = excluded.last_week`,
    userId,
    kind,
    ref,
    rank,
    week,
  );
}

// --- Guestbook ---

export type GuestRow = {
  visitor_id: string;
  stamp_id: string;
  at: number;
};

export function guestbookOf(sql: SqlStorage, ownerId: string, limit: number): GuestRow[] {
  return sql
    .exec<GuestRow>(
      'SELECT visitor_id, stamp_id, at FROM house_guestbook WHERE owner_id = ? ORDER BY id DESC LIMIT ?',
      ownerId,
      limit,
    )
    .toArray();
}

export function stampedToday(
  sql: SqlStorage,
  ownerId: string,
  visitorId: string,
  day: string,
): boolean {
  return (
    sql
      .exec(
        'SELECT 1 FROM house_guestbook WHERE owner_id = ? AND visitor_id = ? AND day = ?',
        ownerId,
        visitorId,
        day,
      )
      .toArray().length > 0
  );
}

/** Adds a stamp and drops the owner's older rows beyond `keep`, in one write (through `house_guestbook_owner`). */
export function addStamp(
  sql: SqlStorage,
  ownerId: string,
  visitorId: string,
  stampId: string,
  day: string,
  now: number,
  keep: number,
): void {
  sql.exec(
    'INSERT INTO house_guestbook (owner_id, visitor_id, stamp_id, day, at) VALUES (?, ?, ?, ?, ?)',
    ownerId,
    visitorId,
    stampId,
    day,
    now,
  );
  // Everything older than the `keep`th newest row goes: the boundary is one index read, the delete reads only what it removes.
  sql.exec(
    `DELETE FROM house_guestbook WHERE owner_id = ? AND id <
       COALESCE((SELECT id FROM house_guestbook WHERE owner_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?), 0)`,
    ownerId,
    ownerId,
    keep - 1,
  );
}

/** The houses the visitor stamped today (at most one per house). */
export function stampedHousesToday(sql: SqlStorage, visitorId: string, day: string): Set<string> {
  return new Set(
    sql
      .exec<{
        owner_id: string;
      }>('SELECT owner_id FROM house_guestbook WHERE visitor_id = ? AND day = ?', visitorId, day)
      .toArray()
      .map((r) => r.owner_id),
  );
}

// --- Mail ---

/** The house the giver's gift today went to, or null. */
export function giftGivenToday(sql: SqlStorage, fromId: string, day: string): string | null {
  return (
    sql
      .exec<{ owner_id: string }>(
        "SELECT owner_id FROM house_mail WHERE from_id = ? AND day = ? AND kind = 'gift'",
        fromId,
        day,
      )
      .toArray()[0]?.owner_id ?? null
  );
}

/** Gifts the owner received on a game day. */
export function giftsReceivedToday(sql: SqlStorage, ownerId: string, day: string): number {
  return sql
    .exec<{
      n: number;
    }>('SELECT COUNT(*) AS n FROM house_mail WHERE owner_id = ? AND day = ?', ownerId, day)
    .one().n;
}

export function addGift(
  sql: SqlStorage,
  ownerId: string,
  fromId: string,
  amount: number,
  day: string,
  now: number,
): void {
  sql.exec(
    "INSERT INTO house_mail (owner_id, from_id, kind, amount, day, at) VALUES (?, ?, 'gift', ?, ?, ?)",
    ownerId,
    fromId,
    amount,
    day,
    now,
  );
}

/** How many gifts wait unclaimed in an owner's mailbox and their Acorns in all (one indexed aggregate). */
export function openMailTotals(
  sql: SqlStorage,
  ownerId: string,
): { count: number; acorns: number } {
  const row = sql
    .exec<{
      n: number;
      total: number;
    }>(
      'SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM house_mail WHERE owner_id = ? AND claimed_at IS NULL',
      ownerId,
    )
    .one();
  return { count: row.n, acorns: row.total };
}

/** The givers of the newest unclaimed mail of an owner (at most `limit` rows read), newest first, each once. */
export function openMailGivers(sql: SqlStorage, ownerId: string, limit: number): string[] {
  const rows = sql
    .exec<{
      from_id: string;
    }>(
      'SELECT from_id FROM house_mail WHERE owner_id = ? AND claimed_at IS NULL ORDER BY id DESC LIMIT ?',
      ownerId,
      limit,
    )
    .toArray();
  return [...new Set(rows.map((r) => r.from_id))];
}

export function claimMail(sql: SqlStorage, ownerId: string, now: number): void {
  sql.exec(
    'UPDATE house_mail SET claimed_at = ? WHERE owner_id = ? AND claimed_at IS NULL',
    now,
    ownerId,
  );
}

// --- Drops ---

export function dropSeen(sql: SqlStorage, userId: string, key: string): boolean {
  return (
    sql.exec('SELECT 1 FROM house_drops WHERE user_id = ? AND key = ?', userId, key).toArray()
      .length > 0
  );
}

export function insertDrop(
  sql: SqlStorage,
  userId: string,
  key: string,
  at: number,
  json: string,
): void {
  sql.exec(
    'INSERT INTO house_drops (user_id, key, at, json) VALUES (?, ?, ?, ?)',
    userId,
    key,
    at,
    json,
  );
}

/** Deletes the player's drop rows older than the cutoff (through `house_drops_at`). */
export function pruneDrops(sql: SqlStorage, userId: string, cutoff: number): void {
  sql.exec('DELETE FROM house_drops WHERE user_id = ? AND at < ?', userId, cutoff);
}

export function recentDrops(
  sql: SqlStorage,
  userId: string,
  limit: number,
): { at: number; json: string }[] {
  return sql
    .exec<{
      at: number;
      json: string;
    }>('SELECT at, json FROM house_drops WHERE user_id = ? ORDER BY at DESC LIMIT ?', userId, limit)
    .toArray();
}

// --- Names ---

/** The stored display names of some players (at most a handful, by primary key). */
export function playerNames(sql: SqlStorage, ids: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of new Set(ids)) {
    const row = sql
      .exec<{ display_name: string }>('SELECT display_name FROM players WHERE user_id = ?', id)
      .toArray()[0];
    if (row !== undefined) out.set(id, row.display_name);
  }
  return out;
}
