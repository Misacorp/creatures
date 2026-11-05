import { describe, expect, it } from 'vitest';
import { sampleRoster } from '../../creature-card-sample';
import {
  BRONZE_BOXES,
  canTry,
  ceremonyParam,
  ceremonyPhase,
  honourTitle,
  isComplete,
  pupilState,
  readyCount,
  schoolNote,
  tickedCount,
  type Trial,
} from './school-logic';
import type { TeacherNote } from './teacher-logic';
import { MAX_PUPILS, pupilsOf } from './school-sample';

const all = BRONZE_BOXES.map((b) => b.id);
const full: Trial = { creatureId: 'a', ticked: all };
const part: Trial = { creatureId: 'b', ticked: ['dungeon', 'post'] };

describe('Bronze trial (V-TRIAL-2)', () => {
  it('has the four boxes of the spec and opens at level 10', () => {
    expect(all).toEqual(['dungeon', 'post', 'find', 'fire']);
    expect(canTry(9)).toBe(false);
    expect(canTry(10)).toBe(true);
  });

  it('counts the ticked boxes and is complete only with all four', () => {
    expect(tickedCount(part)).toBe(2);
    expect(isComplete(part)).toBe(false);
    expect(isComplete(full)).toBe(true);
    expect(readyCount([full, part, full])).toBe(2);
  });
});

describe('the ceremony (V-TRIAL-4)', () => {
  it('is before, live for half an hour from nine, then after', () => {
    expect(ceremonyPhase({ hour: 8, minute: 59 })).toBe('before');
    expect(ceremonyPhase({ hour: 9, minute: 0 })).toBe('live');
    expect(ceremonyPhase({ hour: 9, minute: 29 })).toBe('live');
    expect(ceremonyPhase({ hour: 9, minute: 30 })).toBe('after');
    expect(ceremonyPhase({ hour: 10, minute: 0 })).toBe('after');
  });

  it('lets the address override it, and ignores unknown words', () => {
    expect(ceremonyPhase({ hour: 10, minute: 0 }, 'live')).toBe('live');
    expect(ceremonyParam('#valley?bare=1&ceremony=before')).toBe('before');
    expect(ceremonyParam('#valley?ceremony=nonsense')).toBeNull();
    expect(ceremonyParam('#valley')).toBeNull();
  });

  it('graduates a complete trial whether or not the player was there', () => {
    expect(pupilState(part, 'after')).toBe('working');
    expect(pupilState(full, 'before')).toBe('ready');
    expect(pupilState(full, 'live')).toBe('pinning');
    expect(pupilState(full, 'after')).toBe('graduated');
  });

  it('titles a graduate "Pip, Bronze"', () => {
    expect(honourTitle('Pip')).toBe('Pip, Bronze');
    expect(honourTitle('Pip', 'gold')).toBe('Pip, Gold');
  });
});

describe('what the School says (schoolNote)', () => {
  it('offers the graduation at the ceremony and a calm line otherwise', () => {
    expect(schoolNote('live', 2, 4)).toEqual({
      line: '2 graduating now',
      action: 'See the graduation',
    });
    expect(schoolNote('before', 2, 4)).toEqual({ line: '2 ready to graduate today', action: null });
    expect(schoolNote('after', 2, 4)).toEqual({ line: '2 graduated this morning', action: null });
    expect(schoolNote('after', 0, 3)).toEqual({ line: '3 on a Bronze trial', action: null });
  });

  it('has no button of its own without the teacher', () => {
    expect(schoolNote('after', 0, 0)).toEqual({ line: 'no one on a trial yet', action: null });
    expect(schoolNote('live', 0, 2).action).toBeNull();
  });

  const here: TeacherNote = {
    line: 'A teacher from Storm Ridge brings Rally Cry',
    short: 'teacher Monday to Wednesday: Rally Cry',
    action: 'Send to the teacher',
    news: true,
  };
  const gone: TeacherNote = {
    line: 'Next teacher Monday',
    short: 'next teacher Monday',
    action: null,
    news: false,
  };

  it('lets the teacher take the button and the line while it is news, the ceremony while it is live', () => {
    expect(schoolNote('after', 2, 4, here)).toEqual({
      line: 'teacher Monday to Wednesday: Rally Cry',
      action: 'Send to the teacher',
    });
    expect(schoolNote('live', 2, 4, here).action).toBe('See the graduation');
  });

  it('brings the graduation back and then names the next teacher once the teacher is gone', () => {
    expect(schoolNote('after', 2, 4, gone).line).toBe('2 graduated this morning');
    expect(schoolNote('after', 0, 4, gone)).toEqual({ line: 'next teacher Monday', action: null });
  });
});

describe('the sample pupils', () => {
  it('are the highest creatures that may try Bronze, at most four, two of them complete', () => {
    const pupils = pupilsOf(sampleRoster(12));
    expect(pupils.length).toBeLessThanOrEqual(MAX_PUPILS);
    expect(pupils.every((p) => canTry(p.creature.level))).toBe(true);
    const levels = pupils.map((p) => p.creature.level);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    expect(readyCount(pupils.map((p) => p.trial))).toBe(2);
  });
});
