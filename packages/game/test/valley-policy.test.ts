import { describe, expect, it } from 'vitest';
import {
  MIXED8_BOTS,
  PROFILES,
  STAND_IN_BOT,
  ProfileSchema,
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  anvilKitFor,
  choosePurchase,
  defaultDestination,
  drawByWeight,
  evolutionOrder,
  giftAmount,
  giftBudgetAfterIncome,
  isDumping,
  isHoarding,
  keepOf,
  needsOf,
  nextKit,
  pickFreeCreature,
  pickScoutCreature,
  profileById,
  retiltPlan,
  speciesAvailableAt,
  visitHours,
} from '../src';
import * as v from 'valibot';

const R = VALLEY_RULES;

describe('the profiles', () => {
  it('are valid data, one id each, and the bots are the lab mixed server of 8 (bot 0 stands in for the human seat)', () => {
    for (const p of PROFILES) expect(v.safeParse(ProfileSchema, p).success).toBe(true);
    expect(new Set(PROFILES.map((p) => p.id)).size).toBe(PROFILES.length);
    const ids = MIXED8_BOTS.map((b) => b.id);
    expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(STAND_IN_BOT).toBe(0);
    expect(MIXED8_BOTS.filter((b) => b.profile === 'daily').map((b) => b.id)).toEqual([0, 1]);
    for (const b of MIXED8_BOTS) expect(() => profileById(b.profile)).not.toThrow();
  });

  it('say which hours of which days a player visits (Monday is day 0)', () => {
    const week = (id: string, n = 0): number[] =>
      Array.from({ length: 7 }, (_, d) => visitHours(profileById(id), d, n).length);
    expect(week('daily')).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(week('active')).toEqual([3, 3, 3, 3, 3, 3, 3]);
    expect(week('weekend-off')).toEqual([1, 1, 1, 1, 1, 0, 0]);
    expect(week('weekly')).toEqual([0, 0, 0, 0, 0, 0, 1]);
    // Every other day: the player's number staggers which days.
    expect(week('every-other-day', 0)).toEqual([1, 0, 1, 0, 1, 0, 1]);
    expect(week('every-other-day', 3)).toEqual([0, 1, 0, 1, 0, 1, 0]);
    // Joins in week 6; the returner is away in weeks 5 to 8.
    expect(visitHours(profileById('new'), 34, 6)).toEqual([]);
    expect(visitHours(profileById('new'), 35, 6)).toEqual([20]);
    expect(visitHours(profileById('returner'), 27, 7)).toEqual([20]);
    expect(visitHours(profileById('returner'), 28, 7)).toEqual([]);
    expect(visitHours(profileById('returner'), 56, 7)).toEqual([20]);
  });
});

describe('what to buy', () => {
  const scout = { kind: 'scout', acorns: 113, scrap: 0 } as const;
  const anvil = { kind: 'anvil', acorns: 123, scrap: 38 } as const;

  it('buys the cheapest seat it can afford, kit only with Acorns to spare after the cheapest seat', () => {
    const base = {
      acorns: 200,
      scrap: 50,
      offers: [scout, anvil],
      kit: 'satchel',
      kitPrice: 875,
    } as const;
    expect(choosePurchase(base)).toEqual({ kind: 'seat', offer: scout });
    // An anvil is the cheaper one when the scout seat is dearer; it needs its scrap too.
    expect(choosePurchase({ ...base, offers: [{ ...scout, acorns: 300 }, anvil] })).toEqual({
      kind: 'seat',
      offer: anvil,
    });
    expect(choosePurchase({ ...base, scrap: 10, offers: [anvil] })).toBeNull();
    // Nothing affordable.
    expect(choosePurchase({ ...base, acorns: 100 })).toBeNull();
    // No seat left to buy: the kit, when the Acorns cover it.
    expect(choosePurchase({ ...base, acorns: 875, offers: [] })).toEqual({
      kind: 'kit',
      kit: 'satchel',
    });
    expect(choosePurchase({ ...base, acorns: 874, offers: [] })).toBeNull();
    // The seat waits on scrap the player lacks: the kit only when the Acorns cover the seat's price as well.
    const blocked = { ...base, scrap: 10, offers: [anvil] };
    expect(choosePurchase({ ...blocked, acorns: 875 + 123 })).toEqual({
      kind: 'kit',
      kit: 'satchel',
    });
    expect(choosePurchase({ ...blocked, acorns: 875 + 122 })).toBeNull();
    expect(choosePurchase({ ...base, acorns: 5000, kit: null, offers: [] })).toBeNull();
  });

  it('a set-and-forget player stops buying kit early, an optimiser buys the whole order', () => {
    const order = R.kit.buyOrder;
    expect(nextKit(R, [], 'setAndForget')).toBe(order[0]);
    expect(nextKit(R, order.slice(0, R.kit.setAndForgetBuys), 'setAndForget')).toBeNull();
    expect(nextKit(R, order.slice(0, R.kit.setAndForgetBuys), 'optimiser')).toBe(
      order[R.kit.setAndForgetBuys],
    );
    expect(nextKit(R, order, 'optimiser')).toBeNull();
  });
});

