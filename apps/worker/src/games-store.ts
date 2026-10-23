/**
 * The Valley Games' rows (`games-migration.ts`): small synchronous reads and writes on the guild's
 * database. Callers own the transactions.
 */
import type { GamesEventResult, GamesEntrant } from '@creatures/engine';

/** Simulated players of the staging dev tools (`dev-tools-raid.ts`): bots to the Games. */
export const BOT_PREFIX = 'dev-guest-';
export const isBot = (userId: string): boolean => userId.startsWith(BOT_PREFIX);

export interface DayRow {
  day: string;
  lineup: string[];
  /** The bonus event of a bonus day (`RULES.games.bonus`), or null. */
  bonus: string | null;
  createdAt: number;
  lockedAt: number | null;
  seed: string | null;
  showAt: number | null;
  endsAt: number | null;
  awardedAt: number | null;
}

type RawDay = {
  day: string;
  lineup_json: string;
  created_at: number;
  locked_at: number | null;
  seed: string | null;
  show_at: number | null;
  ends_at: number | null;
  awarded_at: number | null;
};

/**
 * `lineup_json` is the event ids in show order (`["a","b","c"]`), or on a bonus day the ids with the
 * bonus event (`{"ids":["a","b","c","d"],"bonus":"c"}`). Days stored before the bonus day existed (four
 * events, no bonus) are the plain list.
 */
type StoredLineup = string[] | { ids: string[]; bonus: string };

function parseLineup(json: string): { lineup: string[]; bonus: string | null } {
  const v = JSON.parse(json) as StoredLineup;
  return Array.isArray(v) ? { lineup: v, bonus: null } : { lineup: v.ids, bonus: v.bonus };
}

const toDay = (r: RawDay): DayRow => ({
  day: r.day,
  ...parseLineup(r.lineup_json),
  createdAt: r.created_at,
  lockedAt: r.locked_at,
  seed: r.seed,
  showAt: r.show_at,
  endsAt: r.ends_at,
  awardedAt: r.awarded_at,
});

export function readDay(sql: SqlStorage, day: string): DayRow | null {
  const r = sql.exec<RawDay>('SELECT * FROM games_days WHERE day = ?', day).toArray()[0];
  return r === undefined ? null : toDay(r);
}

/** The latest locked day whose show has started by `now` (the show to play or replay), or null. */
export function lastShownDay(sql: SqlStorage, now: number): DayRow | null {
  const r = sql
    .exec<RawDay>(
      `SELECT * FROM games_days WHERE locked_at IS NOT NULL AND show_at <= ?
       ORDER BY show_at DESC, day DESC LIMIT 1`,
      now,
    )
    .toArray()[0];
  return r === undefined ? null : toDay(r);
}

/** The latest awarded day, or null. */
export function lastAwardedDay(sql: SqlStorage): DayRow | null {
  const r = sql
    .exec<RawDay>(
      'SELECT * FROM games_days WHERE awarded_at IS NOT NULL ORDER BY awarded_at DESC, day DESC LIMIT 1',
    )
    .toArray()[0];
  return r === undefined ? null : toDay(r);
}

/** Locked days not awarded yet, earliest end first. */
export function unawardedDays(sql: SqlStorage): DayRow[] {
  return sql
    .exec<RawDay>(
      'SELECT * FROM games_days WHERE locked_at IS NOT NULL AND awarded_at IS NULL ORDER BY ends_at, day',
    )
    .toArray()
    .map(toDay);
}

/** Stores a day's lineup (`bonus`: its bonus event, which must be in `lineup`, or null). */
export function insertDay(
  sql: SqlStorage,
  day: string,
  lineup: readonly string[],
  bonus: string | null,
  now: number,
) {
  if (bonus !== null && !lineup.includes(bonus)) throw new RangeError('bonus not in the lineup');
  const stored: StoredLineup = bonus === null ? [...lineup] : { ids: [...lineup], bonus };
  sql.exec(
    'INSERT INTO games_days (day, lineup_json, created_at) VALUES (?, ?, ?)',
    day,
    JSON.stringify(stored),
    now,
  );
}

export interface StoredEvent {
  idx: number;
  eventId: string;
  entrants: GamesEntrant[];
  /** Null: nobody entered, the event was skipped. */
  result: GamesEventResult | null;
}

