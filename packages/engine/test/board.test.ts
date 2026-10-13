import { describe, expect, it } from 'vitest';
import { RULES, content, rankFactorBp } from '@creatures/game';
import {
  autoPlace,
  compactRow,
  fillWithGuests,
  makeSlot,
  matchupBp,
  neighbours,
  resolveGuests,
  scaleBoss,
  turnOrder,
  zoneIndices,
  zoneOfIndex,
  zoneSizes,
  type FightSlot,
} from '../src/index';
import { boss, slot, species } from './helpers';

describe('zones', () => {
  it('splits rows of 1 to 45 into contiguous thirds with leftovers in the middle', () => {
    for (let n = 1; n <= 45; n++) {
      const sizes = zoneSizes(n);
      expect(sizes.front + sizes.middle + sizes.back).toBe(n);
      expect(sizes.front).toBe(Math.floor(n / 3));
      expect(sizes.back).toBe(sizes.front);
      expect(sizes.middle).toBeGreaterThanOrEqual(sizes.front);
      // Contiguous and ordered front, middle, back.
      const zones = Array.from({ length: n }, (_, i) => zoneOfIndex(i, n));
      const order = { front: 0, middle: 1, back: 2 };
      for (let i = 1; i < n; i++) {
        expect(order[zones[i]!]).toBeGreaterThanOrEqual(order[zones[i - 1]!]);
      }
      expect(zoneIndices('front', n)).toHaveLength(sizes.front);
      expect(zoneIndices('middle', n)).toHaveLength(sizes.middle);
      expect(zoneIndices('back', n)).toHaveLength(sizes.back);
    }
  });

  it('matches known examples', () => {
    expect(zoneSizes(9)).toEqual({ front: 3, middle: 3, back: 3 });
    expect(zoneSizes(10)).toEqual({ front: 3, middle: 4, back: 3 });
    expect(zoneSizes(11)).toEqual({ front: 3, middle: 5, back: 3 });
    expect(zoneSizes(45)).toEqual({ front: 15, middle: 15, back: 15 });
    expect(zoneSizes(2)).toEqual({ front: 0, middle: 2, back: 0 });
    expect(zoneSizes(1)).toEqual({ front: 0, middle: 1, back: 0 });
    expect(zoneIndices('middle', 10)).toEqual([3, 4, 5, 6]);
  });

  it('rejects bad lengths', () => {
    expect(() => zoneSizes(-1)).toThrow(RangeError);
    expect(() => zoneSizes(1.5)).toThrow(RangeError);
  });

  it('finds neighbours directly left and right', () => {
    expect(neighbours(0, 5)).toEqual([1]);
    expect(neighbours(2, 5)).toEqual([1, 3]);
    expect(neighbours(4, 5)).toEqual([3]);
    expect(neighbours(0, 1)).toEqual([]);
  });
});

describe('matchups', () => {
  it('follows Tide > Ember > Grove > Spark > Tide', () => {
    const cycle = ['tide', 'ember', 'grove', 'spark'] as const;
    for (let i = 0; i < 4; i++) {
      const a = cycle[i]!;
      const next = cycle[(i + 1) % 4]!;
      const prev = cycle[(i + 3) % 4]!;
      const opposite = cycle[(i + 2) % 4]!;
      expect(matchupBp(a, next)).toBe(15_000);
      expect(matchupBp(a, prev)).toBe(7_500);
      expect(matchupBp(a, a)).toBe(10_000);
      expect(matchupBp(a, opposite)).toBe(10_000);
    }
  });
});

describe('turn order', () => {
  const cs = [
    { idx: 0, spd: 5 },
    { idx: 1, spd: 9 },
    { idx: 2, spd: 5 },
    { idx: 3, spd: 9 },
  ];
  it('left to right and right to left', () => {
    expect(turnOrder(cs, 'left_to_right')).toEqual([0, 1, 2, 3]);
    expect(turnOrder(cs, 'right_to_left')).toEqual([3, 2, 1, 0]);
  });
  it('speed: highest first, ties by position', () => {
    expect(turnOrder(cs, 'speed')).toEqual([1, 3, 0, 2]);
  });
});

