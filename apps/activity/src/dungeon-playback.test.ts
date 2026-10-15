import { beatEnds, planRounds, roundPlaybackMs } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import replayFixture from './fixtures/dungeon-replay.json';
import landmarkFixture from './fixtures/dungeon-run-landmark.json';
import lostFixture from './fixtures/dungeon-run-lost.json';
import clearedFixture from './fixtures/dungeon-run-cleared.json';
import { parseDungeonReplay } from './dungeon-parse';
import {
  ROOM_CARD_MS,
  ROOM_BANNER,
  ROOM_END_MS,
  atSpeed,
  fightScroll,
  hpLine,
  mineIds,
  modifierGimmicks,
  nextRoom,
  noRewards,
  rewardLoot,
  roomBoss,
  roomOutcome,
  roomIntroView,
  roomResultLine,
  roomState,
  roomStrip,
  runSentence,
  stageRow,
  teamBreakdown,
  streakBonusText,
  streakLoot,
} from './dungeon-playback';
import type { DungeonRunResponse, DungeonRunSummary } from './dungeon-types';
import { turnOrderOfRound } from './replay';
import { buildBeats, creatureHpAt, ordinal, stageStateAt } from './stage';
import { forecastNextRound } from './telegraph';

const replay = parseDungeonReplay(replayFixture);
const cleared = (clearedFixture as unknown as DungeonRunResponse).run;
const lost = (lostFixture as unknown as DungeonRunResponse).run;
const landmark = (landmarkFixture as unknown as DungeonRunResponse).run;

