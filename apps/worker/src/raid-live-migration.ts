/**
 * Migration 10: the live finale. Like the other raid tables there are no foreign keys: rows are only
 * written by the raid code, always inside a transaction. Never edit a released migration.
 */
export function raidLiveMigration(sql: SqlStorage): void {
  // The finale ability a player picked for a week. No row: the round-robin default of M4.
  sql.exec(`CREATE TABLE raid_abilities (
    week_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    ability_id TEXT NOT NULL,
    PRIMARY KEY (week_id, user_id)
  )`);
  // One live fight per (week, party, practice). The row is created when the finale starts (or a
  // practice fight is started) and is never deleted: the clock carries the fight on after a
  // restart, and the stored input and seed are what the end of the fight resolves.
  //   seed       128 random bits in hex. Never sent to a client before the fight has resolved.
  //   input      the frozen fight input (row, boss, pool, adaptation) with NO finale abilities.
  //   members    JSON [{ alias, userId }]: who the engine's opaque player keys are.
  //   abilities  JSON [{ alias, abilityId, mode, fireAtRound, params }], one per member, where mode
  //              is 'default' | 'held' | 'fired'. This is what Fire and Hold change.
  // A real finale (practice = 0) is resolved when its `raid_results` finale row exists; a practice
  // fight (practice = 1) never writes a result.
  sql.exec(`CREATE TABLE raid_live (
    week_id TEXT NOT NULL,
    party INTEGER NOT NULL CHECK (party >= 1),
    practice INTEGER NOT NULL CHECK (practice IN (0, 1)),
    seed TEXT NOT NULL,
    input TEXT NOT NULL,
    members TEXT NOT NULL,
    abilities TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    round_ms INTEGER NOT NULL CHECK (round_ms >= 1),
    rounds INTEGER NOT NULL CHECK (rounds >= 1),
    PRIMARY KEY (week_id, party, practice)
  )`);
  // The loot reveal a player has seen (or dismissed), per finale week.
  sql.exec(`CREATE TABLE raid_reveal_seen (
    user_id TEXT NOT NULL,
    week_id TEXT NOT NULL,
    seen_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, week_id)
  )`);
}
