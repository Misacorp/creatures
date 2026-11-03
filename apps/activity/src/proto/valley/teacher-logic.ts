/**
 * The School's visiting teacher as plain functions (prototype, dev only; `systems/school.md`, V-SCH-11 to
 * V-SCH-13, round 22). A teacher comes every week and stays Monday to Wednesday (guild time); it is announced
 * over the weekend before. It brings ONE talent, picked from the server's whole sample so that it benefits
 * someone: among the talents some player's line can take and that player's book for the line lacks, one that
 * benefits more than one player is preferred, and never one that benefits everyone, so it seems random. Never
 * golden. A creature seated at the School before the arrival or on any day of the stay learns by the next
 * morning if its line can take the talent and its owner's book for that line lacks it. No DOM, no clock, no
 * `Math.random`: the pick is a pure function of the week and the players.
 */

/** Where the teacher is in the week: announced (Saturday, Sunday), at the School (Monday to Wednesday), or gone. */
export type TeacherPhase = 'coming' | 'here' | 'gone';

export const TEACHER_FIRST_DAY = 1;
export const TEACHER_LAST_DAY = 3;
export const TEACHER_DAYS = 'Monday to Wednesday';
/** A player's student seats at the School (example in V-SCH-13). */
export const SEATS = 2;

/** The phase on an ISO weekday (1 Monday to 7 Sunday). */
export function teacherPhase(weekday: number): TeacherPhase {
  if (weekday >= TEACHER_FIRST_DAY && weekday <= TEACHER_LAST_DAY) return 'here';
  return weekday >= 6 ? 'coming' : 'gone';
}

/** The week's number: whole weeks from a Monday (UTC), so every player of the server agrees on the week. */
export function weekNumber(now: number): number {
  // 1 January 1970 was a Thursday: three days in is the first Monday.
  return Math.floor((now / 86_400_000 - 4) / 7);
}

/**
 * The week the visit belongs to: on a Saturday or Sunday the announcement is for the Monday that follows, so it
 * is next week's number.
 */
export function visitWeek(now: number, weekday: number): number {
  return weekNumber(now) + (weekday >= 6 ? 1 : 0);
}

/** The shipped glyph of each combat v2 role (`sprites/concepts/combat-icons.ts`): shown wherever a talent's role shows. */
export const ROLE_GLYPH: Readonly<Record<string, string>> = {
  setter: 'mark',
  payoff: 'sparkle',
  guard: 'shield',
  support: 'ability',
};

/** Line id to its pool of talent ids (the shipped combat v2 pools; injected so the tests can use tiny ones). */
export type Pools = Readonly<Record<string, readonly string[]>>;

/** A player as the pick sees them: the lines they own and their Talent Book for each line. */
export interface Player {
  id: string;
  lines: readonly string[];
  book: Readonly<Record<string, readonly string[]>>;
}

/** Whether a creature of `line` could learn `talent` from this player's book: the pool has it, the book lacks it. */
export function lineCanLearn(
  line: string,
  talent: string,
  book: Readonly<Record<string, readonly string[]>>,
  pools: Pools,
): boolean {
  return (pools[line] ?? []).includes(talent) && !(book[line] ?? []).includes(talent);
}

/** Whether any line a player owns could learn the talent. */
export function benefits(player: Player, talent: string, pools: Pools): boolean {
  return player.lines.some((line) => lineCanLearn(line, talent, player.book, pools));
}

/** A small stable hash (FNV-1a) of a text, for a deterministic and well spread pick. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The week's talent (V-SCH-12), or null when nobody benefits from any talent (no teacher that week). Of the
 * talents that benefit at least one player: first those that benefit more than one player but not everyone, then
 * those that benefit exactly one (when there are other players), and only when every candidate benefits everyone
 * (or the server has one player) any of them: with `b` benefiting out of `n`, that is the fewest benefiting
 * that exist. Inside the chosen group the week's hash decides, so the same week and players always give the same
 * talent. Talents are plain ids: a teacher never teaches a golden one.
 */
