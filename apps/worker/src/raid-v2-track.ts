/**
 * The end of a combat v2 weekend (docs/design/combat/integration.md, section 4; R24): the track moves one slot on a server kill and holds
 * otherwise, keeping the best share of the slot's HP removed and, from the second lap, a failed weekend (Determination's stacks).
 *
 * A server kill is today's rule across parties: at least half of the parties that played won (a party's boss fell in any of its stages).
 * `raid_weeks.ladder_at` is the done marker (as for a v1 week), `ladder_won` the verdict and `rank_after` the slot after. A Festival week
 * has no raid and the track waits; a weekend where no party played changes nothing.
 */
import { RULES } from '@creatures/game';
import type { Analytics } from './analytics';
import { shareBp } from './raid-v2-stage';
import { ensureTrack } from './raid-v2-core';

export interface TrackMove {
  slotBefore: number;
  slotAfter: number;
  won: boolean;
  parties: number;
  partiesWon: number;
  bestShareBp: number;
  failedWeekends: number;
}

/**
 * Ends the weekend once every party that played has finished: its boss fell, or its finale resolved, or it never started one. Returns
 * the move, or null when there is nothing to do (not a v2 week, a Festival, nobody played, a finale still going, or already ended).
 */
export function endWeekV2(
  sql: SqlStorage,
  weekId: string,
  now: number,
  analytics?: Analytics,
): TrackMove | null {
  const week = sql
    .exec<{
      rules_version: number;
      track_slot: number | null;
      festival: number | null;
      ladder_at: number | null;
    }>(
      'SELECT rules_version, track_slot, festival, ladder_at FROM raid_weeks WHERE week_id = ?',
      weekId,
    )
    .toArray()[0];
  if (week === undefined || week.rules_version !== 2 || week.track_slot === null) return null;
  if (week.ladder_at !== null || week.festival === 1) return null;
  const parties = sql
    .exec<{ party: number; hp_max: number | null; hp_current: number | null }>(
      'SELECT party, hp_max, hp_current FROM raid_parties WHERE week_id = ? AND carry_json IS NOT NULL',
      weekId,
    )
    .toArray();
  if (parties.length === 0) return null;
  // A party whose boss still stands and whose finale is being played (it has a live row and no result) is still going.
  const waiting = sql
    .exec(
      `SELECT 1 FROM raid_parties p
       WHERE p.week_id = ? AND p.carry_json IS NOT NULL AND p.hp_current > 0
         AND EXISTS (SELECT 1 FROM raid_live l WHERE l.week_id = p.week_id AND l.party = p.party AND l.practice = 0)
         AND NOT EXISTS (SELECT 1 FROM raid_results r WHERE r.week_id = p.week_id AND r.party = p.party AND r.phase = 'finale')
       LIMIT 1`,
      weekId,
    )
    .toArray();
  if (waiting.length > 0) return null;
  const partiesWon = parties.filter((p) => p.hp_current === 0).length;
  // At least half of the parties: integer maths, a tie counts as a win.
  const won = partiesWon * 2 >= parties.length;
  const slot = week.track_slot;
  const track = ensureTrack(sql);
  const best = parties.reduce(
    (m, p) =>
      Math.max(m, p.hp_max === null || p.hp_current === null ? 0 : shareBp(p.hp_max, p.hp_current)),
    0,
  );
  const { fromSlot, maxStacks } = RULES.raid.v2.determination;
  let bestShareBp = 0;
  let failedWeekends = 0;
  if (!won) {
    bestShareBp = Math.min(10_000, Math.max(track.slot === slot ? track.bestShareBp : 0, best));
    failedWeekends = (track.slot === slot ? track.failedWeekends : 0) + (slot >= fromSlot ? 1 : 0);
  }
  const slotAfter = won ? slot + 1 : slot;
  sql.exec(
    'UPDATE raid_track SET slot = ?, best_share_bp = ?, failed_weekends = ?, updated_week = ? WHERE id = 1',
    slotAfter,
    bestShareBp,
    failedWeekends,
    weekId,
  );
  sql.exec(
    'UPDATE raid_weeks SET ladder_at = ?, ladder_won = ?, rank_after = ? WHERE week_id = ? AND ladder_at IS NULL',
    now,
    won ? 1 : 0,
    slotAfter,
    weekId,
  );
  analytics?.record({
    kind: 'track_change',
    slot,
    kill: won,
    bestShareBp: won ? Math.min(10_000, best) : bestShareBp,
    determination: Math.min(failedWeekends, maxStacks),
  });
  return {
    slotBefore: slot,
    slotAfter,
    won,
    parties: parties.length,
    partiesWon,
    bestShareBp,
    failedWeekends,
  };
}
