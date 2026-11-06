import { describe, expect, it } from 'vitest';
import {
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  brokerTermsAt,
  createSeededRng,
  settle,
  type Rng,
  type SettleAnvil,
  type SettleBroker,
  type SettleForge,
  type SettleOrder,
  type SettleState,
} from '../src';

const H = 3_600_000;
const R = VALLEY_RULES;
const N = VALLEY_ELEMENTS.length;
const seeded = (seed: number | string = 7): Rng => createSeededRng(String(seed));

const order = (over: Partial<SettleOrder> = {}): SettleOrder => ({
  id: 'o1',
  blueprint: 'tide-hat',
  element: 0,
  count: 99,
  made: 0,
  reach: 'none',
  forTeam: false,
  stepUp: 0,
  ...over,
});
const anvil = (over: Partial<SettleAnvil> = {}): SettleAnvil => ({
  id: 'a1',
  creature: 0,
  kit: null,
  orders: [order()],
  piece: null,
  floor: 0,
  ...over,
});
const forgeOf = (shards: number[], anvils = [anvil()]): SettleForge => ({
  anvils,
  shelf: { scrap: 10_000, shards, essence: 0 },
  scrapCarry: 0,
  weak: new Array<number>(N).fill(0),
  pending: new Array<number>(N).fill(0),
  fireLevel: 1,
});
const broker = (over: Partial<SettleBroker> = {}): SettleBroker => ({
  id: 'b1',
  creature: 1,
  toward: -1,
  credit: 0,
  ...over,
});
const stateOf = (forge: SettleForge, withBroker: SettleBroker | null): SettleState => ({
  settledAt: 0,
  lastVisitAt: 0,
  hearth: 1,
  creatures: [0, 1].map(() => ({ xp: 0, carry: 0, capXp: Infinity })),
  forge,
  ...(withBroker === null ? {} : { broker: withBroker }),
});
/** No shards of the element the order needs, plenty of another: the broker's case. */
const spare = (): number[] => {
  const shards = new Array<number>(N).fill(0);
  shards[2] = 60;
  return shards;
};

describe('the broker (V-FORGE-11)', () => {
  it('reads its rate and crits from the trading mastery steps', () => {
    expect(brokerTermsAt(R, 0)).toEqual(R.broker.tiers[0]);
    expect(brokerTermsAt(R, 48)).toEqual(R.broker.tiers[1]);
    expect(brokerTermsAt(R, 168)).toEqual(R.broker.tiers[2]);
    expect(brokerTermsAt(R, 504)).toEqual(R.broker.tiers[3]);
  });

  it('keeps an anvil working that would wait for a shard, paying a spare pile', () => {
    const without = settle(stateOf(forgeOf(spare()), null), 0, 100 * H, [], { rng: seeded() });
    expect(without.forge?.anvils[0]?.wait).toBe('shard');
    expect(without.made).toBeUndefined();

    const withIt = settle(stateOf(forgeOf(spare()), broker()), 0, 100 * H, [], { rng: seeded() });
    expect((withIt.made ?? []).length).toBeGreaterThanOrEqual(5);
    const trades = withIt.brokered?.trades ?? 0;
    expect(trades).toBeGreaterThan(0);
    const paid = withIt.brokered?.paid ?? 0;
    // Every shard paid left the spare pile.
    expect(60 - (withIt.forge?.shelf.shards[2] ?? 0)).toBe(paid);
    // The rate holds on average: shards paid per trade stay at the rate (the change is kept as credit), the mastery steps only lower it.
    expect(paid).toBeLessThanOrEqual(Math.ceil(trades * R.broker.tiers[0]!.rate) + 1);
    expect(paid).toBeGreaterThanOrEqual(Math.floor(trades * R.broker.tiers[3]!.rate));
  });

  it('never trades below the shards the player keeps, and nothing without a spare pile', () => {
    const shards = new Array<number>(N).fill(0);
    shards[2] = R.forge.giveReserveShards;
    const after = settle(stateOf(forgeOf(shards), broker()), 0, 100 * H, [], { rng: seeded() });
    expect(after.brokered).toBeUndefined();
    expect(after.forge?.shelf.shards[2]).toBe(R.forge.giveReserveShards);
  });

  it('does nothing without a creature, and while the creature is in the raid', () => {
    const none = settle(stateOf(forgeOf(spare()), broker({ creature: -1 })), 0, 100 * H, [], {
      rng: seeded(),
    });
    expect(none.brokered).toBeUndefined();
    const away = settle(stateOf(forgeOf(spare()), broker()), 0, 100 * H, [], {
      rng: seeded(),
      away: [{ creature: 1, from: 0, to: Infinity }],
    });
    expect(away.brokered).toBeUndefined();
  });

  it('keeps a small stock of the element it is asked to trade toward', () => {
    const forge = forgeOf(spare(), [anvil({ orders: [] })]);
    const after = settle(stateOf(forge, broker({ toward: 3 })), 0, 10 * H, [], { rng: seeded() });
    expect(after.forge?.shelf.shards[3]).toBeGreaterThanOrEqual(R.forge.shard * 3);
  });

  it('grows its trading hours with the effective hours, and steps up at the mastery steps', () => {
    const after = settle(stateOf(forgeOf(spare()), broker()), 0, 60 * H, [], { rng: seeded() });
    // The away share steps down a little from the sixth hour away, so a bit under the 60 elapsed.
    expect(after.creatures[1]?.tradeHours).toBeGreaterThan(48);
    expect(after.creatures[1]?.tradeHours).toBeLessThan(60);
    expect(brokerTermsAt(R, after.creatures[1]?.tradeHours ?? 0)).toEqual(R.broker.tiers[1]);
  });

  it('is invariant under splitting and a second settle at the same moment changes nothing', () => {
    const forge = forgeOf(spare(), [
      anvil({ orders: [order({ count: 30 })] }),
      anvil({ id: 'a2', creature: 0, orders: [order({ id: 'o2', element: 4, count: 30 })] }),
    ]);
    const start = stateOf(forge, broker());
    const to = 200 * H;
    const whole = settle(start, 0, to, [], { rng: seeded(5) });
    for (const b of [1, 15.9 * H, 47.9 * H, 48 * H, 100 * H, 167.99 * H]) {
      const rng = seeded(5);
      const first = settle(start, 0, b, [], { rng });
      const second = settle(first, b, to, [], { rng });
      expect(second.forge?.shelf).toEqual(whole.forge?.shelf);
      expect(second.broker?.credit).toBeCloseTo(whole.broker?.credit ?? 0, 9);
      expect(second.creatures[1]?.tradeHours).toBeCloseTo(whole.creatures[1]?.tradeHours ?? 0, 6);
      expect((first.brokered?.trades ?? 0) + (second.brokered?.trades ?? 0)).toBe(
        whole.brokered?.trades ?? 0,
      );
    }
    const again = settle(whole, to, to, [], { rng: seeded(99) });
    expect(again.forge?.shelf).toEqual(whole.forge?.shelf);
    expect(again.brokered).toBeUndefined();
  });
});