export function readResults(sql: SqlStorage, day: string): StoredEvent[] {
  return sql
    .exec<{ idx: number; event_id: string; input_json: string; result_json: string | null }>(
      'SELECT idx, event_id, input_json, result_json FROM games_results WHERE day = ? ORDER BY idx',
      day,
    )
    .toArray()
    .map((r) => ({
      idx: r.idx,
      eventId: r.event_id,
      entrants: JSON.parse(r.input_json) as GamesEntrant[],
      result: r.result_json === null ? null : (JSON.parse(r.result_json) as GamesEventResult),
    }));
}

export interface EntryRow {
  userId: string;
  eventId: string;
  slot: number;
  creatureId: string;
  enteredAt: number;
}

type RawEntry = {
  user_id: string;
  event_id: string;
  slot: number;
  creature_id: string;
  entered_at: number;
};

const toEntry = (r: RawEntry): EntryRow => ({
  userId: r.user_id,
  eventId: r.event_id,
  slot: r.slot,
  creatureId: r.creature_id,
  enteredAt: r.entered_at,
});

/** Every entry of a day, in the order they were made. */
export function dayEntries(sql: SqlStorage, day: string): EntryRow[] {
  return sql
    .exec<RawEntry>(
      `SELECT user_id, event_id, slot, creature_id, entered_at FROM games_entries
       WHERE day = ? ORDER BY entered_at, rowid`,
      day,
    )
    .toArray()
    .map(toEntry);
}

/** A player's entries of a day, by event id (creature ids in slot order). */
export function playerEntries(
  sql: SqlStorage,
  day: string,
  userId: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of sql
    .exec<{ event_id: string; creature_id: string }>(
      'SELECT event_id, creature_id FROM games_entries WHERE day = ? AND user_id = ? ORDER BY event_id, slot',
      day,
      userId,
    )
    .toArray()) {
    (out[r.event_id] ??= []).push(r.creature_id);
  }
  return out;
}

/**
 * Stores one entry. Only players enter (there is no auto-entry since 2026-10-23); the table's `auto`
 * column, from migration 39, stays at its default 0.
 */
