import { describe, expect, it } from 'vitest';
import errors from './fixtures/dungeon-errors.json';
import runCleared from './fixtures/dungeon-run-cleared.json';
import runLost from './fixtures/dungeon-run-lost.json';
import todayFixture from './fixtures/dungeon-today.json';
import todayDone from './fixtures/dungeon-today-done.json';
import todayNeed from './fixtures/dungeon-today-need-creatures.json';
import todayRetry from './fixtures/dungeon-today-retry.json';
import { ApiError } from './api';
import { EMPTY_PACK, sampleState, sampleSummary } from './dungeon-path-samples';
import {
  CAMP_HOME_BUTTON,
  CAMP_HOME_LINE,
  CAMP_INTRO,
  CAMP_TITLE,
  DUNGEON_ERROR_TEXT,
  NO_SWAP_LINE,
  ORDER_LINE,
  blockedText,
  campChoiceLines,
  depthChangeText,
  dungeonErrorText,
  fierceName,
  floorLine,
  isPackEmpty,
  isRetryOffer,
  isStaleDungeonError,
  lastEventText,
  nodeFloor,
  packLine,
  packText,
  percentText,
  resultHeadline,
  roomLine,
  roomPlaceLine,
  runHpText,
  runStatusLine,
  streakLabel,
  streakLine,
  streakPips,
} from './dungeon-text';
import { DUNGEON_ERRORS, type DungeonRunResponse, type DungeonToday } from './dungeon-types';

const GENERIC = /^Something went wrong/;

describe('the line about the order', () => {
  it('says it is your row, left to right, then the foe, in one short line', () => {
    expect(ORDER_LINE).toBe('Your creatures act left to right, then the foe.');
    expect(ORDER_LINE.length).toBeLessThan(60);
  });
});

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
    // The captures are of the old route; the path codes (stale_step, invalid_act, run_active, gone,
    // invalid_treat, insufficient_funds) join them when the worker re-captures.
    const captured = new Set(errors.map((e) => e.body.error));
    for (const code of captured) expect(Object.keys(DUNGEON_ERROR_TEXT)).toContain(code);
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
    // A step the run has moved past, an act it cannot take and a run already open: look again.
    for (const code of ['stale_step', 'invalid_act', 'run_active']) {
      expect(isStaleDungeonError(new ApiError(409, code)), code).toBe(true);
    }
    expect(isStaleDungeonError(new ApiError(400, 'invalid_body'))).toBe(false);
    expect(isStaleDungeonError(new ApiError(410, 'gone'))).toBe(false);
    expect(isStaleDungeonError(new ApiError(409, 'key_conflict'))).toBe(false);
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

  it('labels the streak row for a screen reader with a spaced slash', () => {
    expect(streakLabel(0)).toBe('Streak: 0 / 7 days of the cycle');
    expect(streakLabel(3)).toBe('Streak: 3 / 7 days of the cycle');
    expect(streakLabel(8)).toBe('Streak: 1 / 7 days of the cycle');
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
    expect(resultHeadline({ ...lost, roomsCleared: 1 })).toBe('Your team fell in room 2 / 3.');
  });

  it('says what the run did to the depth', () => {
    expect(depthChangeText(cleared)).toBe('Depth 1 to 2');
    expect(depthChangeText(lost)).toContain('Still at depth');
  });

  it('words the room line the way the design says', () => {
    expect(roomLine(0, 3)).toBe('Room 1 / 3');
    expect(roomLine(2, 3)).toBe('Room 3 / 3');
  });
});

describe('the headline of a path run', () => {
  const cleared = sampleSummary('cleared');
  const home = sampleSummary('home');
  const defeat = sampleSummary('defeat');

  it('says how the run ended', () => {
    expect(resultHeadline(cleared)).toBe('Cleared! Depth 3 to 4');
    expect(resultHeadline(home)).toBe('Home safe with your whole pack');
    expect(resultHeadline(defeat)).toBe('Defeated: half your pack made it home');
  });

  it('keeps the old words for a run from before the map', () => {
    const old = (runCleared as unknown as DungeonRunResponse).run;
    expect(old.outcome).toBeUndefined();
    expect(resultHeadline(old)).toBe('Dungeon cleared!');
  });

  it('says what the depth did, and what takes the run deeper', () => {
    expect(depthChangeText(cleared)).toBe('Depth 3 to 4');
    expect(depthChangeText(home)).toBe('Still at depth 3. Beat the room boss to go deeper.');
    expect(depthChangeText(defeat)).toContain('Beat the room boss');
    const old = (runLost as unknown as DungeonRunResponse).run;
    expect(depthChangeText(old)).toContain('Clear all three rooms');
  });
});

