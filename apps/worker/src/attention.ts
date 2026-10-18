/**
 * What the Activity's notification pips show (`attention` on `GET /api/state`): whether the player can
 * start a dungeon run now, whether the Raid tab would ask them to set their team, and the soonest time
 * either answer could change by itself (so the client can look again then, and not poll). The server
 * decides all of it; the client only shows it.
 */
import type { Dungeon } from './dungeon';
import type { Raid } from './raid';

export interface Attention {
  dungeon: boolean;
  raid: boolean;
  /** The soonest future time (epoch ms) either answer could change on its own; null when none. */
  recheckAt: number | null;
}

/** The earliest of `times` that is after `now`; null when there is none (past and null times are ignored). */
export function soonestAfter(now: number, times: readonly (number | null)[]): number | null {
  let soonest: number | null = null;
  for (const t of times) {
    if (t === null || t <= now) continue;
    if (soonest === null || t < soonest) soonest = t;
  }
  return soonest;
}

export function attentionOf(
  parts: { dungeon: Dungeon; raid: Raid },
  userId: string,
  tz: string,
  now: number,
): Attention {
  const dungeon = parts.dungeon.attention(userId);
  const raid = parts.raid.needsPlacement(userId, tz);
  return {
    // An open run is a reason to come back, so the pip stays on for it (as it does for a run to start).
    dungeon: dungeon.canRun || dungeon.active,
    raid: raid.needed,
    recheckAt: soonestAfter(now, [dungeon.resetsAt, raid.nextAt]),
  };
}
