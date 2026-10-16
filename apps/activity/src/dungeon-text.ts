/**
 * The words of the dungeon screens, as pure functions: error messages, why a run is blocked, the
 * depth and streak lines, the results headline. Plain text only; creature names and foe names can
 * carry player text and must be rendered as text.
 */
import { RULES, dungeonContent } from '@creatures/game';
import { ApiError } from './api';
import type { DungeonErrorCode, DungeonRunSummary, DungeonToday } from './dungeon-types';
import { errorText } from './game';

/** One short plain message for every error code the dungeon routes send. */
export const DUNGEON_ERROR_TEXT: Readonly<Record<DungeonErrorCode, string>> = {
  invalid_body:
    'The server did not understand that run. Close and reopen the Activity if it keeps happening.',
  duplicate_creature: 'Pick three different creatures.',
  invalid_id: 'That run could not be found. Close and reopen the Activity.',
  not_found:
    'One of those creatures, or that run, could not be found. The screen was out of date, so it was refreshed.',
  already_run: "You already used today's run. A new one opens when the day resets.",
  key_conflict: 'That run clashed with an earlier one. Check your picks and try again.',
};

/** The message for a failed dungeon request; any other failure gets the game's usual text. */
export function dungeonErrorText(err: unknown): string {
  return errorText(err, 'Bait', DUNGEON_ERROR_TEXT);
}

/**
 * True when the failure says the dungeon screen was out of date, so today's state should be loaded
 * again. Narrower than `isStaleError`: it goes by the error code, not the status (a clashing key is
 * a 409 too, but the screen is not stale then).
 */
export function isStaleDungeonError(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'already_run' || err.code === 'not_found');
}

/**
 * The line on the pre-run card at a landmark depth, which names the room boss before the run:
 * "Depth 14, a landmark: the Slag Tyrant waits. It winds up Slag Spill a round ahead." A boss with
 * no signature move leaves out the second sentence; a boss the content does not know is just "a
 * room boss". The names come from the content, never from the server's text.
 */
export function landmarkLine(landmark: NonNullable<DungeonToday['landmarkBoss']>): string {
  const foe = dungeonContent.foes.find((f) => f.id === landmark.foeId);
  const head = `Depth ${String(landmark.depth)}, a landmark`;
  if (foe === undefined) return `${head}: a room boss waits.`;
  const waits = `${head}: the ${foe.name} waits.`;
  return foe.signature === undefined
    ? waits
    : `${waits} It winds up ${foe.signature.name} a round ahead.`;
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

/** The dungeon's one turn rule, said before the run (setup) and linked to "Your row" in the glossary. */
export const ORDER_LINE = 'Your creatures act left to right, then the foe.';

export const RETRY_TEXT = 'Your first run was lost. You get one more try today, free.';

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

/** What a screen reader says for the streak row: "Streak: 3 / 7 days of the cycle". */
export function streakLabel(streak: number): string {
  const pips = streakPips(streak);
  const lit = pips.filter((p) => p.on).length;
  return `Streak: ${String(lit)} / ${String(pips.length)} days of the cycle`;
}

/** The headline of a finished run. */
export function resultHeadline(
  run: Pick<DungeonRunSummary, 'cleared' | 'roomsCleared' | 'rooms'>,
): string {
  if (run.cleared) return 'Dungeon cleared!';
  const total = run.rooms.length;
  return run.roomsCleared === 0
    ? 'Your team was beaten in the first room.'
    : `Your team fell in room ${String(run.roomsCleared + 1)} / ${String(total)}.`;
}

/** What the run did to the depth. */
export function depthChangeText(run: Pick<DungeonRunSummary, 'depth' | 'newDepth'>): string {
  return run.newDepth > run.depth
    ? `Depth ${String(run.depth)} to ${String(run.newDepth)}`
    : `Still at depth ${String(run.depth)}. Clear all three rooms to go deeper.`;
}

/** The room's place in the run, for the stage header: "Room 3 / 3, room boss". */
export function roomLine(index: number, total: number): string {
  return `Room ${String(index + 1)} / ${String(total)}`;
}