describe('where scouts go', () => {
  it('the first seat goes to the place of the best creature, each seat to the next element in turn', () => {
    const tide = VALLEY_ELEMENTS.indexOf('tide');
    const ember = VALLEY_ELEMENTS.indexOf('ember');
    const place = (i: number): string | undefined => R.scouts.destinations[i]?.id;
    expect(place(defaultDestination(R, [tide, ember, tide], 0))).toBe('tidepools');
    expect(place(defaultDestination(R, [tide, ember, tide], 1))).toBe('ember-caves');
    expect(place(defaultDestination(R, [tide, ember, tide], 2))).toBe('tidepools');
    // No creatures: the seats fall back to the places in order.
    expect(defaultDestination(R, [], 3)).toBe(3);
  });

  it('an optimiser sends scouts where the need is: scrap when out of it, and picks the kit that serves it', () => {
    const none = {
      scrap: 0,
      shards: [20, 20, 20, 20, 20],
      elementCounts: [1, 1, 1, 1, 1],
      creatures: 5,
      kindsOwned: 14,
      kindsAvailable: 14,
    };
    const starved = needsOf(none);
    expect(starved.scrap).toBeGreaterThan(needsOf({ ...none, scrap: 500 }).scrap);
    const plan = retiltPlan(R, starved, 2, ['satchel']);
    expect(plan?.dests).toHaveLength(2);
    expect(plan?.kit).toBe('satchel');
    // Without any kit the plan carries none.
    expect(retiltPlan(R, starved, 2, [])?.kit).toBeNull();
    expect(retiltPlan(R, starved, 0, [])).toEqual({ kit: null, dests: [] });
  });

  it('the anvil kit is the loupe with Essence for its Reach, else the tongs', () => {
    expect(anvilKitFor({ loupe: true, tongs: true }, 200)).toBe('loupe');
    expect(anvilKitFor({ loupe: true, tongs: true }, 10)).toBe('tongs');
    expect(anvilKitFor({ loupe: true, tongs: false }, 10)).toBe('loupe');
    expect(anvilKitFor({ loupe: false, tongs: false }, 500)).toBeNull();
  });
});

describe('who works, who evolves, what is given', () => {
  it('the creature with the fewest hours of work takes a free seat, the higher level on a tie', () => {
    expect(pickFreeCreature([])).toBe(-1);
    expect(
      pickFreeCreature([
        { hours: 5, level: 9 },
        { hours: 0, level: 2 },
        { hours: 0, level: 6 },
      ]),
    ).toBe(2);
  });

  it("a gift goes to an open project drawn over the places' weights, the lab's arithmetic", () => {
    // Weights 2, 3, 1 (total 6): the draw splits [0, 1/3), [1/3, 5/6), [5/6, 1).
    expect([0, 0.32, 0.34, 0.8, 0.84, 0.999].map((u) => drawByWeight([2, 3, 1], u))).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
    expect(drawByWeight([1], 0.7)).toBe(0);
    // The lab draws with `weighted(rng, weights)`: the same thing on a seeded number.
    expect(
      drawByWeight([R.commons.placeWeights['bonfire']!, R.commons.placeWeights['market']!], 0),
    ).toBe(0);
  });

  it('a scout seat takes a creature that fits its place as often as the share says, else one that does not', () => {
    const roster = [
      { hours: 0, level: 9, fits: false },
      { hours: 0, level: 5, fits: true },
      { hours: 0, level: 7, fits: true },
      { hours: 3, level: 20, fits: false },
    ];
    // Below the share: among the fitting ones, the fewest hours and then the highest level.
    expect(pickScoutCreature(roster, 0.3, 0.1)).toBe(2);
    // At or above it: among the others by the same rule.
    expect(pickScoutCreature(roster, 0.3, 0.3)).toBe(0);
    // A wanted kind nobody is falls back to all of them.
    expect(
      pickScoutCreature(
        roster.filter((c) => !c.fits),
        0.9,
        0.1,
      ),
    ).toBe(0);
    expect(pickScoutCreature([], 0.5, 0.5)).toBe(-1);
    // The shares are the lab's: a set-and-forget player about a third of the time, an optimiser almost always.
    expect(R.posts.fitShare.setAndForget).toBeLessThan(R.posts.fitShare.optimiser);
  });

  it('creatures waiting to evolve go best first, keeping the roster order on a tie', () => {
    const order = evolutionOrder([
      { id: 'a', level: 15 },
      { id: 'b', level: 20 },
      { id: 'c', level: 15 },
    ]);
    expect(order.map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('a third of income is set aside; a hoarder saves, then gives everything for two weeks', () => {
    expect(giftBudgetAfterIncome(10, 30, 1 / 3)).toBeCloseTo(20);
    expect(giftBudgetAfterIncome(10, -5, 1 / 3)).toBe(10);
    expect(giftAmount(20, 50, false)).toBe(20);
    expect(giftAmount(20, 5, false)).toBe(5);
    expect(giftAmount(20, 50, true)).toBe(50);
    expect([1, 4, 5].map((w) => isHoarding(4, w))).toEqual([true, true, false]);
    expect([4, 5, 6, 7].map((w) => isDumping(4, w))).toEqual([true, true, true, false]);
    expect(isHoarding(0, 1)).toBe(false);
    expect(isDumping(0, 1)).toBe(false);
    expect(keepOf(8, 0, 5)).toBe(8);
    expect(keepOf(8, 3, 5)).toBe(15);
  });

  it('counts the kinds scouts can find as content drops arrive', () => {
    const { start, dropFromWeek, dropEveryWeeks, dropCount } = R.scouts.species;
    expect(speciesAvailableAt(R, 0)).toBe(start);
    expect(speciesAvailableAt(R, (dropFromWeek - 1) * 168)).toBe(start + dropCount);
    expect(speciesAvailableAt(R, (dropFromWeek - 1 + dropEveryWeeks) * 168)).toBe(
      start + 2 * dropCount,
    );
  });
});
