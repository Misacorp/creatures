import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
  VALLEY_RULES as R,
  ValleyRulesSchema,
  createSeededRng,
  masteryBonus,
  pickSpecies,
  placeIds,
  placeProfile,
  poissonDraw,
  seatLimit,
  seatPrice,
  seatRates,
  settle,
  specialOf,
  type FindableSpecies,
  type ScoutWorld,
  type SettleSeat,
  type SettleState,
  type WorldClock,
} from '../src';

const H = 3_600_000;
const seat = (over: Partial<SettleSeat> = {}): SettleSeat => ({
  id: 's1',
  creature: 0,
  destination: 'tidepools',
  kit: null,
  fit: false,
  second: false,
  storeHours: 0,
  scrap: 0,
  scrapCarry: 0,
  shards: 0,
  shardCarry: 0,
  ...over,
});
const start = (seats: SettleSeat[] = [seat()], creatures = 1): SettleState => ({
  settledAt: 0,
  lastVisitAt: 0,
  hearth: 1,
  creatures: Array.from({ length: creatures }, () => ({
    xp: 0,
    carry: 0,
    capXp: Infinity,
    scoutHours: 0,
  })),
  seats,
});
const hoursOf = (s: SettleState): number =>
  (s.stretches ?? []).reduce((sum, st) => sum + st.hours, 0);
/** What the invariants compare: the state without the stretch list (its split differs with the splits). */
const stateOf = (s: SettleState) => ({ ...s, stretches: undefined });

describe('the rules the scouts read', () => {
  it('still pass the schema, with the extra places', () => {
    expect(v.safeParse(ValleyRulesSchema, R).success).toBe(true);
    expect(placeIds(R)).toEqual([
      'tidepools',
      'ember-caves',
      'verdant-hollow',
      'storm-ridge',
      'sunken-fen',
      'old-crossroads',
      'moonlit-reef',
      'festival-grounds',
    ]);
    expect(placeProfile(R, 'moonlit-reef')?.night).toBe(true);
    expect(placeProfile(R, 'festival-grounds')?.festival).toBe(true);
    expect(placeProfile(R, 'nowhere')).toBeUndefined();
  });
});

