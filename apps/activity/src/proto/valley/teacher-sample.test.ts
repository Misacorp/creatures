import { describe, expect, it } from 'vitest';
import { initialWorld } from '../world';
import { teacherNote } from './teacher-logic';
import { lessonOf, teacherOf, teacherWeekday } from './teacher-sample';

const world = initialWorld();

describe('the sample lesson', () => {
  it('shows the announcement on the sample Saturday: a talent that one of yours can learn', () => {
    expect(teacherWeekday(world, '')).toBe(6);
    const lesson = lessonOf(world, '', null);
    expect(lesson.state.phase).toBe('coming');
    expect(lesson.talent).not.toBeNull();
    expect(lesson.eligible.length).toBeGreaterThan(0);
    expect(teacherNote(lesson.state).action).toBe('Send to the teacher');
  });

  it('has the teacher at the School on Monday to Wednesday and gone after', () => {
    expect(lessonOf(world, '?weekday=mon', null).state.phase).toBe('here');
    expect(lessonOf(world, '?weekday=wed', null).state.phase).toBe('here');
    expect(lessonOf(world, '?weekday=thu', null).state.phase).toBe('gone');
    expect(teacherNote(lessonOf(world, '?weekday=fri', null).state).short).toBe(
      'next teacher Monday',
    );
  });

  it('names no teacher species that the player owns', () => {
    const owned = new Set(world.creatures.map((c) => c.species));
    for (let week = 0; week < 10; week += 1) {
      expect(owned.has(teacherOf(week, world.creatures).species)).toBe(false);
    }
  });

  it('says none of yours can learn it for a talent no line of yours holds', () => {
    const lesson = lessonOf(world, '?weekday=mon&talent=slow-burn', null);
    expect(lesson.eligible).toEqual([]);
    expect(teacherNote(lesson.state).action).toBeNull();
    expect(teacherNote(lesson.state).line).toContain('none of yours can learn it');
  });

  it('seats a student (before the arrival too) and then it is no longer offered', () => {
    const first = lessonOf(world, '', null).eligible[0];
    expect(first).toBeDefined();
    const seated = lessonOf(world, '', { seated: [first?.creature.id ?? ''], done: false });
    expect(seated.seated.map((s) => s.creature.id)).toEqual([first?.creature.id]);
    expect(seated.eligible.map((s) => s.creature.id)).not.toContain(first?.creature.id);
    expect(teacherNote(seated.state).line).toContain('learns');
    expect(teacherNote(seated.state).line).toContain('by morning');
  });

  it('shows the talent in the book the next morning, with the student back at its post', () => {
    const done = lessonOf(world, '?lesson=done', null);
    expect(done.state.phase).toBe('here');
    expect(done.done).toBe(true);
    expect(done.seated).toEqual([]);
    expect(done.state.learnedBy).not.toBeNull();
    expect(world.creatures.map((c) => c.id)).toContain(done.learnerId);
    expect(lessonOf(world, '?lesson=seated', null).learnerId).toBeNull();
    expect(teacherNote(done.state).line).toMatch(/ is in .*'s book$/);
  });

  it("takes the address's seated start", () => {
    const lesson = lessonOf(world, '?lesson=seated', null);
    expect(lesson.seated).toHaveLength(1);
  });
});
