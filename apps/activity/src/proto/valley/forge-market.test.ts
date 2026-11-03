import { beforeEach, describe, expect, it } from 'vitest';
import {
  EXCHANGE,
  applyTrades,
  brokerKeepsStocked,
  finishPieces,
  getNeed,
  isLucky,
  planTrade,
  planTrades,
  postStatus,
  resetMade,
  shortShard,
  summarize,
  surplusOf,
  type ForgeOrder,
} from './forge-post';
import {
  MARKET_NEED,
  STAGES,
  brokerOnDuty,
  fractionPaid,
  giftFor,
  give,
  invitation,
  isBuilt,
  marketFromHash,
  shareOf,
  stageOf,
  stillNeeds,
} from './market-sample';
import { scaffold } from './market-art';

const order = (over: Partial<ForgeOrder> = {}): ForgeOrder => ({
  baseId: 'kelp-cap',
  made: 3,
  of: 6,
  need: 'mire-shard',
  ...over,
});

describe('the forge post', () => {
  beforeEach(() => {
    resetMade();
  });

  it('waits on the shard the bag lacks most', () => {
    expect(shortShard({ 'tide-shard': 2, 'ember-shard': 10, 'grove-shard': 1 })).toBe(
      'spark-shard',
    );
    expect(getNeed({ 'tide-shard': 4, 'ember-shard': 3 })).toBe('grove-shard');
    // The order keeps its element once seen.
    expect(getNeed({ 'grove-shard': 9 })).toBe('grove-shard');
  });

  it('is working with a shard, waiting without, done at the end', () => {
    expect(postStatus(order(), { 'mire-shard': 1 })).toBe('working');
    expect(postStatus(order(), {})).toBe('waiting');
    expect(postStatus(order({ made: 6 }), {})).toBe('done');
  });

  it('offers only whole trades of other elements as spare', () => {
    const parts = { 'tide-shard': 7, 'ember-shard': 2, 'mire-shard': 9 };
    expect(surplusOf(parts, 'mire-shard')).toEqual([{ kind: 'tide-shard', spare: 6 }]);
  });

  it('trades 3 for 1, 3 for 2 on a lucky one, nothing when nothing is spare', () => {
    const parts = { 'tide-shard': 4 };
    expect(planTrade(parts, 'mire-shard', 0)).toEqual({
      from: 'tide-shard',
      to: 'mire-shard',
      spent: EXCHANGE.give,
      got: EXCHANGE.get,
      lucky: false,
    });
    const lucky = planTrade(parts, 'mire-shard', 3);
    expect(isLucky(3)).toBe(true);
    expect(lucky?.got).toBe(EXCHANGE.lucky);
    expect(planTrade({ 'tide-shard': 2 }, 'mire-shard', 0)).toBeNull();
  });

  it('is lucky once in ten trades', () => {
    expect(Array.from({ length: 100 }, (_, n) => isLucky(n)).filter(Boolean)).toHaveLength(10);
  });

  it('trades until the order is covered, and no more', () => {
    const parts = { 'ember-shard': 9 };
    const trades = planTrades(parts, 'mire-shard', 0, 2);
    expect(trades).toHaveLength(2);
    const after = applyTrades(parts, trades);
    expect(after).toEqual({ 'ember-shard': 3, 'mire-shard': 2 });
    expect(summarize(trades)).toEqual({
      from: 'ember-shard',
      to: 'mire-shard',
      spent: 6,
      got: 2,
      base: 2,
      lucky: false,
    });
    expect(summarize([])).toBeNull();
  });

  it('counts a lucky extra in what came', () => {
    const trades = planTrades({ 'ember-shard': 3 }, 'mire-shard', 3, 3);
    expect(summarize(trades)?.got).toBe(2);
    expect(summarize(trades)?.lucky).toBe(true);
  });

  it('finishes a piece for every shard it has, and stops at the shelf end', () => {
    const done = finishPieces(order(), { 'mire-shard': 2 });
    expect(done.order.made).toBe(5);
    expect(done.parts['mire-shard']).toBe(0);
    expect(finishPieces(order({ made: 5 }), { 'mire-shard': 4 }).order.made).toBe(6);
    expect(finishPieces(order(), {}).order.made).toBe(3);
  });

  it('never makes the smith wait when a broker is on duty and something is spare', () => {
    const stocked = brokerKeepsStocked({ 'tide-shard': 9 }, order(), 0);
    expect(stocked.trades).toHaveLength(3);
    expect(postStatus(order(), stocked.parts)).toBe('working');
    expect(brokerKeepsStocked({}, order(), 0).trades).toEqual([]);
  });
});

describe('the Market project', () => {
  const start = marketFromHash('');

  it('rises in stages as gifts come in and is built when everything is paid', () => {
    expect(stageOf({ acorns: 0, scrap: 0 })).toBe(0);
    expect(stageOf(start.given)).toBeGreaterThan(0);
    expect(stageOf({ acorns: 599, scrap: 200 })).toBe(STAGES - 1);
    expect(isBuilt({ acorns: 599, scrap: 200 })).toBe(false);
    expect(isBuilt(MARKET_NEED)).toBe(true);
    expect(fractionPaid({ acorns: 9999, scrap: 9999 })).toBe(1);
  });

  it('words what it still needs as an invitation', () => {
    expect(invitation({ acorns: 340, scrap: 70 })).toBe(
      'The stalls would love 260 Acorns and 130 scrap, whenever you like.',
    );
    expect(invitation({ acorns: 600, scrap: 150 })).toBe(
      'The stalls would love 50 scrap, whenever you like.',
    );
    expect(invitation(MARKET_NEED)).toBe('The stalls are up.');
    expect(stillNeeds({ acorns: 700, scrap: 0 })).toEqual({ acorns: 0, scrap: 200 });
  });

  it('gives only what you hold and the project still takes, and keeps your own share', () => {
    expect(giftFor(start, 73)).toEqual({ acorns: 40, scrap: 10 });
    expect(giftFor({ ...start, pocket: 5 }, 3)).toEqual({ acorns: 5, scrap: 3 });
    expect(giftFor({ ...start, given: { acorns: 590, scrap: 200 } }, 50)).toEqual({
      acorns: 10,
      scrap: 0,
    });
    const after = give(start, { acorns: 40, scrap: 10 });
    expect(after.given).toEqual({ acorns: 380, scrap: 80 });
    expect(after.mine).toEqual({ acorns: 100, scrap: 20 });
    expect(after.pocket).toBe(80);
    expect(shareOf(after.mine)).toBe(15);
  });

  it('opens built with a broker on `&market=built`, nearly done on `&market=almost`', () => {
    const built = marketFromHash('#valley?market=built&bare=1');
    expect(isBuilt(built.given)).toBe(true);
    expect(brokerOnDuty(built)).toBe(true);
    expect(brokerOnDuty({ ...built, broker: null })).toBe(false);
    expect(isBuilt(marketFromHash('#valley?market=almost').given)).toBe(false);
    expect(brokerOnDuty({ ...start, broker: 'x' })).toBe(false);
  });

  it('draws more scaffolding at each stage', () => {
    const filled = (stage: number): number =>
      scaffold(stage).rows().join('').replaceAll('.', '').length;
    for (let stage = 1; stage < STAGES; stage++) {
      expect(filled(stage)).toBeGreaterThan(filled(stage - 1));
    }
  });
});
