import { beatEnds, planRounds, roundPlaybackMs } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import actFightFixture from './fixtures/dungeon-act-fight.json';
import replayPathFixture from './fixtures/dungeon-replay-path.json';
import replayFixture from './fixtures/dungeon-replay.json';
import landmarkFixture from './fixtures/dungeon-run-landmark.json';
import lostFixture from './fixtures/dungeon-run-lost.json';
import clearedFixture from './fixtures/dungeon-run-cleared.json';
import { parseDungeonAct, parseDungeonReplay } from './dungeon-parse';
import {
  ROOM_CARD_MS,
  ROOM_BANNER,
  ROOM_END_MS,
  atSpeed,
  droppedSupplies,
  fightScroll,
  hpLine,
  mineIds,
  modifierGimmicks,
  nextRoom,
  NO_REWARDS_HINT,
  NO_REWARDS_LINE,
  noRewards,
  rewardLoot,
  roomBoss,
  roomOutcome,
  roomIntroView,
  roomResultLine,
  roomStageRow,
  roomState,
  roomStrip,
  stageRow,
  teamBreakdown,
  streakBonusText,
  streakLoot,
} from './dungeon-playback';
import type { DungeonRunResponse, DungeonRunSummary } from './dungeon-types';
import { turnOrderOfRound } from './replay';
import { buildBeats, creatureHpAt, ordinal, stageStateAt } from './stage';
import { forecastNextRound } from './telegraph';
import { rowOfCreatures, roomInput, replayInput, PATH_FLOORS } from './dungeon-playback';
import {
  sampleActFight,
  sampleRoom,
  sampleRunCreatures,
  sampleSummary,
} from './dungeon-path-samples';

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

  it('sees a run that paid nothing, and one that paid in full', () => {
    expect(noRewards(lost.rewards)).toBe(true);
    expect(noRewards(cleared.rewards)).toBe(false);
    expect(noRewards(landmark.rewards)).toBe(false);
  });

  it('says it kindly and short when a run paid nothing', () => {
    expect(NO_REWARDS_LINE).toBe('No rewards this time.');
    expect(NO_REWARDS_HINT).toBe('Beat at least one room next time.');
    expect(`${NO_REWARDS_LINE} ${NO_REWARDS_HINT}`).not.toMatch(/[<>{}]/);
  });

  it('counts a run that paid only a supply as a run that paid something', () => {
    const onlySupply = { ...lost.rewards, supplies: ['lure-basic'] };
    expect(noRewards(onlySupply)).toBe(false);
    // Runs stored before the dungeon dropped supplies have no list: read as none.
    expect(noRewards({ ...lost.rewards })).toBe(true);
    expect(droppedSupplies({})).toEqual([]);
  });

  it('lists the supplies a run dropped, counted by id with the content names, and puts them in the loot', () => {
    const rewards = { ...cleared.rewards, supplies: ['lure-basic', 'lantern-good', 'lure-basic'] };
    expect(droppedSupplies(rewards)).toEqual([
      { id: 'lure-basic', name: 'Plain Lure', amount: 2 },
      { id: 'lantern-good', name: 'Glow Lantern', amount: 1 },
    ]);
    expect(rewardLoot(rewards).supplies).toEqual(['lure-basic', 'lantern-good', 'lure-basic']);
    // The fixture of a cleared run (captured from the server) carries its supply.
    expect(droppedSupplies(cleared.rewards).length).toBeGreaterThan(0);
  });

  it('makes a loot list of the gear and the parts, with no blueprints', () => {
    const loot = rewardLoot(landmark.rewards);
    expect(loot.gear).toHaveLength(1);
    expect(loot.gear[0]?.baseId).toBe(landmark.rewards.gear[0]?.baseId);
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
    expect(strip.map((r) => r.title)).toEqual(['Room 1', 'Room 2', 'Floor boss']);
    expect(strip.map((r) => r.kind)).toEqual(['foe', 'foe', 'boss']);
    expect(strip.map((r) => r.foeId)).toEqual(cleared.rooms.map((r) => r.foe.id));
    expect(strip.every((r) => r.state === 'cleared' && r.banner === 'CLEARED')).toBe(true);
    expect(strip.every((r) => r.foeHp === null)).toBe(true);
  });

  it('puts the panels in room order whatever order the server lists them in', () => {
    const shuffled = { rooms: [...cleared.rooms].reverse() };
    expect(roomStrip(shuffled).map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it('says DEFEATED for the room that was lost, with the foe HP left, and LOCKED for those after it', () => {
    const strip = roomStrip(lost);
    expect(strip.map((r) => r.state)).toEqual(['defeat', 'locked', 'locked']);
    expect(strip.map((r) => r.banner)).toEqual(['DEFEATED', 'LOCKED', 'LOCKED']);
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
    const down = teamBreakdown({ team: [{ ...member, hpEnd: 0 }], rewards: lost.rewards })[0];
    expect(down?.knockedOut).toBe(true);
    expect(down?.hp.startsWith('0 / ')).toBe(true);
    expect(down?.spoken).toContain('knocked out');
    const up = teamBreakdown({ team: [{ ...member, hpEnd: 5 }], rewards: lost.rewards })[0];
    expect(up?.knockedOut).toBe(false);
    expect(up?.spoken).not.toContain('knocked out');
  });

  it('says what the run paid each creature in experience, and nothing for a run from before it', () => {
    const member = cleared.team[0];
    if (member === undefined) throw new Error('fixture has a team');
    const paid = {
      creatureId: member.id,
      gained: 180,
      treat: true,
      levelBefore: 4,
      level: 5,
      exp: 20,
      needed: 175,
      waiting: false,
      gold: false,
    };
    const withExp = teamBreakdown({
      team: [member],
      rewards: { ...cleared.rewards, experience: [paid] },
    })[0];
    expect(withExp?.exp).toMatchObject({
      kind: 'experience',
      from: 4,
      to: 5,
      gained: 180,
      gold: false,
      waiting: false,
    });
    expect(withExp?.exp?.legs.at(-1)).toEqual({ level: 5, max: 175, from: 0, to: 20 });
    // A run stored before the breakdown: the treat of its flag, at the usual doubling.
    expect(withExp?.exp?.boost?.parts).toEqual([{ source: 'treat', name: 'Treat', times: 2 }]);
    // The day's Boons and Omens of a run's older fields go into the same breakdown, never a line.
    const day = teamBreakdown({
      team: [member],
      rewards: {
        ...cleared.rewards,
        experience: [{ ...paid, treat: false, dayEffects: [{ name: 'Cold Snap', bp: -2000 }] }],
      },
    })[0];
    expect(day?.exp?.boost).toEqual({
      parts: [{ source: 'day', name: 'Cold Snap', bp: -2000 }],
      totalBp: 8000,
    });
    // Another creature's award is not this one's.
    const other = teamBreakdown({
      team: [member],
      rewards: { ...cleared.rewards, experience: [{ ...paid, creatureId: 'someone-else' }] },
    })[0];
    expect(other?.exp).toBeNull();
    const old = { ...cleared.rewards };
    delete old.experience;
    expect(teamBreakdown({ team: [member], rewards: old })[0]?.exp).toBeNull();
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

  it('calls the last room the floor boss, and says it all in one sentence', () => {
    const view = roomIntroView(room(2, 'boss'), 3);
    expect(view.heading).toBe('FLOOR BOSS');
    expect(view.boss).toBe(true);
    expect(view.spoken).toBe(
      'Room 3 / 3, floor boss: Puddle Imp. Flooded: Tide creatures hit 20% harder.',
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

describe('the fights of a path', () => {
  const room = sampleRoom();

  it('plays the one room an open run just played, in the row of the run', () => {
    const answer = sampleActFight();
    const input = roomInput(answer.state.team, room, false, 7);
    expect(input.rooms).toEqual([room]);
    expect(input.total).toBe(7);
    expect(input.landmark).toBe(false);
    expect(stageRow(input).map((r) => r.name)).toEqual(['Sproutle', 'Splashet', 'Cindle']);
    expect(stageRow(input).map((r) => r.position)).toEqual([0, 1, 2]);
    expect(nextRoom(input, 0)).toBeNull();
  });

  it('plays each room of a path replay in the row that fought it (a camp swap changes the row)', () => {
    const path = parseDungeonReplay(replayPathFixture);
    const input = replayInput(path);
    // The replay's own row is the starting one; the rooms after the camp carry the swapped row.
    expect(stageRow(input).map((r) => r.name)).toEqual(['Sproutle', 'Splashet', 'Cindle']);
    const rows = input.rooms.map((r) => roomStageRow(input, r).map((e) => e.name));
    expect(rows[0]).toEqual(['Sproutle', 'Splashet', 'Cindle']);
    expect(rows[1]).toEqual(['Splashet', 'Sproutle', 'Zipmouse']);
    expect(rows[3]).toEqual(['Splashet', 'Sproutle', 'Zipmouse']);
    const second = input.rooms[1];
    if (second === undefined) throw new Error('room');
    expect(roomStageRow(input, second).map((e) => e.position)).toEqual([0, 1, 2]);
    expect(roomStageRow(input, second).every((e) => e.owner === 'p1')).toBe(true);
  });

  it('falls back to the replay row for a room with no row of its own', () => {
    const [first] = replay.rooms;
    if (first === undefined) throw new Error('room');
    const input = replayInput(replay);
    expect(first.row).toBeUndefined();
    expect(roomStageRow(input, first)).toEqual(stageRow(replay));
  });

  it("plays the live fight after a move in the answer's room row, else in the state's team", () => {
    const answer = parseDungeonAct(actFightFixture);
    if (answer.room === undefined) throw new Error('room');
    expect(answer.room.row).toBeDefined();
    const withRow = roomInput(answer.state.team, answer.room, false, 7);
    expect(withRow.row).toEqual(answer.room.row);
    // A swapped row in the room wins over the state's team.
    const swapped = (answer.room.row ?? []).map((r) => ({ ...r, name: `${r.name} II` }));
    const own = roomInput(answer.state.team, { ...answer.room, row: swapped }, false, 7);
    expect(roomStageRow(own, own.rooms[0] ?? answer.room).map((r) => r.name)).toEqual(
      swapped.map((r) => r.name),
    );
    // Without a row of its own the room is played in the run's team.
    const bare = { ...answer.room };
    delete bare.row;
    const fallback = roomInput(answer.state.team, bare, false, 7);
    expect(fallback.row.map((r) => r.id)).toEqual(answer.state.team.map((c) => c.id));
  });

  it('writes the row of the run the way a replay writes it', () => {
    const row = rowOfCreatures(sampleRunCreatures());
    expect(row.map((r) => r.species)).toEqual(['sproutle', 'splashet', 'cindle']);
    expect(row.map((r) => r.id)).toEqual(sampleRunCreatures().map((c) => c.id));
    // The same three creatures as the replay fixture's row: the stage reads them the same.
    expect(row).toEqual(replay.row);
  });

  it('watches a stored three-room run against its rooms, and a path run against its floors', () => {
    expect(replayInput(replay)).toMatchObject({ total: 3, landmark: false });
    expect(replayInput(replay).rooms).toHaveLength(3);
    const path = {
      ...replay,
      rooms: replay.rooms.map((r, i) => ({ ...r, node: `f${String(i)}l0` })),
    };
    expect(replayInput(path).total).toBe(PATH_FLOORS);
    expect(PATH_FLOORS).toBe(7);
    expect(
      replayInput({ ...replay, summary: { ...replay.summary, landmark: true } }).landmark,
    ).toBe(true);
  });

  it('opens a fight with FIGHT and its floor, an elite with "Fierce" and the Elite flag', () => {
    const fight = roomIntroView(room, 7);
    expect(fight).toMatchObject({
      heading: 'FIGHT',
      place: 'Room 1 / 7',
      elite: false,
      boss: false,
      foeName: 'Bramble Hound',
    });
    const elite = roomIntroView({ ...room, node: 'f2l1', elite: true }, 7);
    expect(elite).toMatchObject({
      heading: 'FIGHT',
      place: 'Room 3 / 7',
      elite: true,
      foeName: 'Fierce Bramble Hound',
    });
    expect(elite.spoken).toContain('Room 3 / 7, elite: Fierce Bramble Hound.');
  });

  it('names the boss room of a path by its floor', () => {
    const boss = roomIntroView({ ...room, kind: 'boss', node: 'f6l1' }, 7);
    expect(boss.heading).toBe('FLOOR BOSS');
    expect(boss.place).toBe('Room 7 / 7');
    expect(boss.spoken).toContain('Room 7 / 7, floor boss');
  });

  it('puts "Fierce" on the stage boss and in the result line of an elite, once', () => {
    expect(roomBoss({ ...room, elite: true }).name).toBe('Fierce Bramble Hound');
    expect(roomBoss(room).name).toBe('Bramble Hound');
    expect(roomResultLine({ ...room, elite: true })).toBe('Fierce Bramble Hound defeated.');
    expect(roomResultLine({ ...room, cleared: false, elite: true })).toBe(
      'Your team could not beat Fierce Bramble Hound.',
    );
    const named = { ...room, foe: { ...room.foe, name: 'Fierce Bramble Hound' }, elite: true };
    expect(roomBoss(named).name).toBe('Fierce Bramble Hound');
  });

  it('keeps the old banner for a room of a three-room run', () => {
    expect(
      roomIntroView(replay.rooms[0] as NonNullable<(typeof replay.rooms)[0]>, 3),
    ).toMatchObject({
      heading: 'ROOM 1',
      place: '1 / 3',
      elite: false,
    });
  });
});

describe('the end report of a path run', () => {
  it('shows only the fights that were played, named by their order, an elite as Elite', () => {
    const home = roomStrip(sampleSummary('home'));
    expect(home.map((r) => r.title)).toEqual(['Fight 1', 'Elite']);
    expect(home.map((r) => r.state)).toEqual(['cleared', 'cleared']);
    expect(home[1]?.foeName).toBe('Fierce Drift Wisp');
    expect(home[1]?.elite).toBe(true);
    expect(home[0]?.elite).toBe(false);
    const cleared = roomStrip(sampleSummary('cleared'));
    expect(cleared.map((r) => r.title)).toEqual(['Fight 1', 'Elite', 'Fight 3', 'Floor boss']);
  });

  it('leaves the rooms never reached out, and marks the lost one', () => {
    const base = sampleSummary('cleared');
    const withUnplayed = {
      ...base,
      rooms: base.rooms.map((r, i) => (i === 3 ? { ...r, played: false, cleared: false } : r)),
    };
    expect(roomStrip(withUnplayed)).toHaveLength(3);
    const lost = roomStrip(sampleSummary('defeat'));
    expect(lost.map((r) => r.state)).toEqual(['cleared', 'defeat']);
    expect(lost[1]?.foeHp).toBe(
      `120 / ${String(sampleSummary('defeat').rooms[1]?.foe.hpMax)} HP left`,
    );
    expect(lost[1]?.spoken).toMatch(/defeat\.$/);
  });

  it('still shows all three rooms of an old run, the unreached ones locked', () => {
    expect(roomStrip(lost)).toHaveLength(3);
  });
});
