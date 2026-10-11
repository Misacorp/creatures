/**
 * Auto fire preferences for the finale (table `raid_autofire`, migration 14). A preference is the
 * default Auto fire setting of one ability for one week's finale: on (the ability fires by itself at
 * its default round) or off (it waits for its owner and still fires in the last round). The live start
 * reads them to set each ability's first mode, and the Raid view and the lobby show them. After the
 * start the live actions (`hold`, `unhold`) take over and the preferences are no longer read.
 *
 * The target is `basic` (the basic ability) or the id of one of the player's own team creatures. A
 * preference for a creature that is no longer in the team is never read, so it is ignored.
 */
import { effectiveTeam, RaidError } from './raid-teams';

/** The target of a player's basic ability. */
export const BASIC_TARGET = 'basic';

/** The target of one finale ability: its creature's id, or `basic`. */
export const targetOf = (ability: { creatureId: string | null }): string =>
  ability.creatureId ?? BASIC_TARGET;

/** What the players of a week chose, by player and target. Anything not in it is on. */
export interface AutofirePrefs {
  /** True unless the player turned it off. */
  isOn(userId: string, target: string): boolean;
}

const KEY_SEPARATOR = '\u0000';

export function loadAutofire(sql: SqlStorage, weekId: string): AutofirePrefs {
  const off = new Set<string>();
  for (const row of sql
    .exec<{
      user_id: string;
      target: string;
      auto_fire: number;
    }>('SELECT user_id, target, auto_fire FROM raid_autofire WHERE week_id = ?', weekId)
    .toArray()) {
    if (row.auto_fire === 0) off.add(`${row.user_id}${KEY_SEPARATOR}${row.target}`);
  }
  return { isOn: (userId, target) => !off.has(`${userId}${KEY_SEPARATOR}${target}`) };
}

/**
 * Stores one preference. The target must be `basic` or one of the player's own team creatures this
 * week (`not_your_creature` otherwise). Idempotent. Call it inside a transaction.
 */
export function storeAutofire(
  sql: SqlStorage,
  weekId: string,
  userId: string,
  target: string,
  on: boolean,
): void {
  if (target !== BASIC_TARGET) {
    const team = effectiveTeam(sql, weekId, userId).creatures;
    if (!team.some((c) => c.id === target)) throw new RaidError(409, 'not_your_creature');
  }
  sql.exec(
    `INSERT INTO raid_autofire (week_id, user_id, target, auto_fire) VALUES (?, ?, ?, ?)
     ON CONFLICT(week_id, user_id, target) DO UPDATE SET auto_fire = excluded.auto_fire`,
    weekId,
    userId,
    target,
    on ? 1 : 0,
  );
}
