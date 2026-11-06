/**
 * Migration 63: the Market's opening is told once to each player (Q64, docs/design/valley/systems/forge.md V-FORGE-10). Additive:
 * production runs it with the flag off and the column holds its default.
 *
 * - `valley_gazette.market_told`: 1 once the paper has told this player that the Market opened (the story is in the stored log until
 *   the paper is read, so a reload replays it). A player with no paper row yet gets one when it is told.
 */
export function valleyMarketOpenMigration(sql: SqlStorage): void {
  sql.exec('ALTER TABLE valley_gazette ADD COLUMN market_told INTEGER NOT NULL DEFAULT 0');
}
