/**
 * A room of a v2 dungeon run, from real fights (the engine's own events, `workbench/dungeon-v2-sample.ts`): the room as the stage takes it,
 * the fold ending where the engine ended, the parser, and the words (a modifier that does nothing on v2 is not named, the foe's trick comes
 * from its card, no boss or foe is a wall or harder).
 */
import { describe, expect, it } from 'vitest';
import { roomFightV2 } from './dungeon-room-v2';
import { modifierActs } from './dungeon-rooms';
import { parseDungeonAct, parseDungeonReplay } from './dungeon-parse';
import { cardTrick, roomIntroView, roomStrip } from './dungeon-playback';
import { foldSetupOf, stageModelOf } from './fight-v2';
import { sampleState, sampleSummary } from './dungeon-path-samples';
import { sampleRoomV2 } from './workbench/dungeon-v2-sample';

const FIGHT = { foe: 'bramble-hound', depth: 3, level: 22, seed: 'room-a' } as const;

describe('a v2 room as the stage takes it', () => {
  it('puts the row on one row of three lanes, its Knack names on the tiles, and the foe on the one-row arena', () => {
    const { room, row } = sampleRoomV2(FIGHT);
    const fight = roomFightV2(room, row);
    expect(fight.boss).toMatchObject({ id: 'bramble-hound', rows: 1, cols: 3, hp: room.foe.hpMax });
    expect(fight.fighters.map((f) => [f.key, f.row, f.col])).toEqual([
      ['c1', 0, 0],
      ['c2', 0, 1],
      ['c3', 0, 2],
    ]);
    expect(fight.fighters.every((f) => f.owner === 'p1')).toBe(true);
    expect(fight.fighters.map((f) => f.knackName)).toEqual(
      row.map((r) => room.knacks[r.id] ?? null),
    );
    expect(fight.fighters.some((f) => f.knackName !== null)).toBe(true);
    expect(fight.rounds).toBe(room.arena.rounds);
  });

  it('folds to where the engine ended: the foe’s HP, every creature’s HP and who is out', () => {
    for (const seed of ['room-a', 'room-b', 'room-c']) {
      const { room, row } = sampleRoomV2({ ...FIGHT, seed, level: 14 });
      const fight = roomFightV2(room, row);
      const model = stageModelOf(
        foldSetupOf({ fighters: fight.fighters, card: fight.card, bossHpStart: fight.hpMax }),
        room.events,
      );
      const last = model.states[model.states.length - 1];
      expect(last?.end?.won, seed).toBe(room.cleared);
      for (const f of fight.fighters) {
        expect(last?.creatures[f.key]?.hp, `${seed} ${f.key}`).toBe(room.hpEnd[f.key]);
        expect(last?.creatures[f.key]?.out).toBe((room.hpEnd[f.key] ?? 0) <= 0);
      }
      expect(last?.bossHp).toBe(room.cleared ? 0 : last?.bossHp);
    }
  });

  it('keeps a creature that came in knocked out in its place, out from the start, and out of the fight', () => {
    const { room, row } = sampleRoomV2({ ...FIGHT, carried: [1, 0, 0.6] });
    const fight = roomFightV2(room, row);
    expect(fight.fighters.map((f) => f.startHp)).toEqual([
      room.hpMax['c1'],
      0,
      Math.round((room.hpMax['c3'] ?? 0) * 0.6),
    ]);
    expect(room.hpEnd['c2']).toBe(0);
    // It never acts and is never hit: no event names it.
    expect(room.events.some((e) => JSON.stringify(e.board ?? {}).includes('"c2"'))).toBe(false);
    const model = stageModelOf(
      foldSetupOf({ fighters: fight.fighters, card: fight.card, bossHpStart: fight.hpMax }),
      room.events,
    );
    expect(model.states[0]?.creatures['c2']?.out).toBe(true);
  });
});

describe('the parser reads a v2 room and a v2 run', () => {
  it('accepts a real room with its card, arena and Knacks, and refuses one without a card', () => {
    const { room, row } = sampleRoomV2(FIGHT);
    const replay = {
      rules: 2,
      summary: { ...sampleSummary('cleared'), rules: 2 },
      row,
      rooms: [room],
    };
    const parsed = parseDungeonReplay(replay);
    expect(parsed.rules).toBe(2);
    expect(parsed.rooms[0]?.rules).toBe(2);
    const { card: _card, ...noCard } = room;
    expect(() => parseDungeonReplay({ ...replay, rooms: [noCard] })).toThrow('dungeon replay');
    expect(() => parseDungeonReplay({ ...replay, rooms: [{ ...room, rules: 3 }] })).toThrow();
  });

  it('accepts a v2 run state, and a room of an act', () => {
    const { room } = sampleRoomV2(FIGHT);
    const answer = parseDungeonAct({ state: { ...sampleState(), rules: 2 }, room });
    expect(answer.state.rules).toBe(2);
    expect(answer.room?.rules).toBe(2);
    expect(() => parseDungeonAct({ state: { ...sampleState(), rules: 1 } })).toThrow();
  });
});

describe('the words of a v2 room', () => {
  it('names a modifier only when it does something on the run’s rules (Thorns does nothing on v2)', () => {
    expect(modifierActs({ id: 'thorns' }, undefined)).toBe(true);
    expect(modifierActs({ id: 'thorns' }, 2)).toBe(false);
    for (const id of ['flooded', 'dark', 'brittle', 'echoing', 'mud']) {
      expect(modifierActs({ id }, 2), id).toBe(true);
    }
    // A modifier the content does not know (an old run's) is shown.
    expect(modifierActs({ id: 'fog' }, 2)).toBe(true);
  });

  it('leaves Thorns out of the banner and the room strip of a v2 run, and keeps Flooded', () => {
    const { room } = sampleRoomV2(FIGHT);
    const thorns = { id: 'thorns', name: 'Thorns', description: 'Every hit sends damage back.' };
    const view = roomIntroView({ ...room, modifier: thorns }, 7);
    expect(view.modifierShown).toBe(false);
    expect(view.spoken).not.toContain('Thorns');
    expect(roomIntroView(room, 7).modifierShown).toBe(true);
    const summary = sampleSummary('cleared');
    const rooms = summary.rooms.map((r) => ({ ...r, modifier: thorns }));
    expect(roomStrip({ ...summary, rooms, rules: 2 })[0]?.modifierName).toBe('');
    expect(roomStrip({ ...summary, rooms, rules: 2 })[0]?.spoken).not.toContain('Thorns');
    expect(roomStrip({ ...summary, rooms })[0]?.modifierName).toBe('Thorns');
  });

  it('takes the banner’s trick from the foe’s card: its last move, its plain label and how often it comes', () => {
    const { room } = sampleRoomV2({ ...FIGHT, foe: 'drowned-warden', depth: 7, signature: true });
    const trick = cardTrick(room.card);
    expect(trick?.name).toBe(room.card.moves.at(-1)?.name);
    expect(trick?.line).toMatch(/every (round|\d+ rounds)$/);
    expect(roomIntroView(room, 7, true).trick).toEqual(trick);
    expect(cardTrick({ moves: [] })).toBeNull();
  });

  it('never calls a foe a wall or harder', () => {
    const { room } = sampleRoomV2({ ...FIGHT, foe: 'drowned-warden', depth: 7, signature: true });
    const view = roomIntroView(room, 7, true);
    const text = JSON.stringify([room.card, room.foe, view.trick, view.foeName]).toLowerCase();
    expect(text).not.toMatch(/\bwall\b|harder|hardest/);
  });
});
