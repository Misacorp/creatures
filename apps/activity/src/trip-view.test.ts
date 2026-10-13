import { RULES, expeditionContent, supplyDef, tripMs } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { parseGameState } from './api';
import { formatDuration } from './gear-view';
import type { Trip } from './expedition-types';
import stateOffer from './fixtures/expedition-state-offer.json';
import pushOnFixture from './fixtures/expedition-push-on.json';
import {
  canCarry,
  choiceLabel,
  fillPct,
  kitBlocker,
  kitChoice,
  kitCost,
  lengthLabel,
  lengthOptions,
  needsOfferRefresh,
  nextLengthUnlock,
  percentText,
  pickFor,
  recallKeeps,
  setSupply,
  slotsLine,
  supplyEffect,
  supplyOptions,
  tripStatus,
  tripWorth,
  xpBar,
} from './trip-view';

const HOUR = 3_600_000;

describe('trip lengths', () => {
  it('offers 2, 6 and 12 hours to a new explorer, and 24 hours from the rank the rules set', () => {
    expect(lengthOptions(1).map((o) => o.id)).toEqual(['short', 'medium', 'long']);
    expect(lengthOptions(1).map((o) => o.label)).toEqual(['2 h', '6 h', '12 h']);
    const day = RULES.expeditions.lengths.day.minRank;
    expect(lengthOptions(day - 1).map((o) => o.id)).toEqual(['short', 'medium', 'long']);
    expect(lengthOptions(day).map((o) => o.id)).toEqual(['short', 'medium', 'long', 'day']);
    expect(lengthLabel('day')).toBe('24 h');
  });

  it('says what each trip takes for this explorer: each rank above 1 makes it shorter', () => {
    const rank1 = lengthOptions(1).find((o) => o.id === 'long');
    const rank3 = lengthOptions(3).find((o) => o.id === 'long');
    expect(rank1?.takes).toBe(formatDuration(tripMs('long', 1)));
    expect(rank3?.takes).toBe(formatDuration(tripMs('long', 3)));
    expect(tripMs('long', 3)).toBeLessThan(tripMs('long', 1));
  });

  it('names the next length to unlock, and nothing when all are open', () => {
    expect(nextLengthUnlock(1)).toEqual({
      length: 'day',
      rank: RULES.expeditions.lengths.day.minRank,
    });
    expect(nextLengthUnlock(RULES.expeditions.lengths.day.minRank)).toBeNull();
  });
});

