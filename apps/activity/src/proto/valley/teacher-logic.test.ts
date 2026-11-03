import { describe, expect, it } from 'vitest';
import {
  SEATS,
  bookAfterLesson,
  benefits,
  lineCanLearn,
  teacherNote,
  teacherPhase,
  visitWeek,
  weekNumber,
  weeksTalent,
  wouldLearn,
  type LessonState,
  type Player,
  type Pools,
} from './teacher-logic';

const pools: Pools = {
  a: ['t1', 't2', 't3'],
  b: ['t2', 't3', 't4'],
  c: ['t3', 't5'],
};
const player = (id: string, lines: string[], book: Record<string, string[]> = {}): Player => ({
  id,
  lines,
  book,
});

describe('the teacher week (V-SCH-11)', () => {
  it('is announced over the weekend, here Monday to Wednesday, gone Thursday and Friday', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(teacherPhase)).toEqual([
      'here',
      'here',
      'here',
      'gone',
      'gone',
      'coming',
      'coming',
    ]);
  });

  it('gives a weekend the number of the Monday that follows, and every day of a week the same', () => {
    const monday = Date.UTC(2027, 1, 15, 8); // Monday 15 February 2027
    const day = 86_400_000;
    expect(weekNumber(monday + 2 * day)).toBe(weekNumber(monday));
    expect(weekNumber(monday + 6 * day)).toBe(weekNumber(monday));
    expect(weekNumber(monday + 7 * day)).toBe(weekNumber(monday) + 1);
    expect(visitWeek(monday - 2 * day, 6)).toBe(weekNumber(monday));
    expect(visitWeek(monday + day, 2)).toBe(weekNumber(monday));
  });
});

describe('who a talent benefits (V-SCH-12)', () => {
  it('needs a line whose pool has it and whose book lacks it', () => {
    expect(lineCanLearn('a', 't1', {}, pools)).toBe(true);
    expect(lineCanLearn('a', 't1', { a: ['t1'] }, pools)).toBe(false);
    expect(lineCanLearn('a', 't4', {}, pools)).toBe(false);
    expect(benefits(player('p', ['a', 'b'], { a: ['t2'] }), 't2', pools)).toBe(true); // b still lacks it
    expect(benefits(player('p', ['a'], { a: ['t2'] }), 't2', pools)).toBe(false);
  });
});

