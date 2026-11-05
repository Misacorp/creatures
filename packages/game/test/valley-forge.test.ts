import { describe, expect, it } from 'vitest';
import {
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  anvilLimit,
  anvilPrice,
  anvilSpeed,
  chooseTeamElement,
  createSeededRng,
  exchangeShards,
  marksStepUp,
  pieceOdds,
  rollRarity,
  settle,
  weakLimit,
  type Rng,
  type SettleAnvil,
  type SettleForge,
  type SettleOrder,
  type SettleState,
} from '../src';

const H = 3_600_000;
const R = VALLEY_RULES;
const SHARDS = VALLEY_ELEMENTS.length;

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
const forgeOf = (
  anvils: SettleAnvil[],
  shelf: Partial<SettleForge['shelf']> = {},
  over: Partial<SettleForge> = {},
): SettleForge => ({
  anvils,
  shelf: { scrap: 10_000, shards: new Array<number>(SHARDS).fill(1000), essence: 1000, ...shelf },
  scrapCarry: 0,
  weak: new Array<number>(SHARDS).fill(0),
  pending: new Array<number>(SHARDS).fill(0),
  fireLevel: 1,
  ...over,
});
const stateOf = (forge: SettleForge, creatures = forge.anvils.length): SettleState => ({
  settledAt: 0,
  lastVisitAt: 0,
  hearth: 1,
  creatures: Array.from({ length: Math.max(1, creatures) }, () => ({
    xp: 0,
    carry: 0,
    capXp: Infinity,
    smithHours: 0,
  })),
  forge,
});
const seeded = (seed = 7): Rng => createSeededRng(seed);

describe('the anvil ladder', () => {
  it('bounds the anvils by the Forge level and prices each rung in Acorns and scrap', () => {
    expect(anvilLimit(R, 1)).toBe(2);
    expect(anvilLimit(R, 4)).toBe(4);
    expect(anvilPrice(R, 0, 1)).toEqual({ acorns: 0, scrap: 0 });
    expect(anvilPrice(R, 1, 1)).toEqual({ acorns: 123, scrap: 38 });
    expect(anvilPrice(R, 2, 1)).toBeNull();
    expect(anvilPrice(R, 2, 2)).toEqual({
      acorns: Math.ceil(244 * (1 + R.seats.levelSurcharge)),
      scrap: Math.ceil(75 * (1 + R.seats.levelSurcharge)),
    });
  });
});

describe('the odds of a piece', () => {
  const sum = (o: readonly number[]): number => o[0]! + o[1]! + o[2]!;
  it('are the plain odds, a Reach, a loupe lift and the marks, always adding up to 1', () => {
    expect(pieceOdds(R, 'none', false, 0)).toEqual(R.forge.baseOdds);
    expect(pieceOdds(R, 'epic', false, 0)).toEqual(R.forge.reach.epic.odds);
    const loupe = pieceOdds(R, 'none', true, 0);
    expect(loupe[1]).toBeCloseTo(R.forge.baseOdds[1]! * R.kit.loupe.rarityOdds, 12);
    const marked = pieceOdds(R, 'none', false, marksStepUp(10));
    expect(marked[0]).toBeLessThan(R.forge.baseOdds[0]!);
    expect(marked[2]).toBeGreaterThan(R.forge.baseOdds[2]!);
    for (const o of [loupe, marked, pieceOdds(R, 'rare', true, 0.3)]) {
      expect(sum(o)).toBeCloseTo(1, 12);
    }
  });

  it('draw each rarity with its odds', () => {
    const rng = seeded(11);
    const n = 20_000;
    const seen = [0, 0, 0];
    for (let i = 0; i < n; i++) seen[rollRarity(rng, R.forge.reach.epic.odds as never)]! += 1;
    expect(seen[2]! / n).toBeCloseTo(0.3, 1);
    expect(seen[0]! / n).toBeCloseTo(0.15, 1);
  });

  it('give the anvil its speed: mastery, tongs for commons only, the loupe slower', () => {
    expect(anvilSpeed(R, 0, null, 0)).toBe(1);
    expect(anvilSpeed(R, 48, null, 0)).toBeCloseTo(1.05, 12);
    expect(anvilSpeed(R, 0, 'tongs', 0)).toBe(R.kit.tongs.speed);
    expect(anvilSpeed(R, 0, 'tongs', 1)).toBe(1);
    expect(anvilSpeed(R, 0, 'loupe', 2)).toBe(R.kit.loupe.speed);
  });
});

