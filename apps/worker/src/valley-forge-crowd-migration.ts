/**
 * Migration 67: an index for the workshop's background smiths (the Forge's interior shows other players' smiths at work): the seats of
 * one place and kind by owner, so "the anvils of everyone but me" is read through it, never by a scan of the table. Additive.
 */
export function valleyForgeCrowdMigration(sql: SqlStorage): void {
  sql.exec('CREATE INDEX IF NOT EXISTS valley_seats_place ON valley_seats (place, kind, user_id)');
}