describe('supplies', () => {
  it('lists every supply of the content with its price, stock and the effect with real numbers', () => {
    const options = supplyOptions({ 'lure-good': 2 });
    expect(options).toHaveLength(expeditionContent.supplies.length);
    const def = supplyDef('lure-good');
    if (def?.kind !== 'lure') throw new Error('no lure-good');
    const lure = options.find((o) => o.id === 'lure-good');
    expect(lure).toMatchObject({ name: def.name, owned: 2, price: def.price });
    expect(lure?.effect).toBe(
      `Rare +${percentText(def.rareUpBp)}, Epic +${percentText(def.epicUpBp)} of the odds`,
    );
    expect(options.find((o) => o.id === 'lure-basic')?.owned).toBe(0);
  });

  it('marks the best tier as a guaranteed choice and every other one as likely', () => {
    for (const option of supplyOptions({})) {
      expect(option.choice, option.id).toBe(option.tier === 'great' ? 'guaranteed' : 'likely');
    }
    expect(choiceLabel('guaranteed')).toBe('Choice guaranteed');
    expect(choiceLabel('likely')).toBe('Choice likely');
  });

  it('describes each kind of supply with the numbers of its content', () => {
    for (const def of expeditionContent.supplies) {
      expect(supplyEffect(def).length, def.id).toBeGreaterThan(10);
    }
    expect(percentText(2500)).toBe('25%');
    expect(percentText(150)).toBe('1.5%');
  });

  it('carries one supply of a kind, replaces it with another tier, and refuses one too many', () => {
    let picks = setSupply([], 'lure-basic', 'buy');
    expect(picks).toEqual([{ id: 'lure-basic', source: 'buy' }]);
    picks = setSupply(picks, 'lure-good', 'owned');
    expect(picks).toEqual([{ id: 'lure-good', source: 'owned' }]);
    // Fill the places with other kinds, as many as the rules allow.
    const kinds = ['map-scrap', 'lantern', 'satchel'].map((k) => `${k}-basic`);
    for (const id of kinds.slice(0, RULES.expeditions.maxSupplies - 1)) {
      picks = setSupply(picks, id, 'buy');
    }
    expect(picks).toHaveLength(RULES.expeditions.maxSupplies);
    const extra = kinds[RULES.expeditions.maxSupplies - 1];
    if (extra !== undefined) {
      expect(setSupply(picks, extra, 'buy')).toEqual(picks);
      expect(canCarry(picks, extra)).toBe(false);
    }
    // A supply of a kind already carried can still be swapped.
    expect(canCarry(picks, 'lure-great')).toBe(true);
    expect(setSupply(picks, 'lure-great', 'buy').map((p) => p.id)).toContain('lure-great');
    // Taking it off, and looking it up.
    expect(setSupply(picks, 'lure-good', null).some((p) => p.id === 'lure-good')).toBe(false);
    expect(pickFor(picks, 'lure-good')?.source).toBe('owned');
    expect(setSupply(picks, 'no-such-supply', 'buy')).toEqual(picks);
  });

  it('charges Bait only for supplies to buy, from the content prices', () => {
    expect(kitCost([])).toBe(0);
    expect(kitCost([{ id: 'lure-good', source: 'owned' }])).toBe(0);
    expect(
      kitCost([
        { id: 'lure-good', source: 'buy' },
        { id: 'map-scrap-basic', source: 'buy' },
      ]),
    ).toBe((supplyDef('lure-good')?.price ?? -1) + (supplyDef('map-scrap-basic')?.price ?? -1));
  });

  it('knows what choice a kit gives', () => {
    expect(kitChoice([])).toBe('none');
    expect(kitChoice([{ id: 'lure-basic', source: 'buy' }])).toBe('likely');
    expect(
      kitChoice([
        { id: 'lure-basic', source: 'buy' },
        { id: 'lantern-great', source: 'buy' },
      ]),
    ).toBe('guaranteed');
  });

  it('says why supplies cannot go: one missing from the stock, or a bad kit', () => {
    expect(kitBlocker([{ id: 'lure-good', source: 'owned' }], { 'lure-good': 1 })).toBeNull();
    expect(kitBlocker([{ id: 'lure-good', source: 'owned' }], {})).toContain(
      `no ${supplyDef('lure-good')?.name ?? '?'}`,
    );
    expect(
      kitBlocker(
        [
          { id: 'lure-good', source: 'buy' },
          { id: 'lure-basic', source: 'buy' },
        ],
        {},
      ),
    ).toContain('never two of the same kind');
  });
});

describe('what a trip is good for', () => {
  it('lists the same things for every length, with pips that grow with the length', () => {
    const keys = tripWorth('short', 'tide').map((r) => r.key);
    expect(tripWorth('day', 'tide').map((r) => r.key)).toEqual(keys);
    for (const row of tripWorth('day', 'tide')) {
      expect(row.level, row.key).toBeLessThanOrEqual(4);
    }
    const sum = (length: 'short' | 'medium' | 'long' | 'day'): number =>
      tripWorth(length, 'tide').reduce((n, r) => n + r.level, 0);
    expect(sum('short')).toBeLessThan(sum('medium'));
    expect(sum('medium')).toBeLessThan(sum('long'));
    expect(sum('long')).toBeLessThan(sum('day'));
  });

  it('draws the shard of the place, and the exact chance is in the label', () => {
    const ember = tripWorth('long', 'ember').find(
      (r) => r.icon.kind === 'part' && r.icon.part === 'ember-shard',
    );
    expect(ember?.label).toBe(
      `Shards: ${percentText(RULES.expeditions.lengths.long.loot.shardBp)} chance`,
    );
    expect(tripWorth('long', null).some((r) => r.key === 'tide-shard')).toBe(true);
    expect(tripWorth('short', 'grove').find((r) => r.key === 'scrap')?.label).toBe('No scrap');
  });
});

function tripOf(patch: Partial<Trip> = {}): Trip {
  const base = parseGameState(stateOffer).expeditions[0];
  if (base === undefined) throw new Error('the fixture has no trip');
  return { ...base, ...patch };
}

