/**
 * Which dungeon screen to show, as pure functions of the server's state. The server decides what is
 * possible (`canRun`, `blocked`, an open run, what is pending); this only picks the screen:
 *
 * - `setup`: the pre-run screen (the map in preview, the team, Enter), also when there is nothing to
 *   show yet (not enough creatures);
 * - `run`: an open run on its map, which is also where a stored run resumes after a reload;
 * - `event`, `camp`, `descend`: the run stands in a mystery room, at the camp or at the descent card
 *   (the boss fell), and that choice comes first;
 * - `fight`: the playback of the one room a move just played (the screen only knows this one from
 *   the answer of the move, never from today);
 * - `results`: the summary of the day's run when it is over.
 */
import type {
  DungeonActResponse,
  DungeonRunState,
  DungeonRunSummary,
  DungeonToday,
} from './dungeon-types';

/** The screen of an open run: what is pending comes first, else the map. */
export function runScreenOf(
  state: Pick<DungeonRunState, 'pending'>,
): 'run' | 'event' | 'camp' | 'descend' {
  if (state.pending === null) return 'run';
  return state.pending.kind;
}

/** The run that is open, or null: only a state that is still `active` counts. */
export function openRun(today: Pick<DungeonToday, 'active'>): DungeonRunState | null {
  const run = today.active ?? null;
  return run !== null && run.status === 'active' ? run : null;
}

/**
 * The screen to open with, from what today says: an open run first (resume after a reload), else the
 * pre-run screen when a run can start (the first-day retry included) or when there is nothing to show
 * yet (not enough creatures), else the summary of the day's run.
 */
export function initialScreen(
  today: Pick<DungeonToday, 'canRun' | 'last'> & Partial<Pick<DungeonToday, 'active'>>,
): 'setup' | 'run' | 'results' {
  if (openRun({ active: today.active ?? null }) !== null) return 'run';
  if (today.canRun) return 'setup';
  return today.last === null ? 'setup' : 'results';
}

/**
 * The screen the answer of an act leads to. A move into a fight comes with its room, which plays
 * first (a fight that ended the run plays too, and the results follow it); a run that ended without
 * a fight (heading home) goes straight to the results; otherwise the run goes on, at the choice it
 * stands at.
 */
export function screenAfterAct(
  answer: Pick<DungeonActResponse, 'state' | 'room' | 'summary'>,
): 'fight' | 'results' | 'run' | 'event' | 'camp' | 'descend' {
  if (answer.room !== undefined) return 'fight';
  if (answer.summary !== undefined) return 'results';
  return runScreenOf(answer.state);
}

/**
 * The screen after a fight has played out: the results when the fight ended the run (the answer
 * carried the summary), otherwise back to the run, at what it stands at.
 */
export function screenAfterFight(
  summary: DungeonRunSummary | undefined,
  state: Pick<DungeonRunState, 'pending'>,
): 'results' | 'run' | 'event' | 'camp' | 'descend' {
  return summary === undefined ? runScreenOf(state) : 'results';
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
