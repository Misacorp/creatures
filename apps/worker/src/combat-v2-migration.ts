/**
 * Versions 50 and 51: what combat v2 stores per creature and per line (docs/design/combat/integration.md,
 * section 2). Both are plain additions: nothing reads them while the `COMBAT_V2` flag is off, and no
 * existing row changes. Never edit a released migration.
 *
 * - Version 50, `knackMigration`: `creatures.knack`, the Knack the owner saved (R11), or NULL for none. The
 *   Knacks a creature knows are worked out from its form and line, never stored.
 * - Version 51, `talentBookV2Migration`: the v2 Talent Book (R20). `line_talents` is the book: every talent
 *   the player found on a line (a catch, a duplicate, a role change's roll), golden or not, one row per
 *   (player, line, talent). `creature_talents_v2` holds the talents a creature has learned from its line's
 *   book (learning costs Bait once) and the slot (1 to 3) each sits in now, or NULL when it is learned but not
 *   slotted. A slot holds one talent. Lookups by player and line, and by creature, are answered by the
 *   primary keys, and both tables are WITHOUT ROWID so that a row read through the key is one row read, not two
 *   (the key and the table row: a player's whole book would read twice as many rows on every creature page load).
 */
export function knackMigration(sql: SqlStorage): void {
  sql.exec('ALTER TABLE creatures ADD COLUMN knack TEXT');
}

export function talentBookV2Migration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE line_talents (
    user_id TEXT NOT NULL,
    line TEXT NOT NULL,
    talent_id TEXT NOT NULL,
    golden INTEGER NOT NULL DEFAULT 0 CHECK (golden IN (0, 1)),
    found_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, line, talent_id)
  ) WITHOUT ROWID`);
  sql.exec(`CREATE TABLE creature_talents_v2 (
    creature_id TEXT NOT NULL,
    talent_id TEXT NOT NULL,
    slot INTEGER CHECK (slot IS NULL OR slot BETWEEN 1 AND 3),
    learned_at INTEGER NOT NULL,
    PRIMARY KEY (creature_id, talent_id)
  ) WITHOUT ROWID`);
  sql.exec(
    'CREATE UNIQUE INDEX creature_talents_v2_slot ON creature_talents_v2(creature_id, slot) WHERE slot IS NOT NULL',
  );
}