describe('a running trip', () => {
  const trip = tripOf({ offer: null, pushOn: null });

  it('is out until the trip ends, with its progress from the start to the end', () => {
    const half = trip.startedAt + (trip.endsAt - trip.startedAt) / 2;
    const status = tripStatus(trip, half);
    expect(status).toMatchObject({ phase: 'out', claim: 'recall' });
    expect(status.fraction).toBeCloseTo(0.5, 5);
    expect(status.remainingMs).toBe(trip.endsAt - half);
    expect(tripStatus(trip, trip.startedAt - 1000).fraction).toBe(0);
  });

  it('is ready to claim when it ended with nothing on offer', () => {
    expect(tripStatus(trip, trip.endsAt)).toEqual({
      phase: 'ready',
      fraction: 1,
      remainingMs: 0,
      claim: 'claim',
    });
  });

  it('waits for the choice when one is on offer, and a claim then comes home', () => {
    const offered = tripOf({ pushOn: null });
    expect(offered.offer?.goals).toHaveLength(2);
    expect(tripStatus(offered, offered.endsAt)).toMatchObject({ phase: 'choice', claim: 'claim' });
    expect(tripStatus(offered, offered.endsAt - 1).phase).toBe('out');
  });

  it('shows a push-on as its own leg, and coming home before it ends skips it', () => {
    const pushed = parseGameState(pushOnFixture.state).expeditions[0];
    if (pushed?.pushOn === null || pushed === undefined) throw new Error('no push-on');
    const { startedAt, endsAt } = pushed.pushOn;
    const middle = startedAt + (endsAt - startedAt) / 4;
    const status = tripStatus(pushed, middle);
    expect(status).toMatchObject({ phase: 'pushing', claim: 'early' });
    expect(status.fraction).toBeCloseTo(0.25, 5);
    expect(status.remainingMs).toBe(endsAt - middle);
    expect(tripStatus(pushed, endsAt)).toMatchObject({ phase: 'ready', claim: 'claim' });
  });

  it('asks for a refresh once when a trip has just ended with nothing offered yet', () => {
    expect(needsOfferRefresh(trip, trip.endsAt - 1)).toBe(false);
    expect(needsOfferRefresh(trip, trip.endsAt)).toBe(true);
    expect(needsOfferRefresh(tripOf(), tripOf().endsAt)).toBe(false);
    expect(needsOfferRefresh({ ...trip, status: 'claimed' }, trip.endsAt)).toBe(false);
    const pushed = parseGameState(pushOnFixture.state).expeditions[0];
    if (pushed === undefined) throw new Error('no trip');
    expect(needsOfferRefresh(pushed, pushed.endsAt)).toBe(false);
  });

  it('counts what a recall keeps with the same rule as the server', () => {
    const many = { ...trip, rolls: 4 };
    expect(recallKeeps(many, many.startedAt)).toBe(0);
    expect(recallKeeps(many, many.startedAt + (many.endsAt - many.startedAt) / 2)).toBe(2);
    expect(recallKeeps(many, many.endsAt + 5 * HOUR)).toBe(4);
  });

  it('fills a bar in tenths of a percent between 0 and 100', () => {
    expect(fillPct(0)).toBe(0);
    expect(fillPct(0.5)).toBe(50);
    expect(fillPct(0.3333)).toBe(33.3);
    expect(fillPct(2)).toBe(100);
    expect(fillPct(-1)).toBe(0);
  });
});

describe('the explorer XP bar', () => {
  const table = RULES.expeditions.rank.xpForRank;

  it('fills from the XP of the rank to the XP of the next one', () => {
    const start = table[2] ?? 0;
    const next = table[3] ?? 0;
    const bar = xpBar({ rank: 3, xp: start + (next - start) / 2, nextRankXp: next });
    expect(bar.pct).toBe(50);
    expect(bar.text).toBe(`${String((next - start) / 2)} of ${String(next - start)} XP to rank 4`);
  });

  it('is empty at the start of a rank, full at the top and never beyond', () => {
    expect(xpBar({ rank: 1, xp: 0, nextRankXp: table[1] ?? 0 }).pct).toBe(0);
    expect(xpBar({ rank: 10, xp: 999_999, nextRankXp: null })).toEqual({
      pct: 100,
      text: 'Top rank',
    });
    expect(xpBar({ rank: 2, xp: 0, nextRankXp: table[2] ?? 0 }).pct).toBe(0);
  });
});

describe('the slot progress line', () => {
  it('counts finished trips for the second slot and rank sums after that', () => {
    const base = { total: 1, used: 1, rankSum: 2, tripsFinished: 1 };
    const trips = slotsLine({ ...base, next: { kind: 'trips', at: 3 } });
    expect(trips.use).toBe('1 of 1 slot in use');
    expect(trips.next).toBe('Next slot: finish 3 trips (1 so far)');
    expect(trips.fraction).toBeCloseTo(1 / 3, 5);
    const sum = slotsLine({
      ...base,
      total: 2,
      tripsFinished: 3,
      next: { kind: 'rank_sum', at: 26 },
    });
    expect(sum.use).toBe('1 of 2 slots in use');
    expect(sum.next).toContain('add up to 26 (now 2)');
    expect(sum.fraction).toBeCloseTo(2 / 26, 5);
  });

  it('has no next line when every slot is open', () => {
    expect(slotsLine({ total: 5, used: 0, rankSum: 200, tripsFinished: 99, next: null })).toEqual({
      use: '0 of 5 slots in use',
      next: null,
      fraction: null,
    });
  });
});
