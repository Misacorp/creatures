/**
 * SAMPLE data of the School's visiting teacher (prototype, dev only): the server's players (you and two
 * made-up friends) with the lines they own and their Talent Books, the teacher's species and home, and the
 * session's two student seats. The rules are `teacher-logic.ts`; the talents and their pools are combat v2's real
 * data. Dev addresses: `&weekday=mon` (the day), `&lesson=seated` (a student is seated), `&lesson=done` (the
 * morning after, the talent is in the book), `&talent=<id>` (a chosen talent, for the "none of yours" view).
 */
import { combatV2 } from '@creatures/game/combat-v2';
import type { Creature } from '../../api';
import type { ProtoWorld } from '../world';
import { sampleName } from './bonfire-sample';
import {
  SEATS,
  bookAfterLesson,
  teacherPhase,
  visitWeek,
  weeksTalent,
  wouldLearn,
  type LessonState,
  type Player,
  type Pools,
} from './teacher-logic';
import { lookParams, weekClock } from './valley-logic';

/** The shipped pools of combat v2 (line id to seven talent ids). */
export const POOLS: Pools = combatV2.pools;

/** SAMPLE: your Talent Book per line (what you have found so far). */
export const MY_BOOK: Readonly<Record<string, readonly string[]>> = {
  splashet: ['first-pounce', 'hardy'],
  cindle: ['steady-rhythm', 'sharp-claws', 'crit-chance'],
  sproutle: ['brace'],
  zipmouse: ['momentum'],
  mistnewt: ['catch-breath'],
  ashmole: ['hardy', 'brace'],
};

/** SAMPLE: two friends on the server, with the lines they own and their books. */
export const FRIENDS: readonly Player[] = [
  {
    id: 'ines',
    lines: ['mossback', 'stormray', 'cindle'],
    book: {
      mossback: ['hardy', 'brace', 'opportunist'],
      stormray: ['quick-draw', 'edge-walker'],
      cindle: ['steady-rhythm', 'sharp-claws', 'rally-cry', 'owners-mark'],
    },
  },
  {
    id: 'jori',
    lines: ['splashet', 'coralynx'],
    book: {
      splashet: ['first-pounce', 'momentum', 'edge-walker', 'quick-draw', 'hardy'],
      coralynx: ['sharp-claws', 'crit-damage'],
    },
  },
];

/** SAMPLE: where teachers come from and the species that carries them (never one the player owns). */
const TEACHERS: readonly { species: string; from: string }[] = [
  { species: 'stormray', from: 'Storm Ridge' },
  { species: 'mossback', from: 'Verdant Hollow' },
  { species: 'coralynx', from: 'Moonlit Reef' },
  { species: 'lanternfin', from: 'Tidepools' },
];

/** The week's teacher: a species not in the player's roster, by the week's number. */
export function teacherOf(
  week: number,
  creatures: readonly Pick<Creature, 'species'>[],
): { species: string; from: string } {
  const owned = new Set(creatures.map((c) => c.species));
  const free = TEACHERS.filter((t) => !owned.has(t.species));
  const list = free.length > 0 ? free : TEACHERS;
  const at = ((week % list.length) + list.length) % list.length;
  return list[at] ?? { species: 'stormray', from: 'Storm Ridge' };
}

/** The seats' state of the session: who sits at the School, and whether the night has passed. */
export interface Seats {
  seated: readonly string[];
  done: boolean;
}

/** What the address asks for: `&lesson=seated`, `&lesson=done`. */
export function lessonParam(hash: string): 'seated' | 'done' | null {
  const found = /[?&]lesson=([a-z]+)(?:&|$)/.exec(hash)?.[1];
  return found === 'seated' || found === 'done' ? found : null;
}

let store: Seats | null = null;

/** The seats now (the address picks the start). The students are chosen by `lessonOf`'s first eligible ones. */
export function getSeats(): Seats | null {
  return store;
}

export function setSeats(next: Seats | null): void {
  store = next;
}

/** Back to the start (tests). */
export function resetSeats(): void {
  store = null;
}