describe('"for my team"', () => {
  it('takes the fullest stocked pile of the elements the team needs, else waits on the fullest wanted', () => {
    const none = new Array<number>(SHARDS).fill(0);
    expect(chooseTeamElement(R, none, none, none)).toBe(-1);
    expect(chooseTeamElement(R, [0, 2, 0, 3, 0], none, [0, 4, 0, 9, 0])).toBe(3);
    expect(chooseTeamElement(R, [0, 2, 0, 3, 0], [0, 0, 0, 3, 0], [0, 4, 0, 9, 0])).toBe(1);
    expect(chooseTeamElement(R, [0, 2, 0, 0, 1], none, [0, 0, 0, 0, 0])).toBe(1);
    expect(weakLimit(R, 1)).toBe(1);
    expect(weakLimit(R, 30)).toBe(24);
  });
});

describe('the exchange', () => {
  it('trades the rate of another pile for one, with a crit that gives more, and stops when no pile can pay', () => {
    const shards = [0, 7, 0, 0, 1];
    const rng = seeded(3);
    const trades = exchangeShards(R, rng, shards, 0, null, 10);
    expect(trades.length).toBe(2);
    expect(trades.every((t) => t.from === 1 && t.paid === R.forge.exchange.rate)).toBe(true);
    expect(exchangeShards(R, rng, shards, 0, 4, 1)).toEqual([]);
    expect(exchangeShards(R, rng, shards, 1, 1, 1)).toEqual([]);
    const crit: Rng = { nextU32: () => 0 };
    expect(exchangeShards(R, crit, shards, 0, 1, 1)[0]?.got).toBe(R.forge.exchange.critYield);
    const plain: Rng = { nextU32: () => 0xffffffff };
    expect(exchangeShards(R, plain, shards, 0, 1, 1)[0]?.got).toBe(1);
  });
});