export function addEntry(
  sql: SqlStorage,
  e: { day: string; userId: string; eventId: string; slot: number; creatureId: string },
  now: number,
): void {
  sql.exec(
    `INSERT INTO games_entries (day, user_id, event_id, slot, creature_id, entered_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    e.day,
    e.userId,
    e.eventId,
    e.slot,
    e.creatureId,
    now,
  );
}

/** Whether anybody has entered a creature for show day `day`. */
export function hasEntries(sql: SqlStorage, day: string): boolean {
  return sql.exec('SELECT 1 FROM games_entries WHERE day = ? LIMIT 1', day).toArray().length > 0;
}

/** Whether anybody has entered a creature for a show day on or after `day` that is not locked yet. */
export function hasOpenEntries(sql: SqlStorage, day: string): boolean {
  return (
    sql
      .exec(
        `SELECT 1 FROM games_entries e LEFT JOIN games_days d ON d.day = e.day
         WHERE e.day >= ? AND d.locked_at IS NULL LIMIT 1`,
        day,
      )
      .toArray().length > 0
  );
}

export type MedalCounts = {
  gold: number;
  silver: number;
  bronze: number;
  pins: number;
};

export function readMedals(sql: SqlStorage, userId: string): MedalCounts & { pocket: number } {
  return (
    sql
      .exec<{ gold: number; silver: number; bronze: number; pins: number; pocket: number }>(
        'SELECT gold, silver, bronze, pins, pocket FROM games_medals WHERE user_id = ?',
        userId,
      )
      .toArray()[0] ?? { gold: 0, silver: 0, bronze: 0, pins: 0, pocket: 0 }
  );
}

export function readCreatureMedals(sql: SqlStorage, creatureId: string): MedalCounts {
  return (
    sql
      .exec<MedalCounts>(
        'SELECT gold, silver, bronze, pins FROM games_creature_medals WHERE creature_id = ?',
        creatureId,
      )
      .toArray()[0] ?? { gold: 0, silver: 0, bronze: 0, pins: 0 }
  );
}

/** Adds to a player's lifetime counts and pocket (all non-negative). */
export function addMedals(
  sql: SqlStorage,
  userId: string,
  add: MedalCounts & { pocket: number },
): void {
  sql.exec(
    `INSERT INTO games_medals (user_id, gold, silver, bronze, pins, pocket) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET gold = gold + excluded.gold, silver = silver + excluded.silver,
       bronze = bronze + excluded.bronze, pins = pins + excluded.pins, pocket = pocket + excluded.pocket`,
    userId,
    add.gold,
    add.silver,
    add.bronze,
    add.pins,
    add.pocket,
  );
}

export function addCreatureMedals(
  sql: SqlStorage,
  creatureId: string,
  userId: string,
  add: MedalCounts,
): void {
  sql.exec(
    `INSERT INTO games_creature_medals (creature_id, user_id, gold, silver, bronze, pins) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(creature_id) DO UPDATE SET user_id = excluded.user_id, gold = gold + excluded.gold,
       silver = silver + excluded.silver, bronze = bronze + excluded.bronze, pins = pins + excluded.pins`,
    creatureId,
    userId,
    add.gold,
    add.silver,
    add.bronze,
    add.pins,
  );
}

/** One event badge: the creature won `eventId` (gold) `wins` times. */
export interface GamesBadge {
  eventId: string;
  wins: number;
}

/** A creature's event badges (migration 40), by event id. */
export function creatureBadges(sql: SqlStorage, creatureId: string): GamesBadge[] {
  return sql
    .exec<{ event_id: string; wins: number }>(
      'SELECT event_id, wins FROM games_badges WHERE creature_id = ? AND wins > 0 ORDER BY event_id',
      creatureId,
    )
    .toArray()
    .map((r) => ({ eventId: r.event_id, wins: r.wins }));
}

/** A player's creatures' wins in each of `eventIds`: event id to creature id to wins (none: absent). */
export function playerBadges(
  sql: SqlStorage,
  userId: string,
  eventIds: readonly string[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const eventId of new Set(eventIds)) {
    for (const r of sql
      .exec<{ creature_id: string; wins: number }>(
        'SELECT creature_id, wins FROM games_badges WHERE user_id = ? AND event_id = ? AND wins > 0',
        userId,
        eventId,
      )
      .toArray()) {
      (out[eventId] ??= {})[r.creature_id] = r.wins;
    }
  }
  return out;
}

/** Adds one win of `eventId` to a creature's badge. */
export function addBadgeWin(
  sql: SqlStorage,
  creatureId: string,
  eventId: string,
  userId: string,
): void {
  sql.exec(
    `INSERT INTO games_badges (creature_id, event_id, user_id, wins) VALUES (?, ?, ?, 1)
     ON CONFLICT(creature_id, event_id) DO UPDATE SET user_id = excluded.user_id, wins = wins + 1`,
    creatureId,
    eventId,
    userId,
  );
}

export function readRecord(
  sql: SqlStorage,
  creatureId: string,
  eventId: string,
): number | undefined {
  return sql
    .exec<{ best: number }>(
      'SELECT best FROM games_records WHERE creature_id = ? AND event_id = ?',
      creatureId,
      eventId,
    )
    .toArray()[0]?.best;
}

export function writeRecord(
  sql: SqlStorage,
  r: { creatureId: string; eventId: string; userId: string; best: number; day: string },
): void {
  sql.exec(
    `INSERT INTO games_records (creature_id, event_id, user_id, best, day) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(creature_id, event_id) DO UPDATE SET user_id = excluded.user_id, best = excluded.best,
       day = excluded.day`,
    r.creatureId,
    r.eventId,
    r.userId,
    r.best,
    r.day,
  );
}

export function creatureRecords(
  sql: SqlStorage,
  creatureId: string,
): { eventId: string; best: number; day: string }[] {
  return sql
    .exec<{ event_id: string; best: number; day: string }>(
      'SELECT event_id, best, day FROM games_records WHERE creature_id = ? ORDER BY event_id',
      creatureId,
    )
    .toArray()
    .map((r) => ({ eventId: r.event_id, best: r.best, day: r.day }));
}

/** Display names of players, by id. */
export function playerNames(sql: SqlStorage, ids: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of new Set(ids)) {
    const r = sql
      .exec<{ display_name: string }>('SELECT display_name FROM players WHERE user_id = ?', id)
      .toArray()[0];
    if (r !== undefined) out.set(id, r.display_name);
  }
  return out;
}
