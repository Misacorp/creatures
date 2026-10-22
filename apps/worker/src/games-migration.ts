/**
 * Migration 38: the Valley Games (docs/design/valley-games.md). Never edit a released migration.
 *
 * - `games_days`: one row per show day: its lineup (drawn lazily), and from the lock its seed, show time,
 *   end time and the award marker. `show_at` is stored at the lock (the dev tools can move it).
 * - `games_results`: the frozen inputs (entrants) and the engine's result of each event of a day, one row
 *   per event so no row grows past the storage's row limit.
 * - `games_entries`: who entered which creature in which event of a day (one event per creature per day).
 *   `auto` marks the entries the lock filled for an auto-entered player.
 * - `games_players`: who has joined (entered once) and whether auto-entry is on.
 * - `games_placings`: each player's (team's) place in each event, written at the lock; the pins and
 *   experience are filled in by the award.
 * - `games_medals`, `games_creature_medals`: lifetime counts per player and per creature, and the player's
 *   pocket of medal points (spent at the stall, never negative).
 * - `games_records`: each creature's best score per event id (pins are for beating it).
 * - `games_stall_buys`: purchases per player, stall week and offer (the weekly limit).
 */
export function gamesMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE games_days (
    day TEXT PRIMARY KEY,
    lineup_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    locked_at INTEGER,
    seed TEXT,
    show_at INTEGER,
    ends_at INTEGER,
    awarded_at INTEGER
  )`);
  sql.exec(`CREATE TABLE games_results (
    day TEXT NOT NULL,
    idx INTEGER NOT NULL,
    event_id TEXT NOT NULL,
    input_json TEXT NOT NULL,
    result_json TEXT,
    PRIMARY KEY (day, idx)
  )`);
  sql.exec(`CREATE TABLE games_entries (
    day TEXT NOT NULL,
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 2),
    creature_id TEXT NOT NULL,
    auto INTEGER NOT NULL DEFAULT 0 CHECK (auto IN (0, 1)),
    entered_at INTEGER NOT NULL,
    PRIMARY KEY (day, creature_id),
    UNIQUE (day, user_id, event_id, slot)
  )`);
  sql.exec('CREATE INDEX games_entries_by_user ON games_entries (user_id, event_id, day)');
  sql.exec(`CREATE TABLE games_players (
    user_id TEXT PRIMARY KEY,
    auto INTEGER NOT NULL DEFAULT 1 CHECK (auto IN (0, 1)),
    joined_at INTEGER NOT NULL
  )`);
  sql.exec(`CREATE TABLE games_placings (
    day TEXT NOT NULL,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    creature_ids TEXT NOT NULL,
    place INTEGER NOT NULL CHECK (place >= 1),
    medal TEXT CHECK (medal IN ('gold', 'silver', 'bronze')),
    score INTEGER NOT NULL,
    bot INTEGER NOT NULL DEFAULT 0 CHECK (bot IN (0, 1)),
    pins TEXT,
    xp INTEGER,
    PRIMARY KEY (day, event_id, user_id)
  )`);
  sql.exec('CREATE INDEX games_placings_by_user ON games_placings (user_id, day)');
  const counts = `gold INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
    silver INTEGER NOT NULL DEFAULT 0 CHECK (silver >= 0),
    bronze INTEGER NOT NULL DEFAULT 0 CHECK (bronze >= 0),
    pins INTEGER NOT NULL DEFAULT 0 CHECK (pins >= 0)`;
  sql.exec(`CREATE TABLE games_medals (
    user_id TEXT PRIMARY KEY,
    ${counts},
    pocket INTEGER NOT NULL DEFAULT 0 CHECK (pocket >= 0)
  )`);
  sql.exec(`CREATE TABLE games_creature_medals (
    creature_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ${counts}
  )`);
  sql.exec(`CREATE TABLE games_records (
    creature_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    best INTEGER NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (creature_id, event_id)
  )`);
  sql.exec(`CREATE TABLE games_stall_buys (
    user_id TEXT NOT NULL,
    week TEXT NOT NULL,
    offer_id TEXT NOT NULL,
    bought INTEGER NOT NULL CHECK (bought >= 0),
    PRIMARY KEY (user_id, week, offer_id)
  )`);
}

/** The tables of migration 38, for the tests' undo. */
export const GAMES_TABLES = [
  'games_days',
  'games_results',
  'games_entries',
  'games_players',
  'games_placings',
  'games_medals',
  'games_creature_medals',
  'games_records',
  'games_stall_buys',
] as const;
