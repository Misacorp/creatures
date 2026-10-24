import { dungeonContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { outcomeLine } from './after-action';
import { landmarkLine } from './dungeon-text';
import { modifierGimmicks, roomIntroView, roomMoves, roomTrick } from './dungeon-playback';
import { parseDungeonToday } from './dungeon-parse';
import todayFixture from './fixtures/dungeon-today.json';
import { revealSummary } from './live';
import { isEvent, parseReplayView, parseStats, type PhaseResultView } from './raid-api';
import { stepMark } from './raid-timeline';
import statsCloseWin from './fixtures/raid-stats-close-win.json';
import type { DungeonReplayRoom } from './dungeon-types';

describe('the new fight events are accepted, and unknown ones still refused', () => {
  it('accepts heal, cleanse, charge, retreat and enrage', () => {
    for (const t of ['heal', 'cleanse', 'charge', 'retreat', 'enrage']) {
      expect(isEvent({ t, round: 3 }), t).toBe(true);
    }
    expect(isEvent({ t: 'explode', round: 3 })).toBe(false);
  });
});

const stats = { ...parseStats(statsCloseWin), retreated: false, enraged: false };

describe('the result wording of a stage', () => {
  it('says a cleared phase retreated, and an enraged finale says so', () => {
    expect(outcomeLine({ ...stats, phase: 'phase1', outcome: 'cleared', retreated: true })).toBe(
      `Phase 1 cleared after ${String(stats.rounds)} / ${String(stats.maxRounds)} rounds: the boss retreated.`,
    );
    const finale = { ...stats, phase: 'finale' as const, enraged: true };
    expect(outcomeLine({ ...finale, outcome: 'missed' })).toBe(
      `Finale not cleared after ${String(stats.maxRounds)} rounds. Out of time, the boss enraged.`,
    );
    expect(outcomeLine({ ...finale, outcome: 'cleared' })).toContain('even with the boss enraged');
    expect(outcomeLine({ ...finale, outcome: 'wiped' })).toContain(
      'Out of time, the boss had enraged.',
    );
  });

  it('reads absent flags as false: the plain lines are as they were', () => {
    expect(outcomeLine({ ...stats, outcome: 'cleared' })).toBe(
      `${outcomeLine({ ...stats, outcome: 'cleared', retreated: false, enraged: false })}`,
    );
    expect(outcomeLine({ ...stats, phase: 'phase1', outcome: 'cleared' })).not.toContain(
      'retreated',
    );
  });

  it('puts it on the timeline mark and in the finale reveal', () => {
    const result: PhaseResultView = {
      phase: 'phase1',
      at: 1,
      cleared: true,
      retreated: true,
      rounds: 6,
      bossHpMax: 100,
      bossHpStart: 100,
      bossHpEnd: 70,
      damage: 30,
      reactions: 1,
      top: [],
      essence: 12,
      rankChange: null,
      festivalGrant: null,
    };
    expect(stepMark(result).summary).toBe(
      'Phase 1 cleared: the boss retreated. You got 12 Essence.',
    );
    const older: PhaseResultView = { ...result };
    delete older.retreated;
    expect(stepMark(older).summary).toBe('Phase 1: cleared. You got 12 Essence.');
    expect(revealSummary({ cleared: false, essence: 3, enraged: true }).outcome).toBe(
      'The boss held on. Out of time, it enraged. Not cleared.',
    );
    expect(revealSummary({ cleared: true, essence: 3, enraged: true }).outcome).toContain(
      'enraged',
    );
    expect(revealSummary({ cleared: false, essence: 3 }).outcome).toBe(
      'The boss held on. Not cleared.',
    );
  });
});

describe('the replay and stats the server sends', () => {
  const replay = {
    weekId: '2026-W41',
    party: 1,
    phase: 'phase1',
    at: 5,
    boss: {
      id: 'tidal-colossus',
      name: 'Tidal Colossus',
      retreat: { phase1: 'It sinks.', phase2: 'It sinks again.' },
    },
    rounds: 5,
    cleared: true,
    retreated: true,
    enraged: false,
    bossHpMax: 100,
    bossHpStart: 100,
    bossHpEnd: 70,
    you: null,
    row: [],
    events: [
      { t: 'round_start', round: 1, bossHp: 100, mark: null },
      { t: 'retreat', round: 5, bossHp: 70 },
    ],
    names: { boss: 'Tidal Colossus', creatures: {} },
  };

  it('accepts the retreat lines and the flags, and also a server that sends neither', () => {
    expect(parseReplayView(replay).retreated).toBe(true);
    const older: Record<string, unknown> = { ...replay };
    delete older['retreated'];
    delete older['enraged'];
    expect(parseReplayView({ ...older, boss: { id: 'x', name: 'X' } }).events).toHaveLength(2);
  });

  it('refuses a flag that is not a boolean', () => {
    expect(() => parseReplayView({ ...replay, retreated: 'yes' })).toThrow();
    expect(() => parseStats({ ...statsCloseWin, enraged: 1 })).toThrow();
    expect(parseStats({ ...statsCloseWin, enraged: false, retreated: false }).outcome).toBe(
      'cleared',
    );
  });
});

describe('the landmark on the pre-run card', () => {
  it('names the floor boss and the move it winds up', () => {
    expect(landmarkLine({ depth: 14, foeId: 'slag-tyrant' })).toBe(
      'Depth 14, a landmark: the Slag Tyrant waits. It winds up Slag Spill a round ahead.',
    );
    expect(landmarkLine({ depth: 7, foeId: 'drowned-warden' })).toBe(
      'Depth 7, a landmark: the Drowned Warden waits. It winds up Sluice Surge a round ahead.',
    );
  });

  it('leaves out the second sentence for a boss with no signature, and copes with an unknown boss', () => {
    // A foe without a signature (the content has them on every floor boss, so use a plain foe).
    expect(landmarkLine({ depth: 7, foeId: 'puddle-imp' })).toBe(
      'Depth 7, a landmark: the Puddle Imp waits.',
    );
    expect(landmarkLine({ depth: 7, foeId: 'nobody' })).toBe(
      'Depth 7, a landmark: a floor boss waits.',
    );
  });

  it('reads landmarkBoss from the server, absent as null, and refuses a bad shape', () => {
    expect(parseDungeonToday(todayFixture).landmarkBoss ?? null).toBeNull();
    const boss = { depth: 14, foeId: 'slag-tyrant' };
    expect(parseDungeonToday({ ...todayFixture, landmarkBoss: boss }).landmarkBoss).toEqual(boss);
    expect(parseDungeonToday({ ...todayFixture, landmarkBoss: null }).landmarkBoss).toBeNull();
    expect(() => parseDungeonToday({ ...todayFixture, landmarkBoss: { depth: 'x' } })).toThrow();
    expect(() => parseDungeonToday({ ...todayFixture, landmarkBoss: true })).toThrow();
  });
});

describe('the room banner names the foe trick', () => {
  const room = (foeId: string, kind: 'foe' | 'boss'): DungeonReplayRoom =>
    ({
      index: kind === 'boss' ? 2 : 0,
      kind,
      foe: { id: foeId, name: foeId, element: 'ember', hpMax: 100 },
      modifier: { id: 'dark', name: 'Dark', description: 'Dim.' },
    }) as unknown as DungeonReplayRoom;

  it('shows the last trick of a foe in the dungeon wording, with its glyph', () => {
    const view = roomIntroView(room('ember-mite', 'foe'), 3);
    expect(view.trick).toEqual({
      glyph: 'barrage',
      name: 'Flare Up',
      line: 'Hits one random creature every 2 rounds',
    });
    expect(view.spoken).toContain('Flare Up: Hits one random creature every 2 rounds.');
    expect(roomIntroView(room('puddle-imp', 'foe'), 3).trick).toBeNull();
    expect(roomIntroView(room('nobody', 'foe'), 3).trick).toBeNull();
  });

  it('lists every move of a foe for the pre-fight drawer: the signature first at a landmark, then its own moves', () => {
    const names = (r: ReturnType<typeof room>, landmark = false) =>
      roomMoves(r, landmark).map((g) => g.name);
    expect(names(room('slag-tyrant', 'boss'))).toEqual(['Molten Shell', 'Anvil Fall']);
    expect(names(room('slag-tyrant', 'boss'), true)).toEqual([
      'Slag Spill',
      'Molten Shell',
      'Anvil Fall',
    ]);
    expect(names(room('bramble-matron', 'boss'))).toContain('Tangle');
    // A landmark only changes the boss room; the room modifier's gimmick is not a move of the foe.
    expect(names(room('ember-mite', 'foe'), true)).toEqual(['Flare Up']);
    expect(names(room('puddle-imp', 'foe'))).toEqual([]);
    expect(names(room('nobody', 'foe'))).toEqual([]);
  });

  it('shows the boss pattern normally and its signature at a landmark', () => {
    expect(roomTrick(room('slag-tyrant', 'boss'))?.name).toBe('Anvil Fall');
    expect(roomTrick(room('slag-tyrant', 'boss'), true)?.name).toBe('Slag Spill');
    // A landmark only changes the boss room.
    expect(roomTrick(room('ember-mite', 'foe'), true)?.name).toBe('Flare Up');
    const view = roomIntroView(room('slag-tyrant', 'boss'), 3, true);
    expect(view.trick?.glyph).toBe('charge');
    expect(view.trick?.line).toBe(
      'Charged: slams your strongest creature and the ones beside it every 4 rounds',
    );
  });

  it('adds the signature to the foe gimmicks only in a landmark boss room', () => {
    const boss = room('slag-tyrant', 'boss');
    expect(modifierGimmicks(boss).map((g) => g.id)).toEqual([]);
    expect(modifierGimmicks(boss, true).map((g) => g.id)).toEqual(['slag-spill']);
    expect(modifierGimmicks(room('slag-tyrant', 'foe'), true)).toEqual([]);
    expect(dungeonContent.foes.find((f) => f.id === 'slag-tyrant')?.signature?.name).toBe(
      'Slag Spill',
    );
  });
});
