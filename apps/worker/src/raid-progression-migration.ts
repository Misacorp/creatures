/**
 * Migration 12: the Boss Rank ladder, seasons and Festival weeks (see `raid-ladder.ts`). Like the
 * other raid tables there are no foreign keys: rows are only written by the raid code, always inside
 * a transaction. Never edit a released migration.
 *
 * Weeks that exist when this runs keep every new column NULL. `season_index IS NULL` is what marks
 * such a legacy week: it keeps the pool it had, fights at rank 1 without Festival rules, and never
 * moves the ladder.
 */
export function raidProgressionMigration(sql: SqlStorage): void {
  // The server's ladder: one row. `rank` stays NULL until the first week with a roster places the
  // server (`placementRank`, once); `best_rank` is the highest rank the server has cleared in a
  // normal week, NULL until it has cleared one.
  sql.exec(`CREATE TABLE raid_ladder (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    rank INTEGER CHECK (rank IS NULL OR rank >= 1),
    best_rank INTEGER CHECK (best_rank IS NULL OR best_rank >= 1)
  )`);
  sql.exec('INSERT INTO raid_ladder (id, rank, best_rank) VALUES (1, NULL, NULL)');

  // Per raid week, fixed when the week is created (or, while the server has no rank and nobody is
  // in yet, when the first player joins):
  //   rank            the server's rank for the week (what the card shows and rewards follow)
  //   effective_rank  the rank the boss fights at (lower in a Festival)
  //   festival        1 for a Festival week
  //   season_index    the season the week belongs to (the global week index / 5)
  //   festival_species  the Festival creature of the week, NULL in a normal week
  // Set once when the ladder moves after the week's finale (the done marker):
  //   ladder_at       when the ladder was updated; NULL until then
  //   ladder_won      1 if at least half of the parties won their finale
  //   rank_after      the server's rank after the update
  sql.exec('ALTER TABLE raid_weeks ADD COLUMN rank INTEGER');
  sql.exec('ALTER TABLE raid_weeks ADD COLUMN effective_rank INTEGER');
  sql.exec('ALTER TABLE raid_weeks ADD COLUMN festival INTEGER');
  sql.exec('ALTER TABLE raid_weeks ADD COLUMN season_index INTEGER');
  sql.exec('ALTER TABLE raid_weeks ADD COLUMN festival_species TEXT');
  sql.exec('ALTER TABLE raid_weeks ADD COLUMN ladder_at INTEGER');
  sql.exec('ALTER TABLE raid_weeks ADD COLUMN ladder_won INTEGER');
  sql.exec('ALTER TABLE raid_weeks ADD COLUMN rank_after INTEGER');

  // The Festival creature a player got for a won Festival finale. The primary key is the
  // idempotency: a player is granted at most once per week. `outcome` is new, fused or converted;
  // `fusion_count` (fused) and `bait` (converted) are filled for those outcomes.
  sql.exec(`CREATE TABLE raid_festival_grants (
    week_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    species TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('new', 'fused', 'converted')),
    fusion_count INTEGER,
    bait INTEGER,
    first_on_server INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (week_id, user_id)
  )`);

  // "First on server" gets a fourth kind, for the Festival creature. SQLite cannot change a CHECK
  // constraint, so the table is recreated with its rows.
  sql.exec(`CREATE TABLE server_firsts_new (
    kind TEXT NOT NULL CHECK (kind IN ('catch', 'evolve', 'jackpot', 'festival')),
    species TEXT NOT NULL,
    user_id TEXT NOT NULL,
    drop_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (kind, species, user_id)
  )`);
  sql.exec(
    'INSERT INTO server_firsts_new (kind, species, user_id, drop_id, at) SELECT kind, species, user_id, drop_id, at FROM server_firsts',
  );
  sql.exec('DROP TABLE server_firsts');
  sql.exec('ALTER TABLE server_firsts_new RENAME TO server_firsts');
}