describe('seatRates (V-SCOUT-2, 5, 7, 8, 10, 11 and V-POST-4)', () => {
  const place = placeProfile(R, 'tidepools')!;
  const world: ScoutWorld = { night: false, festival: false, special: null };
  const base = { place, fit: false, masteryHours: 0, kit: null, second: false, world };

  it('is the lab rate at a plain seat, doubled for what the place is rich in', () => {
    const r = seatRates(R, base);
    expect(r.scrap).toBeCloseTo(R.scouts.perHour.scrap * R.scouts.richMultiplier, 12);
    expect(r.shards).toBeCloseTo(R.scouts.perHour.shards, 12);
    expect(r.creatures).toBeCloseTo(R.scouts.perHour.creatures, 12);
    expect(r.gear).toBeCloseTo(R.scouts.perHour.gear, 12);
  });

  it('adds fit and mastery to everything and takes kit as a tilt', () => {
    const plain = seatRates(R, base);
    const fit = seatRates(R, { ...base, fit: true });
    expect(fit.creatures / plain.creatures).toBeCloseTo(1 + R.posts.fitBonus, 12);
    const master = seatRates(R, { ...base, masteryHours: 600 });
    expect(master.scrap / plain.scrap).toBeCloseTo(1 + masteryBonus(R, 600), 12);
    expect(seatRates(R, { ...base, kit: 'lure' }).creatures / plain.creatures).toBeCloseTo(
      R.kit.lure.creatures,
      12,
    );
    expect(seatRates(R, { ...base, kit: 'lantern' }).blueprints / plain.blueprints).toBeCloseTo(
      R.kit.lantern.rare,
      12,
    );
    const satchel = seatRates(R, { ...base, kit: 'satchel' });
    expect(satchel.scrap / plain.scrap).toBeCloseTo(R.kit.satchel.scrap, 12);
    expect(satchel.shards / plain.shards).toBeCloseTo(R.kit.satchel.shards, 12);
    expect(satchel.creatures).toBeCloseTo(plain.creatures, 12);
  });

  it('halves creatures for a second scout at a place and leaves the rest', () => {
    const plain = seatRates(R, base);
    const second = seatRates(R, { ...base, second: true });
    expect(second.creatures / plain.creatures).toBeCloseTo(R.scouts.secondScoutCreatures, 12);
    expect(second.scrap).toBeCloseTo(plain.scrap, 12);
    expect(second.pages).toBeCloseTo(plain.pages, 12);
  });

  it('gives more at the reef at night, and applies the twist only at its destination', () => {
    const reef = placeProfile(R, 'moonlit-reef')!;
    const day = seatRates(R, { ...base, place: reef });
    const night = seatRates(R, { ...base, place: reef, world: { ...world, night: true } });
    expect(night.creatures / day.creatures).toBeCloseTo(R.scouts.nightMultiplier, 12);
    // Night changes nothing at a place that is not the reef.
    const tide = seatRates(R, { ...base, world: { ...world, night: true } });
    expect(tide.scrap).toBeCloseTo(seatRates(R, base).scrap, 12);

    const special = specialOf('tidepools', { kind: 'parts', bp: 5000 });
    const twisted = seatRates(R, { ...base, world: { ...world, special } });
    expect(twisted.scrap / seatRates(R, base).scrap).toBeCloseTo(1.5, 12);
    const elsewhere = seatRates(R, {
      ...base,
      place: placeProfile(R, 'ember-caves')!,
      world: { ...world, special },
    });
    expect(elsewhere.scrap).toBeCloseTo(
      seatRates(R, { ...base, place: placeProfile(R, 'ember-caves')! }).scrap,
      12,
    );
    const pages = specialOf('tidepools', { kind: 'journal', bp: 10_000 });
    expect(
      seatRates(R, { ...base, world: { ...world, special: pages } }).pages /
        seatRates(R, base).pages,
    ).toBeCloseTo(2, 12);
  });
});

describe('the seat price ladder (V-POST-2)', () => {
  it('rises with the seats owned, is dearer at a higher level and ends at the level limit', () => {
    expect(seatLimit(R, 1)).toBe(2);
    expect(seatLimit(R, 5)).toBe(6);
    expect(seatPrice(R, 0, 1)).toBe(0);
    expect(seatPrice(R, 1, 1)).toBe(R.seats.scoutPrices[1]);
    expect(seatPrice(R, 2, 1)).toBeNull();
    expect(seatPrice(R, 2, 2)).toBe(
      Math.ceil(R.seats.scoutPrices[2]! * (1 + R.seats.levelSurcharge)),
    );
    expect(seatPrice(R, 6, 5)).toBeNull();
  });
});

