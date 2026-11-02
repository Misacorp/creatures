/**
 * The `combat-v2-convert` dev tool (staging only; `docs/design/combat/integration.md`, section 1): does for the
 * caller's guild what a fresh start under combat v2 would do. Every creature that has learned no v2 talent
 * rolls one from its line's pool as a fresh catch would (recorded in its player's line book, learned and slotted
 * in slot 1), its Knack is none, and its player's finale ability choice for the open week goes (creature finale
 * abilities do not exist under v2).
 *
 * It exists only when both the dev tools and the `COMBAT_V2` flag are on (anything else answers 404). It is
 * idempotent: a creature that has a v2 talent is left alone, so a second run changes nothing, and it never
 * touches a Knack a player has saved since. Production never runs it: the game resets after the combat and
 * valley reworks (roadmap), so phase 6 converts nothing.
 */
import { DevError, type ToolCtx } from './dev-context';
import { weekIdFor } from './raid-schedule';
import { grantFirstTalent } from './talent-v2-store';

export interface ConvertResult {
  /** Creatures that rolled a v2 talent. */
  creatures: number;
  /** Of those, creatures whose saved Knack was cleared. */
  knacksCleared: number;
  /** Finale ability choices of the open week that were cleared (players with a converted creature). */
  abilitiesCleared: number;
}

export function combatV2Convert(ctx: ToolCtx): ConvertResult {
  if (!ctx.combatV2) throw new DevError(404, 'not_found');
  const sql = ctx.sql;
  const waiting = sql
    .exec<{ id: string; user_id: string; line: string; knack: string | null }>(
      `SELECT c.id, c.user_id, c.line, c.knack FROM creatures c
       WHERE NOT EXISTS (SELECT 1 FROM creature_talents_v2 t WHERE t.creature_id = c.id)
       ORDER BY c.caught_at, c.rowid`,
    )
    .toArray();
  let knacksCleared = 0;
  const players = new Set<string>();
  for (const creature of waiting) {
    grantFirstTalent(sql, ctx.talentRng, {
      creatureId: creature.id,
      userId: creature.user_id,
      line: creature.line,
      now: ctx.now,
    });
    if (creature.knack !== null) {
      sql.exec('UPDATE creatures SET knack = NULL WHERE id = ?', creature.id);
      knacksCleared += 1;
    }
    players.add(creature.user_id);
  }
  const week = weekIdFor(ctx.now, ctx.tz);
  let abilitiesCleared = 0;
  for (const userId of players) {
    abilitiesCleared += sql
      .exec(
        'DELETE FROM raid_abilities WHERE week_id = ? AND user_id = ? RETURNING 1',
        week,
        userId,
      )
      .toArray().length;
  }
  return { creatures: waiting.length, knacksCleared, abilitiesCleared };
}
