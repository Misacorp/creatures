/**
 * What the School's buttons do (phase 5 step 9b): the read of the School, and seating a creature (or taking it off). A seating is free (like
 * every post: no key); the server decides everything and answers a refusal with a code the game shows as the shared alert (`no_teacher`,
 * `would_not_learn`, `line_seated`). After a seating, or after a refusal that says the School is not as the screen thought, the School is
 * read again so the page, the scene and the valley's lists follow the server. Plain code with injected parts, so it is tested without the
 * game screen.
 */
import type { ActionRunner } from '../action-runner';
import {
  ApiError,
  fetchSchool,
  seatAtSchool,
  type GameState,
  type SchoolState,
  type ValleyAnswer,
} from '../api';
import type { SchoolActions } from './SchoolPage';

/** What `Game` gives the actions. */
export interface SchoolDeps {
  run: ActionRunner['run'];
  /** Takes in an answer's valley and state; false when there was none. */
  takeValley: (answer: { valley: ValleyAnswer['valley']; state: GameState } | undefined) => boolean;
  /** Changes what the screen holds of the School. */
  setSchool: (view: SchoolState) => void;
  /** The server calls, replaceable in tests. */
  server?: { seatAtSchool: typeof seatAtSchool; fetchSchool: typeof fetchSchool };
}

/** The refusals that say the School is not as the screen thought: the screen reads it again. */
const STALE_CODES: readonly string[] = ['no_teacher', 'would_not_learn', 'line_seated'];

/** True when an error is one of the School's refusals. */
export const isSchoolRefusal = (err: unknown): boolean =>
  err instanceof ApiError && err.status === 409 && STALE_CODES.includes(err.code ?? '');

/** Reads the School afresh into the screen; a failed read keeps what the screen has. */
export async function refreshSchool(
  setSchool: (view: SchoolState) => void,
  read: typeof fetchSchool = fetchSchool,
): Promise<void> {
  try {
    setSchool(await read());
  } catch {
    // Keep what is on screen; the next visit to the School reads it again.
  }
}

export function createSchoolActions(deps: SchoolDeps): SchoolActions {
  const server = deps.server ?? { seatAtSchool, fetchSchool };
  return {
    seat: async (index, creatureId): Promise<boolean> => {
      const answer = await deps.run(() => server.seatAtSchool({ index, creatureId }));
      if (!deps.takeValley(answer)) return false;
      await refreshSchool(deps.setSchool, server.fetchSchool);
      return true;
    },
  };
}