describe('settle with seats', () => {
  it('takes effective hours into the store and pays scrap as an expected value with a carry', () => {
    const s = settle(start(), 0, 10 * H, []);
    expect(s.seats?.[0]?.storeHours).toBeCloseTo(10, 9);
    const rates = seatRates(R, {
      place: placeProfile(R, 'tidepools')!,
      fit: false,
      masteryHours: 0,
      kit: null,
      second: false,
      world: { night: false, festival: false, special: null },
    });
    const scrap = (s.seats?.[0]?.scrap ?? 0) + (s.seats?.[0]?.scrapCarry ?? 0);
    expect(scrap).toBeCloseTo(10 * rates.scrap, 6);
    expect(s.creatures[0]?.scoutHours).toBeCloseTo(10, 9);
    expect(hoursOf(s)).toBeCloseTo(10, 9);
  });

  it('does nothing for an empty seat or an unknown place', () => {
    const s = settle(
      start([seat({ creature: -1 }), seat({ id: 's2', destination: 'nowhere' })]),
      0,
      10 * H,
      [],
    );
    expect(s.seats?.every((x) => x.storeHours === 0 && x.scrap === 0)).toBe(true);
    expect(s.stretches).toBeUndefined();
  });

  it('stops picking up when the store is full but the scout keeps growing (V-SCOUT-4)', () => {
    const s = settle(start(), 0, 100 * H, []);
    expect(s.seats?.[0]?.storeHours).toBe(R.posts.storeHours);
    expect(hoursOf(s)).toBeCloseTo(R.posts.storeHours, 9);
    // 100 hours of work: 48 at full share, then 0.85 to 96, then 0.6: all of it counts as mastery.
    const effective = 48 + 48 * 0.85 + 4 * 0.6;
    expect(s.creatures[0]?.scoutHours).toBeCloseTo(effective, 6);
    // A creature that cannot fill any more picks up nothing further.
    const more = settle(s, 100 * H, 200 * H, []);
    expect(hoursOf(more)).toBe(0);
    expect(more.seats?.[0]?.storeHours).toBe(R.posts.storeHours);
  });

  it('splits where mastery steps up, so the bonus counts from the step (V-POST-12)', () => {
    const s = settle(start([seat()]), 0, 60 * H, []);
    const stretches = s.stretches ?? [];
    // Skilled at 48 effective hours: the rate rises at the step, not before.
    const before = stretches.filter((x) => x.at < 48 * H);
    const after = stretches.filter((x) => x.at >= 48 * H);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]!.rates.scrap / before[0]!.rates.scrap).toBeCloseTo(1.05, 9);
  });

  it('is invariant under splitting: a to c equals a to b to c, wherever b falls', () => {
    const whole = settle(start(), 0, 200 * H, []);
    for (const mid of [1 * H, 47.5 * H, 48 * H, 71.3 * H, 96 * H, 150 * H]) {
      const half = settle(settle(start(), 0, mid, []), mid, 200 * H, []);
      const a = stateOf(whole);
      const b = stateOf(half);
      expect(b.seats?.[0]?.storeHours).toBeCloseTo(a.seats![0]!.storeHours, 6);
      expect(b.seats![0]!.scrap + b.seats![0]!.scrapCarry).toBeCloseTo(
        a.seats![0]!.scrap + a.seats![0]!.scrapCarry,
        6,
      );
      expect(b.seats![0]!.shards + b.seats![0]!.shardCarry).toBeCloseTo(
        a.seats![0]!.shards + a.seats![0]!.shardCarry,
        6,
      );
      expect(b.creatures[0]?.scoutHours).toBeCloseTo(a.creatures[0]!.scoutHours!, 6);
    }
    const expected = (st: SettleState): number =>
      (st.stretches ?? []).reduce((sum, x) => sum + x.hours * x.rates.creatures, 0);
    const first = settle(start(), 0, 70 * H, []);
    const second = settle(first, 70 * H, 200 * H, []);
    expect(expected(first) + expected(second)).toBeCloseTo(expected(whole), 9);
  });

  it('changes nothing when settled again at the same now, and never changes its input', () => {
    const input = start();
    const frozen = JSON.stringify(input);
    const a = settle(input, 0, 30 * H, []);
    expect(JSON.stringify(input)).toBe(frozen);
    const b = settle(a, 30 * H, 30 * H, []);
    expect(stateOf(b)).toEqual(stateOf(a));
    expect(b.stretches).toBeUndefined();
  });

  it('counts only the away share after a long absence (V-POST-10 applies to output too)', () => {
    const s = settle(start(), 0, 168 * H, []);
    // Curve B over 7 days: 48 at 1, 48 at 0.85, 72 at 0.6; the store holds 72 effective hours, so it filled on day 3.
    expect(s.seats?.[0]?.storeHours).toBe(R.posts.storeHours);
    const weekly = settle(start([seat({ storeHours: 0 })]), 0, 24 * H, []);
    expect(weekly.seats?.[0]?.storeHours).toBeCloseTo(24, 9);
  });

  it('follows the world: night falls at the reef and the rates split there', () => {
    const world: WorldClock = {
      at: (t) => ({ night: Math.floor(t / (12 * H)) % 2 === 1, festival: false, special: null }),
      nextChange: (t) => (Math.floor(t / (12 * H)) + 1) * 12 * H,
    };
    const input = start([seat({ destination: 'moonlit-reef' })]);
    const s = settle(input, 0, 24 * H, [], { world });
    const stretches = s.stretches ?? [];
    const day = stretches.find((x) => !x.world.night)!;
    const night = stretches.find((x) => x.world.night)!;
    expect(night.rates.creatures / day.rates.creatures).toBeCloseTo(R.scouts.nightMultiplier, 9);
    const split = settle(settle(input, 0, 5 * H, [], { world }), 5 * H, 24 * H, [], { world });
    expect(split.seats?.[0]?.storeHours).toBeCloseTo(s.seats![0]!.storeHours, 9);
  });

  it('pays nothing while a festival place is closed', () => {
    const closed: WorldClock = {
      at: () => ({ night: false, festival: false, special: null }),
      nextChange: () => Infinity,
    };
    const s = settle(start([seat({ destination: 'festival-grounds' })]), 0, 10 * H, [], {
      world: closed,
    });
    expect(s.seats?.[0]?.storeHours).toBe(0);
    const open: WorldClock = {
      at: () => ({ night: false, festival: true, special: null }),
      nextChange: () => Infinity,
    };
    const t = settle(start([seat({ destination: 'festival-grounds' })]), 0, 10 * H, [], {
      world: open,
    });
    expect(t.seats?.[0]?.storeHours).toBeCloseTo(10, 9);
  });

  it('counts the twist at its place for the week it holds (V-SCOUT-11)', () => {
    const special = specialOf('tidepools', { kind: 'xp', bp: 10_000 });
    const world: WorldClock = {
      at: () => ({ night: false, festival: false, special }),
      nextChange: () => Infinity,
    };
    const s = settle(start(), 0, 10 * H, [], { world });
    // "Learn twice as much": ten hours of work count as twenty of mastery.
    expect(s.creatures[0]?.scoutHours).toBeCloseTo(20, 9);
  });
});