describe('scaleBoss', () => {
  const b = boss('tidal-colossus');

  it('pins the exponent maths so every runtime agrees', () => {
    // floor(Math.pow(N, exponent) * 10000), checked against another run of V8. Every exponent the
    // balance simulator has shipped is listed; moving the exponent means adding its row here.
    const pinned: Record<string, Record<number, number>> = {
      '9/10': { 1: 10_000, 2: 18_660, 5: 42_566, 10: 79_432, 15: 114_414, 30: 213_505 },
      '12/10': { 1: 10_000, 2: 22_973, 5: 68_986, 10: 158_489, 15: 257_815, 30: 592_305 },
      '11/10': { 1: 10_000, 2: 21_435, 5: 58_730, 10: 125_892, 15: 196_652, 30: 421_534 },
      '105/100': { 1: 10_000, 2: 20_705, 5: 54_189, 10: 112_201, 15: 171_749, 30: 355_612 },
      '121/100': { 1: 10_000, 2: 23_133, 5: 70_105, 10: 162_181, 15: 264_892, 30: 612_797 },
      '100/100': { 1: 10_000, 2: 20_000, 5: 50_000, 10: 100_000, 15: 150_000, 30: 300_000 },
      '107/100': { 1: 10_000, 2: 20_994, 5: 55_962, 10: 117_489, 15: 181_308, 30: 380_644 },
      '104/100': { 1: 10_000, 2: 20_562, 5: 53_324, 10: 109_647, 15: 167_160, 30: 343_721 },
      '113/100': { 1: 10_000, 2: 21_885, 5: 61_636, 10: 134_896, 15: 213_296, 30: 466_817 },
      '112/100': { 1: 10_000, 2: 21_734, 5: 60_652, 10: 131_825, 15: 207_597, 30: 451_206 },
      '123/100': { 1: 10_000, 2: 23_456, 5: 72_399, 10: 169_824, 15: 279_635, 30: 655_932 },
      '115/100': { 1: 10_000, 2: 22_191, 5: 63_652, 10: 141_253, 15: 225_167, 30: 499_677 },
    };
    // The rules' exponent and every exponent a shipped boss carries.
    const used = [
      RULES.raid.scaling.hpExponent,
      ...content.bosses.flatMap((x) => (x.hpExponent === undefined ? [] : [x.hpExponent])),
    ];
    const baseHp = 10_000;
    for (const { num, den } of used) {
      const expected = pinned[`${num}/${den}`];
      expect(expected, `pin the exponent ${num}/${den} here`).toBeDefined();
      for (const [n, bp] of Object.entries(expected ?? {})) {
        const exponent = { num, den };
        expect(scaleBoss({ baseHp, baseAtk: 1, hpExponent: exponent }, Number(n), 1).maxHp).toBe(
          (baseHp * bp) / 10_000,
        );
      }
    }
  });

  it('is at least 1 player and rank 1 and uses the rank factor', () => {
    expect(scaleBoss(b, 0, 1)).toEqual(scaleBoss(b, 1, 1));
    expect(scaleBoss(b, -5, 0)).toEqual(scaleBoss(b, 1, 1));
    expect(scaleBoss(b, 1, 1)).toEqual({ maxHp: b.baseHp, atk: b.baseAtk });
    // Rank 3: the step compounds twice (floored each time), Attack follows at its share.
    const step = RULES.raid.scaling.rankStepBp;
    const f2 = Math.floor((10_000 * (10_000 + step)) / 10_000);
    const f3 = Math.floor((f2 * (10_000 + step)) / 10_000);
    expect(rankFactorBp(3)).toBe(f3);
    const r3 = scaleBoss({ baseHp: 1000, baseAtk: 100 }, 1, 3);
    expect(r3.maxHp).toBe(Math.floor((1000 * f3) / 10_000));
    const atkBp = 10_000 + Math.floor(((f3 - 10_000) * RULES.raid.scaling.atkRankShareBp) / 10_000);
    expect(r3.atk).toBe(Math.floor((100 * atkBp) / 10_000));
    // The creatures' levels play no part: the signature takes a head count and a rank only.
    expect(scaleBoss.length).toBe(3);
  });

  it('keeps the rank in 1..maxRank and floors fractions', () => {
    expect(scaleBoss(b, 5, 0)).toEqual(scaleBoss(b, 5, 1));
    expect(scaleBoss(b, 5, Number.NaN)).toEqual(scaleBoss(b, 5, 1));
    expect(scaleBoss(b, 5, 3.9)).toEqual(scaleBoss(b, 5, 3));
    const max = RULES.raid.scaling.maxRank;
    expect(scaleBoss(b, 5, max + 50)).toEqual(scaleBoss(b, 5, max));
  });

  it('stays exact for the biggest boss at the top rank', () => {
    const big = scaleBoss({ baseHp: 10 ** 7, baseAtk: 100 }, 15, RULES.raid.scaling.maxRank);
    expect(Number.isSafeInteger(big.maxHp)).toBe(true);
    const { num, den } = RULES.raid.scaling.hpExponent;
    const players = BigInt(
      Math.floor((10 ** 7 * Math.floor(Math.pow(15, num / den) * 10_000)) / 10_000),
    );
    expect(big.maxHp).toBe(
      Number((players * BigInt(rankFactorBp(RULES.raid.scaling.maxRank))) / 10_000n),
    );
  });

  it('weighs every player the same: a veteran adds what a newcomer adds', () => {
    // The head count is the only player input, so there is no per-player weight to cap.
    const { num, den } = b.hpExponent ?? RULES.raid.scaling.hpExponent;
    const bp = (n: number) => Math.floor(Math.pow(n, num / den) * 10_000);
    for (let n = 1; n <= 14; n++) {
      const add = scaleBoss(b, n + 1, 4).maxHp - scaleBoss(b, n, 4).maxHp;
      const expected =
        Math.floor((Math.floor((b.baseHp * bp(n + 1)) / 10_000) * rankFactorBp(4)) / 10_000) -
        Math.floor((Math.floor((b.baseHp * bp(n)) / 10_000) * rankFactorBp(4)) / 10_000);
      expect(add).toBe(expected);
    }
  });

  it("uses the boss's own head-count exponent when it has one, else the rules'", () => {
    expect(
      scaleBoss({ baseHp: 10_000, baseAtk: 1, hpExponent: { num: 1, den: 1 } }, 7, 1).maxHp,
    ).toBe(70_000);
    const plain = scaleBoss({ baseHp: 10_000, baseAtk: 1 }, 7, 1).maxHp;
    const { num, den } = RULES.raid.scaling.hpExponent;
    expect(plain).toBe(Math.floor(Math.pow(7, num / den) * 10_000));
    expect(
      scaleBoss({ baseHp: 10_000, baseAtk: 1, hpExponent: { num: 2, den: 1 } }, 7, 1).maxHp,
    ).toBeGreaterThan(plain);
  });

  it('never decreases with more players or higher ranks', () => {
    let prev = scaleBoss(b, 1, 1);
    for (let players = 2; players <= 30; players++) {
      const next = scaleBoss(b, players, 1);
      expect(next.maxHp).toBeGreaterThan(prev.maxHp);
      expect(next.atk).toBe(prev.atk);
      prev = next;
    }
    prev = scaleBoss(b, 5, 1);
    for (let rank = 2; rank <= 30; rank++) {
      const next = scaleBoss(b, 5, rank);
      expect(next.maxHp).toBeGreaterThan(prev.maxHp);
      expect(next.atk).toBeGreaterThanOrEqual(prev.atk);
      prev = next;
    }
    // Per-player HP follows the exponent: it falls below 1, rises above 1 (bigger servers earn
    // more per player, so their bosses are tougher per head).
    const { num, den } = RULES.raid.scaling.hpExponent;
    const small = scaleBoss(b, 5, 2).maxHp / 5;
    const large = scaleBoss(b, 15, 2).maxHp / 15;
    if (num < den) expect(large).toBeLessThan(small);
    else if (num > den) expect(large).toBeGreaterThan(small);
  });
});

