import { describe, expect, it } from 'vitest';
import { RULES, createSeededRng, readinessBand } from '@creatures/game';
import { forecastFinale, forecastWeek, simulateFight, type FightInput } from '../src/index';
import { randomInput } from './helpers';

const finale = (seed: string): FightInput => ({
  ...randomInput(seed, 5, 'finale'),
  luck: RULES.combat.luck,
});

describe('forecastFinale', () => {
  it('is deterministic for a seed and reports the boss HP left', () => {
    const input = finale('forecast-a');
    const a = forecastFinale(input, createSeededRng('f'));
    const b = forecastFinale(input, createSeededRng('f'));
    expect(a).toEqual(b);
    expect(a.hpLeft).toBe(input.bossHpPool.current);
    expect(Number.isInteger(a.damage)).toBe(true);
    expect(a.damage).toBeGreaterThan(0);
  });

  it('measures damage against a boss that cannot fall, whatever the real pool', () => {
    const input = finale('forecast-b');
    const small: FightInput = { ...input, bossHpPool: { max: 10, current: 10 } };
    const big: FightInput = { ...input, bossHpPool: { max: 10 ** 9, current: 10 ** 9 } };
    expect(forecastFinale(small, createSeededRng('f')).damage).toBe(
      forecastFinale(big, createSeededRng('f')).damage,
    );
  });

  it('forecasts the abilities at their default rounds, not the pressed ones', () => {
    const input = finale('forecast-c');
    const late: FightInput = {
      ...input,
      finaleAbilities: input.finaleAbilities.map((a) => ({ ...a, fireAtRound: 12 })),
    };
    expect(forecastFinale(late, createSeededRng('f'))).toEqual(
      forecastFinale(input, createSeededRng('f')),
    );
  });

  it('does not change the input and never uses the seed of the real fight', () => {
    const input = finale('forecast-d');
    const before = JSON.stringify(input);
    forecastFinale(input, createSeededRng('forecast'));
    expect(JSON.stringify(input)).toBe(before);
    // The real fight (any other seed) is unaffected by having forecast first.
    const first = simulateFight(input, createSeededRng('real'));
    forecastFinale(input, createSeededRng('another'));
    expect(simulateFight(input, createSeededRng('real')).events).toEqual(first.events);
  });

  it('averages over fresh seeds: damage is close to the mean of single runs', () => {
    const input = finale('forecast-e');
    const one = forecastFinale(input, createSeededRng('x'), 1).damage;
    const many = forecastFinale(input, createSeededRng('x'), 20).damage;
    expect(Math.abs(one - many) / many).toBeLessThan(0.1);
  });

  it('feeds readinessBand: a boss with almost no HP left is strong, one with huge HP a long shot', () => {
    const input = finale('forecast-f');
    const easy = forecastFinale(
      { ...input, bossHpPool: { max: 100, current: 100 } },
      createSeededRng('f'),
    );
    const hard = forecastFinale(
      { ...input, bossHpPool: { max: 10 ** 9, current: 10 ** 9 } },
      createSeededRng('f'),
    );
    expect(readinessBand(easy)).toBe('strong');
    expect(readinessBand(hard)).toBe('long_shot');
  });

  it('rejects a bad sample count', () => {
    const input = finale('forecast-g');
    expect(() => forecastFinale(input, createSeededRng('f'), 0)).toThrow(RangeError);
    expect(() => forecastFinale(input, createSeededRng('f'), 1.5)).toThrow(RangeError);
  });
});

describe('forecastWeek', () => {
  const week = (seed: string) => {
    const f = finale(seed);
    return {
      phase1: { ...f, phase: 'phase1' as const, finaleAbilities: [] },
      phase2: { ...f, phase: 'phase2' as const, finaleAbilities: [] },
      finale: f,
    };
  };

  it('estimates the finale damage and the HP left after the two phases, deterministically', () => {
    const inputs = week('week-a');
    const a = forecastWeek(inputs, createSeededRng('w'));
    expect(forecastWeek(inputs, createSeededRng('w'))).toEqual(a);
    expect(a.damage).toBeGreaterThan(0);
    expect(a.hpLeft).toBeGreaterThanOrEqual(1);
    expect(a.hpLeft).toBeLessThan(inputs.finale.bossHpPool.max);
  });

  it('agrees with the finale forecast of a fight that starts where the week predicts', () => {
    const inputs = week('week-b');
    const w = forecastWeek(inputs, createSeededRng('w'), 10);
    const f = forecastFinale(
      { ...inputs.finale, bossHpPool: { max: inputs.finale.bossHpPool.max, current: w.hpLeft } },
      createSeededRng('f'),
      10,
    );
    // Same quantity, different seeds and adaptation: the damage is close.
    expect(Math.abs(f.damage - w.damage) / w.damage).toBeLessThan(0.15);
  });

  it('never goes below 1 HP left and rejects a bad sample count', () => {
    const inputs = week('week-c');
    const tiny = (i: FightInput): FightInput => ({ ...i, bossHpPool: { max: 5, current: 5 } });
    const w = forecastWeek(
      { phase1: tiny(inputs.phase1), phase2: tiny(inputs.phase2), finale: tiny(inputs.finale) },
      createSeededRng('w'),
    );
    expect(w.hpLeft).toBe(1);
    expect(() => forecastWeek(inputs, createSeededRng('w'), 0)).toThrow(RangeError);
  });
});
