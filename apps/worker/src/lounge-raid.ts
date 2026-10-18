/**
 * The raid weekend line of the lounge message (see `lounge.ts`), read from the game's own state. All
 * times here are on the game clock; the caller puts any Discord timestamp on real time.
 */
import { bossAtRank, content } from '@creatures/game';
import { readWeekProgression } from './raid-ladder';
import { addWeeks, eventTimes, weekIdFor } from './raid-schedule';
import type { StoredSummary } from './raid-resolve';

/** The stage of the raid weekend the lounge line shows, with game-clock times. */
export type RaidStage =
  | { boss: string; stage: 'phase2' | 'finale'; at: number }
  | { boss: string; stage: 'live' }
  | { boss: string; stage: 'over'; fell: boolean };

/**
 * The line for `now` (game clock), or null outside the weekend (from phase 1 on) or when the week
 * does not exist. The boss name is the one the raid posts use (its moves depend on the week's rank).
 */
export function raidStageAt(sql: SqlStorage, now: number, tz: string): RaidStage | null {
  const weekId = weekIdFor(now, tz);
  const times = eventTimes(weekId, tz);
  if (now < times.phase1) return null;
  const week = sql
    .exec<{ boss_id: string }>('SELECT boss_id FROM raid_weeks WHERE week_id = ?', weekId)
    .toArray()[0];
  if (week === undefined) return null;
  const found = content.bosses.find((b) => b.id === week.boss_id);
  if (found === undefined) return null;
  const progression = readWeekProgression(sql, weekId);
  const boss = bossAtRank(found, progression?.effectiveRank ?? progression?.rank ?? 1).name;
  if (now < times.phase2) return { boss, stage: 'phase2', at: times.phase2 };
  if (now < times.finale) return { boss, stage: 'finale', at: times.finale };
  const finales = sql
    .exec<{ summary: string }>(
      "SELECT summary FROM raid_results WHERE week_id = ? AND phase = 'finale'",
      weekId,
    )
    .toArray();
  if (finales.length === 0) return { boss, stage: 'live' };
  const fell = finales.some((f) => (JSON.parse(f.summary) as StoredSummary).cleared);
  return { boss, stage: 'over', fell };
}

/** The next raid boundary (phase 1, phase 2 or the finale of this week, or next week's phase 1) after `now`. */
export function nextRaidBoundary(now: number, tz: string): number {
  const weekId = weekIdFor(now, tz);
  const times = eventTimes(weekId, tz);
  const next = [times.phase1, times.phase2, times.finale].find((t) => t > now);
  return next ?? eventTimes(addWeeks(weekId, 1), tz).phase1;
}
