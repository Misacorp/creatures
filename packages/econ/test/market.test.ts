/** The broker's seat and the Market as a project (V-FORGE-11): when the seat exists, how the project opens and finishes. */
import { describe, expect, it } from 'vitest';
import { contributePart, openMarket, refreshProjects, MARKET_OPENS_AT } from '../src/commons';
import { RULES } from '../src/rules';
import { ALL_SERVERS } from '../src/servers';
import { brokerSeatOn, runServer } from '../src/sim';
import { createServer } from '../src/world';
import { sum } from '../src/util';

const serverWith = (broker: 'always' | 'never' | 'market' | 'market-shards') =>
  createServer(
    'market',
    1,
    { bossKills: 'half', communalSeats: true, shardExchange: true, broker },
    RULES,
  );

describe('the broker seat', () => {
  it('exists from day one, never, or once the Market is built', () => {
    expect(brokerSeatOn(serverWith('always'))).toBe(true);
    expect(brokerSeatOn(serverWith('never'))).toBe(false);
    const market = serverWith('market');
    expect(brokerSeatOn(market)).toBe(false);
    market.marketDoneHour = 100;
    expect(brokerSeatOn(market)).toBe(true);
  });
});

describe('the Market project', () => {
  it('joins the valley once, as a level-2 project, shard-free in the first variant and with shards in the other', () => {
    for (const [mode, shards] of [
      ['market', false],
      ['market-shards', true],
    ] as const) {
      const server = serverWith(mode);
      const before = server.places.length;
      openMarket(server, 100);
      openMarket(server, 200);
      expect(server.places).toHaveLength(before + 1);
      expect(server.marketOpenedHour).toBe(100);
      refreshProjects(server, 100, RULES);
      const place = server.places.at(-1)!;
      expect(place.id).toBe('market');
      expect(place.open).toBe(true);
      // Sized like the second level's project of a place (the base times the second factor, at the server's weight).
      const c = RULES.commons;
      const level2 =
        c.baseSize *
        c.levelFactor[1]! *
        Math.pow(Math.max(server.weight, 1) / c.referenceWeight, c.sizeExponent);
      expect(place.size).toBeCloseTo(level2, 6);
      expect(place.need[2]! > 0).toBe(shards);
    }
  });

  it('is built once: the seat appears, the project does not open again', () => {
    const server = serverWith('market');
    openMarket(server, 0);
    refreshProjects(server, 0, RULES);
    const index = server.places.length - 1;
    const place = server.places[index]!;
    for (let part = 0; part < 3; part++) contributePart(server, index, part, 1e9, 500, RULES);
    expect(server.marketDoneHour).toBe(500);
    expect(place.open).toBe(false);
    expect(place.opensAt).toBe(Infinity);
    refreshProjects(server, 100_000, RULES);
    expect(place.open).toBe(false);
  });

  it('opens when the server waits on shards for a share of the week', () => {
    expect(MARKET_OPENS_AT).toBe(0.15);
  });
});

describe('the variants in a run', () => {
  const config = (id: string) => ALL_SERVERS.find((s) => s.id === id)!;
  const brokerHours = (id: string): number => {
    const run = runServer({ ...config(id), weeks: 6 }, 1);
    return sum(run.players.map((p) => sum(p.weeks.map((w) => w.brokerHours))));
  };

  it('has no broker without a seat, and a broker from day one with one', () => {
    expect(brokerHours('mixed8-nobroker')).toBe(0);
    expect(brokerHours('mixed8')).toBeGreaterThan(0);
  });

  it('logs the server shard stall each week as a share, and the Market state', () => {
    const run = runServer({ ...config('mixed8-market'), weeks: 6 }, 1);
    for (const w of run.log) {
      expect(w.shardStall).toBeGreaterThanOrEqual(0);
      expect(w.shardStall).toBeLessThanOrEqual(1);
      expect([0, 1, 2]).toContain(w.market);
    }
    // A server whose anvils wait on shards opens the Market in the first weeks, and no broker works before it is built.
    expect(run.marketOpenedHour).not.toBeNull();
    if (run.marketDoneHour === null)
      expect(sum(run.players.map((p) => sum(p.weeks.map((w) => w.brokerHours))))).toBe(0);
  });
});
