import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/index';
import { randomInput, rng } from './helpers';

// The test tsconfig has no DOM or Node types; both globals exist in Node and workerd.
declare const performance: { now(): number };
declare const console: { log(...args: unknown[]): void };

describe('performance', () => {
  it('runs a 15-player (45 creature) 12-round finale well under the Worker CPU budget', () => {
    // A strong boss pool so the fight really lasts all 12 rounds with everything in play.
    const inp = randomInput('perf', 15, 'finale');
    inp.bossHpPool = { max: 100_000_000, current: 100_000_000 };
    expect(inp.row).toHaveLength(45);
    // Warm up the JIT, then take the median of many runs so one slow tick cannot fail the test.
    for (let i = 0; i < 20; i++) simulateFight(inp, rng());
    const times: number[] = [];
    let events = 0;
    for (let i = 0; i < 40; i++) {
      const start = performance.now();
      const r = simulateFight(inp, rng());
      times.push(performance.now() - start);
      events = r.events.length;
      expect(r.rounds).toBe(12);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] as number;
    const worst = times[times.length - 1] as number;
    console.log(
      `15-player finale: median ${median.toFixed(2)} ms, worst ${worst.toFixed(2)} ms, ${events} events`,
    );
    expect(median).toBeLessThan(50);
  });

  it('resolves a 45-player week (three full parties, three phases each) well under budget', () => {
    const phases = ['phase1', 'phase2', 'finale'] as const;
    const times: number[] = [];
    for (let party = 0; party < 3; party++) {
      for (const phase of phases) {
        const inp = randomInput(`perf-week-${party}`, 15, phase);
        inp.bossHpPool = { max: 100_000_000, current: 100_000_000 };
        simulateFight(inp, rng()); // warm up
        const start = performance.now();
        simulateFight(inp, rng());
        times.push(performance.now() - start);
      }
    }
    const worst = Math.max(...times);
    console.log(`45-player week: worst single fight ${worst.toFixed(2)} ms`);
    expect(worst).toBeLessThan(50);
    expect(times.reduce((a, b) => a + b, 0)).toBeLessThan(250);
  });
});