describe('autoPlace', () => {
  const mk = (id: string, role: FightSlot['role'], owner = 'p1') => slot(id, { role, owner });

  it('puts guards at the front, payoffs at the back, setters next to payoffs, supports in the middle', () => {
    const empty = Array<FightSlot | null>(9).fill(null);
    const placed = autoPlace(
      empty,
      new Map([
        ['p1', [mk('sup', 'support'), mk('set', 'setter'), mk('pay', 'payoff')]],
        ['p2', [mk('grd', 'guard', 'p2'), mk('pay2', 'payoff', 'p2'), mk('set2', 'setter', 'p2')]],
      ]),
    );
    const ids = placed.map((s) => s?.id ?? null);
    expect(ids[0]).toBe('grd');
    expect(ids[8]).toBe('pay');
    expect(ids[7]).toBe('pay2');
    // Setters sit directly left of the payoff block.
    expect(ids[6]).toBe('set');
    expect(ids[5]).toBe('set2');
    // The support takes the free slot nearest the centre (index 4).
    expect(ids[4]).toBe('sup');
    expect(placed.filter((s) => s !== null)).toHaveLength(6);
  });

  it('never moves creatures that are already placed', () => {
    const existing: (FightSlot | null)[] = [null, mk('fixed', 'payoff'), null, null, null];
    const placed = autoPlace(existing, new Map([['p1', [mk('g', 'guard'), mk('p', 'payoff')]]]));
    expect(placed[1]?.id).toBe('fixed');
    expect(placed[0]?.id).toBe('g');
    expect(placed[4]?.id).toBe('p');
    // Input row is not mutated.
    expect(existing[0]).toBeNull();
  });

  it('skips creatures that are already in the row and sets the owner from the map key', () => {
    const fixed = mk('a', 'guard');
    const placed = autoPlace([fixed, null], new Map([['p9', [fixed, mk('b', 'support', 'x')]]]));
    expect(placed.map((s) => s?.id)).toEqual(['a', 'b']);
    expect(placed[1]?.ownerId).toBe('p9');
  });

  it('throws when there are not enough free slots', () => {
    expect(() =>
      autoPlace([null], new Map([['p1', [mk('a', 'guard'), mk('b', 'guard')]]])),
    ).toThrow(RangeError);
  });

  it('is deterministic and compactRow drops empty slots', () => {
    const empty = Array<FightSlot | null>(6).fill(null);
    const unplaced = new Map([['p1', [mk('a', 'setter'), mk('b', 'payoff'), mk('c', 'guard')]]]);
    expect(autoPlace(empty, unplaced)).toEqual(autoPlace(empty, unplaced));
    expect(compactRow(autoPlace(empty, unplaced))).toHaveLength(3);
  });
});

