import { describe, expect, it } from 'vitest';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import { sampleSchool, STAY_FROM, STAY_NOON, STAY_UNTIL, withTrials } from './school-sample';
import { sampleValley } from './signpost-sample';
import {
  NONE_OF_YOURS,
  NOTHING_TO_TEACH_LINE,
  NO_TEACHER_LINE,
  ceremonyWhen,
  freeSeat,
  graduationLines,
  learners,
  readyLine,
  schoolLine,
  stayDays,
  studentIds,
  teacherLine,
  teaching,
  withoutStudents,
} from './school-view';

const creatures = homeInput('busy', true).creatures;
const [a, b, c] = creatures;
if (a === undefined || b === undefined || c === undefined) throw new Error('sample creatures');

describe('the stay in the reader’s own time', () => {
  it('is Monday to Wednesday for a reader on the guild’s clock', () => {
    expect(stayDays(sampleSchool(), 'Europe/Helsinki')).toBe('Monday to Wednesday');
  });

  it('is the days a far-away clock gives (Sunday to Wednesday ten hours west)', () => {
    expect(stayDays(sampleSchool(), 'Pacific/Honolulu')).toBe('Sunday to Wednesday');
  });

  it('is nothing while away, and an unknown zone falls back to UTC', () => {
    expect(stayDays(sampleSchool({ phase: 'away' }), 'Europe/Helsinki')).toBeNull();
    expect(stayDays(sampleSchool(), 'Not/AZone')).toBe('Sunday to Wednesday');
  });

  it('names the leaving day by its last moment, not by Thursday 00:00', () => {
    const view = { ...sampleSchool(), leavesAt: STAY_UNTIL };
    expect(stayDays(view, 'Europe/Helsinki')).not.toContain('Thursday');
  });
});

describe('where the teacher stands', () => {
  it('says here, coming and none, with the days and no timer', () => {
    expect(teacherLine(sampleSchool({ phase: 'here' }), 'Europe/Helsinki')).toBe(
      'The visiting teacher is here Monday to Wednesday.',
    );
    expect(teacherLine(sampleSchool({ phase: 'announced' }), 'Europe/Helsinki')).toBe(
      'A visiting teacher comes Monday to Wednesday.',
    );
    expect(teacherLine(sampleSchool({ phase: 'away' }), 'Europe/Helsinki')).toBe(NO_TEACHER_LINE);
    for (const phase of ['here', 'announced', 'away'] as const) {
      expect(teacherLine(sampleSchool({ phase }), 'Europe/Helsinki')).not.toMatch(
        /\d|until|in \w+ hours?|left/,
      );
    }
  });

  it('says when a week has no lesson at all (nothing on the server needs one)', () => {
    expect(teacherLine(sampleSchool({ talent: false }), 'Europe/Helsinki')).toBe(
      NOTHING_TO_TEACH_LINE,
    );
    expect(teaching(sampleSchool({ talent: false }))).toBe(false);
  });

  it('teaches while announced or here with a talent, never while away or before the server has said', () => {
    expect(teaching(sampleSchool({ phase: 'here' }))).toBe(true);
    expect(teaching(sampleSchool({ phase: 'announced' }))).toBe(true);
    expect(teaching(sampleSchool({ phase: 'away' }))).toBe(false);
    expect(teaching(null)).toBe(false);
  });
});

describe('the faces that would learn', () => {
  it('lists the seated students first, then the rest in the server’s order, each once', () => {
    const view = sampleSchool({ seated: [b.id, null], wouldLearn: [a.id, b.id, c.id] });
    expect(learners(view, creatures).map((l) => [l.creature.id, l.seat])).toEqual([
      [b.id, 0],
      [a.id, null],
      [c.id, null],
    ]);
  });

  it('skips an id the client does not hold, and is empty when none would learn', () => {
    expect(learners(sampleSchool({ wouldLearn: ['gone', a.id] }), creatures)).toHaveLength(1);
    expect(learners(sampleSchool({ wouldLearn: [] }), creatures)).toEqual([]);
    expect(NONE_OF_YOURS).toBe('None of yours this time.');
  });

  it('finds the first free seat, and none when both are taken', () => {
    expect(freeSeat(sampleSchool({ seated: [a.id, null] }))?.index).toBe(1);
    expect(freeSeat(sampleSchool({ seated: [a.id, b.id] }))).toBeUndefined();
  });

  it('knows who sits at the School', () => {
    expect([...studentIds(sampleSchool({ seated: [a.id, b.id] }))].sort()).toEqual(
      [a.id, b.id].sort(),
    );
    expect(studentIds(null).size).toBe(0);
  });
});