export interface Lesson {
  state: LessonState;
  /** The talent's text and roles, from combat v2's data (null with no teacher). */
  talent: { id: string; name: string; text: string; roles: readonly string[] } | null;
  teacher: { species: string; from: string };
  /** Your creatures that would learn, with the names they show. */
  eligible: { creature: Creature; name: string }[];
  /** Your creatures seated at the School, with their names (they have left their posts). */
  seated: { creature: Creature; name: string }[];
  /** The book after the night when it has passed: the line that gained the talent is in it. */
  done: boolean;
  /** The creature that learned it overnight (the morning after), else null. */
  learnerId: string | null;
}

/** The ISO weekday the School shows: the address's `&weekday=`, else the lesson's own day, else the world's clock. */
export function teacherWeekday(world: ProtoWorld, hash: string): number {
  const asked = lookParams(hash).weekday;
  if (asked !== undefined) return asked;
  if (lessonParam(hash) === 'done') return 2;
  return weekClock(world.now, world.timezone).weekday;
}

/**
 * Everything the School and the Places list show about the teacher, from the world, the address and the seats.
 * `seats` is the session's (null before anyone is sent: the address may start it seated or done).
 */
export function lessonOf(world: ProtoWorld, hash: string, seats: Seats | null): Lesson {
  const weekday = teacherWeekday(world, hash);
  const phase = teacherPhase(weekday);
  const week = visitWeek(world.now, weekday);
  const names = (list: readonly Creature[]) =>
    list.map((c) => ({ creature: c, name: sampleName(c, world.creatures.indexOf(c)) }));
  const mine: Player = {
    id: 'me',
    lines: [...new Set(world.creatures.map((c) => c.line))],
    book: MY_BOOK,
  };
  const asked = /[?&]talent=([a-z-]+)(?:&|$)/.exec(hash)?.[1];
  const picked = weeksTalent([mine, ...FRIENDS], POOLS, week);
  const id = asked !== undefined && combatV2.talents[asked] !== undefined ? asked : picked;
  const def = id === null ? undefined : combatV2.talents[id];
  const teacher = teacherOf(week, world.creatures);
  const empty = {
    state: {
      phase,
      talent: null,
      seatedNames: [],
      eligible: 0,
      seatFree: true,
      learnedBy: null,
      from: teacher.from,
    },
    talent: null,
    teacher,
    eligible: [],
    seated: [],
    done: false,
    learnerId: null,
  } satisfies Lesson;
  if (id === null || def === undefined) return empty;

  // The address may start the lesson seated or done: the first creature that would learn sits down.
  const first = wouldLearn(world.creatures, MY_BOOK, id, POOLS, [])[0];
  const start = lessonParam(hash);
  const now: Seats =
    seats ??
    (start !== null && first !== undefined
      ? { seated: [first.id], done: start === 'done' }
      : { seated: [], done: false });
  const book = now.done
    ? bookAfterLesson(world.creatures, MY_BOOK, id, POOLS, now.seated)
    : MY_BOOK;
  const seatedCreatures = now.done
    ? []
    : world.creatures.filter((c) => now.seated.includes(c.id)).slice(0, SEATS);
  const eligible = now.done
    ? []
    : wouldLearn(
        world.creatures,
        book,
        id,
        POOLS,
        seatedCreatures.map((c) => c.id),
      );
  const gainer = now.done ? world.creatures.find((c) => now.seated.includes(c.id)) : undefined;
  const state: LessonState = {
    phase,
    talent: { id, name: def.name },
    seatedNames: names(seatedCreatures).map((s) => s.name),
    eligible: eligible.length,
    seatFree: seatedCreatures.length < SEATS,
    learnedBy: gainer === undefined ? null : sampleName(gainer, world.creatures.indexOf(gainer)),
    from: teacher.from,
  };
  return {
    state,
    talent: { id, name: def.name, text: def.text, roles: def.roles },
    teacher,
    eligible: names(eligible),
    seated: names(seatedCreatures),
    done: now.done,
    learnerId: gainer?.id ?? null,
  };
}
