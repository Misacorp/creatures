/**
 * What the valley says about the School (phase 5 step 9b, `systems/school.md` V-SCH-10 to 13, `systems/trials.md` V-TRIAL-3, 4), as plain
 * functions over the server's answers (`GET /api/valley/school`, the seat's answer and `valley.graduation`): where the teacher stands, the
 * stay's days in the reader's own time zone, which of a player's creatures would learn (their faces, with one Send), the seats, and the
 * graduation's line. Pure: no clock of its own and no request. There is no countdown anywhere: a lesson is learned "by morning", the
 * ceremony is "this evening", and the days are names of days (V-RET-7).
 */
import type { Creature, SchoolState, ValleyVisit } from '../api';

/** One student seat as the server shows it. */
export type SchoolSeatView = SchoolState['seats'][number];

/** The one line of a School with no teacher (V-SCH-11: the scene is empty then). */
export const NO_TEACHER_LINE = 'No teacher at the School right now.';

/** What the School says when a teacher is announced or here but no talent benefits anyone (no talent was drawn). */
export const NOTHING_TO_TEACH_LINE = 'No lesson this week: nothing on the server needs one.';

/** What the School says before the server has answered (or with the valley's systems off): the "not open yet" line. */
export const WAITING_LINE = 'A teacher will visit here.';

/** The faces list's words when none of the player's creatures would learn it (V-SCH-13). */
export const NONE_OF_YOURS = 'None of yours this time.';

/** The words under a seated student: it learns it by the next morning (V-SCH-13), never a timer. */
export const LEARNS_BY_MORNING = 'Learns it by morning';

/** The line under the seats when every one is taken. */
export const SEATS_FULL_LINE = 'Both seats are taken. Take one off to send another.';

/** True when the server has answered about the School (null until the first answer; the place then reads "not open yet"). */
export const isSchoolHere = (view: SchoolState | null | undefined): view is SchoolState =>
  view !== null && view !== undefined;

/** The device's own time zone (the reader's local time); UTC where the platform cannot say. */
export function readerZone(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function dayName(at: number, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'long' }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(at);
  }
}

/**
 * The stay's days in the reader's own time ("Monday to Wednesday"; a reader far east or west sees the days their own clock gives):
 * from the day of the arrival to the day of the last moment before he leaves. Null while away (nothing is announced).
 */
export function stayDays(view: SchoolState, zone: string): string | null {
  if (view.arrivesAt === null || view.leavesAt === null) return null;
  const first = dayName(view.arrivesAt, zone);
  const last = dayName(view.leavesAt - 1, zone);
  return first === last ? first : `${first} to ${last}`;
}

/** The School's head line: where the teacher stands, with the stay's days. */
export function teacherLine(view: SchoolState, zone: string): string {
  if (view.phase === 'away') return NO_TEACHER_LINE;
  if (view.talent === null) return NOTHING_TO_TEACH_LINE;
  const days = stayDays(view, zone);
  const when = days === null ? '' : ` ${days}`;
  return view.phase === 'here'
    ? `The visiting teacher is here${when}.`
    : `A visiting teacher comes${when}.`;
}

/** Whether a teacher with a talent is at the School now or announced (the lectern stands, the seats can be used). */
export const teaching = (view: SchoolState | null | undefined): boolean =>
  isSchoolHere(view) && view.phase !== 'away' && view.talent !== null;

/** The first empty student seat, if any. */
export const freeSeat = (view: SchoolState): SchoolSeatView | undefined =>
  view.seats.find((s) => s.creatureId === null);

/** One of the player's creatures on the School's list: its face and what to do with it. */
export interface Learner {
  creature: Creature;
  /** The seat it sits in, or null when it waits to be sent. */
  seat: number | null;
}

/**
 * The faces of the player's creatures that would learn the talent (V-SCH-13), the seated students first (in seat order), then the rest in
 * the server's order. An id the client does not hold is skipped. Empty: "none of yours this time".
 */
