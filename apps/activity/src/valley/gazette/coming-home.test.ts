import { describe, expect, it } from 'vitest';
import {
  withAllowance,
  COUNT_STEPS,
  MAX_COINS,
  MIN_COINS,
  coinCount,
  coinDelay,
  coinOffset,
  countSteps,
  flyMode,
  originOf,
  purseDisplay,
  stepText,
  targetOf,
} from './coming-home';

describe('the count-up', () => {
  it('rises without falling, starts above zero and ends exactly on the amount', () => {
    for (const amount of [1, 2, 7, 180, 4321]) {
      const steps = countSteps(amount);
      expect(steps).toHaveLength(COUNT_STEPS);
      expect(steps[0]).toBeGreaterThanOrEqual(1);
      expect(steps.at(-1)).toBe(amount);
      for (let i = 1; i < steps.length; i += 1) {
        expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1] ?? 0);
      }
    }
  });

  it('counts nothing as "+0" and clamps the step', () => {
    expect(stepText(0, 3)).toBe('+0');
    expect(stepText(180, 99)).toBe('+180');
    expect(stepText(180, -4)).toBe(`+${String(countSteps(180)[0])}`);
  });
});

describe('the allowance flies with the paper', () => {
  it('joins the Bait of the paper, or flies alone, and adds nothing for 0', () => {
    expect(withAllowance([{ resource: 'bait', amount: 12 }], 100)).toEqual([
      { resource: 'bait', amount: 112 },
    ]);
    expect(withAllowance([{ resource: 'essence', amount: 3 }], 100)).toEqual([
      { resource: 'bait', amount: 100 },
      { resource: 'essence', amount: 3 },
    ]);
    expect(withAllowance([{ resource: 'bait', amount: 12 }], 0)).toEqual([
      { resource: 'bait', amount: 12 },
    ]);
  });
});

describe('the mode', () => {
  it('does not fly under reduced motion or in a screenshot', () => {
    expect(flyMode({ reduced: false, still: false })).toBe('play');
    expect(flyMode({ reduced: true, still: false })).toBe('still');
    expect(flyMode({ reduced: false, still: true })).toBe('still');
  });
});

describe('the purse while it counts', () => {
  it('shows the total less what has not landed, ending on the total', () => {
    expect(purseDisplay(500, 57, 0)).toBe(443);
    expect(purseDisplay(500, 57, 20)).toBe(463);
    expect(purseDisplay(500, 57, 57)).toBe(500);
    expect(purseDisplay(500, 57, 999)).toBe(500);
    expect(purseDisplay(500, 57, -5)).toBe(443);
  });
});

describe('the swarm and the places', () => {
  it('flies more coins for a bigger gain, none for none', () => {
    expect(coinCount(0)).toBe(0);
    expect(coinCount(1)).toBe(MIN_COINS);
    expect(coinCount(100000)).toBe(MAX_COINS);
    expect(coinCount(60)).toBeGreaterThan(coinCount(10));
  });

  it('bursts the same way every time, one coin after another', () => {
    expect(coinOffset(3, 8)).toEqual(coinOffset(3, 8));
    expect(coinDelay(4, 8)).toBeGreaterThan(coinDelay(1, 8));
  });

  it('starts at the paper’s middle (a little high) and lands in the purse’s middle', () => {
    expect(originOf({ left: 10, top: 100, width: 200, height: 500 })).toEqual({ x: 110, y: 300 });
    expect(targetOf({ left: 300, top: 10, width: 80, height: 30 })).toEqual({ x: 340, y: 25 });
  });
});