describe('what arrives (V-SCOUT-3, 12)', () => {
  const species: FindableSpecies[] = [
    { id: 'a', element: 'tide', rarity: 0, owned: true, resident: true },
    { id: 'b', element: 'ember', rarity: 0, owned: false, resident: false },
    { id: 'c', element: 'tide', rarity: 1, owned: false, resident: true },
    { id: 'd', element: 'grove', rarity: 2, owned: false, resident: false },
  ];
  const place = placeProfile(R, 'tidepools')!;
  const tally = (options: Parameters<typeof pickSpecies>[4], n = 6000): number[] => {
    const rng = createSeededRng('scouts-pick');
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) counts[pickSpecies(rng, R, species, place, options)]! += 1;
    return counts;
  };

  it('weighs the place element, the rarity and a lure (the lab rule)', () => {
    const plain = tally({ lure: false, special: null });
    // a (tide common) beats b (ember common) by the place affinity; epics are rare.
    expect(plain[0]! / plain[1]!).toBeGreaterThan(R.scouts.placeAffinity * 0.85);
    expect(plain[3]!).toBeLessThan(plain[1]! * 0.2);
    const lure = tally({ lure: true, special: null });
    expect(lure[0]! / plain[0]!).toBeLessThan(0.8);
  });

  it('draws only new species when the first scout needs one, and favours the featured resident', () => {
    const fresh = tally({ lure: false, special: null, needNew: true }, 500);
    expect(fresh[0]).toBe(0);
    const special = specialOf('tidepools', { kind: 'featured', rarity: 'rare', weight: 9 });
    const featured = tally({ lure: false, special });
    const plain = tally({ lure: false, special: null });
    expect(featured[2]! / plain[2]!).toBeGreaterThan(3);
  });

  it('draws a Poisson count with the right mean from an injected RNG', () => {
    const rng = createSeededRng('poisson');
    let sum = 0;
    for (let i = 0; i < 4000; i++) sum += poissonDraw(rng, 0.7);
    expect(sum / 4000).toBeGreaterThan(0.65);
    expect(sum / 4000).toBeLessThan(0.75);
    expect(poissonDraw(rng, 0)).toBe(0);
    expect(poissonDraw(rng, -1)).toBe(0);
  });
});
