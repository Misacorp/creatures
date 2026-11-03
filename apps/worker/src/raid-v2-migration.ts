/**
 * Versions 52 to 55: what the combat v2 raid weekend stores (docs/design/combat/integration.md, section 2). Plain additions: a v1
 * week reads none of it, and no existing row changes meaning. Never edit a released migration.
 *
 * - Version 52, `raidTrackMigration`: `raid_weeks.rules_version` (1 is the shipped weekend, 2 is combat v2) and `raid_weeks.track_slot`
 *   (the slot a v2 week fights; its boss comes from the track), the server's track (`raid_track`, one row, created when the first v2 week
 *   opens), and `raid_results` made again so its `phase` also takes `stage1` and `stage2` (SQLite cannot change a CHECK in place; the
 *   rows are copied as they are).
 * - Version 53, `raidPartyCarryMigration`: `raid_parties.carry_json`, what passes from one stage to the next (the engine's `StageCarry`),
 *   and `raid_parties.v2_players`, the party's players at stage 1 (they set the weekend's HP).
 * - Version 54, `raidSwapMigration`: swap requests (R19), indexed by who is asked and who asks.
 * - Version 55, `raidLiveV2Migration`: `raid_live.rules` (1 or 2) and `raid_live.frames`, the replayed rounds of a v2 finale so far.
 */
export function raidTrackMigration(sql: SqlStorage): void {
  sql.exec('ALTER TABLE raid_weeks ADD COLUMN rules_version INTEGER NOT NULL DEFAULT 1');
  sql.exec('ALTER TABLE raid_weeks ADD COLUMN track_slot INTEGER');
  // One row per server. The slot is the Boss Rank; the best share is the most of the slot's HP removed in a weekend so far (bp, never
  // above 10000); failed_weekends are the weekends lost on this slot from the second lap on (Determination's stacks); updated_week is
  // the week the row last changed.
  sql.exec(`CREATE TABLE raid_track (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    slot INTEGER NOT NULL CHECK (slot >= 1),
    best_share_bp INTEGER NOT NULL DEFAULT 0 CHECK (best_share_bp BETWEEN 0 AND 10000),
    failed_weekends INTEGER NOT NULL DEFAULT 0 CHECK (failed_weekends >= 0),
    updated_week TEXT
  )`);
  sql.exec(`CREATE TABLE raid_results_v2 (
    week_id TEXT NOT NULL,
    party INTEGER NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('phase1', 'phase2', 'finale', 'stage1', 'stage2')),
    seed TEXT NOT NULL,
    input TEXT NOT NULL,
    result TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (week_id, party, phase)
  )`);
  sql.exec(
    `INSERT INTO raid_results_v2 (week_id, party, phase, seed, input, result, summary, created_at)
     SELECT week_id, party, phase, seed, input, result, summary, created_at FROM raid_results`,
  );
  sql.exec('DROP TABLE raid_results');
  sql.exec('ALTER TABLE raid_results_v2 RENAME TO raid_results');
}

export function raidPartyCarryMigration(sql: SqlStorage): void {
  sql.exec('ALTER TABLE raid_parties ADD COLUMN carry_json TEXT');
  sql.exec('ALTER TABLE raid_parties ADD COLUMN v2_players INTEGER');
}

export function raidSwapMigration(sql: SqlStorage): void {
  // A request to swap the creatures in two slots of one party (or to move into an empty one): `slot_a` is the asker's creature's
  // slot, `slot_b` the other one's. `status` is open, accepted, declined or ended (a stage locked first).
  sql.exec(`CREATE TABLE raid_swap_requests (
    week_id TEXT NOT NULL,
    party INTEGER NOT NULL,
    id TEXT NOT NULL,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL,
    slot_a INTEGER NOT NULL CHECK (slot_a >= 0),
    slot_b INTEGER NOT NULL CHECK (slot_b >= 0),
    status TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'declined', 'ended')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (week_id, party, id)
  ) WITHOUT ROWID`);
  sql.exec('CREATE INDEX raid_swap_requests_to ON raid_swap_requests(week_id, to_user)');
  sql.exec('CREATE INDEX raid_swap_requests_from ON raid_swap_requests(week_id, from_user)');
}

export function raidLiveV2Migration(sql: SqlStorage): void {
  sql.exec('ALTER TABLE raid_live ADD COLUMN rules INTEGER NOT NULL DEFAULT 1');
  sql.exec('ALTER TABLE raid_live ADD COLUMN frames TEXT');
}