describe('the pack words', () => {
  it('lists what the pack holds without the empty kinds', () => {
    expect(packText({ bait: 2, essence: 0, scrap: 1 })).toBe('2 Bait · 1 Scrap');
    expect(packText({ bait: 0, essence: 1, scrap: 0 })).toBe('1 Essence');
    expect(packText(EMPTY_PACK)).toBe('nothing');
    expect(isPackEmpty(EMPTY_PACK)).toBe(true);
    expect(isPackEmpty({ bait: 0, essence: 0, scrap: 1 })).toBe(false);
  });

  it('says it on the strip, empty or not', () => {
    expect(packLine({ bait: 2, essence: 0, scrap: 1 })).toBe('In your pack: 2 Bait · 1 Scrap');
    expect(packLine(EMPTY_PACK)).toBe('Your pack is empty.');
  });
});

describe('the headline of a defeat with an empty pack', () => {
  it('does not say half the pack made it home when there was nothing in it', () => {
    const base = { cleared: false, roomsCleared: 0, rooms: [], outcome: 'defeat' as const };
    expect(resultHeadline({ ...base, pack: { found: EMPTY_PACK, kept: EMPTY_PACK } })).toBe(
      'Defeated: your pack was empty',
    );
    expect(
      resultHeadline({
        ...base,
        pack: { found: { bait: 3, essence: 0, scrap: 0 }, kept: { bait: 2, essence: 0, scrap: 0 } },
      }),
    ).toBe('Defeated: half your pack made it home');
    // No pack field (an older server): the usual words.
    expect(resultHeadline(base)).toBe('Defeated: half your pack made it home');
  });
});

describe('where the run is', () => {
  it('reads the floor from a node id', () => {
    expect(nodeFloor('f0l0')).toBe(0);
    expect(nodeFloor('f6l1')).toBe(6);
    expect(nodeFloor('x')).toBeNull();
    expect(nodeFloor('f2l1; drop')).toBeNull();
  });

  it('counts floors from 1', () => {
    expect(floorLine(2, 7)).toBe('Floor 3 / 7');
    expect(floorLine(6, 7)).toBe('Floor 7 / 7');
  });

  it('reads the place of a fight by its floor on a path and by its room in an old run', () => {
    expect(roomPlaceLine({ index: 2, node: 'f2l1' }, 7)).toBe('Floor 3 / 7');
    expect(roomPlaceLine({ index: 1 }, 3)).toBe('Room 2 / 3');
    expect(roomPlaceLine({ index: 1, node: 'weird' }, 3)).toBe('Room 2 / 3');
  });

  it('says the status of the run on the strip', () => {
    const state = sampleState();
    expect(runStatusLine(state)).toBe('Depth 3 · At the entrance');
    expect(runStatusLine({ ...state, at: 'f1l2' })).toBe('Depth 3 · Floor 2 / 7');
    expect(runStatusLine({ ...state, at: 'f3l1' })).toBe('Depth 3 · At the camp');
  });

  it('puts "Fierce" before an elite foe once', () => {
    expect(fierceName('Flicker Swarm', true)).toBe('Fierce Flicker Swarm');
    expect(fierceName('Fierce Flicker Swarm', true)).toBe('Fierce Flicker Swarm');
    expect(fierceName('Flicker Swarm', false)).toBe('Flicker Swarm');
    expect(fierceName('Flicker Swarm', undefined)).toBe('Flicker Swarm');
  });

  it('writes what the last event did as plain sentences', () => {
    expect(
      lastEventText({ name: 'Glowing Pool', option: 'Drink', outcome: 'Everyone healed 25%' }),
    ).toEqual({ title: 'Glowing Pool: Drink', outcome: 'Everyone healed 25%.' });
    expect(lastEventText({ name: 'A', option: 'B', outcome: 'Nothing happened.' }).outcome).toBe(
      'Nothing happened.',
    );
  });

  it('says HP in words, and knocked out when it is gone', () => {
    expect(runHpText({ hp: 240, hpMax: 281 })).toBe('240 / 281 HP');
    expect(runHpText({ hp: 0, hpMax: 281 })).toBe('Knocked out');
  });
});

describe('the camp words', () => {
  it('turns basis points into a percentage', () => {
    expect(percentText(4000)).toBe('40%');
    expect(percentText(1250)).toBe('12.5%');
  });

  it('says each choice with its exact effect', () => {
    const lines = campChoiceLines(4000);
    expect(lines.rest.line).toBe('Standing creatures recover 40% HP.');
    expect(lines.keepsake.label).toBe('Take a keepsake');
    expect(lines.swap.line).toContain('full HP');
  });

  it('names the way home and what it risks, plainly', () => {
    expect(CAMP_HOME_BUTTON).toBe('Head home with your pack');
    expect(CAMP_HOME_LINE).toBe('Push on and a defeat keeps only half your pack.');
  });

  it('keeps every line short and free of markup', () => {
    const lines = [
      CAMP_TITLE,
      CAMP_INTRO,
      CAMP_HOME_BUTTON,
      CAMP_HOME_LINE,
      NO_SWAP_LINE,
      ...Object.values(campChoiceLines(4000)).flatMap((c) => [c.label, c.line]),
    ];
    for (const line of lines) {
      expect(line.length, line).toBeLessThan(70);
      expect(line, line).not.toMatch(/[<>{}]/);
    }
  });
});
