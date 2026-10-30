import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blinkRhythm, type LifeState } from './life-clock';

type Clock = typeof import('./life-clock');

interface FakeQuery {
  matches: boolean;
  addEventListener: (type: string, fn: () => void) => void;
}

let query: FakeQuery;
let change: (() => void) | undefined;

async function load(reduced: boolean): Promise<Clock> {
  vi.resetModules();
  change = undefined;
  query = {
    matches: reduced,
    addEventListener: (_type, fn) => {
      change = fn;
    },
  };
  vi.stubGlobal('matchMedia', () => query);
  return import('./life-clock');
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('subscribeLife', () => {
  it('starts the interval on the first listener and clears it on the last unsubscribe', async () => {
    const clock = await load(false);
    expect(vi.getTimerCount()).toBe(0);
    const stopA = clock.subscribeLife('a', false, () => undefined);
    const stopB = clock.subscribeLife('b', true, () => undefined);
    expect(vi.getTimerCount()).toBe(1);
    expect(clock.listenerCount()).toBe(2);
    stopA();
    expect(vi.getTimerCount()).toBe(1);
    stopB();
    expect(vi.getTimerCount()).toBe(0);
    expect(clock.listenerCount()).toBe(0);
  });

  it('notifies a blink and its end, and nothing while the state is unchanged', async () => {
    const clock = await load(false);
    const seen: LifeState[] = [];
    const stop = clock.subscribeLife('a', false, (s) => seen.push(s));
    const { period } = blinkRhythm('a');
    vi.advanceTimersByTime(period * 2);
    // Two blinks in two periods: on and off each time, never the same state twice in a row.
    expect(seen.length).toBeGreaterThanOrEqual(3);
    seen.forEach((s, i) => {
      expect(s.blink).toBe(i % 2 === 0);
    });
    const count = seen.length;
    stop();
    vi.advanceTimersByTime(period * 2);
    expect(seen.length).toBe(count);
  });

  it('runs no interval under reduced motion, and starts it when that turns off', async () => {
    const clock = await load(true);
    const seen: LifeState[] = [];
    const stop = clock.subscribeLife('a', true, (s) => seen.push(s));
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(20000);
    expect(seen).toEqual([]);
    query.matches = false;
    change?.();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(20000);
    expect(seen.length).toBeGreaterThan(0);
    // And back: the timer stops and the sprite is told to rest.
    query.matches = true;
    change?.();
    expect(vi.getTimerCount()).toBe(0);
    expect(seen[seen.length - 1]).toEqual(clock.REST);
    stop();
    expect(clock.listenerCount()).toBe(0);
  });
});
