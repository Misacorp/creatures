import { RULES, createSeededRng } from '@creatures/game';
import {
  PROC_KINDS,
  liveFightRules,
  makeSlot,
  planRounds,
  scaleBoss,
  simulateFight,
  type FightEvent,
  type FightInput,
  type FightSlot,
  type SlotMods,
} from '@creatures/engine';
import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { isEvent } from './raid-api';
import { stateAt } from './replay';
import { PROC_WORDS, cuesForEvents, creatureHpAt } from './stage';

/**
 * What the stage and the replay do with the events of the chance lines and trigger lines (the engine's
 * `proc` event, a `heal` with a cause, a `boss_hit` with `sidestep` or `stubborn`): the client accepts
 * them, shows a word or a number for each, and keeps every creature's HP and the boss's HP the way the
 * engine did.
 */

const ROW = ['a', 'b', 'c'];
const start = (round = 1): FightEvent => ({ t: 'round_start', round, bossHp: 1_000, mark: null });
const cuesOf = (events: FightEvent[]) => cuesForEvents(events, 0, events.length, ROW);
const floats = (events: FightEvent[]) =>
  cuesOf(events)
    .filter((c) => c.kind === 'float')
    .map((c) => [c.target, c.text, c.tone]);

describe('the client accepts the new events', () => {
  it('knows the proc event, and every kind has a word for the stage', () => {
    const e: FightEvent = { t: 'proc', round: 2, creature: 'a', kind: 'payback', amount: 3_000 };
    expect(isEvent(e)).toBe(true);
    for (const kind of PROC_KINDS) expect(PROC_WORDS[kind], kind).toMatch(/^[A-Z]/);
  });

  it('a proc is something to look at in a playback beat (the round has time for it)', () => {
    const quiet = planRounds([start(), { t: 'round_end', round: 1, bossHp: 1_000 }]);
    const proc = planRounds([
      start(),
      { t: 'proc', round: 1, creature: 'a', kind: 'ember_tail', amount: 2_000 },
      { t: 'round_end', round: 1, bossHp: 1_000 },
    ]);
    expect(proc[0]?.beats.some((b) => b.visible)).toBe(true);
    expect(quiet[0]?.beats.some((b) => b.visible)).toBe(false);
  });
});

describe('the cues of a proc', () => {
  it('floats a word over the creature whose line fired', () => {
    expect(
      floats([
        start(),
        { t: 'proc', round: 1, creature: 'b', kind: 'stubborn' },
        { t: 'proc', round: 1, creature: 'c', kind: 'payback', amount: 3_000 },
        { t: 'proc', round: 1, creature: 'a', kind: 'steady_paws' },
      ]),
    ).toEqual([
      ['b', 'Stubborn!', 'buff'],
      ['c', 'Payback', 'buff'],
      ['a', 'Steady', 'buff'],
    ]);
  });

  it('shows a boost for another creature as +N% over the one that gets it', () => {
    const events: FightEvent[] = [
      start(),
      { t: 'proc', round: 1, creature: 'a', kind: 'kindling', target: 'b', amount: 4_000 },
      { t: 'proc', round: 1, creature: 'a', kind: 'warm_heart', target: 'b', amount: 1_000 },
    ];
    expect(floats(events)).toEqual([
      ['b', '+40%', 'buff'],
      ['b', '+10%', 'buff'],
    ]);
    // The creature whose line it is hops.
    expect(cuesOf(events).filter((c) => c.kind === 'hop')).toHaveLength(2);
  });

  it('shows an Echo as a number over the boss', () => {
    expect(
      floats([
        start(),
        { t: 'proc', round: 1, creature: 'a', kind: 'echo', amount: 300, bossHp: 600 },
      ]),
    ).toEqual([[null, '300', 'hit']]);
  });

  it('shows a dodge followed by Momentum and Riposte as Dodged!, a word, then a hop and a number on the boss', () => {
    const events: FightEvent[] = [
      start(),
      { t: 'boss_hit', round: 1, source: 'attack', target: 'b', damage: 0, dodged: true },
      { t: 'proc', round: 1, creature: 'b', kind: 'momentum', amount: 1_200 },
      { t: 'proc', round: 1, creature: 'b', kind: 'riposte', amount: 40, bossHp: 960 },
    ];
    const cues = cuesOf(events);
    expect(cues.some((c) => c.kind === 'flash')).toBe(false);
    expect(floats(events)).toEqual([
      ['b', 'Dodged!', 'dodge'],
      ['b', 'Momentum', 'buff'],
      [null, '40', 'hit'],
    ]);
    expect(cues.filter((c) => c.kind === 'hop').map((c) => [c.i, c.creature])).toEqual([[3, 'b']]);
  });

  it('shows a Sidestep as a word, with no hit flash and no shake', () => {
    const events: FightEvent[] = [
      start(),
      { t: 'boss_hit', round: 1, source: 'gimmick', target: 'b', damage: 0, sidestep: true },
    ];
    const cues = cuesOf(events);
    expect(cues.filter((c) => c.kind === 'float').map((c) => [c.target, c.text, c.tone])).toEqual([
      ['b', 'SIDESTEP', 'blocked'],
    ]);
    expect(cues.some((c) => c.kind === 'flash' || c.kind === 'shake')).toBe(false);
  });

  it('shows a second wind as a green number over the creature (a heal event with a cause)', () => {
    expect(
      floats([
        start(),
        { t: 'heal', round: 1, supporter: 'a', target: 'a', amount: 25, cause: 'second_wind' },
      ]),
    ).toEqual([['a', '+25', 'heal']]);
  });
});

