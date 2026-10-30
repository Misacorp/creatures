/** Stores (V-POST-5): a full store stops picking up, counts what was missed, and a visit empties it. */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { RULES } from '../src/rules';
import { newSeat } from '../src/policy';
import { accrueSeats, collectSeat } from '../src/scouts';
import { profileById } from '../src/profiles';
import { createPlayer, createServer, addCreature } from '../src/world';
import { runServer } from '../src/sim';
import { SERVERS } from '../src/servers';
import { playersOf, runScenario } from '../src/scenarios';

function player() {
  const p = createPlayer(RULES, 'test', 1, 0, profileById('daily'), 4);
  for (let s = 0; s < 3; s++) addCreature(p, s);
  newSeat(p);
  return p;
}

describe('a store', () => {
  it('holds about three days of effective time and then stops picking up', () => {
    const p = player();
    for (let h = 0; h < 100; h++) accrueSeats(p, 1, 1);
    const seat = p.seats[0]!;
    expect(seat.store).toBe(RULES.posts.storeHours);
    expect(seat.wasted).toBe(100 - RULES.posts.storeHours);
    // The scout keeps working (mastery counts every hour) even when the store is full.
    expect(seat.mastery).toBe(100);
  });

  it('counts an away-step share of an hour the same way', () => {
    const p = player();
    for (let h = 0; h < 200; h++) accrueSeats(p, 0.5, 1);
    expect(p.seats[0]!.store).toBe(72);
    expect(p.seats[0]!.wasted).toBeCloseTo(100 - 72, 9);
  });

  it('is emptied by a visit: the finds come home and the missed ones are waste, not stock', () => {
    const p = player();
    const server = createServer(
      'test',
      1,
      { bossKills: 'half', communalSeats: true, gifts: 'acorns', essenceToProjects: false },
      RULES,
    );
    for (let h = 0; h < 100; h++) accrueSeats(p, 1, 1);
    const scrapBefore = p.stock[1]!;
    collectSeat(p, 0, server, 0);
    const seat = p.seats[0]!;
    expect(seat.store).toBe(0);
    expect(seat.wasted).toBe(0);
    expect(p.stock[1]! - scrapBefore).toBeGreaterThan(0);
    // Picked up 72 hours of work at the seat's rate; the other 28 hours show as waste only.
    expect(p.wk.waste[1]!).toBeGreaterThan(0);
    expect(p.wk.waste[1]! / p.sources.get('in:1:scouts')!).toBeCloseTo(28 / 72, 9);
    expect(p.wk.storeHours).toBe(72);
    expect(p.wk.storeLost).toBe(28);
  });

  it('wastes little for a daily player and about half for a weekly player (stores of three days)', () => {
    const result = runScenario({ ...SERVERS[1]!, id: 'stores', weeks: 6 }, 2);
    const share = (id: string): number => {
      const ps = playersOf(result, id);
      const got = ps.reduce((n, p) => n + p.weeks.reduce((m, w) => m + w.storeHours, 0), 0);
      const lost = ps.reduce((n, p) => n + p.weeks.reduce((m, w) => m + w.storeLost, 0), 0);
      return got / (got + lost);
    };
    expect(share('daily')).toBeGreaterThan(0.99);
    expect(share('weekly')).toBeLessThan(0.6);
    expect(share('weekly')).toBeGreaterThan(0.4);
  });
});

describe('a run is seeded', () => {
  it('gives the same run for the same seed and another for another seed', () => {
    const a = runServer(SERVERS[1]!, 7);
    const b = runServer(SERVERS[1]!, 7);
    const c = runServer(SERVERS[1]!, 8);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('uses only the seeded generator', () => {
    const rng = createSeededRng('x');
    expect(rng.nextU32()).toBe(createSeededRng('x').nextU32());
  });
});
