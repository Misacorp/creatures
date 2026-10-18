/**
 * The words and shapes of the Undercroft on the client's pure side: the descent card's text, the strip's
 * status line, the results headline, the history lines, the stage banner, the room strip and the screens
 * a pending descent leads to. All from the real captured answers (`fixtures/dungeon-act-*.json`).
 */
import { describe, expect, it } from 'vitest';
import {
  CHEST_GEAR_LABEL,
  DOOR_ADDED_LINE,
  DOOR_NONE_LINE,
  PENDING_DESCEND_LINE,
  chestLine,
  descendLine,
  doorLine,
  lootOf,
  routeRun,
  stepsAt,
} from './dungeon-history';
import { lockedBandShown, runScreenOf, screenAfterAct, screenAfterFight } from './dungeon-flow';
import {
  PATH_FLOORS,
  placeTotal,
  replayInput,
  roomInput,
  roomIntroView,
  roomStrip,
} from './dungeon-playback';
import { parseDungeonAct, parseDungeonReplay } from './dungeon-parse';
import {
  DESCEND_BUTTON,
  DESCEND_HOME_BUTTON,
  catchBreathText,
  depthChangeText,
  descendIntro,
  descendLines,
  descendTitle,
  descendUnderHeading,
  nodeFloor,
  resultHeadline,
  roomPlaceLine,
  runStatusLine,
} from './dungeon-text';
import {
  undercroftLostSummary,
  undercroftState,
  undercroftSummary,
} from './dungeon-undercroft-sample';
import { omitKey } from './dungeon-path-samples';
import replayPath from './fixtures/dungeon-replay-path.json';
import actKeeper from './fixtures/dungeon-act-keeper.json';
import type { DungeonReplayRoom } from './dungeon-types';

const descent = (() => {
  const p = undercroftState('descent').pending;
  if (p?.kind !== 'descend') throw new Error('descent');
  return p;
})();

describe('the descent card words', () => {
  it('titles the card by what fell', () => {
    expect(descendTitle(descent)).toBe('Depth 15 is yours');
    expect(descendTitle({ level: 2, newDepth: 15 })).toBe('The keeper is down');
    expect(descendIntro(descent)).toContain('locked in');
    expect(descendIntro({ level: 2, newDepth: 15 })).toBe(
      'The floor cracks open: an even deeper Undercroft.',
    );
    expect(descendUnderHeading(descent)).toBe('The Undercroft · foes are fiercer here');
    expect(descendUnderHeading({ level: 2 })).toContain('fiercer still');
  });

  it("says the level's floors, how much fiercer it is, the breath and the loot, from what the server sent", () => {
    expect(catchBreathText(2000)).toBe('20% HP');
    expect(descendLines(descent)).toEqual([
      '4 floors, with a keeper on the last. Foes fight 3 depths deeper than yours.',
      'Your creatures catch their breath (20% HP).',
      'Fights there put twice their loot in your pack.',
      'Once down, you can head home only from a camp, if you find one.',
    ]);
    // A deeper level is fiercer again; a different multiplier is said as such.
    expect(descendLines({ ...descent, level: 2, floors: 3 })[0]).toBe(
      '3 floors, with a keeper on the last. Foes fight 6 depths deeper than yours.',
    );
    expect(descendLines(descent, 3)[2]).toBe('Fights there put 3 times their loot in your pack.');
    expect(DESCEND_BUTTON).toBe('Descend');
    expect(DESCEND_HOME_BUTTON).toBe('Head home with everything');
  });
});

describe('the run strip and the stage place in the Undercroft', () => {
  it('says where the run is in the Undercroft, and at the descent card', () => {
    expect(runStatusLine(undercroftState('descent'))).toBe('Depth 15 · The room boss is down');
    expect(runStatusLine(undercroftState('entrance'))).toBe('Undercroft 1 · At the entrance');
    expect(runStatusLine(undercroftState('midway'))).toBe('Undercroft 1 · Floor 2 / 4');
    expect(runStatusLine(undercroftState('keeper'))).toBe('Undercroft 1 · Floor 3 / 4');
    expect(runStatusLine(undercroftState('cracked-deeper'))).toBe('Undercroft 2 · At the entrance');
    expect(runStatusLine(undercroftState('locked'))).toBe('Depth 14 · Floor 5 / 7');
    const keeperDown = { ...undercroftState('descent') };
    expect(
      runStatusLine({
        ...keeperDown,
        level: 1,
        pending: keeperDown.pending && {
          ...(keeperDown.pending as object),
          kind: 'descend',
          level: 2,
          newDepth: 15,
          floors: 3,
          depthBonus: 3,
          catchBreathBp: 2000,
          banked: { gear: [], supplies: [], parts: {} },
        },
      }),
    ).toBe('Depth 15 · The keeper is down');
    // A run that does not know about levels (an older state in a test) reads as the day's map.
    const plain = omitKey(omitKey(undercroftState('locked'), 'level'), 'undercroft');
    expect(runStatusLine(plain)).toBe('Depth 14 · Floor 5 / 7');
  });

  it('reads the floor of a room of a level, and says the place of its rooms in the level', () => {
    expect(nodeFloor('f3l1')).toBe(3);
    expect(nodeFloor('u2f1l0')).toBe(1);
    expect(nodeFloor('u2')).toBeNull();
    expect(nodeFloor('x1f1l0')).toBeNull();
    expect(roomPlaceLine({ index: 6, node: 'u1f3l1' }, 4)).toBe('Undercroft 1 · Floor 4 / 4');
    expect(roomPlaceLine({ index: 2, node: 'f2l1' }, 7)).toBe('Floor 3 / 7');
    expect(roomPlaceLine({ index: 1 }, 3)).toBe('Room 2 / 3');
  });
});