describe('a student at the School is not resting', () => {
  const visit = sampleValley(creatures, []);

  it('leaves the students out of the valley’s lists, and is the same object when nobody sits there', () => {
    const rested = visit.creatures.filter((r) => r.state === 'resting').map((r) => r.id);
    expect(rested).toContain(a.id);
    const without = withoutStudents(visit, new Set([a.id]));
    expect(without.creatures.some((r) => r.id === a.id)).toBe(false);
    expect(without.creatures).toHaveLength(visit.creatures.length - 1);
    expect(withoutStudents(visit, new Set())).toBe(visit);
    expect(withoutStudents(visit, new Set(['someone-else']))).toBe(visit);
  });
});

describe('the graduation', () => {
  it('says how many are ready, and none when none are', () => {
    expect(readyLine(2)).toBe('2 ready to graduate');
    expect(readyLine(0)).toBeNull();
  });

  it('tells the next ceremony without counting down: this evening, tomorrow evening, or a day', () => {
    const zone = 'Europe/Helsinki';
    // Monday noon Helsinki; the ceremony is 17:00 Helsinki (15:00 UTC).
    const today17 = Date.UTC(2026, 10, 9, 15);
    expect(ceremonyWhen(today17, STAY_NOON, zone)).toBe('this evening');
    expect(ceremonyWhen(today17 + 24 * 3_600_000, STAY_NOON, zone)).toBe('tomorrow evening');
    expect(ceremonyWhen(today17 + 3 * 24 * 3_600_000, STAY_NOON, zone)).toBe('Thursday evening');
    // A reader whose day of it ends before 17:00 hears "today".
    expect(ceremonyWhen(today17, STAY_NOON, 'Asia/Tokyo')).not.toMatch(/evening/);
  });

  it('is two lines on the School page: the count and the ceremony', () => {
    expect(
      graduationLines({ ready: 2, nextAt: Date.UTC(2026, 10, 9, 15) }, STAY_NOON, 'Europe/Helsinki'),
    ).toEqual(['2 ready to graduate', 'The next ceremony is this evening.']);
    expect(
      graduationLines({ ready: 0, nextAt: Date.UTC(2026, 10, 9, 15) }, STAY_NOON, 'Europe/Helsinki')[0],
    ).toBe('Nobody is ready to graduate yet.');
    expect(graduationLines(undefined, STAY_NOON, 'Europe/Helsinki')).toEqual([]);
  });
});

describe('the Places list and the map', () => {
  it('says the ceremony first, then where the teacher stands, and nothing before the server has said', () => {
    expect(schoolLine(sampleSchool(), { ready: 2 })).toBe('2 ready to graduate · a teacher is here');
    expect(schoolLine(sampleSchool({ phase: 'announced' }), undefined)).toBe('a teacher is coming');
    expect(schoolLine(sampleSchool({ phase: 'away' }), { ready: 0 })).toBe('no teacher now');
    expect(schoolLine(null, undefined)).toBeNull();
    expect(schoolLine(null, { ready: 1 })).toBe('1 ready to graduate');
  });

  it('is carried by the valley with trials: the ceremony’s count reads from `graduation`', () => {
    const visit = withTrials(sampleValley(creatures, []), {}, { ready: 3, nextAt: HOME_NOW });
    expect(schoolLine(null, visit.graduation)).toBe('3 ready to graduate');
  });

  it('the stay starts when the server says it does', () => {
    expect(sampleSchool().arrivesAt).toBe(STAY_FROM);
  });
});
