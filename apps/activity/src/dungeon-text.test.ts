import { describe, expect, it } from 'vitest';
import errors from './fixtures/dungeon-errors.json';
import runCleared from './fixtures/dungeon-run-cleared.json';
import runLost from './fixtures/dungeon-run-lost.json';
import todayFixture from './fixtures/dungeon-today.json';
import todayDone from './fixtures/dungeon-today-done.json';
import todayNeed from './fixtures/dungeon-today-need-creatures.json';
import todayRetry from './fixtures/dungeon-today-retry.json';
import { ApiError } from './api';
import {
  DUNGEON_ERROR_TEXT,
  blockedText,
  depthChangeText,
  dungeonErrorText,
  isRetryOffer,
  isStaleDungeonError,
  resultHeadline,
  roomCardTitle,
  roomLine,
  streakLine,
  streakPips,
} from './dungeon-text';
import { DUNGEON_ERRORS, type DungeonRunResponse, type DungeonToday } from './dungeon-types';

const GENERIC = /^Something went wrong/;

describe('the dungeon error texts', () => {
  it('has a plain message for every error code the types list', () => {
    for (const code of Object.keys(DUNGEON_ERRORS)) {
      const text = dungeonErrorText(
        new ApiError(DUNGEON_ERRORS[code as keyof typeof DUNGEON_ERRORS], code),
      );
      expect(text, code).not.toMatch(GENERIC);
      expect(text.length, code).toBeGreaterThan(10);
    }
  });

  it('has a message for every real error body in the server fixtures', () => {
    expect(errors.length).toBeGreaterThan(5);
    for (const { route, status, body } of errors) {
      const text = dungeonErrorText(new ApiError(status, body.error));
      expect(text, `${route} ${body.error}`).not.toMatch(GENERIC);
    }
    expect(new Set(errors.map((e) => e.body.error))).toEqual(
      new Set(Object.keys(DUNGEON_ERROR_TEXT)),
    );
  });

  it('keeps the dungeon meaning of not_found and says what to do about the others', () => {
    expect(dungeonErrorText(new ApiError(404, 'not_found'))).toContain('creatures');
    expect(dungeonErrorText(new ApiError(409, 'already_run'))).toContain('already used');
    expect(dungeonErrorText(new ApiError(400, 'duplicate_creature'))).toContain('three different');
    // The formation is gone with the zones: there is no code for it any more.
    expect(Object.keys(DUNGEON_ERROR_TEXT)).not.toContain('invalid_formation');
  });

  it('falls back to the game text for other failures', () => {
    expect(dungeonErrorText(new ApiError(429, 'rate_limited'))).toContain('Too many');
    expect(dungeonErrorText(new Error('offline'))).toContain('Could not reach');
  });

  it('knows which refusals mean the screen was out of date', () => {
    expect(isStaleDungeonError(new ApiError(409, 'already_run'))).toBe(true);
    expect(isStaleDungeonError(new ApiError(404, 'not_found'))).toBe(true);
    expect(isStaleDungeonError(new ApiError(400, 'invalid_body'))).toBe(false);
    expect(isStaleDungeonError(new Error('x'))).toBe(false);
  });
});

describe('why a run is blocked, and the retry offer', () => {
  const today = todayFixture as unknown as DungeonToday;
  it('says nothing when a run can start', () => {
    expect(blockedText(today)).toBeNull();
  });

  it('says why in words for the two blocked states', () => {
    expect(blockedText(todayDone as unknown as DungeonToday)).toContain('already run');
    expect(blockedText(todayNeed as unknown as DungeonToday)).toContain('at least 3 creatures');
  });

  it('offers the retry only after a lost first run with an attempt left', () => {
    expect(isRetryOffer(todayRetry as unknown as DungeonToday)).toBe(true);
    expect(isRetryOffer(today)).toBe(false);
    expect(isRetryOffer(todayDone as unknown as DungeonToday)).toBe(false);
    const cleared = (runCleared as unknown as DungeonRunResponse).run;
    expect(
      isRetryOffer({ canRun: true, attemptsToday: 1, attemptsAllowed: 2, last: cleared }),
    ).toBe(false);
    expect(isRetryOffer({ canRun: true, attemptsToday: 2, attemptsAllowed: 2, last: null })).toBe(
      false,
    );
  });
});

describe('the streak', () => {
  it('lights the pips for the streak in a cycle of seven', () => {
    const lit = (n: number): number => streakPips(n).filter((p) => p.on).length;
    expect([0, 1, 3, 7, 8, 14, 15].map(lit)).toEqual([0, 1, 3, 7, 1, 7, 1]);
    expect(streakPips(2)).toHaveLength(7);
    expect(
      streakPips(2)
        .filter((p) => p.bonus)
        .map((p) => p.day),
    ).toEqual([3, 7]);
  });

  it('says the streak in words', () => {
    expect(streakLine(0)).toContain('No streak');
    expect(streakLine(1)).toBe('1 day in a row');
    expect(streakLine(5)).toBe('5 days in a row');
  });
});

describe('the results words', () => {
  const cleared = (runCleared as unknown as DungeonRunResponse).run;
  const lost = (runLost as unknown as DungeonRunResponse).run;

  it('has a headline for a clear, a loss in the first room and a loss later', () => {
    expect(resultHeadline(cleared)).toBe('Dungeon cleared!');
    expect(resultHeadline(lost)).toBe('Your team was beaten in the first room.');
    expect(resultHeadline({ ...lost, roomsCleared: 1 })).toBe('Your team fell in room 2 of 3.');
  });

  it('says what the run did to the depth', () => {
    expect(depthChangeText(cleared)).toBe('Depth 1 to 2');
    expect(depthChangeText(lost)).toContain('Still at depth');
  });

  it('titles the room card the way the design says', () => {
    expect(roomCardTitle(1, 'Flooded')).toBe('Room 2 · Flooded');
    expect(roomLine(0, 3, 'foe')).toBe('Room 1 of 3');
    expect(roomLine(2, 3, 'boss')).toBe('Room 3 of 3, room boss');
  });
});
