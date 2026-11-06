import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_WEIGHT,
  VALLEY_RULES,
  addDaysToKey,
  benefitCounts,
  composePaper,
  createSeededRng,
  emptyLog,
  learningPrice,
  lessonTakes,
  pickTeacherTalent,
  teacherCandidates,
  teacherPhase,
  teacherWeekOf,
  visitorWeekOf,
  wouldBenefit,
} from '../src';

const HOUR = 3_600_000;
// Monday 2027-01-04 00:00 UTC.
const MONDAY = Date.UTC(2027, 0, 4);

describe('the teacher: his days (V-SCH-11)', () => {
  it('is here Monday to Wednesday, away on Thursday, announced from Friday', () => {
    const rules = VALLEY_RULES;
    expect(rules.school.teacherStayDays).toBe(3);
    expect(rules.school.teacherAnnounceDays).toBe(3);
    expect(teacherPhase(rules, 0)).toBe('here');
    expect(teacherPhase(rules, 71.9)).toBe('here');
    expect(teacherPhase(rules, 72)).toBe('away');
    expect(teacherPhase(rules, 95.9)).toBe('away');
    expect(teacherPhase(rules, 96)).toBe('announced');
    expect(teacherPhase(rules, 167.9)).toBe('announced');
    // The week repeats.
    expect(teacherPhase(rules, 168)).toBe('here');
  });

  it("names the Monday of the stay: this week's while here, next week's once announced, none between", () => {
    const at = (h: number) => teacherWeekOf(VALLEY_RULES, visitorWeekOf(MONDAY + h * HOUR, 'UTC'));
    expect(at(10)).toEqual({ phase: 'here', key: '2027-01-04' });
    expect(at(80)).toEqual({ phase: 'away', key: null });
    expect(at(100)).toEqual({ phase: 'announced', key: '2027-01-11' });
  });

  it('adds days to a date key across a month and a year', () => {
    expect(addDaysToKey('2027-01-25', 7)).toBe('2027-02-01');
    expect(addDaysToKey('2026-12-28', 7)).toBe('2027-01-04');
  });
});

describe('the band rule (V-SCH-12)', () => {
  it('prefers a few players, from 2 up to a quarter of the server (at least 2), never everyone', () => {
    // 16 players: a quarter is 4. Talents benefit 1, 3, 4, 5 and 16 players.
    expect(teacherCandidates([1, 3, 4, 5, 16], 16)).toEqual([1, 2]);
    // 6 players: a quarter is 1.5, so the cap is 2.
    expect(teacherCandidates([1, 2, 3, 6], 6)).toEqual([1]);
    // Never everyone: with 2 players a talent for both is no candidate; one for exactly one is.
    expect(teacherCandidates([2, 1], 2)).toEqual([1]);
  });

  it('falls back to exactly one player, then to the fewest there are', () => {
    expect(teacherCandidates([1, 5, 16], 16)).toEqual([0]);
    // Nobody to prefer: every talent benefits more than the band allows.
    expect(teacherCandidates([5, 6, 9], 16)).toEqual([0]);
    // A server of one player: one benefit is "everyone", so the fewest rule takes it.
    expect(teacherCandidates([1, 1], 1)).toEqual([0, 1]);
  });

  it('has no candidate when no talent benefits anyone; the first draft keeps its own cap', () => {
    expect(teacherCandidates([0, 0], 5)).toEqual([]);
    // The first draft: any number from 2 to all but one.
    expect(teacherCandidates([1, 3, 7], 8, 'several')).toEqual([1, 2]);
    expect(teacherCandidates([1, 3, 7], 8, 'few')).toEqual([0]);
    expect(teacherCandidates([8], 8, 'several')).toEqual([]);
  });

  it('counts who a talent would benefit: an owned line whose pool has it and whose book lacks it', () => {
    const pools = { a: ['x', 'y'], b: ['y', 'z'] };
    const talents = ['x', 'y', 'z'];
    const players = [
      { lines: new Map([['a', new Set<string>()]]) },
      {
        lines: new Map([
          ['a', new Set(['x'])],
          ['b', new Set<string>()],
        ]),
      },
      { lines: new Map([['b', new Set(['y', 'z'])]]) },
    ];
    expect(benefitCounts(talents, pools, players)).toEqual([1, 2, 1]);
    expect(wouldBenefit([{ pool: pools.a, book: new Set(['x']) }], 'x')).toBe(false);
    expect(wouldBenefit([{ pool: pools.a, book: new Set(['x']) }], 'y')).toBe(true);
    expect(wouldBenefit([{ pool: pools.a, book: new Set<string>() }], 'z')).toBe(false);
    expect(lessonTakes(pools.a, new Set(['x']), 'x')).toBe(false);
    expect(lessonTakes(pools.a, new Set(['x']), 'y')).toBe(true);
    expect(lessonTakes(pools.a, new Set<string>(), 'z')).toBe(false);
  });

  it('draws evenly from the candidates with the injected dice, and null when none benefit', () => {
    const pools = { a: ['x', 'y', 'z'] };
    const talents = ['x', 'y', 'z'];
    const players = [{ lines: new Map([['a', new Set<string>()]]) }];
    const seen = new Set<string | null>();
    for (let i = 0; i < 60; i++) {
      seen.add(pickTeacherTalent(createSeededRng(`pick-${String(i)}`), talents, pools, players));
    }
    expect([...seen].sort()).toEqual(['x', 'y', 'z']);
    const full = [{ lines: new Map([['a', new Set(talents)]]) }];
    expect(pickTeacherTalent(createSeededRng('none'), talents, pools, full)).toBeNull();
    expect(pickTeacherTalent(createSeededRng('empty'), talents, pools, [])).toBeNull();
  });
});

describe('learning on a card (V-SCH-10)', () => {
  it('costs the price times the slot, at least once the price', () => {
    const price = VALLEY_RULES.school.price;
    expect(learningPrice(VALLEY_RULES, 1)).toBe(price);
    expect(learningPrice(VALLEY_RULES, 2)).toBe(price * 2);
    expect(learningPrice(VALLEY_RULES, 3)).toBe(price * 3);
    expect(learningPrice(VALLEY_RULES, 0)).toBe(price);
  });
});

describe("the School's news in the paper", () => {
  it('a lesson and the announcement are creature stories; the best creature story is the one told', () => {
    const log = { ...emptyLog(), teacher: 'flank-guard' };
    expect(composePaper(log).headlines.map((h) => h.kind)).toEqual(['teacher']);
    const lesson = {
      ...emptyLog(),
      lessons: [{ creatureId: 'c1', talentId: 'flank-guard' }],
      lessonCount: 1,
    };
    const paper = composePaper(lesson).headlines;
    expect(paper).toHaveLength(1);
    expect(paper[0]).toMatchObject({
      kind: 'lesson',
      weight: HIGHLIGHT_WEIGHT.lesson,
      creatureIds: ['c1'],
      talent: 'flank-guard',
    });
    // The announcement outranks the lesson, and both rank with the creature stories (a newcomer beats them).
    expect(HIGHLIGHT_WEIGHT.teacher).toBeGreaterThan(HIGHLIGHT_WEIGHT.lesson);
    expect(HIGHLIGHT_WEIGHT.newLine).toBeGreaterThan(HIGHLIGHT_WEIGHT.teacher);
  });
});