export function weeksTalent(players: readonly Player[], pools: Pools, week: number): string | null {
  const all = [...new Set(Object.values(pools).flat())].sort();
  const n = players.length;
  const counted = all
    .map((id) => ({ id, b: players.filter((p) => benefits(p, id, pools)).length }))
    .filter((t) => t.b > 0);
  if (counted.length === 0) return null;
  const several = counted.filter((t) => t.b > 1 && t.b < n);
  const one = counted.filter((t) => t.b === 1 && n > 1);
  const fewest = Math.min(...counted.map((t) => t.b));
  const group =
    several.length > 0 ? several : one.length > 0 ? one : counted.filter((t) => t.b === fewest);
  const ranked = group
    .map((t) => ({ id: t.id, h: hash(`${String(week)}:${t.id}`) }))
    .sort((a, b) => a.h - b.h || (a.id < b.id ? -1 : 1));
  return ranked[0]?.id ?? null;
}

/** A creature as the lesson sees it. */
export interface Student {
  id: string;
  line: string;
}

/**
 * Your creatures that would learn the talent: their line can take it and your book for that line lacks it. Once a
 * creature of a line is seated, the talent is in the book by morning, so the others of that line are no longer
 * shown (a second seat would be wasted). Seated creatures themselves are not listed here.
 */
export function wouldLearn<T extends Student>(
  creatures: readonly T[],
  book: Readonly<Record<string, readonly string[]>>,
  talent: string,
  pools: Pools,
  seated: readonly string[],
): T[] {
  const seatedLines = new Set(creatures.filter((c) => seated.includes(c.id)).map((c) => c.line));
  return creatures.filter(
    (c) =>
      !seated.includes(c.id) &&
      !seatedLines.has(c.line) &&
      lineCanLearn(c.line, talent, book, pools),
  );
}

/** The book after the night: each seated student's line gains the talent when it could take it. */
export function bookAfterLesson(
  creatures: readonly Student[],
  book: Readonly<Record<string, readonly string[]>>,
  talent: string,
  pools: Pools,
  seated: readonly string[],
): Record<string, readonly string[]> {
  const next: Record<string, readonly string[]> = { ...book };
  for (const c of creatures) {
    if (seated.includes(c.id) && lineCanLearn(c.line, talent, next, pools)) {
      next[c.line] = [...(next[c.line] ?? []), talent];
    }
  }
  return next;
}

/** What the lesson looks like to the player right now; the School's words and button read it. */
export interface LessonState {
  phase: TeacherPhase;
  /** The week's talent id and name; null when nobody on the server benefits (no teacher this week). */
  talent: { id: string; name: string } | null;
  /** Names of the creatures seated now. */
  seatedNames: readonly string[];
  /** Your creatures that would learn, and whether a seat is free. */
  eligible: number;
  seatFree: boolean;
  /** The morning after: the name of the creature whose line's book now has the talent. */
  learnedBy: string | null;
  from: string;
}

/**
 * The teacher's words and button. `line` is the School's own (the pinned calm line), `short` is the Places list's,
 * `news` is false when the teacher is gone or absent (the ceremony's news may then lead).
 */
export interface TeacherNote {
  line: string;
  short: string;
  action: string | null;
  news: boolean;
}

const SEND = 'Send to the teacher';

/**
 * What the School says about the teacher, in a few words, and its one button when there is a next step: "Send to
 * the teacher" when something of yours can learn and a seat is free. The Places list reads `short`: "teacher Monday
 * to Wednesday: Rally Cry", "next teacher Monday".
 */
export function teacherNote(s: LessonState): TeacherNote {
  if (s.talent === null) {
    return {
      line: 'No teacher this week',
      short: 'no teacher this week',
      action: null,
      news: false,
    };
  }
  const name = s.talent.name;
  if (s.learnedBy !== null) {
    const line = `${name} is in ${s.learnedBy}'s book`;
    return { line, short: line, action: null, news: true };
  }
  const send = s.eligible > 0 && s.seatFree;
  if (s.seatedNames.length > 0) {
    const line = `${s.seatedNames.join(' and ')} learns ${name} by morning`;
    return { line, short: line, action: send ? SEND : null, news: true };
  }
  if (s.phase === 'gone') {
    return { line: 'Next teacher Monday', short: 'next teacher Monday', action: null, news: false };
  }
  if (s.phase === 'coming') {
    return {
      line: `A teacher from ${s.from} brings ${name}, ${TEACHER_DAYS}`,
      short: `teacher Monday: ${name}`,
      action: send ? SEND : null,
      news: true,
    };
  }
  return {
    line:
      s.eligible === 0
        ? `${name} this week: none of yours can learn it`
        : `A teacher from ${s.from} brings ${name}`,
    short: `teacher ${TEACHER_DAYS}: ${name}`,
    action: send ? SEND : null,
    news: true,
  };
}
