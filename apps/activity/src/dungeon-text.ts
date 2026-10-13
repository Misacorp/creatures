/**
 * The words of the dungeon screens, as pure functions: error messages, why a run is blocked, the
 * depth and streak lines, the results headline. Plain text only; creature names and foe names can
 * carry player text and must be rendered as text.
 */
import { RULES } from '@creatures/game';
import { ApiError } from './api';
import {
  DUNGEON_ERRORS,
  type DungeonErrorCode,
  type DungeonRunSummary,
  type DungeonToday,
} from './dungeon-types';
import { errorText } from './game';

/** One short plain message for every error code the dungeon routes send. */
export const DUNGEON_ERROR_TEXT: Readonly<Record<DungeonErrorCode, string>> = {
  invalid_body:
    'The server did not understand that run. Close and reopen the Activity if it keeps happening.',
  duplicate_creature: 'Pick three different creatures.',
  invalid_abilities:
    'One of your ability choices is not allowed. Check the basic ability and the rounds you set.',
  invalid_id: 'That run could not be found. Close and reopen the Activity.',
  not_found:
    'One of those creatures, or that run, could not be found. The screen was out of date, so it was refreshed.',
  already_run: "You already used today's run. A new one opens when the day resets.",
  key_conflict: 'That run clashed with an earlier one. Check your picks and try again.',
};

const isDungeonCode = (code: string): code is DungeonErrorCode =>
  Object.hasOwn(DUNGEON_ERRORS, code);

/** The message for a failed dungeon request; any other failure gets the game's usual text. */
export function dungeonErrorText(err: unknown): string {
  if (err instanceof ApiError && err.code !== null && isDungeonCode(err.code)) {
    return DUNGEON_ERROR_TEXT[err.code];
  }
  return errorText(err);
}

/** True when the failure says the screen was out of date, so today's state should be loaded again. */
export function isStaleDungeonError(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'already_run' || err.code === 'not_found');
}

/** Why a run cannot start now, in words; null when it can. */
export function blockedText(today: Pick<DungeonToday, 'blocked' | 'canRun'>): string | null {
  switch (today.blocked) {
    case 'already_run':
      return 'You have already run the dungeon today. A new run opens when the day resets.';
    case 'need_creatures':
      return 'You need at least 3 creatures to enter. Catch more on an expedition.';
    case null:
      return today.canRun ? null : 'No run is possible right now.';
  }
}

/** True on the first-day retry: a first run that was lost may be tried once more. */
export function isRetryOffer(
  today: Pick<DungeonToday, 'canRun' | 'attemptsToday' | 'attemptsAllowed' | 'last'>,
): boolean {
  return (
    today.canRun &&
    today.attemptsToday > 0 &&
    today.attemptsToday < today.attemptsAllowed &&
    today.last !== null &&
    !today.last.cleared
  );
}

export const RETRY_TEXT =
  'Your first run was lost. On your first day you get one more try, free. Pick your team again or change it.';

/** "Depth 4" or "Depth 7, a landmark". */
export function depthLine(today: Pick<DungeonToday, 'depth' | 'landmark'>): string {
  return today.landmark
    ? `Depth ${String(today.depth)}, a landmark`
    : `Depth ${String(today.depth)}`;
}

/**
 * The next landmark at or after a depth (every 7th), and how many depths away it is, for the marker
 * on the pre-run screen. At a landmark itself the distance is 0.
 */
export function nextLandmark(
  depth: number,
  every: number = RULES.dungeon.landmarkEvery,
): { depth: number; away: number } {
  const at = Math.max(1, Math.ceil(Math.max(1, depth) / every)) * every;
  return { depth: at, away: at - Math.max(1, depth) };
}

/** The line next to the landmark marker: "Landmark in 3 depths (depth 7)". */
export function landmarkLine(depth: number): string {
  const { depth: at, away } = nextLandmark(depth);
  if (away === 0) return 'This depth is a landmark: a full clear drops gear for certain.';
  return `Next landmark: depth ${String(at)}, ${String(away)} ${away === 1 ? 'depth' : 'depths'} away.`;
}

/** How many days in a row, in words. */
export function streakLine(streak: number): string {
  if (streak <= 0) return 'No streak yet. Run today to start one.';
  return streak === 1 ? '1 day in a row' : `${String(streak)} days in a row`;
}

export interface StreakPip {
  day: number;
  on: boolean;
  /** The day pays a small bonus. */
  bonus: boolean;
}

/** The pips of a streak: a cycle of days (7), lit up to today's count; day 8 counts as day 1 again. */
export function streakPips(
  streak: number,
  cycleDays: number = RULES.dungeon.streak.cycleDays,
  bonusDays: readonly number[] = RULES.dungeon.streak.bonuses.map((b) => b.day),
): StreakPip[] {
  const lit = streak <= 0 ? 0 : ((streak - 1) % cycleDays) + 1;
  return Array.from({ length: cycleDays }, (_, i) => ({
    day: i + 1,
    on: i + 1 <= lit,
    bonus: bonusDays.includes(i + 1),
  }));
}

/** The headline of a finished run. */
export function resultHeadline(
  run: Pick<DungeonRunSummary, 'cleared' | 'roomsCleared' | 'rooms'>,
): string {
  if (run.cleared) return 'Dungeon cleared!';
  const total = run.rooms.length;
  return run.roomsCleared === 0
    ? 'Your team was beaten in the first room.'
    : `Your team fell in room ${String(run.roomsCleared + 1)} of ${String(total)}.`;
}

/** What the run did to the depth. */
export function depthChangeText(run: Pick<DungeonRunSummary, 'depth' | 'newDepth'>): string {
  return run.newDepth > run.depth
    ? `Depth ${String(run.depth)} to ${String(run.newDepth)}`
    : `Still at depth ${String(run.depth)}. Clear all three rooms to go deeper.`;
}

/** "Room 2 · Flooded": the card between rooms. */
export function roomCardTitle(index: number, modifierName: string): string {
  return `Room ${String(index + 1)} · ${modifierName}`;
}

/** The room's place in the run, for the stage header: "Room 3 of 3, room boss". */
export function roomLine(index: number, total: number, kind: 'foe' | 'boss'): string {
  return `Room ${String(index + 1)} of ${String(total)}${kind === 'boss' ? ', room boss' : ''}`;
}
