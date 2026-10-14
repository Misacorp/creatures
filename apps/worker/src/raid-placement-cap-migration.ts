import { RULES } from '@creatures/game';
import { autoTeam, capPlacements, loadCreatures, type PlacementRow } from './raid-teams';

/**
 * Migration 22: a data repair, no schema change. A bug let a player have four creatures on the raid
 * board (a placement stayed behind when the strongest three changed, and a fourth was allowed in
 * beside it). For every week and player with more than three placements, the three kept are chosen
 * by `capPlacements`: first the creatures of the player's team as it stood (the chosen team if it
 * still belongs to them, otherwise the automatic one), then the earliest placed, then the lowest
 * slot. The rest are deleted. Weeks and players that are fine are not touched. Never edit a
 * released migration.
 */
export function raidPlacementCapMigration(sql: SqlStorage): void {
  const over = sql
    .exec<{ week_id: string; user_id: string }>(
      'SELECT week_id, user_id FROM raid_placements GROUP BY week_id, user_id HAVING COUNT(*) > ?',
      RULES.raid.teamSize,
    )
    .toArray();
  for (const { week_id: weekId, user_id: userId } of over) {
    const rows = sql
      .exec<PlacementRow>(
        'SELECT rowid, slot, user_id, creature_id FROM raid_placements WHERE week_id = ? AND user_id = ? ORDER BY rowid',
        weekId,
        userId,
      )
      .toArray();
    const kept = new Set(
      capPlacements(rows, teamAsItStood(sql, weekId, userId)).map((r) => r.rowid),
    );
    for (const row of rows) {
      if (!kept.has(row.rowid)) sql.exec('DELETE FROM raid_placements WHERE rowid = ?', row.rowid);
    }
  }
}

/** The creature ids of the team the player had this week before this migration (chosen, else automatic). */
function teamAsItStood(sql: SqlStorage, weekId: string, userId: string): Set<string> {
  const owned = loadCreatures(sql, userId);
  const stored = sql
    .exec<{
      creature_ids: string | null;
    }>('SELECT creature_ids FROM raid_teams WHERE week_id = ? AND user_id = ?', weekId, userId)
    .toArray()[0]?.creature_ids;
  if (stored !== null && stored !== undefined) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every((id): id is string => typeof id === 'string')) {
        const ownedIds = new Set(owned.map((c) => c.id));
        if (parsed.every((id) => ownedIds.has(id))) return new Set(parsed);
      }
    } catch {
      // A damaged value means the automatic team, as it did before.
    }
  }
  return new Set(autoTeam(owned).map((c) => c.id));
}
