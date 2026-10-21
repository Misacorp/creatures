import { describe, expect, it } from 'vitest';
import mapErrors from './fixtures/dungeon-errors.json';
import legacyErrors from './fixtures/dungeon-legacy-errors.json';
import runCleared from './fixtures/dungeon-run-cleared.json';
import runLost from './fixtures/dungeon-run-lost.json';
import todayFixture from './fixtures/dungeon-today.json';
import todayDone from './fixtures/dungeon-today-done.json';
import todayNeed from './fixtures/dungeon-today-need-creatures.json';
import todayRetry from './fixtures/dungeon-today-retry.json';
import { ApiError } from './api';
import { EMPTY_PACK, omitKey, sampleState, sampleSummary } from './dungeon-path-samples';
import {
  CAMP_HOME_BUTTON,
  CAMP_ARRANGE_LINE,
  CAMP_INTRO,
  CAMP_TITLE,
  DUNGEON_ERROR_TEXT,
  NO_SWAP_LINE,
  ORDER_LINE,
  blockedText,
  campChoiceLines,
  dungeonErrorText,
  fierceName,
  floorLine,
  undercroftName,
  isPackEmpty,
  isRetryOffer,
  isStaleDungeonError,
  lastEventText,
  nodeFloor,
  packLine,
  packText,
  percentText,
  resultSummary,
  resultTitle,
  resultTone,
  roomLine,
  roomPlaceLine,
  runHpText,
  runStatusLine,
  streakLabel,
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
    const errors = [...legacyErrors, ...mapErrors];
    expect(errors.length).toBeGreaterThan(5);
    for (const { route, status, body } of errors) {
      const text = dungeonErrorText(new ApiError(status, body.error));
      expect(text, `${route} ${body.error}`).not.toMatch(GENERIC);
    }
    // The captures are of the old run route (dungeon-legacy-errors.json) and of the map's routes.
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
});

describe('the results words', () => {
  const cleared = (runCleared as unknown as DungeonRunResponse).run;
  const lost = (runLost as unknown as DungeonRunResponse).run;

  it('has a short title for a run from before the map, red for a loss and green for a clear', () => {
    expect(resultTitle(cleared)).toBe('Cleared!');
    expect(resultTitle(lost)).toBe('Defeated');
    expect(resultTone(cleared)).toBe('good');
    expect(resultTone(lost)).toBe('bad');
  });

  it('keeps a sensible line for a run from before the map', () => {
    expect(resultSummary(cleared)).toBe('You cleared all 3 rooms and went from depth 1 to 2.');
    expect(resultSummary(lost)).toBe(
      `Your team was beaten in the first room. You stay at depth ${String(lost.depth)}.`,
    );
    expect(resultSummary({ ...lost, roomsCleared: 1 })).toBe(
      `Your team fell in room 2 / 3. You stay at depth ${String(lost.depth)}.`,
    );
    expect(resultSummary({ ...cleared, newDepth: cleared.depth })).toBe(
      'You cleared all 3 rooms. You stay at depth 1.',
    );
  });

  it('words the room line the way the design says', () => {
    expect(roomLine(0, 3)).toBe('Room 1 / 3');
    expect(roomLine(2, 3)).toBe('Room 3 / 3');
  });
});

describe('the title and summary of a path run', () => {
  const cleared = sampleSummary('cleared');
  const home = sampleSummary('home');
  const defeat = sampleSummary('defeat');

  it('has a short title, green for a success and red for a defeat', () => {
    expect(resultTitle(cleared)).toBe('Cleared!');
    expect(resultTitle(home)).toBe('Home safe');
    expect(resultTitle(defeat)).toBe('Defeated');
    expect(resultTitle({ ...defeat, cleared: true })).toBe('Lost in the Undercroft');
    expect([cleared, home, defeat].map(resultTone)).toEqual(['good', 'good', 'bad']);
    expect(resultTone({ ...defeat, cleared: true })).toBe('bad');
  });

  it('sums up a clear, with the Undercroft floors it cleared', () => {
    expect(resultSummary(cleared)).toBe(
      'You defeated the floor boss and advanced to depth 4. You brought your whole pack home.',
    );
    expect(resultSummary({ ...cleared, deepest: 1 })).toBe(
      'You defeated the floor boss and advanced to depth 4 and cleared 1 Undercroft floor. You brought your whole pack home.',
    );
    expect(resultSummary({ ...cleared, deepest: 2 })).toContain('and cleared 2 Undercroft floors.');
  });

  it('sums up a run that headed home from the camp, and keeps the depth', () => {
    expect(resultSummary(home)).toBe(
      'You headed home from the camp with your whole pack. You stay at depth 3.',
    );
    expect(resultSummary({ ...home, pack: { found: EMPTY_PACK, kept: EMPTY_PACK } })).toBe(
      'You headed home from the camp with an empty pack. You stay at depth 3.',
    );
  });

  it("names the room a defeat on the day's floor fell in", () => {
    // The sample's lost fight is the elite on the third floor of seven.
    expect(resultSummary(defeat)).toBe(
      'You were defeated in room 3 / 7 and kept half of your loot pack.',
    );
    // No route (an older server): no room to name.
    expect(resultSummary(omitKey(defeat, 'route'))).toBe(
      'You were defeated on the way to the floor boss and kept half of your loot pack.',
    );
  });

  it('says it was the Undercroft when the floor boss fell first', () => {
    const lostBelow = { ...defeat, cleared: true, newDepth: 4 };
    expect(resultSummary(lostBelow)).toBe(
      'You defeated the first floor boss and advanced to depth 4. You were defeated in the Undercroft and kept half of your loot pack.',
    );
    expect(resultSummary({ ...lostBelow, deepest: 2 })).toBe(
      'You defeated the first floor boss and advanced to depth 4, then cleared 2 Undercroft floors. You were defeated in the Undercroft and kept half of your loot pack.',
    );
  });

  it('does not promise half of an empty pack', () => {
    const empty = { found: EMPTY_PACK, kept: EMPTY_PACK };
    expect(resultSummary({ ...defeat, pack: empty })).toBe(
      'You were defeated in room 3 / 7 with an empty pack.',
    );
    expect(resultSummary({ ...defeat, cleared: true, newDepth: 4, pack: empty })).toBe(
      'You defeated the first floor boss and advanced to depth 4. You were defeated in the Undercroft with an empty pack.',
    );
    // A clear with nothing in the pack just leaves the pack out.
    expect(resultSummary({ ...sampleSummary('cleared'), pack: empty })).toBe(
      'You defeated the floor boss and advanced to depth 4.',
    );
  });
});