describe('the results of a run that went down', () => {
  const summary = undercroftSummary();
  const lost = undercroftLostSummary();

  it('says how deep the run went, and the way down to the lost run', () => {
    expect(resultHeadline(summary)).toBe('Cleared! Depth 14 to 15 · Undercroft 1 cleared');
    expect(resultHeadline({ ...summary, deepest: 0 })).toBe('Cleared! Depth 14 to 15');
    expect(resultHeadline({ ...summary, deepest: 2 })).toBe(
      'Cleared! Depth 14 to 15 · Undercroft 2 cleared',
    );
    expect(resultHeadline(lost)).toBe('Lost in the Undercroft: half your pack made it home');
    // A lost run whose room boss did not fall is the old "Defeated".
    expect(resultHeadline({ ...lost, cleared: false })).toBe(
      'Defeated: half your pack made it home',
    );
    expect(
      resultHeadline({
        ...lost,
        pack: { found: { bait: 0, essence: 0, scrap: 0 }, kept: { bait: 0, essence: 0, scrap: 0 } },
      }),
    ).toBe('Lost in the Undercroft: your pack was empty');
  });

  it('says that the depth still went up after a loss below, and what was cleared', () => {
    expect(depthChangeText(summary)).toBe('Depth 14 to 15');
    expect(depthChangeText(lost)).toBe(
      'Depth 14 to 15. The room boss fell first, so the new depth stays.',
    );
    expect(depthChangeText({ ...lost, deepest: 1 })).toBe(
      'Depth 14 to 15. Undercroft 1 cleared. The room boss fell first, so the new depth stays.',
    );
    // A defeat that did not get past the boss keeps the old line.
    expect(depthChangeText({ ...lost, newDepth: lost.depth })).toContain('Still at depth 14');
  });

  it('labels the fights of the Undercroft in the strip: Undercroft 1, Undercroft elite, Epic and Keeper', () => {
    const strip = roomStrip(summary);
    expect(strip.map((r) => r.title)).toEqual([
      'Fight 1',
      'Fight 2',
      'Room boss',
      'Undercroft 1',
      'Undercroft 1',
      'Undercroft elite',
      'Keeper',
    ]);
    expect(strip.map((r) => r.level)).toEqual([0, 0, 0, 1, 1, 1, 1]);
    expect(strip.at(-1)?.spoken).toContain('Keeper: Slag Tyrant');
    // An epic room is labelled Epic, and counted as fierce.
    const epic = {
      ...summary,
      rooms: summary.rooms.map((r, i) => (i === 5 ? { ...r, epic: true } : r)),
    };
    expect(roomStrip(epic)[5]).toMatchObject({ title: 'Epic', epic: true, level: 1 });
    // Without a route, or when its fights are not these rooms, every room is on the day's map.
    const bare = omitKey(summary, 'route');
    expect(roomStrip(bare).map((r) => r.level)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(
      roomStrip({
        ...summary,
        route: { ...(summary.route as NonNullable<typeof summary.route>), history: [] },
      }).every((r) => r.level === 0),
    ).toBe(true);
  });

  it('keeps the levels the run went down into with its route, for the map', () => {
    const route = routeRun(summary);
    expect(route?.undercroft).toHaveLength(1);
    expect(route?.undercroft[0]?.level).toBe(1);
    expect(route?.run.path.at(-1)).toBe('u1f3l1');
    expect(routeRun({ landmark: false })).toBeNull();
    const flat = omitKey(summary.route as NonNullable<typeof summary.route>, 'undercroft');
    expect(routeRun({ ...summary, route: flat })?.undercroft).toEqual([]);
  });
});

describe('what happened in the rooms of the Undercroft', () => {
  it('says what a carved door did, and never which room it added', () => {
    expect(doorLine({ added: true })).toBe(DOOR_ADDED_LINE);
    expect(doorLine({ added: false })).toBe(DOOR_NONE_LINE);
    expect(DOOR_ADDED_LINE).toBe('Added a room to the Undercroft.');
    expect(DOOR_NONE_LINE).toBe('Nothing more to add.');
  });

  it('says what a chest and the descent came to', () => {
    expect(chestLine({ level: 0 })).toBe('The boss chest opened.');
    expect(chestLine({ level: 1 })).toBe("The keeper's chest opened.");
    expect(CHEST_GEAR_LABEL).toBe('Banked at once');
    expect(descendLine({ result: 'pending', level: 1 })).toBe(PENDING_DESCEND_LINE);
    expect(descendLine({ result: 'descend', level: 1, healed: 140 })).toBe(
      'You went down into Undercroft 1. Your creatures caught their breath (140 HP between them).',
    );
    expect(descendLine({ result: 'home', level: 1 })).toBe('You headed home with the whole pack.');
  });

  it('keeps all the entries of a boss that fell, in order, and counts a chest as loot', () => {
    const keeper = parseDungeonAct(actKeeper).state;
    expect(stepsAt(keeper.history, 'f6l1').map((e) => e.result)).toEqual([
      'fight',
      'chest',
      'descend',
    ]);
    expect(stepsAt(keeper.history, 'u1f3l1').map((e) => e.result)).toEqual(['fight', 'chest']);
    expect(stepsAt(undefined, 'f6l1')).toEqual([]);
    const chest = stepsAt(keeper.history, 'u1f3l1')[1];
    expect(chest && lootOf(chest)).toEqual({ bait: 0, essence: 1, scrap: 2 });
    const door = (keeper.history ?? []).find((e) => e.result === 'door');
    expect(door && lootOf(door)).toBeNull();
  });
});

describe('the stage of an Undercroft fight', () => {
  const answer = parseDungeonAct(actKeeper);
  const room = answer.room as DungeonReplayRoom;

  it('names the level and its floors in the banner, and the keeper as the keeper', () => {
    const view = roomIntroView(room, 4);
    expect(view).toMatchObject({
      heading: 'KEEPER',
      place: 'Undercroft 1 · Floor 4 / 4',
      boss: true,
      level: 1,
      epic: false,
    });
    expect(view.spoken).toContain('Undercroft 1 · Floor 4 / 4, Undercroft keeper: Slag Tyrant.');
    const epic = roomIntroView(
      { ...room, kind: 'foe', elite: true, epic: true, node: 'u1f2l1' },
      4,
    );
    expect(epic).toMatchObject({ heading: 'EPIC FIGHT', epic: true, elite: false, boss: false });
    expect(epic.foeName).toBe('Fierce Slag Tyrant');
    expect(epic.spoken).toContain('epic fight');
    expect(roomIntroView({ ...room, kind: 'foe', node: 'u1f0l0' }, 4).heading).toBe('FIGHT');
    // The day's rooms are as before.
    const day = roomIntroView({ ...room, node: 'f6l1' }, 7);
    expect(day).toMatchObject({ heading: 'ROOM BOSS', place: 'Floor 7 / 7', level: 0 });
  });

  it("counts a room's place against its own level's floors", () => {
    const input = roomInput([], room, true, 7, answer.state.undercroft?.maps ?? []);
    expect(placeTotal(input, room)).toBe(4);
    expect(placeTotal(input, { node: 'f2l0' })).toBe(7);
    expect(placeTotal(input, {})).toBe(7);
    // A level the input does not know falls back to the day's floors.
    expect(placeTotal(input, { node: 'u3f0l0' })).toBe(7);
    const none = roomInput([], room, true, 7);
    expect(none.undercroftFloors).toBeUndefined();
    expect(placeTotal(none, room)).toBe(7);
  });

  it('a replay counts the level floors from the summary route', () => {
    const replay = parseDungeonReplay({
      summary: answer.summary,
      row: room.row,
      rooms: [room],
    });
    const input = replayInput(replay);
    expect(input.total).toBe(PATH_FLOORS);
    expect(input.undercroftFloors).toEqual([4]);
    expect(placeTotal(input, room)).toBe(4);
    const plain = replayInput(parseDungeonReplay(replayPath));
    expect(plain.undercroftFloors).toBeUndefined();
  });
});

describe('which screen a pending descent leads to', () => {
  it('shows the descent card for a pending descent, in every place that picks a screen', () => {
    const pending = undercroftState('descent');
    expect(runScreenOf(pending)).toBe('descend');
    expect(runScreenOf({ pending: null })).toBe('run');
    const answer = { state: pending };
    expect(screenAfterAct(answer)).toBe('descend');
    expect(screenAfterFight(undefined, pending)).toBe('descend');
    // The fight that dropped the boss plays first, then the card.
    const boss = parseDungeonAct(actKeeper);
    expect(
      screenAfterAct({ ...answer, ...(boss.room === undefined ? {} : { room: boss.room }) }),
    ).toBe('fight');
  });

  it('shows the locked band from the depth that opens the Undercroft, until a level is drawn', () => {
    expect(lockedBandShown({ depth: 8 })).toBe(true);
    expect(lockedBandShown({ depth: 7 })).toBe(false);
    expect(lockedBandShown({ depth: 14, undercroft: null })).toBe(true);
    expect(lockedBandShown({ depth: 14, undercroft: { maps: [], marks: 1 } })).toBe(true);
    expect(lockedBandShown(undercroftState('entrance'))).toBe(false);
    expect(lockedBandShown({ depth: 3 }, 3)).toBe(true);
  });
});
