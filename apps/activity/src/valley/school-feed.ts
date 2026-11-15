/**
 * What the valley shell needs of the School and what its canvas asks the game to do (`SchoolCanvas.tsx`, `school-actions.ts`): the server's
 * answer (`GET /api/valley/school`), the reader's clock and zone, and the one action, seating a creature. Types only.
 */
import type { SchoolState } from '../api';

/** What the canvas asks the game to do; resolves true when the server took it (the refusal shows as the game's alert). */
export interface SchoolActions {
  /** Seats a creature at the student seat (`index`), or empties the seat with `null` (free, so no key). */
  seat: (index: number, creatureId: string | null) => Promise<boolean>;
}

/** What the valley shell needs of the School: what the server said of it (null until it has) and what the canvas asks. */
export interface SchoolFeed {
  /** `GET /api/valley/school`; null until the first answer (the place then reads "not open yet"). */
  view: SchoolState | null;
  actions: SchoolActions;
  /** The server's clock, for "this evening". */
  now: number;
  /** The reader's own time zone (the days of the stay and of the ceremony are told in it). */
  zone: string;
}
