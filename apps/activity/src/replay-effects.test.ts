import { content, createSeededRng } from '@creatures/game';
import { makeSlot, scaleBoss, simulateFight, type FightInput } from '@creatures/engine';
import type { FightEvent } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { initialStep, stateAt } from './replay';

const roundStart = (round: number): FightEvent => ({
  t: 'round_start',
  round,
  bossHp: 1000,
  mark: null,
});
const turn = (round: number, creature: string): FightEvent => ({ t: 'turn', round, creature });
const roundEnd = (round: number, bossHp = 1000): FightEvent => ({ t: 'round_end', round, bossHp });
const apply = (
  round: number,
  target: string | null,
  stacks: number,
  turnsLeft: number,
  stacksAdded = stacks,
): FightEvent => ({
  t: 'effect_apply',
  round,
  target,
  effect: 'mired',
  stacksAdded,
  stacks,
  turnsLeft,
});

const at = (events: readonly FightEvent[], n = events.length) => stateAt(events, n, 1000);

describe('status effects in the replay state', () => {
  it('starts with none', () => {
    expect(initialStep(10)).toMatchObject({ bossEffects: [], creatureEffects: {} });
  });

  it('shows an applied effect on the boss with its stacks and turns', () => {
    const s = at([roundStart(1), apply(1, null, 2, 3)]);
    expect(s.bossEffects).toEqual([{ effect: 'mired', stacks: 2, turnsLeft: 3 }]);
  });

  it('stacks and refreshes: the event carries the new total and a full timer', () => {
    const s = at([roundStart(1), apply(1, null, 2, 3), apply(1, null, 5, 3, 3)]);
    expect(s.bossEffects).toEqual([{ effect: 'mired', stacks: 5, turnsLeft: 3 }]);
  });

  it('counts the boss down once a round, at the end of its turn', () => {
    const events = [roundStart(1), apply(1, null, 1, 3), roundEnd(1), roundStart(2)];
    expect(at(events).bossEffects[0]?.turnsLeft).toBe(2);
    expect(at([...events, roundEnd(2)]).bossEffects[0]?.turnsLeft).toBe(1);
  });

  it('does not count the boss down in a round it retreated', () => {
    const events: FightEvent[] = [
      roundStart(1),
      apply(1, null, 1, 3),
      { t: 'retreat', round: 1, bossHp: 400 },
      roundEnd(1, 400),
    ];
    expect(at(events).bossEffects[0]?.turnsLeft).toBe(3);
  });

  it('removes an effect that expired', () => {
    const s = at([
      roundStart(1),
      apply(1, null, 1, 1),
      { t: 'effect_expire', round: 1, target: null, effect: 'mired' },
      roundEnd(1),
    ]);
    expect(s.bossEffects).toEqual([]);
  });

  it('removes what the boss purged', () => {
    const s = at([
      roundStart(1),
      apply(1, null, 3, 3),
      { t: 'effect_purge', round: 1, removed: [{ effect: 'mired', stacks: 3 }] },
    ]);
    expect(s.bossEffects).toEqual([]);
  });

  it('removes what a reaction consumed', () => {
    const s = at([
      roundStart(1),
      apply(1, null, 4, 3),
      {
        t: 'effect_consume',
        round: 1,
        reaction: 'flare',
        effect: 'mired',
        stacks: 4,
        bonusBp: 1200,
      },
    ]);
    expect(s.bossEffects).toEqual([]);
  });

  it('tracks a creature: apply, count down after its own turn, cleanse', () => {
    const start = [roundStart(1), apply(1, 'a', 2, 3)];
    expect(at(start).creatureEffects['a']).toEqual([{ effect: 'mired', stacks: 2, turnsLeft: 3 }]);
    // Its turn, then the next creature's turn: a's turn is over, so one less.
    const after = [...start, turn(2, 'a'), turn(2, 'b')];
    expect(at(after).creatureEffects['a']?.[0]?.turnsLeft).toBe(2);
    // The creature's own turn is not over yet while it is acting.
    expect(at([...start, turn(2, 'a')]).creatureEffects['a']?.[0]?.turnsLeft).toBe(3);
    const cleansed: FightEvent = {
      t: 'effect_cleanse',
      round: 2,
      supporter: 'b',
      target: 'a',
      effect: 'mired',
      stacks: 2,
    };
    expect(at([...start, cleansed]).creatureEffects).toEqual({});
  });

  it('removes a creature’s effects when it is knocked out, and when one expires', () => {
    const start = [roundStart(1), apply(1, 'a', 2, 3), apply(1, 'b', 1, 3)];
    const out = at([...start, { t: 'knockout', round: 1, creature: 'a' }]);
    expect(Object.keys(out.creatureEffects)).toEqual(['b']);
    const expired = at([...start, { t: 'effect_expire', round: 1, target: 'b', effect: 'mired' }]);
    expect(Object.keys(expired.creatureEffects)).toEqual(['a']);
  });

  it('agrees with the engine: an effect expires exactly when the replay counted it down to 1 turn', () => {
    const boss = content.bosses.find((b) => b.id === 'old-bogback');
    if (boss === undefined) throw new Error('no Old Bogback');
    const row = content.creatures
      .filter((c) => c.stage === 1)
      .slice(0, 6)
      .map((sp, k) =>
        makeSlot(sp, { id: `c${String(k)}`, ownerId: null, level: 12, fusionCount: 0 }),
      );
    const scaled = scaleBoss(boss, 3, 1);
    const hp = scaled.maxHp * 1000;
    const input: FightInput = {
      boss,
      bossAtk: Math.max(1, Math.floor(scaled.atk / 20)),
      phase: 'finale',
      bossHpPool: { max: hp, current: hp },
      adaptation: null,
      row,
      players: [],
      finaleAbilities: [],
      effects: { dice: 4 },
    };
    const events = simulateFight(input, createSeededRng('mired')).events;
    const applied = events.filter((e) => e.t === 'effect_apply').length;
    const expired = events.filter((e) => e.t === 'effect_expire');
    expect(applied).toBeGreaterThan(0);
    expect(expired.length).toBeGreaterThan(0);
    events.forEach((e, i) => {
      if (e.t !== 'effect_expire') return;
      const before = stateAt(events, i, hp);
      const list =
        e.target === null ? before.bossEffects : (before.creatureEffects[e.target] ?? []);
      expect(list.find((x) => x.effect === e.effect)?.turnsLeft).toBe(1);
    });
    // And no effect is ever shown with no turns left.
    for (let i = 0; i <= events.length; i++) {
      const s = stateAt(events, i, hp);
      for (const x of [...s.bossEffects, ...Object.values(s.creatureEffects).flat()]) {
        expect(x.turnsLeft).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