export function learners(view: SchoolState, creatures: readonly Creature[]): Learner[] {
  const byId = new Map(creatures.map((c) => [c.id, c]));
  const seated = view.seats.flatMap((s) => {
    const creature = s.creatureId === null ? undefined : byId.get(s.creatureId);
    return creature === undefined ? [] : [{ creature, seat: s.index }];
  });
  const seatedIds = new Set(seated.map((l) => l.creature.id));
  const waiting = view.wouldLearn.flatMap((id) => {
    const creature = byId.get(id);
    return creature === undefined || seatedIds.has(id) ? [] : [{ creature, seat: null }];
  });
  return [...seated, ...waiting];
}

/** The ids of the creatures sitting at the School's seats (what the valley shows there instead of at rest). */
export function studentIds(view: SchoolState | null | undefined): ReadonlySet<string> {
  if (!isSchoolHere(view)) return new Set();
  return new Set(view.seats.flatMap((s) => (s.creatureId === null ? [] : [s.creatureId])));
}

/**
 * The valley's state without the creatures seated at the School: the server's view lists a student as resting at the fire (it has no seat
 * view of the School; step 9a), so the client takes the School's own answer and leaves the students out of the valley's lists (the fire's
 * ring, the tray's "z", the map's walkers). The same object when nobody is seated.
 */
export function withoutStudents(visit: ValleyVisit, students: ReadonlySet<string>): ValleyVisit {
  if (students.size === 0 || !visit.creatures.some((c) => students.has(c.id))) return visit;
  return { ...visit, creatures: visit.creatures.filter((c) => !students.has(c.id)) };
}

// --- The graduation (V-TRIAL-3, V-TRIAL-4) ---

/** "3 ready to graduate" (V-TRIAL-3, the valley's line): null when none are. */
export function readyLine(ready: number): string | null {
  return ready <= 0 ? null : `${String(ready)} ready to graduate`;
}

const dayKey = (at: number, zone: string): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(at);
  }
};

const hourOf = (at: number, zone: string): number => {
  try {
    const part = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .find((p) => p.type === 'hour');
    return Number(part?.value ?? '0');
  } catch {
    return 0;
  }
};

/**
 * When the next ceremony is, in the reader's own time, in words that never count down: "this evening" on the reader's day of it, else
 * "tomorrow evening" (a ceremony further off says its day). "Evening" is from 17:00 local; earlier it is "today" or "tomorrow".
 */
export function ceremonyWhen(nextAt: number, now: number, zone: string): string {
  const evening = hourOf(nextAt, zone) >= 17;
  const today = dayKey(now, zone);
  const there = dayKey(nextAt, zone);
  if (there === today) return evening ? 'this evening' : 'today';
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  // Noon UTC of the next calendar date reads as that date in any zone's day key.
  if (there === dayKey(Date.UTC(y, m - 1, d + 1, 12), 'UTC'))
    return evening ? 'tomorrow evening' : 'tomorrow';
  return `${dayName(nextAt, zone)}${evening ? ' evening' : ''}`;
}

/** The graduation card's lines: how many are ready, and when the next ceremony is. */
export function graduationLines(
  graduation: { ready: number; nextAt: number } | undefined,
  now: number,
  zone: string,
): string[] {
  if (graduation === undefined) return [];
  const ready = readyLine(graduation.ready);
  const when = `The next ceremony is ${ceremonyWhen(graduation.nextAt, now, zone)}.`;
  return [ready ?? 'Nobody is ready to graduate yet.', when];
}

// --- The Places list and the map ---

/**
 * The Places list's line for the School: the ceremony's news first ("2 ready to graduate"), then where the teacher stands. Null before the
 * server has said anything (the place then reads "not open yet").
 */
export function schoolLine(
  view: SchoolState | null | undefined,
  graduation: { ready: number } | undefined,
): string | null {
  const ready = graduation === undefined ? null : readyLine(graduation.ready);
  const teacher = !isSchoolHere(view)
    ? null
    : view.phase === 'away'
      ? 'no teacher now'
      : view.talent === null
        ? null
        : view.phase === 'here'
          ? 'a teacher is here'
          : 'a teacher is coming';
  const parts = [ready, teacher].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}
