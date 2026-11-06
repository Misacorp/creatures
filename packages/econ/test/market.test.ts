/** The broker's seat and the Market as a project (V-FORGE-11): when the seat exists, how the project opens and finishes. */
import { describe, expect, it } from 'vitest';
import { contributePart, openMarket, refreshProjects } from '../src/commons';
import { RULES } from '../src/rules';
import { ALL_SERVERS } from '../src/servers';
import { brokerSeatOn, exchangeOn, runServer } from '../src/sim';
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
  it('joins the valley once, as a small project (Q48): shards of any kind may fill it in the first variant, a fifth of it in the other', () => {
    for (const mode of ['market', 'market-shards'] as const) {
      const server = serverWith(mode);
      const before = server.places.length;
      openMarket(server, 100);
      openMarket(server, 200);
      expect(server.places).toHaveLength(before + 1);
      expect(server.marketOpenedHour).toBe(100);
      server.places[0]!.level = 2;
      refreshProjects(server, 100, RULES);
      const place = server.places.at(-1)!;
      expect(place.id).toBe('market');
      expect(place.open).toBe(true);
      // Sized as the rule says: a share of the base, at the server's weight.
      const c = RULES.commons;
      const small =
        c.baseSize *
        c.oneShot['market']!.sizeFactor *
        Math.pow(Math.max(server.weight, 1) / c.referenceWeight, c.sizeExponent);
      expect(place.size).toBeCloseTo(small, 6);
      if (mode === 'market') {
        // V-COM-15: the shard part is the whole project at the Market's one value.
        expect(place.need[2]! * c.oneShot['market']!.shardValue!).toBeCloseTo(place.size, 6);
        expect(
          place.need[0]! * c.giftValue.acorns + place.need[1]! * c.giftValue.scrap,
        ).toBeCloseTo(place.size, 6);
      } else {
        expect(place.need[2]! * c.giftValue.shards).toBeCloseTo(place.size * c.costSplit.shards, 6);
      }
    }
  });

  it('is filled by shards alone, never past the project, and a part is not taken past what is left (V-COM-15)', () => {
    const server = serverWith('market');
    openMarket(server, 0);
    server.places[0]!.level = 2;
    refreshProjects(server, 0, RULES);
    const index = server.places.length - 1;
    const place = server.places[index]!;
    const value = RULES.commons.oneShot['market']!.shardValue!;
    const half = place.size / 2 / value;
    expect(contributePart(server, index, 2, half, 5, RULES)).toBeCloseTo(half, 9);
    expect(place.progress).toBeCloseTo(place.size / 2, 6);
    expect(place.open).toBe(true);
    // Scrap takes only what the shards left, so an overgift is not swallowed.
    const taken = contributePart(server, index, 1, 1e9, 6, RULES);
    expect(taken * RULES.commons.giftValue.scrap).toBeCloseTo(place.size / 2, 6);
    expect(server.marketDoneHour).toBe(6);
    expect(place.open).toBe(false);
  });

  it('is built once: the seat appears, the project does not open again', () => {
    const server = serverWith('market');
    openMarket(server, 0);
    server.places[0]!.level = 2;
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

  it('opens when the hearth has levelled, and not before (Q48); the Forge waits for it to be built', () => {
    const server = serverWith('market');
    refreshProjects(server, 100, RULES);
    expect(server.places.some((p) => p.id === 'market')).toBe(false);
    expect(server.places.filter((p) => p.open).map((p) => p.id)).toEqual(['bonfire']);
    server.places[0]!.level = 2;
    refreshProjects(server, 100, RULES);
    expect(server.places.filter((p) => p.open).map((p) => p.id)).toEqual(['bonfire', 'market']);
    expect(server.places.find((p) => p.id === 'forge')!.open).toBe(false);
    const market = server.places.findIndex((p) => p.id === 'market');
    for (let part = 0; part < 3; part++) contributePart(server, market, part, 1e9, 200, RULES);
    refreshProjects(server, 300, RULES);
    expect(server.places.find((p) => p.id === 'forge')!.open).toBe(true);
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
    // The Market is the second guided project (Q48): open once the hearth has levelled, built in the first two weeks (day 14), and no
    // broker works before it is built.
    expect(run.marketOpenedHour).not.toBeNull();
    expect(run.marketDoneHour).not.toBeNull();
    expect(run.marketDoneHour!).toBeLessThan(14 * 24);
  });
});

describe('the exchange opens with the Market (Q64)', () => {
  it('is open from day one without a Market, and only once the Market is built with one', () => {
    expect(exchangeOn(serverWith('always'))).toBe(true);
    expect(exchangeOn(serverWith('never'))).toBe(true);
    for (const mode of ['market', 'market-shards'] as const) {
      const server = serverWith(mode);
      expect(exchangeOn(server)).toBe(false);
      openMarket(server, 10);
      expect(exchangeOn(server)).toBe(false);
      server.marketDoneHour = 100;
      expect(exchangeOn(server)).toBe(true);
    }
    const none = createServer(
      'market',
      1,
      { bossKills: 'half', communalSeats: true, shardExchange: false, broker: 'market' },
      RULES,
    );
    none.marketDoneHour = 100;
    expect(exchangeOn(none)).toBe(false);
  });

  it('a run of the Market variant trades nothing before the Market is built, and the day-one variant trades from the first weeks', () => {
    const config = (id: string) => ALL_SERVERS.find((s) => s.id === id)!;
    const market = runServer({ ...config('mixed8-market'), weeks: 8 }, 1);
    const builtWeek = market.marketDoneHour === null ? 8 : Math.floor(market.marketDoneHour / 168);
    const early = (run: typeof market): number =>
      sum(run.players.map((p) => sum(p.weeks.slice(0, builtWeek).map((w) => w.exchanges))));
    expect(early(market)).toBe(0);
    const always = runServer({ ...config('mixed8'), weeks: 8 }, 1);
    expect(early(always)).toBeGreaterThan(0);
  });
});
