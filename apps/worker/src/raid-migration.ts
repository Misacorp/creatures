/**
 * Migration 8: the weekly raid. Like the other tables there are no foreign keys: rows are only
 * written by `raid.ts`, always inside a transaction. Never edit a released migration.
 */
export function raidMigration(sql: SqlStorage): void {
  // One row per raid week. `status` is the last event that resolved: open (none yet), phase1,
  // phase2 or finale. It decides what players may still change. The week's chosen adaptation is
  // kept per party (below), because each party's phase 1 decides its own.
  sql.exec(`CREATE TABLE raid_weeks (
    week_id TEXT PRIMARY KEY,
    boss_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'phase1', 'phase2', 'finale')),
    created_at INTEGER NOT NULL
  )`);
  // A party fights the boss on its own: its own HP pool (fixed at phase 1 from the member count
  // and average level) and its own phase 2 adaptation (chosen from its own phase 1). Until phase 1
  // resolves the pool and boss attack are NULL. The adaptation rule and target stay NULL when the
  // boss found nothing to adapt to; the description is then still stored for the players.
  sql.exec(`CREATE TABLE raid_parties (
    week_id TEXT NOT NULL,
    party INTEGER NOT NULL CHECK (party >= 1),
    hp_max INTEGER,
    hp_current INTEGER,
    boss_atk INTEGER,
    adaptation_rule TEXT,
    adaptation_target TEXT,
    adaptation_description TEXT,
    PRIMARY KEY (week_id, party)
  )`);
  sql.exec(`CREATE TABLE raid_party_members (
    week_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    party INTEGER NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (week_id, user_id)
  )`);
  sql.exec('CREATE INDEX raid_party_members_party ON raid_party_members(week_id, party)');
  sql.exec(`CREATE TABLE raid_opt_outs (
    week_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (week_id, user_id)
  )`);
  // creature_ids is a JSON array of 3 creature ids, or NULL for the automatic team.
  sql.exec(`CREATE TABLE raid_teams (
    week_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    creature_ids TEXT,
    PRIMARY KEY (week_id, user_id)
  )`);
  sql.exec(`CREATE TABLE raid_placements (
    week_id TEXT NOT NULL,
    party INTEGER NOT NULL,
    slot INTEGER NOT NULL CHECK (slot >= 0),
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    UNIQUE (week_id, party, slot),
    UNIQUE (week_id, creature_id)
  )`);
  // One row per resolved (week, party, phase): the seed, the exact fight input, the full engine
  // result (event log included) and a small summary the API reads without parsing the log.
  sql.exec(`CREATE TABLE raid_results (
    week_id TEXT NOT NULL,
    party INTEGER NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('phase1', 'phase2', 'finale')),
    seed TEXT NOT NULL,
    input TEXT NOT NULL,
    result TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (week_id, party, phase)
  )`);
  // Done markers: an event of a week runs at most once. outcome 'skipped' means the week did not
  // exist yet when the event was scheduled.
  sql.exec(`CREATE TABLE raid_events (
    week_id TEXT NOT NULL,
    event TEXT NOT NULL CHECK (event IN ('weekStart', 'phase1', 'phase2', 'finale')),
    outcome TEXT NOT NULL CHECK (outcome IN ('ran', 'skipped')),
    done_at INTEGER NOT NULL,
    PRIMARY KEY (week_id, event)
  )`);
  // Raids taken part in without a jackpot, per player.
  sql.exec(`CREATE TABLE jackpot_pity (
    user_id TEXT PRIMARY KEY,
    counter INTEGER NOT NULL CHECK (counter >= 0)
  )`);
  // "First on server" gets a third kind. SQLite cannot change a CHECK constraint, so the table is
  // recreated with its rows.
  sql.exec(`CREATE TABLE server_firsts_new (
    kind TEXT NOT NULL CHECK (kind IN ('catch', 'evolve', 'jackpot')),
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