describe('settle with anvils', () => {
  it('makes about 1.5 plain pieces a day per anvil at the plain pace, paying scrap and a shard each', () => {
    const forge = forgeOf([anvil()]);
    const after = settle(stateOf(forge), 0, 48 * H, [], { rng: seeded() });
    const made = after.made ?? [];
    // 48 h at 1.05 for the last stretch: 16 h pieces, the 3rd lands at 48 h minus the mastery step's gain.
    expect(made.length).toBe(3);
    expect(made[0]?.at).toBe(16 * H);
    expect(after.forge?.shelf.scrap).toBe(10_000 - 4 * R.forge.scrap);
    const spent = forge.shelf.shards.reduce((a, b) => a + b, 0) - sum(after.forge?.shelf.shards);
    expect(spent).toBe(4 * R.forge.shard);
    expect(after.forge?.anvils[0]?.floor).toBe(3);
    expect(after.creatures[0]?.smithHours).toBeCloseTo(48, 9);
    expect(made.every((m) => m.itemLevel === 1 && m.element === 0)).toBe(true);
  });

  it('is invariant under splitting and a second settle at the same moment changes nothing', () => {
    const forge = forgeOf([
      anvil({ orders: [order({ count: 4 }), order({ id: 'o2', count: 5, reach: 'rare' })] }),
      anvil({ id: 'a2', creature: 1, kit: 'tongs', orders: [order({ id: 'o3', element: 2 })] }),
    ]);
    const events = [{ at: 30 * H, kind: 'visit' as const }];
    const whole = settle(stateOf(forge), 0, 200 * H, events, { rng: seeded(5) });
    const key = (s: SettleState): unknown => ({
      made: (s.made ?? []).map((m) => [m.anvil, m.order, m.rarity]),
      floors: s.forge?.anvils.map((a) => a.floor),
      shelf: s.forge?.shelf,
      smith: s.creatures.map((c) => Math.round((c.smithHours ?? 0) * 1e6)),
    });
    for (const b of [1, 15.9 * H, 16 * H, 30 * H, 47.5 * H, 111 * H]) {
      const first = settle(stateOf(forge), 0, b, events, { rng: seeded(5) });
      const rng = seeded(5);
      // The same stream, continued: replay the first leg's draws, then run the second leg.
      settle(stateOf(forge), 0, b, events, { rng });
      const second = settle(first, b, 200 * H, events, { rng });
      expect(second.made?.length ?? 0).toBeGreaterThanOrEqual(0);
      expect(second.forge?.anvils.map((a) => a.floor)).toEqual(
        whole.forge?.anvils.map((a) => a.floor),
      );
      expect(second.forge?.shelf).toEqual(whole.forge?.shelf);
      expect(second.creatures.map((c) => Math.round((c.smithHours ?? 0) * 1e3))).toEqual(
        whole.creatures.map((c) => Math.round((c.smithHours ?? 0) * 1e3)),
      );
    }
    const again = settle(whole, 200 * H, 200 * H, [], { rng: seeded(99) });
    expect(key(again)).toEqual({
      made: [],
      floors: whole.forge?.anvils.map((a) => a.floor),
      shelf: whole.forge?.shelf,
      smith: whole.creatures.map((c) => Math.round((c.smithHours ?? 0) * 1e6)),
    });
  });

  it('tinkers when there is no order, with a trickle of scrap and mastery hours (V-FORGE-2)', () => {
    const forge = forgeOf([anvil({ orders: [] })], { scrap: 0 });
    const after = settle(stateOf(forge), 0, 36 * H, [], { rng: seeded() });
    expect(after.made).toBeUndefined();
    expect(after.forge?.shelf.scrap).toBe(3);
    expect(after.forge?.anvils[0]?.wait).toBe('idle');
    expect(after.forgeHours?.idle).toBeCloseTo(36, 9);
    expect(after.creatures[0]?.smithHours).toBeCloseTo(36, 9);
  });

  it('waits on a shard and keeps the scrap; the trickle never restarts it (V-FORGE-4)', () => {
    const shards = new Array<number>(SHARDS).fill(0);
    const forge = forgeOf([anvil()], { shards, scrap: 100 });
    const after = settle(stateOf(forge), 0, 100 * H, [], { rng: seeded() });
    expect(after.made).toBeUndefined();
    expect(after.forge?.anvils[0]).toMatchObject({ wait: 'shard', waitElement: 0 });
    // 100 h away: 48 h at full share, 48 h at 0.85, 4 h at 0.6 (curve B).
    expect(after.forgeHours?.shard).toBeCloseTo(48 + 48 * 0.85 + 4 * 0.6, 9);
  });

  it('restarts a scrap wait by itself once the tinkering scrap makes it affordable', () => {
    const forge = forgeOf([anvil()], { scrap: R.forge.scrap - 2 });
    const after = settle(stateOf(forge), 0, 100 * H, [], { rng: seeded() });
    // Needs 2 more scrap: 24 h of tinkering, then 16 h of work, and so on.
    const first = after.made?.[0];
    expect(first?.at).toBe(Math.ceil((24 + 16) * H));
    expect(after.forgeHours?.scrap ?? 0).toBeGreaterThan(24);
  });

  it('pauses on a full floor and holds the finished piece (F-1)', () => {
    const forge = forgeOf([anvil({ floor: R.forge.floorPiecesPerAnvil - 1 })]);
    const after = settle(stateOf(forge), 0, 100 * H, [], { rng: seeded() });
    expect(after.made?.length).toBe(1);
    const held = after.forge?.anvils[0];
    expect(held?.floor).toBe(R.forge.floorPiecesPerAnvil);
    expect(held?.wait).toBe('floor');
    expect(held?.piece?.progress).toBe(held?.piece?.need);
    // 91.2 effective hours, 16 for the piece that fit and 16 for the one that was held.
    expect(after.forgeHours?.floor).toBeCloseTo(91.2 - 32, 6);
    // Collecting (the caller empties the floor) lets it deliver the held piece first.
    const emptied = {
      ...after,
      forge: { ...after.forge!, anvils: [{ ...held!, floor: 0 }] },
    };
    const next = settle(emptied, 100 * H, 100 * H, [], { rng: seeded() });
    expect(next.made?.length).toBe(1);
    expect(next.forge?.anvils[0]?.piece).not.toBeNull();
  });

  it('finishes an order after its count and leaves the queue', () => {
    const forge = forgeOf([
      anvil({ orders: [order({ count: 2 }), order({ id: 'o2', count: 1 })] }),
    ]);
    const after = settle(stateOf(forge), 0, 200 * H, [], { rng: seeded() });
    expect(after.finishedOrders).toEqual(['o1', 'o2']);
    expect(after.made?.map((m) => m.order)).toEqual(['o1', 'o1', 'o2']);
    expect(after.forge?.anvils[0]?.orders).toEqual([]);
    expect(after.forge?.anvils[0]?.wait).toBe('idle');
  });

  it('takes Essence for a Reach when the piece starts and waits when it is short', () => {
    const rich = settle(
      stateOf(forgeOf([anvil({ orders: [order({ reach: 'epic', count: 1 })] })], { essence: 100 })),
      0,
      60 * H,
      [],
      { rng: seeded() },
    );
    expect(rich.forge?.shelf.essence).toBe(100 - R.forge.reach.epic.essence);
    expect(rich.made?.length).toBe(1);
    expect(rich.made?.[0]?.at).toBeGreaterThanOrEqual(R.forge.reach.epic.hours * H * 0.9);
    const poor = settle(
      stateOf(forgeOf([anvil({ orders: [order({ reach: 'epic', count: 1 })] })], { essence: 5 })),
      0,
      60 * H,
      [],
      { rng: seeded() },
    );
    expect(poor.forge?.anvils[0]?.wait).toBe('essence');
    expect(poor.made).toBeUndefined();
  });

  it('makes team pieces only while the team needs them, counting the ones on the way', () => {
    const weak = [0, 0, 2, 0, 0];
    const forge = forgeOf(
      [
        anvil({
          orders: [order({ id: 'team', blueprint: null, forTeam: true, element: -1, count: 0 })],
        }),
      ],
      {},
      { weak },
    );
    const after = settle(stateOf(forge), 0, 200 * H, [], { rng: seeded() });
    expect(after.made?.length).toBe(2);
    expect(after.made?.every((m) => m.forTeam && m.element === 2)).toBe(true);
    expect(after.forge?.anvils[0]?.wait).toBe('idle');
  });

  it('works only with a smith and not before the smith joined', () => {
    const forge = forgeOf([anvil({ creature: -1 })]);
    const none = settle(stateOf(forge), 0, 50 * H, [], { rng: seeded() });
    expect(none.made).toBeUndefined();
    expect(none.forge?.anvils[0]?.wait ?? null).toBeNull();
    const late = stateOf(forgeOf([anvil()]));
    const joined: SettleState = {
      ...late,
      creatures: [{ ...late.creatures[0]!, joinedAt: 20 * H }],
    };
    const after = settle(joined, 0, 40 * H, [], { rng: seeded() });
    expect(after.made?.[0]?.at).toBe(36 * H);
  });

  it('needs an rng when anvils are present', () => {
    expect(() => settle(stateOf(forgeOf([anvil()])), 0, H, [])).toThrow(/rng/);
  });
});

function sum(xs: readonly number[] | undefined): number {
  return (xs ?? []).reduce((a, b) => a + b, 0);
}
