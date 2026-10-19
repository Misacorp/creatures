import { pickQuirk } from '@creatures/game';
import { liveRng } from './rng';

/**
 * Migration 13: every creature gets a cosmetic personality quirk (`quirk_id`, see
 * `docs/design/creatures.md`). The column is nullable because SQLite cannot add a NOT NULL column
 * without a default; the code always writes one when it creates a creature.
 *
 * Creatures that already exist are backfilled here, once, with the same pick as a new creature
 * (`pickQuirk`) from live crypto randomness. The result is stored, so it never changes again: a
 * creature's quirk is fixed from this moment. Never edit a released migration.
 */
export function creatureQuirkMigration(sql: SqlStorage): void {
  sql.exec('ALTER TABLE creatures ADD COLUMN quirk_id TEXT');
  const rng = liveRng();
  const rows = sql
    .exec<{ id: string; species: string }>(
      'SELECT id, species FROM creatures WHERE quirk_id IS NULL',
    )
    .toArray();
  for (const row of rows) {
    sql.exec('UPDATE creatures SET quirk_id = ? WHERE id = ?', pickQuirk(row.species, rng), row.id);
  }
}