describe('the pack words', () => {
  it('lists what the pack holds without the empty kinds', () => {
    expect(packText({ bait: 2, essence: 0, scrap: 1 })).toBe('2 Bait · 1 Scrap');
    expect(packText({ bait: 0, essence: 1, scrap: 0 })).toBe('1 Essence');
    expect(packText(EMPTY_PACK)).toBe('nothing');
    // Shards are in the pack too, by element, after the plain kinds.
    const shards = { ...EMPTY_PACK, bait: 1, shards: { 'ember-shard': 1, 'tide-shard': 2 } };
    expect(packText(shards)).toBe('1 Bait · 1 Ember Shard · 2 Tide Shard');
    expect(isPackEmpty({ ...EMPTY_PACK, shards: { 'grove-shard': 1 } })).toBe(false);
    expect(isPackEmpty({ ...EMPTY_PACK, shards: {} })).toBe(true);
    expect(isPackEmpty(EMPTY_PACK)).toBe(true);
    expect(isPackEmpty({ bait: 0, essence: 0, scrap: 1 })).toBe(false);
  });

  it('says it on the strip, empty or not', () => {
    expect(packLine({ bait: 2, essence: 0, scrap: 1 })).toBe('In your pack: 2 Bait · 1 Scrap');
    expect(packLine(EMPTY_PACK)).toBe('Your pack is empty.');
  });
});

describe('where the run is', () => {
  it('reads the floor from a node id', () => {
    expect(nodeFloor('f0l0')).toBe(0);
    expect(nodeFloor('f6l1')).toBe(6);
    expect(nodeFloor('x')).toBeNull();
    expect(nodeFloor('f2l1; drop')).toBeNull();
  });

  it('names Undercroft floors', () => {
    expect(undercroftName(1)).toBe('Undercroft 1');
  });

  it('counts the rooms along a path from 1', () => {
    expect(floorLine(2, 7)).toBe('Room 3 / 7');
    expect(floorLine(6, 7)).toBe('Room 7 / 7');
  });

  it('reads the place of a fight by its room along a path and by its room in an old run', () => {
    expect(roomPlaceLine({ index: 2, node: 'f2l1' }, 7)).toBe('Room 3 / 7');
    expect(roomPlaceLine({ index: 1 }, 3)).toBe('Room 2 / 3');
    expect(roomPlaceLine({ index: 1, node: 'weird' }, 3)).toBe('Room 2 / 3');
  });

  it('says the status of the run on the strip', () => {
    const state = sampleState();
    expect(runStatusLine(state)).toBe('Depth 3 · At the entrance');
    expect(runStatusLine({ ...state, at: 'f1l2' })).toBe('Depth 3 · Room 2 / 7');
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
    expect(lines.rest.line).toBe('Standing creatures heal 40% HP.');
    expect(lines.keepsake.label).toBe('Take a keepsake');
    expect(lines.swap.line).toContain('full HP');
  });

  it('names the way home, and says in one line that the row can be reordered', () => {
    expect(CAMP_HOME_BUTTON).toBe('Head home with your pack');
    expect(CAMP_INTRO).toContain('swap places');
    expect(CAMP_ARRANGE_LINE).toContain('swap places');
  });

  it('keeps every line short and free of markup', () => {
    const lines = [
      CAMP_TITLE,
      CAMP_INTRO,
      CAMP_HOME_BUTTON,
      CAMP_ARRANGE_LINE,
      NO_SWAP_LINE,
      ...Object.values(campChoiceLines(4000)).flatMap((c) => [c.label, c.line]),
    ];
    for (const line of lines) {
      expect(line.length, line).toBeLessThan(70);
      expect(line, line).not.toMatch(/[<>{}]/);
    }
  });
});