describe('a stored room, as the stage draws it', () => {
  it('turns the row into the stage row, front to back, with no owner colours to mix up', () => {
    const row = stageRow(replay);
    expect(row.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(row.map((r) => r.name)).toEqual(['Sproutle', 'Splashet', 'Cindle']);
    expect(row.every((r) => r.owner === 'p1')).toBe(true);
    // The row comes sorted by position even when the server lists it otherwise.
    const shuffled = stageRow({ row: [...replay.row].reverse() });
    expect(shuffled.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  it('names the foe as the boss of the fight', () => {
    const room = replay.rooms[2];
    if (room === undefined) throw new Error('fixture has three rooms');
    expect(roomBoss(room)).toEqual({
      id: 'drowned-warden',
      name: 'Drowned Warden',
      element: room.foe.element,
    });
    expect(mineIds([]).size).toBe(0);
    expect(mineIds(stageRow(replay)).size).toBe(3);
  });

  it('moves from room to room and ends after the last one played', () => {
    expect(nextRoom(replay, 0)).toBe(1);
    expect(nextRoom(replay, 1)).toBe(2);
    expect(nextRoom(replay, 2)).toBeNull();
    expect(nextRoom({ rooms: [] }, 0)).toBeNull();
  });
});

describe('creature HP on the stage', () => {
  it('starts every room from its own hpStart', () => {
    for (const room of replay.rooms) {
      expect(creatureHpAt(room.events, 0, room.hpStart)).toEqual(room.hpStart);
    }
  });

  it('follows the boss hits and ends where the next room starts (HP carries over)', () => {
    const [first, second, third] = replay.rooms;
    if (first === undefined || second === undefined || third === undefined)
      throw new Error('rooms');
    expect(creatureHpAt(first.events, first.events.length, first.hpStart)).toEqual(second.hpStart);
    expect(creatureHpAt(second.events, second.events.length, second.hpStart)).toEqual(
      third.hpStart,
    );
  });

  it('ends at the HP the run summary reports for each creature', () => {
    const last = replay.rooms.at(-1);
    if (last === undefined) throw new Error('rooms');
    const end = creatureHpAt(last.events, last.events.length, last.hpStart);
    for (const member of replay.summary.team)
      expect(end[member.id], member.name).toBe(member.hpEnd);
  });

  it('never goes below 0, leaves unknown creatures out and clamps the index', () => {
    const events = [
      { t: 'boss_hit', round: 1, source: 'attack', target: 'a', damage: 50 },
      { t: 'boss_hit', round: 1, source: 'attack', target: 'ghost', damage: 5 },
    ] as const;
    expect(creatureHpAt(events, 99, { a: 30 })).toEqual({ a: 0 });
    expect(creatureHpAt(events, -4, { a: 30 })).toEqual({ a: 30 });
    expect(creatureHpAt(events, 1, { a: 80 })).toEqual({ a: 30 });
  });
});

describe('the pacing is the live finale pacing', () => {
  it('plays every room with the engine beats and the same round lengths', () => {
    for (const room of replay.rooms) {
      const rowIds = replay.row.map((r) => r.id);
      const beats = buildBeats(room.events, 0, rowIds, room.foe.id, { introMs: 1000 });
      expect(beats.length, room.foe.name).toBe(beatEnds(room.events).length);
      // Each round plays for the time the server paces a live round by.
      const plans = planRounds(room.events, { introMs: 1000 });
      expect(plans.length).toBe(room.rounds);
      for (const plan of plans) {
        const slice = room.events.slice(plan.from, plan.to);
        expect(plan.totalMs).toBe(roundPlaybackMs(slice, { introMs: 1000 }));
        expect(plan.totalMs).toBeGreaterThanOrEqual(6000);
      }
    }
  });

  it('shows the boss HP from the foe HP of the room, and the telegraph of its attacks', () => {
    const room = replay.rooms[2];
    if (room === undefined) throw new Error('rooms');
    const state = stageStateAt(room.events, 0, room.foe.hpMax);
    expect(state.bossHp).toBe(room.foe.hpMax);
    const rowIds = replay.row.map((r) => r.id);
    const beats = buildBeats(room.events, 0, rowIds, room.foe.id, {});
    expect(beats.some((b) => b.windupMs > 0)).toBe(true);
  });

  it('forecasts a dungeon foe the way it forecasts a raid boss', () => {
    // The Drowned Warden's Flood Gate hits a zone in some round; the forecast names it.
    const room = replay.rooms[2];
    if (room === undefined) throw new Error('rooms');
    const ids = replay.row.map((r) => r.id);
    const seen = [1, 2, 3, 4, 5, 6, 7].map((round) =>
      forecastNextRound(room.foe.id, round, 8, ids, [], room.names),
    );
    expect(seen.some((f) => f !== null)).toBe(true);
    expect(forecastNextRound('not-a-foe', 1, 8, ids, [], room.names)).toBeNull();
  });
});

describe('the timings', () => {
  it('halves everything at 2x and leaves normal speed alone', () => {
    expect(atSpeed(ROOM_CARD_MS, 1)).toBe(ROOM_CARD_MS);
    expect(atSpeed(ROOM_CARD_MS, 2)).toBe(ROOM_CARD_MS / 2);
    expect(atSpeed(ROOM_END_MS, 2)).toBe(ROOM_END_MS / 2);
    expect(atSpeed(1501, 2)).toBe(751);
  });

  it('keeps the room card up 3 seconds longer than the 2.2 seconds it had (Misa, 2026-10-15)', () => {
    expect(ROOM_CARD_MS).toBe(2_200 + 3_000);
  });
});

describe('the results', () => {
  it('tells how each room ended', () => {
    expect(cleared.rooms.map(roomOutcome)).toEqual(['cleared', 'cleared', 'cleared']);
    expect(lost.rooms.map(roomOutcome)).toEqual(['lost', 'not reached', 'not reached']);
  });

  it('says how a room ended under the stage', () => {
    const room = replay.rooms[0];
    if (room === undefined) throw new Error('rooms');
    expect(roomResultLine(room)).toBe('Bramble Hound defeated.');
    expect(roomResultLine({ ...room, cleared: false })).toBe(
      'Your team could not beat Bramble Hound.',
    );
  });

  it('writes one sentence for the whole run', () => {
    expect(runSentence(cleared)).toBe('Cleared at depth 1: 3 / 3 rooms cleared.');
    expect(runSentence(lost)).toContain('Not cleared at depth');
    expect(runSentence(lost)).toContain('0 / 3 rooms cleared');
  });

  it('sees a run that paid nothing, and one that paid in full', () => {
    expect(noRewards(lost.rewards)).toBe(true);
    expect(noRewards(cleared.rewards)).toBe(false);
    expect(noRewards(landmark.rewards)).toBe(false);
  });

  it('makes a loot list of the gear and the parts, with no blueprints', () => {
    const loot = rewardLoot(landmark.rewards);
    expect(loot.gear).toHaveLength(1);
    expect(loot.gear[0]?.baseId).toBe('keen-trinket');
    expect(loot.blueprints).toEqual([]);
    expect(loot.parts).toEqual(landmark.rewards.parts);
  });

  it('shows the streak bonus apart from the amounts, in words and as parts', () => {
    expect(streakBonusText(landmark.rewards)).toBe('Day 3 streak bonus: 1 Scrap');
    expect(streakLoot(landmark.rewards)?.parts).toEqual({ scrap: 1 });
    expect(streakBonusText(cleared.rewards)).toBeNull();
    expect(streakLoot(cleared.rewards)).toBeNull();
    const empty = { ...landmark.rewards, streak: { day: 7, bait: 0, essence: 0, parts: {} } };
    expect(streakBonusText(empty)).toBe('Day 7 streak bonus: nothing this time');
    const money = {
      ...landmark.rewards,
      streak: { day: 7, bait: 2, essence: 1, parts: { scrap: 1 } },
    };
    expect(streakBonusText(money)).toBe('Day 7 streak bonus: 2 Bait, 1 Essence, 1 Scrap');
  });
});

describe('the room strip of the end report', () => {
  it('has one panel per room, in order, with the foe, the modifier and the state', () => {
    const strip = roomStrip(cleared);
    expect(strip.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(strip.map((r) => r.title)).toEqual(['Room 1', 'Room 2', 'Room boss']);
    expect(strip.map((r) => r.kind)).toEqual(['foe', 'foe', 'boss']);
    expect(strip.map((r) => r.foeId)).toEqual(cleared.rooms.map((r) => r.foe.id));
    expect(strip.every((r) => r.state === 'cleared' && r.banner === 'CLEARED')).toBe(true);
    expect(strip.every((r) => r.foeHp === null)).toBe(true);
  });

  it('puts the panels in room order whatever order the server lists them in', () => {
    const shuffled = { rooms: [...cleared.rooms].reverse() };
    expect(roomStrip(shuffled).map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it('says DEFEAT for the room that was lost, with the foe HP left, and LOCKED for those after it', () => {
    const strip = roomStrip(lost);
    expect(strip.map((r) => r.state)).toEqual(['defeat', 'locked', 'locked']);
    expect(strip.map((r) => r.banner)).toEqual(['DEFEAT', 'LOCKED', 'LOCKED']);
    const first = lost.rooms[0];
    expect(strip[0]?.foeHp).toBe(
      `${String(first?.foeHpEnd)} / ${String(first?.foe.hpMax)} HP left`,
    );
    expect(strip[1]?.foeHp).toBeNull();
  });

  it('names a room cleared before the lost one as cleared', () => {
    const second = {
      rooms: [
        { ...cleared.rooms[0], played: true, cleared: true },
        { ...cleared.rooms[1], played: true, cleared: false, foeHpEnd: 40 },
        { ...cleared.rooms[2], played: false, cleared: false },
      ],
    } as unknown as Pick<DungeonRunSummary, 'rooms'>;
    expect(roomStrip(second).map((r) => r.state)).toEqual(['cleared', 'defeat', 'locked']);
  });

  it('keeps the states and the banner words apart, and speaks every panel', () => {
    expect(roomState({ played: true, cleared: true })).toBe('cleared');
    expect(roomState({ played: true, cleared: false })).toBe('defeat');
    expect(roomState({ played: false, cleared: false })).toBe('locked');
    expect(new Set(Object.values(ROOM_BANNER)).size).toBe(3);
    const spoken = roomStrip(lost).map((r) => r.spoken);
    expect(spoken[0]).toMatch(/defeat\.$/);
    expect(spoken[2]).toMatch(/not reached\.$/);
    expect(roomStrip(cleared)[0]?.spoken).toContain(cleared.rooms[0]?.foe.name);
  });
});

describe('the team breakdown of the end report', () => {
  it('lists the creatures in their fighting order with "HP left / HP max HP"', () => {
    const team = teamBreakdown(cleared);
    expect(team.map((t) => t.id)).toEqual(cleared.team.map((m) => m.id));
    for (const [i, entry] of team.entries()) {
      const member = cleared.team[i];
      expect(entry.hp).toBe(`${String(member?.hpEnd)} / ${String(member?.hpMax)} HP`);
    }
  });

  it('writes the line the way the design says, and 0 for a knocked-out creature', () => {
    expect(hpLine({ hpEnd: 340, hpMax: 391 })).toBe('340 / 391 HP');
    expect(hpLine({ hpEnd: 0, hpMax: 391 })).toBe('0 / 391 HP');
    // Never negative, never more than the maximum.
    expect(hpLine({ hpEnd: -5, hpMax: 391 })).toBe('0 / 391 HP');
    expect(hpLine({ hpEnd: 900, hpMax: 391 })).toBe('391 / 391 HP');
  });

  it('marks a knocked-out creature, and says so out loud', () => {
    const member = lost.team[0];
    if (member === undefined) throw new Error('fixture has a team');
    const down = teamBreakdown({ team: [{ ...member, hpEnd: 0 }] })[0];
    expect(down?.knockedOut).toBe(true);
    expect(down?.hp.startsWith('0 / ')).toBe(true);
    expect(down?.spoken).toContain('knocked out');
    const up = teamBreakdown({ team: [{ ...member, hpEnd: 5 }] })[0];
    expect(up?.knockedOut).toBe(false);
    expect(up?.spoken).not.toContain('knocked out');
  });

  it('carries what the small-creature popover needs, and no more than the creature', () => {
    const entry = teamBreakdown(cleared)[0];
    expect(entry).toMatchObject({
      name: cleared.team[0]?.name,
      speciesId: cleared.team[0]?.speciesId,
      element: cleared.team[0]?.element,
      role: cleared.team[0]?.role,
      level: cleared.team[0]?.level,
    });
  });
});

describe('the banner over the stage when a room opens', () => {
  const room = (index: number, kind: 'foe' | 'boss') => ({
    index,
    kind,
    foe: { id: 'puddle-imp', name: 'Puddle Imp', element: 'tide' as const, hpMax: 300 },
    modifier: { id: 'flooded', name: 'Flooded', description: 'Tide creatures hit 20% harder.' },
  });

  it('shows the room number, the foe and the modifier', () => {
    const view = roomIntroView(room(1, 'foe'), 3);
    expect(view).toMatchObject({
      heading: 'ROOM 2',
      place: '2 / 3',
      boss: false,
      foeId: 'puddle-imp',
      foeName: 'Puddle Imp',
      element: 'tide',
      modifierName: 'Flooded',
      modifierDescription: 'Tide creatures hit 20% harder.',
    });
  });

  it('calls the last room the room boss, and says it all in one sentence', () => {
    const view = roomIntroView(room(2, 'boss'), 3);
    expect(view.heading).toBe('ROOM BOSS');
    expect(view.boss).toBe(true);
    expect(view.spoken).toBe(
      'Room 3 / 3, room boss: Puddle Imp. Flooded: Tide creatures hit 20% harder.',
    );
  });

  it('is made from every stored room of a replay', () => {
    const views = replay.rooms.map((r) => roomIntroView(r, replay.rooms.length));
    expect(views.map((v) => v.foeName)).toEqual(replay.rooms.map((r) => r.foe.name));
    expect(views.at(-1)?.boss).toBe(true);
  });
});

describe('the acting order written under the creatures', () => {
  const row = stageRow(replay);

  it('is the row left to right, 1st to 3rd, whatever order the server listed it in', () => {
    const shuffled = stageRow({ row: [...replay.row].reverse() });
    expect(shuffled.map((r) => r.id)).toEqual(row.map((r) => r.id));
    expect(row.map((_, i) => ordinal(i + 1))).toEqual(['1st', '2nd', '3rd']);
  });

  it('agrees with the order the engine actually played, round after round', () => {
    for (const room of replay.rooms) {
      const ids = row.map((r) => r.id);
      for (let round = 1; round <= room.rounds; round++) {
        // Everyone who acted in a round acted in row order (a knocked-out creature just has no turn).
        const acted = turnOrderOfRound(room.events, round);
        expect(acted, `${room.foe.name} round ${String(round)}`).toEqual(
          ids.filter((id) => acted.includes(id)),
        );
      }
    }
  });

  it('is ordinals: 1st, 2nd, 3rd, then 4th, 11th, 12th, 13th, 21st, 22nd, 23rd and 101st', () => {
    expect([1, 2, 3, 4, 10, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '10th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
      '111th',
    ]);
  });

  it('shows who is acting from the stage state', () => {
    const room = replay.rooms[0];
    if (room === undefined) throw new Error('fixture room');
    const first = room.events.findIndex((e) => e.t === 'turn');
    const actor = (index: number) => stageStateAt(room.events, index, room.foe.hpMax).actor;
    expect(actor(0)).toBeNull();
    expect(actor(first + 1)).toBe(row[0]?.id);
    const second = room.events.findIndex((e, i) => i > first && e.t === 'turn');
    expect(actor(second + 1)).toBe(row[1]?.id);
  });
});

describe('the forecast knows what the room modifier adds to the foe', () => {
  it('reads the gimmick Thorns adds from the content, and none for other modifiers', () => {
    const thorns = replay.rooms.find((r) => r.modifier.id === 'thorns');
    const plain = replay.rooms.find((r) => r.modifier.id !== 'thorns');
    if (thorns === undefined || plain === undefined) throw new Error('fixture modifiers');
    expect(modifierGimmicks(thorns).map((g) => g.op)).toEqual(['reflect_first_reaction']);
    expect(modifierGimmicks(plain)).toEqual([]);
  });

  it('shows Thorns in the Next round line of a Thorns room, which the foe alone does not give', () => {
    const room = replay.rooms.find((r) => r.modifier.id === 'thorns');
    if (room === undefined) throw new Error('fixture has a Thorns room');
    const ids = replay.row.map((r) => r.id);
    const without = forecastNextRound(room.foe.id, 1, 8, ids, [], room.names);
    const added = modifierGimmicks(room);
    const withThorns = forecastNextRound(room.foe.id, 1, 8, ids, [], room.names, 'row', added);
    expect(withThorns?.text).toContain('reflects the first reaction');
    expect(without?.text ?? '').not.toContain('reflects the first reaction');
  });
});

describe('a run that was stored with the removed Fog modifier', () => {
  // Old runs keep the modifier's name and text in the stored room, so they still read and draw.
  const fogged = {
    ...replay,
    rooms: replay.rooms.map((r, i) =>
      i === 0
        ? {
            ...r,
            modifier: {
              id: 'fog',
              name: 'Fog',
              description: 'Nobody can see: everyone acts in row order, left to right.',
            },
          }
        : r,
    ),
  };

  it('shows its banner text and adds no gimmick', () => {
    const room = fogged.rooms[0];
    if (room === undefined) throw new Error('room');
    const view = roomIntroView(room, fogged.rooms.length);
    expect(view.modifierName).toBe('Fog');
    expect(view.spoken).toContain('Fog: Nobody can see');
    expect(modifierGimmicks(room)).toEqual([]);
    expect(stageRow(fogged).map((r) => r.position)).toEqual([0, 1, 2]);
  });
});

describe('the scroll to the fight when a run starts', () => {
  it('is smooth, with the fight at the top of the viewport', () => {
    expect(fightScroll(false)).toEqual({ behavior: 'smooth', block: 'start' });
  });

  it('is instant under prefers-reduced-motion', () => {
    expect(fightScroll(true)).toEqual({ behavior: 'auto', block: 'start' });
  });
});
