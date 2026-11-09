import type { Rng } from '../rng';
import { int } from '../rng';
import type { ValleyRules } from './rules';
import { VISITOR_WEEK_HOURS } from './visitor';

/**
 * The School's visiting teacher, the pure half (phase 5 step 9, docs/design/valley/systems/school.md, V-SCH-10 to 13). The lab
 * (`packages/econ/src/school.ts`) models the same rules and imports these for the band rule, the "would benefit" test and the price, so
 * a number changes in one place. Nothing here reads a clock or a table; the worker passes in the books and the pools it read, and the
 * dice. The week is the visitor's Monday-first week (`visitorWeekOf`), counted on the guild's wall clock.
 */

type SchoolRules = Pick<ValleyRules, 'school'>;

/**
 * V-SCH-12: "a few" players is from 2 up to this share of the server's players (at least 2), never everyone. One place for the lab and the
 * server (the owner's trial of the first draft, 2026-11-03, tuned it).
 */
export const TEACHER_BAND_SHARE = 0.25;

/** Where the teacher stands at an hour of the Monday-first week: here (Monday to Wednesday), announced for the coming Monday, or away. */
export type TeacherPhase = 'here' | 'announced' | 'away';

/** V-SCH-11: the phase at this many hours into a Monday-first week (the stay starts Monday 00:00; the announcement comes `teacherAnnounceDays` ahead). */
export function teacherPhase(rules: SchoolRules, hoursIn: number): TeacherPhase {
  const inWeek = hoursIn % VISITOR_WEEK_HOURS;
  const s = rules.school;
  if (inWeek < s.teacherStayDays * 24) return 'here';
  if (inWeek >= (7 - s.teacherAnnounceDays) * 24) return 'announced';
  return 'away';
}

/** The `YYYY-MM-DD` key `days` after the key (a Monday, say). Calendar arithmetic on the date only, so it never meets a DST change. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return `${String(at.getUTCFullYear()).padStart(4, '0')}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(at.getUTCDate()).padStart(2, '0')}`;
}

/**
 * The Monday (key) of the teacher a moment belongs to: this week's while he is here, the next week's once announced, none between.
 * `weekKey` and `hoursIn` are the visitor's week of the instant.
 */
export function teacherWeekOf(
  rules: SchoolRules,
  week: { readonly key: string; readonly hoursIn: number },
): { phase: TeacherPhase; key: string | null } {
  const phase = teacherPhase(rules, week.hoursIn);
  if (phase === 'here') return { phase, key: week.key };
  if (phase === 'announced') return { phase, key: addDaysToKey(week.key, 7) };
  return { phase, key: null };
}

/**
 * V-SCH-10: the Acorns a first learning of slot `slot` (1-based) costs on a creature's card: the price times the slot's number. Slot 1 is
 * the talent a creature is born with (given when it is caught, the owner's answer of 2026-11-09), so it is free; the server never charges
 * it (the born talent is already learned, the next learning is slot 2), and the lab starts every creature with it learned.
 */
export const learningPrice = (rules: SchoolRules, slot: number): number =>
  slot <= 1 ? 0 : rules.school.price * slot;

/** Whether a talent would benefit a player: a line they own has it in its pool and their book for that line lacks it. */
export function wouldBenefit<T>(
  lines: Iterable<{ readonly pool: readonly T[]; readonly book: ReadonlySet<T> }>,
  talent: T,
): boolean {
  for (const line of lines) if (!line.book.has(talent) && line.pool.includes(talent)) return true;
  return false;
}

/** V-SCH-13: a creature learns the lesson when its line's pool holds the talent and its owner's book for the line lacks it. */
export const lessonTakes = <T>(pool: readonly T[], book: ReadonlySet<T>, talent: T): boolean =>
  pool.includes(talent) && !book.has(talent);

/**
 * V-SCH-12, the band rule (the owner's words: "it's fine if it doesn't benefit many players ... select one that benefits hopefully more
 * than one. But we don't want ... everyone"). `counts[t]` is how many of the server's `players` the talent `t` would benefit. Of the
 * talents that benefit at least one player: first those that benefit a few players, from 2 up to max(2, a quarter of the players) and never
 * all; else those that benefit exactly one (when there is more than one player); else the fewest there are. The `several` rule is the
 * lab's first draft (any number from 2 to all but one, else exactly one), kept for its comparison. Returns the indexes to draw from
 * evenly; empty when no talent benefits anyone.
 */
export function teacherCandidates(
  counts: readonly number[],
  players: number,
  rule: 'few' | 'several' = 'few',
): number[] {
  const some = counts.flatMap((c, t) => (c >= 1 ? [t] : []));
  if (some.length === 0) return [];
  const old = rule === 'several';
  const cap = old ? players - 1 : Math.max(2, Math.floor(players * TEACHER_BAND_SHARE));
  const band = some.filter(
    (t) => (counts[t] ?? 0) >= 2 && (counts[t] ?? 0) <= cap && (counts[t] ?? 0) < players,
  );
  if (band.length > 0) return band;
  const one = some.filter((t) => counts[t] === 1 && players > 1);
  if (one.length > 0) return one;
  if (old) return [];
  const fewest = Math.min(...some.map((t) => counts[t] ?? 0));
  return some.filter((t) => counts[t] === fewest);
}

/** One player as the pick sees them: each line they own and their book for it (talent ids). */
export interface TeacherPlayer {
  readonly lines: ReadonlyMap<string, ReadonlySet<string>>;
}

/** For each talent (in the order of `talents`), how many of the players it would benefit. One pass over the players' lines. */
export function benefitCounts(
  talents: readonly string[],
  pools: Readonly<Record<string, readonly string[]>>,
  players: readonly TeacherPlayer[],
): number[] {
  const counts = talents.map(() => 0);
  const indexOf = new Map(talents.map((id, i) => [id, i]));
  for (const player of players) {
    const benefits = new Set<number>();
    for (const [line, book] of player.lines) {
      for (const id of pools[line] ?? []) {
        const i = indexOf.get(id);
        if (i !== undefined && !book.has(id)) benefits.add(i);
      }
    }
    for (const i of benefits) counts[i] = (counts[i] ?? 0) + 1;
  }
  return counts;
}

/**
 * The week's teacher talent (V-SCH-12): drawn evenly from the band rule's candidates with the server's live dice. Never golden (a talent
 * id only). Null when no talent benefits anyone (no teacher that week). `talents` is the library in file order, `pools` each line's seven.
 */
export function pickTeacherTalent(
  rng: Rng,
  talents: readonly string[],
  pools: Readonly<Record<string, readonly string[]>>,
  players: readonly TeacherPlayer[],
): string | null {
  const counts = benefitCounts(talents, pools, players);
  const from = teacherCandidates(counts, players.length);
  if (from.length === 0) return null;
  const pick = from[int(rng, from.length)];
  return pick === undefined ? null : (talents[pick] ?? null);
}
