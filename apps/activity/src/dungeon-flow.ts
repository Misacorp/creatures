/**
 * Which dungeon screen to show, as pure functions of the server's state: the pre-run screen when a
 * run can start (the first-day retry included) or when there is nothing to show yet (not enough
 * creatures), the summary of the day's run when today's run is used up. The server decides what is
 * possible (`canRun`, `blocked`); this only picks the screen.
 */
import type { DungeonToday } from './dungeon-types';

export type DungeonScreen = 'setup' | 'results';

export function initialScreen(today: Pick<DungeonToday, 'canRun' | 'last'>): DungeonScreen {
  if (today.canRun) return 'setup';
  return today.last === null ? 'setup' : 'results';
}

/** Milliseconds until the day resets, by the server's clock (`offset` is server minus local), never negative. */
export function msUntilReset(
  today: Pick<DungeonToday, 'resetsAt'>,
  localNow: number,
  offset: number,
): number {
  return Math.max(0, today.resetsAt - (localNow + offset));
}

/** How long after the reset to ask again: a moment, so the server's day has really turned. */
export const RESET_GRACE_MS = 1_500;
