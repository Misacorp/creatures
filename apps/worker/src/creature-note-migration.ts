/**
 * Version 47: a player's private note on each of their creatures (#76), plain text of at most 256
 * code points (`sanitizeCreatureNote`), or null for none. Only the owner's own collection state
 * carries it.
 */
export function creatureNoteMigration(sql: SqlStorage): void {
  sql.exec('ALTER TABLE creatures ADD COLUMN note TEXT');
}