describe("the week's talent (V-SCH-12)", () => {
  it('is never picked when nobody benefits from anything: no teacher that week', () => {
    const full = player('p', ['a'], { a: ['t1', 't2', 't3'] });
    expect(weeksTalent([full], pools, 1)).toBeNull();
    expect(weeksTalent([], pools, 1)).toBeNull();
  });

  it('prefers a talent that benefits more than one player but not everyone', () => {
    // t1: only p1. t3: p1 and p2 (both own a line with it), p3 owns only c, which has t3 too: everyone.
    // t2: p1 (a) and p2 (b), not p3: two of three.
    const players = [player('p1', ['a']), player('p2', ['b']), player('p3', ['c'])];
    for (let week = 0; week < 40; week += 1) {
      expect(weeksTalent(players, pools, week)).toBe('t2');
    }
  });

  it('prefers a few players (2 up to a quarter of the server, at least 2) over many', () => {
    // Eight players: line c has t5 only for c (benefits 2 players) while t3 is in every pool (benefits all but those who hold it).
    const players = [
      ...['p1', 'p2'].map((id) => player(id, ['c'])),
      ...['p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((id) => player(id, ['a', 'b'])),
    ];
    // t5: 2 players (the band); t1: 6 (a); t4: 6 (b); t3: 8 (everyone); t2: 6. Only t5 is in the band.
    for (let week = 0; week < 30; week += 1) {
      expect(weeksTalent(players, pools, week)).toBe('t5');
    }
  });

  it('takes a talent for one player over one for everyone', () => {
    // Both own line a only: t1, t2, t3 all benefit both (everyone); with p2 holding t1, t1 benefits one.
    const players = [player('p1', ['a']), player('p2', ['a'], { a: ['t1'] })];
    for (let week = 0; week < 20; week += 1) {
      expect(weeksTalent(players, pools, week)).toBe('t1');
    }
  });

  it('picks the fewest benefiting when everyone benefits from every candidate', () => {
    const players = [player('p1', ['a']), player('p2', ['a'])];
    const picks = new Set(
      Array.from({ length: 60 }, (_, week) => weeksTalent(players, pools, week)),
    );
    expect([...picks].every((t) => t === 't1' || t === 't2' || t === 't3')).toBe(true);
    // A lone player benefits from everything of their lines too: there is still a teacher.
    expect(weeksTalent([player('solo', ['a'])], pools, 3)).not.toBeNull();
  });

  it('is the same for the same week and players, and varies over the weeks', () => {
    const players = [player('p1', ['a', 'c']), player('p2', ['b']), player('p3', ['b', 'c'])];
    const run = (week: number) => weeksTalent(players, pools, week);
    expect(run(7)).toBe(run(7));
    const seen = new Set(Array.from({ length: 60 }, (_, week) => run(week)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('only ever picks a talent that benefits someone', () => {
    const players = [
      player('p1', ['a', 'b'], { a: ['t1', 't2'], b: ['t2'] }),
      player('p2', ['c'], { c: ['t3'] }),
    ];
    for (let week = 0; week < 50; week += 1) {
      const id = weeksTalent(players, pools, week);
      expect(id).not.toBeNull();
      expect(players.some((p) => benefits(p, id as string, pools))).toBe(true);
    }
  });
});

describe('a lesson (V-SCH-13)', () => {
  const creatures = [
    { id: 'c1', line: 'a' },
    { id: 'c2', line: 'a' },
    { id: 'c3', line: 'b' },
    { id: 'c4', line: 'c' },
  ];

  it('lists the creatures whose line can take the talent and whose book lacks it', () => {
    const ids = (book: Record<string, string[]>) =>
      wouldLearn(creatures, book, 't2', pools, []).map((c) => c.id);
    expect(ids({})).toEqual(['c1', 'c2', 'c3']);
    expect(ids({ a: ['t2'] })).toEqual(['c3']);
    expect(wouldLearn(creatures, {}, 't5', pools, []).map((c) => c.id)).toEqual(['c4']);
    expect(wouldLearn(creatures, {}, 't4', pools, []).map((c) => c.id)).toEqual(['c3']);
    expect(wouldLearn(creatures, { b: ['t4'] }, 't4', pools, [])).toEqual([]);
  });

  it('drops the others of a line once one of it is seated, and the seated one itself', () => {
    expect(wouldLearn(creatures, {}, 't2', pools, ['c1']).map((c) => c.id)).toEqual(['c3']);
  });

  it('adds the talent to the line of each seated student the next morning, once per line', () => {
    const book = bookAfterLesson(creatures, { a: ['t1'] }, 't2', pools, ['c1', 'c2', 'c3']);
    expect(book).toEqual({ a: ['t1', 't2'], b: ['t2'] });
    // A student whose line cannot take it learns nothing.
    expect(bookAfterLesson(creatures, {}, 't4', pools, ['c1'])).toEqual({});
  });

  it('has two student seats', () => {
    expect(SEATS).toBe(2);
  });
});

describe('what the School says about the teacher', () => {
  const base: LessonState = {
    phase: 'here',
    talent: { id: 'rally-cry', name: 'Rally Cry' },
    seatedNames: [],
    eligible: 2,
    seatFree: true,
    learnedBy: null,
    from: 'Storm Ridge',
  };

  it('announces the teacher with the talent, the days and a button over the weekend', () => {
    expect(teacherNote({ ...base, phase: 'coming' })).toEqual({
      line: 'A teacher from Storm Ridge brings Rally Cry, Monday to Wednesday',
      short: 'teacher Monday: Rally Cry',
      action: 'Send to the teacher',
      news: true,
    });
  });

  it('says the days in the Places list while the teacher is here', () => {
    expect(teacherNote(base).short).toBe('teacher Monday to Wednesday: Rally Cry');
    expect(teacherNote(base).action).toBe('Send to the teacher');
  });

  it('has no button when nothing of yours can learn it, or both seats are taken', () => {
    expect(teacherNote({ ...base, eligible: 0 })).toMatchObject({
      line: 'Rally Cry this week: none of yours can learn it',
      action: null,
    });
    expect(
      teacherNote({ ...base, seatedNames: ['Moss', 'Pip'], seatFree: false }).action,
    ).toBeNull();
  });

  it('says who learns by morning, and the next day that the talent is in the book', () => {
    expect(teacherNote({ ...base, seatedNames: ['Moss'] }).line).toBe(
      'Moss learns Rally Cry by morning',
    );
    expect(teacherNote({ ...base, learnedBy: 'Moss' }).line).toBe("Rally Cry is in Moss's book");
  });

  it('says the next visit once the teacher is gone, and when there is none this week', () => {
    expect(teacherNote({ ...base, phase: 'gone' })).toMatchObject({
      short: 'next teacher Monday',
      news: false,
    });
    expect(teacherNote({ ...base, talent: null }).news).toBe(false);
  });
});
