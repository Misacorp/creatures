import { describe, expect, it } from 'vitest';
import { VALLEY_RULES } from '@creatures/game';
import { homeInput } from '../workbench/home-sample';
import { sampleCommons, withCommons } from './commons-sample';
import {
  COMMONS_NAMES,
  giveRows,
  levelLine,
  stateLine,
  stateTag,
  stillNeeded,
} from './commons-view';
import {
  brokerLine,
  brokerRows,
  marketLine,
  marketState,
  rateText,
  towardName,
} from './market-view';
import {
  marketPlace,
  presetMarket,
  sampleBroker,
  withMarket,
  withMarketPlace,
} from './market-sample';
import { placeStates } from './place-state';
import { sampleValley } from './signpost-sample';
import { isTrading, trayBadge, trayFor, trayStates } from './tray-state';

const busy = homeInput('busy', true);
const free = busy.creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a, b] = free;
if (a === undefined || b === undefined) throw new Error('fixture');

const visitOf = (preset: string) => {
  const commons = withMarketPlace(sampleCommons(), preset);
  const market = presetMarket(preset, free);
  const base = withCommons(sampleValley(free, []), commons);
  return market === null ? base : withMarket(base, market);
};

describe('the rate in words', () => {
  it('is a ratio of whole shards: the lab tiers read 12 for 5, 2 for 1 and 8 for 5', () => {
    expect(VALLEY_RULES.broker.tiers.map((t) => rateText(t.rate))).toEqual([
      '12 for 5',
      '12 for 5',
      '2 for 1',
      '8 for 5',
    ]);
    expect(rateText(3)).toBe('3 for 1');
  });
});

describe("the Market's state", () => {
  it('is not there without the block, waiting until the guided start reaches it, building, then built', () => {
    expect(marketState(sampleValley(free, []))).toBeNull();
    expect(marketState(visitOf('not open'))).toBe('waiting');
    expect(marketState(visitOf('being built'))).toBe('building');
    expect(marketState(visitOf('open, free seat'))).toBe('built');
  });

  it('says its words: not built, built, and never a level count or a cosmetic one', () => {
    const waiting = marketPlace('not open');
    const building = marketPlace('being built');
    const built = marketPlace('open with a broker');
    expect(levelLine(waiting)).toBe('Not built yet');
    expect(levelLine(building)).toBe('Not built yet');
    expect(levelLine(built)).toBe('Built');
    expect(stateTag(built)).toBe('Built');
    expect(stateLine(built)).toBe('The Market is built.');
    expect(COMMONS_NAMES['market']).toBe('Market');
  });

  it('asks for Acorns and scrap only, and offers no shards to give', () => {
    const place = marketPlace('being built');
    expect(stillNeeded(place)).toBe('190 Acorns, 380 scrap');
    const rows = giveRows(
      place,
      { acorns: 500, scrap: 500, shards: { tide: 9, ember: 9, grove: 9, spark: 9, mire: 9 } },
      3,
    );
    expect(rows.map((r) => r.id)).toEqual(['acorns', 'scrap']);
  });
});

describe('the broker in words', () => {
  it('asks for a creature when the seat is free, and says its rate, bonus and what it waits on', () => {
    expect(brokerLine(sampleBroker(null))).toBe('Pick a creature, or drag one here.');
    expect(brokerLine(sampleBroker(a.id, 1))).toBe(
      'Swaps spare shards 12 for 5, with a 15% chance of one extra',
    );
    expect(brokerLine(sampleBroker(a.id, 1, { blocked: 'tide' }))).toMatch(
      /Waiting for spare shards to trade for Tide/,
    );
    expect(brokerLine(sampleBroker(a.id, 1, { paused: 'raid' }))).toMatch(/In the raid/);
  });

  it('lists its numbers and the next step, none at Master', () => {
    const rows = brokerRows(sampleBroker(a.id, 1, { toward: 'grove' }));
    expect(rows.map((r) => r.label)).toEqual([
      'Rate',
      'Bonus shard',
      'Trading',
      'Trades toward',
      'Next step',
    ]);
    expect(rows.find((r) => r.label === 'Trades toward')?.value).toBe('Grove shards');
    expect(brokerRows(sampleBroker(a.id, 3)).some((r) => r.label === 'Next step')).toBe(false);
    expect(towardName(null)).toBe('What the orders need');
  });
});

describe('the tray and the Places list', () => {
  it('marks the creature at the broker seat as Trading, sorted after the smiths', () => {
    const visit = visitOf('open with a broker');
    expect(isTrading(a, visit)).toBe(true);
    const input = { trips: [], jobs: [], now: 0, ...trayStates(visit) };
    const badge = trayBadge(a, input);
    expect(badge?.state).toBe('trading');
    expect(badge?.label).toMatch(/Trading at the Market/);
    expect(trayFor(free, input).map((c) => c.id)).toContain(a.id);
    expect(trayStates(visitOf('open, free seat')).trading?.size).toBe(0);
  });

  it('says nothing new while the Market waits, then what its project or its broker is doing', () => {
    const line = (preset: string): string =>
      placeStates({ ...busy, visit: visitOf(preset) }).market;
    expect(line('not open')).toBe('not open yet');
    expect(line('being built')).toBe('being built');
    expect(line('open, free seat')).toBe('a free broker seat');
    expect(line('open with a broker')).toBe('the broker trades');
    expect(line('broker stuck')).toBe('the broker waits for spare shards');
    expect(marketLine(sampleValley(free, []))).toBeNull();
  });
});