describe('HP from the events', () => {
  it('Stubborn leaves the creature at 1 HP although the hit shows its full damage', () => {
    const events: FightEvent[] = [
      { t: 'boss_hit', round: 1, source: 'attack', target: 'a', damage: 500, stubborn: true },
      { t: 'proc', round: 1, creature: 'a', kind: 'stubborn' },
      { t: 'boss_hit', round: 2, source: 'attack', target: 'a', damage: 500 },
    ];
    expect(creatureHpAt(events, 2, { a: 100 })).toEqual({ a: 1 });
    expect(creatureHpAt(events, 3, { a: 100 })).toEqual({ a: 0 });
  });

  it('a Sidestep takes nothing, a second wind or breath heals, and Echo moves the boss HP', () => {
    const events: FightEvent[] = [
      { t: 'boss_hit', round: 1, source: 'gimmick', target: 'a', damage: 0, sidestep: true },
      { t: 'boss_hit', round: 1, source: 'attack', target: 'a', damage: 40 },
      { t: 'heal', round: 2, supporter: 'a', target: 'a', amount: 25, cause: 'second_wind' },
      { t: 'heal', round: 3, supporter: 'a', target: 'a', amount: 10, cause: 'second_breath' },
    ];
    expect(creatureHpAt(events, 1, { a: 100 })).toEqual({ a: 100 });
    expect(creatureHpAt(events, 4, { a: 100 })).toEqual({ a: 95 });
    const echo: FightEvent[] = [
      start(),
      {
        t: 'hit',
        round: 1,
        creature: 'a',
        damage: 100,
        matchupBp: 10_000,
        bonusBp: 0,
        mark: null,
        bossHp: 900,
      },
      { t: 'proc', round: 1, creature: 'a', kind: 'echo', amount: 30, bossHp: 870 },
    ];
    expect(stateAt(echo, 3, 1_000).bossHp).toBe(870);
    // A proc that did not touch the boss leaves its HP where it was.
    expect(
      stateAt(
        [...echo, { t: 'proc', round: 1, creature: 'b', kind: 'payback', amount: 1 }],
        4,
        1_000,
      ).bossHp,
    ).toBe(870);
  });
});

describe('the stage reads a real fight of every line the way the engine ended it', () => {
  const ALL: SlotMods = {
    secondWindBp: 4_000,
    echoBp: 4_000,
    sidestepBp: 4_000,
    steadyPawsBp: 4_000,
    warmHeartBp: 4_000,
    quickRemarkBp: 4_000,
    spillOverBp: 4_000,
    paybackBp: 1_200,
    kindlingBp: 800,
    openingMark: 1,
    rallyCryBp: 900,
    emberTailBp: 1_000,
    stormWarningBp: 1_000,
    stubborn: 1,
    lastStandBp: 1_000,
    overflowBp: 900,
    secondBreathBp: 500,
    patientBp: 1_000,
    sharedWarmthBp: 200,
  };

  function fight(seed: string, players: number): { input: FightInput; events: FightEvent[] } {
    const stage1 = content.creatures.filter((c) => c.stage === 1);
    const rng = createSeededRng(`stage-${seed}`);
    const row: FightSlot[] = [];
    for (let k = 0; k < players * 3; k++) {
      const sp = stage1[rng.nextU32() % stage1.length];
      if (sp === undefined) throw new Error('no creatures');
      row.push({
        ...makeSlot(sp, {
          id: `c${String(k)}`,
          ownerId: `p${String(k % players)}`,
          level: 5 + (rng.nextU32() % 10),
          fusionCount: 0,
        }),
        mods: ALL,
      });
    }
    const boss = content.bosses[rng.nextU32() % content.bosses.length];
    if (boss === undefined) throw new Error('no bosses');
    const scaled = scaleBoss(boss, players, 3);
    const input: FightInput = {
      boss,
      bossAtk: scaled.atk,
      phase: 'finale',
      bossHpPool: { max: scaled.maxHp * 4, current: scaled.maxHp * 4 },
      adaptation: null,
      row,
      players: Array.from({ length: players }, (_, i) => `p${String(i)}`),
      finaleAbilities: [],
      rules: liveFightRules(),
      luck: RULES.combat.luck,
      enrage: { rounds: 3, powerBp: 20_000 },
    };
    const result = simulateFight(input, createSeededRng(`dice-${seed}`));
    return { input, events: result.events };
  }

  it('every creature ends with the HP the engine gave it, and the boss with its own', () => {
    let procs = 0;
    for (let i = 0; i < 10; i++) {
      const { input, events } = fight(String(i), 2 + (i % 3));
      const result = simulateFight(input, createSeededRng(`dice-${String(i)}`));
      const hp = creatureHpAt(events, events.length, result.hpStart);
      for (const [id, end] of Object.entries(result.hpEnd)) {
        expect(hp[id], `${id} in fight ${String(i)}`).toBe(end);
      }
      expect(stateAt(events, events.length, result.bossHpStart).bossHp).toBe(result.bossHpEnd);
      procs += events.filter((e) => e.t === 'proc').length;
      // Every event the engine wrote is one the client accepts.
      for (const e of events) expect(isEvent(e), e.t).toBe(true);
    }
    expect(procs).toBeGreaterThan(20);
  });
});