describe('fillWithGuests', () => {
  const guests = resolveGuests(content);

  it('fills a row up to 9 slots with ownerless guests at the average level', () => {
    const mine = ['a', 'b', 'c'].map((id) => slot(id));
    const row = fillWithGuests([...mine, null, null, null, null, null, null], guests, 7);
    const dense = compactRow(row);
    expect(dense).toHaveLength(9);
    expect(row.slice(0, 3).map((s) => s?.id)).toEqual(['a', 'b', 'c']);
    const added = dense.filter((s) => s.ownerId === null);
    expect(added).toHaveLength(6);
    expect(new Set(added.map((s) => s.id)).size).toBe(6);
    for (const g of added) {
      expect(g.level).toBe(7);
      expect(g.stats).toBeDefined();
    }
    // Guard guests go to the front of the free slots, the payoff guest to the back.
    expect(row[3]?.role).toBe('guard');
    expect(row[8]?.role).toBe('payoff');
  });

  it('extends a short row, caps the level at the species cap and leaves full rows alone', () => {
    const row = fillWithGuests([], guests, 99);
    expect(row).toHaveLength(9);
    for (const g of compactRow(row)) {
      expect(g.level).toBe(species(g.speciesId).levelCap);
      expect(g.level).toBeLessThanOrEqual(15);
    }
    const full = Array.from({ length: 9 }, (_, i) => slot(`s${i}`));
    expect(fillWithGuests(full, guests, 5)).toEqual(full);
  });

  it('needs at least one guest definition', () => {
    expect(() => fillWithGuests([], [], 5)).toThrow(RangeError);
  });

  it('makeSlot computes effective stats including fusion', () => {
    const sp = species('zipmouse');
    const s = makeSlot(sp, { id: 'z', ownerId: 'p', level: 3, fusionCount: 2 });
    // base 28 + 2*2 = 32 attack, +11% fusion = 35.52 -> 35
    expect(s.stats?.atk).toBe(35);
    expect(s.element).toBe('spark');
    expect(s.role).toBe('setter');
  });
});
