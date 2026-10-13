import { beatEnds, planRounds, roundPlaybackMs } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import replayFixture from './fixtures/dungeon-replay.json';
import landmarkFixture from './fixtures/dungeon-run-landmark.json';
import lostFixture from './fixtures/dungeon-run-lost.json';
import clearedFixture from './fixtures/dungeon-run-cleared.json';
import { parseDungeonReplay } from './dungeon-parse';
import {
  ROOM_CARD_MS,
  ROOM_END_MS,
  atSpeed,
  creatureHpLabel,
  foeHpLine,
  mineIds,
  nextRoom,
  noRewards,
  rewardLoot,
  roomBoss,
  roomOutcome,
  roomResultLine,
  runSentence,
  stageRow,
  streakBonusText,
  streakLoot,
} from './dungeon-playback';
import type { DungeonRunResponse } from './dungeon-types';
import { buildBeats, creatureHpAt, stageStateAt } from './stage';
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
    expect(roomBoss(room)).toEqual({ id: 'drowned-warden', name: 'Drowned Warden' });
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

  it('says what the bar means in words', () => {
    expect(creatureHpLabel('Ann', 12, 40)).toBe('Ann HP: 12 of 40');
    expect(creatureHpLabel('Ann', 0, 40)).toBe('Ann HP: knocked out');
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
});

describe('the results', () => {
  it('tells how each room ended', () => {
    expect(cleared.rooms.map(roomOutcome)).toEqual(['cleared', 'cleared', 'cleared']);
    expect(lost.rooms.map(roomOutcome)).toEqual(['lost', 'not reached', 'not reached']);
  });

  it('says how much HP the foe had left in a room that was played', () => {
    const first = lost.rooms[0];
    if (first === undefined) throw new Error('rooms');
    expect(foeHpLine(first)).toBe(
      `${String(first.foeHpEnd)} of ${String(first.foe.hpMax)} HP left`,
    );
    expect(foeHpLine(lost.rooms[1] ?? first)).toBeNull();
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
    expect(runSentence(cleared)).toBe('Cleared at depth 1: 3 of 3 rooms cleared.');
    expect(runSentence(lost)).toContain('Not cleared at depth');
    expect(runSentence(lost)).toContain('0 of 3 rooms cleared');
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
