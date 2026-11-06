/**
 * The `valley-fresh` dev tool (staging only; `docs/design/valley/phase5-plan.md`, step 0): wipes every player's progress in the
 * caller's guild and opens a day-0 valley, so a step can be tried from nothing and the simulated month starts clean. It is the
 * first half of phase 6's reset, on staging.
 *
 * It exists only when the dev tools and the valley systems are both on (`VALLEY_SYSTEMS`, which needs `VALLEY` and `COMBAT_V2`;
 * anything else answers 404). Production has the dev tools off, so the route is a 404 there before this code runs, and its
 * `VALLEY_SYSTEMS` is off as well (a test pins both).
 *
 * What it clears: every table with a `user_id` column (`purgeUser`: creatures, balances, gear, trips, jobs, runs ... everything but
 * sign-in and the guild's own rows), the players' dev state, and the valley's guild-level tables in `VALLEY_GUILD_TABLES`. Players
 * stay signed in with their rows in `players`; each starts again at the starter choice. The dev clock goes back to real time.
 */
import { DevError, purgeUser, type ToolCtx } from './dev-context';

/**
 * The valley's tables that are NOT keyed by `user_id` (the guild-level ones), cleared whole. Per-player valley tables carry a
 * `user_id` column and are cleared by `purgeUser` with everything else, so they need no entry. Step 5 added `valley_server` (the
 * server's middle); later steps add their guild-level tables here, in one place (for example `valley_places`, `valley_gifts`,
 * `valley_collections`, `valley_fire_log` in step 6).
 */
export const VALLEY_GUILD_TABLES: readonly string[] = ['valley_server'];

export interface ValleyFreshResult {
  /** Players whose progress was wiped. */
  players: number;
  /** The valley's guild-level tables that were cleared. */
  tablesCleared: string[];
}

export function valleyFresh(ctx: ToolCtx): ValleyFreshResult {
  if (!ctx.valleySystems) throw new DevError(404, 'not_found');
  const sql = ctx.sql;
  const ids = sql
    .exec<{ user_id: string }>('SELECT user_id FROM players ORDER BY user_id')
    .toArray()
    .map((r) => r.user_id);
  for (const userId of ids) {
    purgeUser(sql, userId, true);
    ctx.state.clearUser(userId);
  }
  // Names come from the constant above, never from a request.
  for (const table of VALLEY_GUILD_TABLES) sql.exec(`DELETE FROM "${table}"`);
  ctx.raid.invalidateReadiness();
  ctx.offset.set(0);
  return { players: ids.length, tablesCleared: [...VALLEY_GUILD_TABLES] };
}
