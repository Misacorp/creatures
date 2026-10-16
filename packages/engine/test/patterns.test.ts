import { createSeededRng, type Gimmick, type Rng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { defaultAbilityRound, firingIndex, simulateFight } from '../src/index';
import {
  PATTERN_DICE,
  diceWindow,
  planBarrage,
  planChain,
  planLance,
  planPattern,
  planPincer,
  planSlam,
  planSweep,
  type PatternContext,
  type PatternCreature,
} from '../src/patterns';
import { TEST_PACK, eventsOf, input, inRound } from './helpers';
import { everyRound, fightWith, gimmickHits, rowOf, rulesOf } from './pattern-helpers';

/** A plan context over `n` creatures with optional per-slot overrides (dead, role, atk). */
function world(
  n: number,
  over: Readonly<Record<number, Partial<PatternCreature>>> = {},
  extra: Partial<PatternContext> = {},
): PatternContext {
  const creatures: PatternCreature[] = Array.from({ length: n }, (_, idx) => ({
    idx,
    id: `s${String(idx)}`,
    atk: 10,
    role: 'payoff',
    alive: true,
    ...over[idx],
  }));
  return { creatures, n, firing: 1, dice: Array.from({ length: 10 }, () => 0), ...extra };
}

describe('pattern dice windows', () => {
  it('gives each gimmick its own ten of the forty dice', () => {
    const dice = Array.from({ length: PATTERN_DICE }, (_, i) => i);
    expect(PATTERN_DICE).toBe(40);
    expect(diceWindow(dice, 0)).toEqual(dice.slice(0, 10));
    expect(diceWindow(dice, 3)).toEqual(dice.slice(30, 40));
  });
});

describe('planSweep', () => {
  const spec = { rows: ['middle', 'back', 'front'] as const, power: 100 };

  it('walks rows[(firing - 1) mod length]', () => {
    const rows = [1, 2, 3, 4].map((firing) => planSweep(world(9, {}, { firing }), spec).rows);
    expect(rows).toEqual([['middle'], ['back'], ['front'], ['middle']]);
    expect(planSweep(world(9, {}, { firing: 1 }), spec).targets).toEqual([3, 4, 5]);
  });

  it('all hits every row, left to right, skipping wiped rows', () => {
    const all = { rows: ['all'] as const, power: 100 };
    expect(planSweep(world(9), all).targets).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const noMiddle = planSweep(
      world(9, { 3: { alive: false }, 4: { alive: false }, 5: { alive: false } }),
      all,
    );
    expect(noMiddle.targets).toEqual([0, 1, 2, 6, 7, 8]);
    expect(noMiddle.rows).toEqual(['front', 'back']);
  });

  it('falls to the nearest living row when the named row is wiped, and never hits the dead', () => {
    const dead = (...i: number[]) => Object.fromEntries(i.map((k) => [k, { alive: false }]));
    // Middle named, Middle wiped: the front side wins the tie.
    const tie = planSweep(world(9, dead(3, 4, 5)), { rows: ['middle'], power: 100 });
    expect(tie.rows).toEqual(['front']);
    // Front named, Front and Middle wiped: the Back row.
    const far = planSweep(world(9, dead(0, 1, 2, 3, 4, 5)), { rows: ['front'], power: 100 });
    expect(far.rows).toEqual(['back']);
    expect(far.targets).toEqual([6, 7, 8]);
    // A partly wiped row hits only the living.
    expect(planSweep(world(9, dead(0, 2)), { rows: ['front'], power: 100 }).targets).toEqual([1]);
    expect(
      planSweep(world(9, dead(...[0, 1, 2, 3, 4, 5, 6, 7, 8])), { rows: ['front'], power: 1 }).hits,
    ).toEqual([]);
  });
});

describe('planBarrage', () => {
  const shells = { min: 2, max: 6, shareBp: 1_200 };
  const spec = { shells, power: 100 };
  const countFor = (n: number, s = shells) =>
    planBarrage(world(n), { ...spec, shells: s }).targets.length;

  it('clamps the count: ceil(living x share) between min and max, never above who lives', () => {
    expect([3, 9, 21, 45].map((n) => countFor(n))).toEqual([2, 2, 3, 6]);
    expect(countFor(45, { min: 1, max: 2, shareBp: 1_200 })).toBe(2);
    expect(countFor(1, { min: 2, max: 6, shareBp: 1_200 })).toBe(1);
    expect(countFor(45, { min: 3, max: 6, shareBp: 1_500 })).toBe(6);
    expect(countFor(9, { min: 3, max: 6, shareBp: 1_500 })).toBe(3);
  });

  it('is a partial Fisher-Yates over the living creatures, driven by the dice', () => {
    const low = planBarrage(world(9), spec);
    expect(low.targets).toEqual([0, 1]);
    // The top die swaps the last creature in; the second pick then lands on the swapped-out slot 0.
    const high = planBarrage(
      world(9, {}, { dice: Array.from({ length: 10 }, () => 999_999) }),
      spec,
    );
    expect(high.targets).toEqual([8, 0]);
    const mid = planBarrage(world(9, {}, { dice: [500_000, 0, 0, 0, 0, 0, 0, 0, 0, 0] }), spec);
    expect(mid.targets).toEqual([4, 1]);
  });

  it('picks distinct, living creatures only', () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = createSeededRng(`distinct-${String(seed)}`);
      const dice = Array.from({ length: 10 }, () => r.nextU32() % 1_000_000);
      const plan = planBarrage(
        world(45, { 4: { alive: false }, 20: { alive: false } }, { dice }),
        spec,
      );
      expect(new Set(plan.targets).size).toBe(plan.targets.length);
      expect(plan.targets.every((i) => i !== 4 && i !== 20)).toBe(true);
    }
  });

  it('skips the last volley unless fewer than the count others live', () => {
    const prev = planBarrage(world(9, {}, { previousVolley: [0, 1] }), spec);
    expect(prev.targets).toEqual([2, 3]);
    // Three creatures, two shells, the last volley hit slots 0 and 1: slot 2 is the only other one,
    // so it is hit and one of the previous creatures is drawn to make up the count.
    const tight = planBarrage(world(3, {}, { previousVolley: [0, 1] }), spec);
    expect(tight.targets).toEqual([2, 0]);
    // A dead previous victim does not count as an "other".
    const dead = planBarrage(world(3, { 2: { alive: false } }, { previousVolley: [0] }), spec);
    expect(dead.targets).toEqual([1, 0]);
  });
});

describe('planSlam', () => {
  const slam = (aim: 'front' | 'strongest' | 'left' | 'random', ctx = world(9)) =>
    planSlam(ctx, { aim, power: 100, splashBp: 4_500 });

  it('aims front like the plain attack: the Guard of the front-most row, else the first', () => {
    expect(slam('front').targets).toEqual([0]);
    expect(slam('front', world(9, { 1: { role: 'guard' } })).targets).toEqual([1]);
    expect(
      slam(
        'front',
        world(9, {
          0: { alive: false },
          1: { alive: false },
          2: { alive: false },
          4: { role: 'guard' },
        }),
      ).targets,
    ).toEqual([4]);
  });

  it('aims strongest (ties to the lower slot), left, and random with one die', () => {
    expect(slam('strongest', world(9, { 5: { atk: 99 }, 7: { atk: 99 } })).targets).toEqual([5]);
    expect(
      slam('strongest', world(9, { 5: { atk: 99, alive: false }, 7: { atk: 98 } })).targets,
    ).toEqual([7]);
    expect(slam('left', world(9, { 0: { alive: false }, 1: { alive: false } })).targets).toEqual([
      2,
    ]);
    expect(slam('random', world(9, {}, { dice: [0] })).targets).toEqual([0]);
    expect(slam('random', world(9, {}, { dice: [999_999] })).targets).toEqual([8]);
    expect(slam('random', world(9, { 0: { alive: false } }, { dice: [0] })).targets).toEqual([1]);
    expect(slam('random', world(9, {}, { dice: [500_000] })).targets).toEqual([4]);
  });

  it('is one aimed hit and carries the splash share', () => {
    const plan = slam('front');
    expect(plan.hits).toEqual([{ target: 0, powerBp: 100, kind: 'aimed' }]);
    expect(plan.splashBp).toBe(4_500);
  });
});

describe('planLance (lane geometry: slot position l of Front, Middle and Back)', () => {
  const lance = (ctx: PatternContext, lane: 'random' | 'strongest' = 'random') =>
    planLance(ctx, { lane, power: 20_000, falloffBp: 8_000 });

  it('takes the same position in each row, front to back, with the falloff per row', () => {
    const plan = lance(world(9, {}, { dice: [400_000] }));
    expect(plan.lane).toBe(1);
    expect(plan.targets).toEqual([1, 4, 7]);
    expect(plan.hits.map((h) => h.powerBp)).toEqual([20_000, 16_000, 12_800]);
    expect(plan.hits.every((h) => h.kind === 'area')).toBe(true);
  });

  it('has width n / 3 on rows of 3, 9, 21 and 45', () => {
    const lanes = (n: number) => [0, 999_999].map((d) => lance(world(n, {}, { dice: [d] })));
    expect(lanes(3).map((p) => [p.lane, p.targets])).toEqual([
      [0, [0, 1, 2]],
      [0, [0, 1, 2]],
    ]);
    expect(lanes(9).map((p) => p.lane)).toEqual([0, 2]);
    expect(lanes(21).map((p) => [p.lane, p.targets])).toEqual([
      [0, [0, 7, 14]],
      [6, [6, 13, 20]],
    ]);
    expect(lanes(45).map((p) => [p.lane, p.targets])).toEqual([
      [0, [0, 15, 30]],
      [14, [14, 29, 44]],
    ]);
  });

  it('passes through empty and knocked-out slots', () => {
    const plan = lance(world(9, { 4: { alive: false } }, { dice: [400_000] }));
    expect(plan.targets).toEqual([1, 7]);
    // The falloff belongs to the row: the Back row still takes the third step.
    expect(plan.hits.map((h) => h.powerBp)).toEqual([20_000, 12_800]);
  });

  it('is stopped by the first Guard in the lane: it takes its hit, nobody behind it is hit', () => {
    const plan = lance(world(9, { 4: { role: 'guard' } }, { dice: [400_000] }));
    expect(plan.targets).toEqual([1, 4]);
    const front = lance(world(9, { 1: { role: 'guard' } }, { dice: [400_000] }));
    expect(front.targets).toEqual([1]);
    // A knocked-out Guard no longer stops anything.
    const down = lance(world(9, { 4: { role: 'guard', alive: false } }, { dice: [400_000] }));
    expect(down.targets).toEqual([1, 7]);
  });

  it('strongest: the lane of the highest-Attack creature (ties lower slot)', () => {
    expect(lance(world(9, { 5: { atk: 99 } }), 'strongest').targets).toEqual([2, 5, 8]);
    expect(lance(world(21, { 13: { atk: 99 }, 14: { atk: 99 } }), 'strongest').lane).toBe(6);
  });

  it('random only picks lanes that have somebody standing', () => {
    const dead = Object.fromEntries([0, 3, 6].map((i) => [i, { alive: false }]));
    const plan = lance(world(9, dead, { dice: [0] }));
    expect(plan.lane).toBe(1);
    const all = Object.fromEntries([...Array(9).keys()].map((i) => [i, { alive: false }]));
    expect(lance(world(9, all, { dice: [0] })).hits).toEqual([]);
  });

  it('on rows that are not a multiple of 3 the middle row is the widest', () => {
    // 7 slots: Front 2 (0-1), Middle 3 (2-4), Back 2 (5-6). Lane 2 exists in the middle only.
    const plan = lance(world(7, {}, { dice: [999_999] }));
    expect(plan.lane).toBe(2);
    expect(plan.targets).toEqual([4]);
  });
});

describe('planChain', () => {
  const chain = (ctx: PatternContext, jumps = 2) =>
    planChain(ctx, { power: 17_000, jumps, decayBp: 5_500 });
  const atk = { 0: { atk: 20 }, 1: { atk: 90 }, 2: { atk: 50 }, 3: { atk: 90 }, 4: { atk: 70 } };

  it('hits the strongest aimed, then jumps down the ranking as area hits', () => {
    const plan = chain(world(5, atk));
    expect(plan.targets).toEqual([1, 3, 4]);
    expect(plan.hits.map((h) => [h.kind, h.powerBp])).toEqual([
      ['aimed', 17_000],
      ['area', 9_350],
      ['area', 5_142],
    ]);
  });

  it('never repeats a creature, skips the dead, and stops when nobody is left', () => {
    expect(chain(world(5, { ...atk, 1: { atk: 90, alive: false } })).targets).toEqual([3, 4, 2]);
    expect(chain(world(2, atk), 3).targets).toEqual([1, 0]);
    expect(chain(world(1), 3).targets).toEqual([0]);
    expect(chain(world(5, atk), 0).targets).toEqual([1]);
    expect(chain(world(5, atk), 3).targets).toEqual([1, 3, 4, 2]);
  });
});

describe('planPincer', () => {
  it('rows: the first and last living creature of every row', () => {
    expect(planPincer(world(9), { scope: 'rows', power: 100 }).targets).toEqual([0, 2, 3, 5, 6, 8]);
    expect(planPincer(world(21), { scope: 'rows', power: 100 }).targets).toEqual([
      0, 6, 7, 13, 14, 20,
    ]);
    expect(planPincer(world(45), { scope: 'rows', power: 100 }).targets).toEqual([
      0, 14, 15, 29, 30, 44,
    ]);
    // Rows of one: each creature is its row's only end, hit once.
    expect(planPincer(world(3), { scope: 'rows', power: 100 }).targets).toEqual([0, 1, 2]);
  });

  it('moves in to the next living creature when an end has fallen, and skips wiped rows', () => {
    const plan = planPincer(
      world(9, {
        0: { alive: false },
        3: { alive: false },
        4: { alive: false },
        5: { alive: false },
      }),
      {
        scope: 'rows',
        power: 100,
      },
    );
    expect(plan.targets).toEqual([1, 2, 6, 8]);
  });

  it('row: the two ends of the whole row, one creature hit once', () => {
    expect(planPincer(world(9), { scope: 'row', power: 100 }).targets).toEqual([0, 8]);
    expect(planPincer(world(3), { scope: 'row', power: 100 }).targets).toEqual([0, 2]);
    expect(planPincer(world(1), { scope: 'row', power: 100 }).targets).toEqual([0]);
    expect(planPincer(world(1), { scope: 'rows', power: 100 }).targets).toEqual([0]);
  });
});

describe('planPattern', () => {
  it('dispatches on the op (so a charged pattern can be planned from its `then`)', () => {
    expect(planPattern({ op: 'pincer', scope: 'row', power: 1 }, world(9)).targets).toEqual([0, 8]);
    expect(planPattern({ op: 'sweep', rows: ['back'], power: 1 }, world(9)).rows).toEqual(['back']);
  });
});

// ---------------------------------------------------------------------------------------------
// Fights

const ROWS = [3, 9, 21, 45];

describe.each(ROWS)('patterns in a fight of %i creatures', (n) => {
  const side = n / 3;
  const ids = (idx: number[]) => idx.map((i) => `s${String(i)}`);

  it('sweep: walks the rows by firing and hits every living creature of the row', () => {
    const g = everyRound({ op: 'sweep', rows: ['front', 'middle', 'back'], power: 10_000 });
    const r = fightWith(rowOf(n), [g], { rounds: 4 });
    const range = (from: number) => ids(Array.from({ length: side }, (_, i) => from + i));
    const byRound = (round: number) =>
      gimmickHits(r)
        .filter((h) => h[0] === round)
        .map((h) => h[1]);
    expect(byRound(1)).toEqual(range(0));
    expect(byRound(2)).toEqual(range(side));
    expect(byRound(3)).toEqual(range(2 * side));
    expect(byRound(4)).toEqual(range(0));
    expect(gimmickHits(r).every((h) => h[2] === 100)).toBe(true);
    const events = eventsOf(r, 'gimmick');
    expect(events[1]).toMatchObject({ op: 'sweep', rows: ['middle'], targets: range(side) });
  });

  it('sweep over every row: all n creatures take the hit', () => {
    const r = fightWith(rowOf(n), [everyRound({ op: 'sweep', rows: ['all'], power: 5_000 })]);
    expect(gimmickHits(r)).toEqual(Array.from({ length: n }, (_, i) => [1, `s${String(i)}`, 50]));
  });

  it('barrage: the clamped count of distinct living creatures, not interceptable, nobody twice running', () => {
    const shells = { min: 2, max: 6, shareBp: 1_200 };
    const g = everyRound({ op: 'barrage', shells, power: 13_000 });
    const guards: Record<number, { role: 'guard' }> = {};
    for (let i = 1; i < n; i += 3) guards[i] = { role: 'guard' };
    const r = fightWith(rowOf(n, guards), [g], { rounds: 25 });
    const expected = Math.min(6, Math.max(2, Math.ceil((n * 1_200) / 10_000)));
    let previous = new Set<string>();
    for (let round = 1; round <= 25; round++) {
      const hits = gimmickHits(r).filter((h) => h[0] === round);
      const targets = hits.map((h) => h[1]);
      expect(targets).toHaveLength(Math.min(expected, n));
      expect(new Set(targets).size).toBe(targets.length);
      expect(hits.every((h) => h[2] === 130)).toBe(true);
      if (n >= 9) for (const t of targets) expect(previous.has(t)).toBe(false);
      previous = new Set(targets);
    }
    // A Guard in the shell's row does not catch it: no hit says it was taken for someone else.
    const shellHits = eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick');
    expect(shellHits.every((e) => e.from === undefined)).toBe(true);
    expect(eventsOf(r, 'gimmick')[0]).toMatchObject({ op: 'barrage' });
  });

  it('slam: an aimed hit on the aim, splash on the impact neighbours as area hits', () => {
    const mid = Math.floor(n / 2);
    const g = everyRound({ op: 'slam', aim: 'strongest', power: 30_000, splashBp: 4_500 });
    const r = fightWith(rowOf(n, { [mid]: { atk: 50 } }), [g]);
    const hits = gimmickHits(r);
    expect(hits[0]).toEqual([1, `s${String(mid)}`, 300]);
    // Beside the impact: the same-row neighbours (the board's adjacency stops at row edges).
    const row = Math.floor(mid / side);
    const near = [mid - 1, mid + 1].filter((i) => i >= 0 && i < n && Math.floor(i / side) === row);
    expect(hits.slice(1)).toEqual(near.map((i) => [1, `s${String(i)}`, 135]));
    const splash = eventsOf(r, 'boss_hit').filter((e) => e.splash === true);
    expect(splash).toHaveLength(near.length);
    expect(eventsOf(r, 'gimmick')[0]).toMatchObject({ op: 'slam', targets: [`s${String(mid)}`] });
  });

  it('lance: one lane through the rows, softer each row', () => {
    const g = everyRound({ op: 'lance', lane: 'strongest', power: 20_000, falloffBp: 8_000 });
    const pos = Math.floor(side / 2);
    const r = fightWith(rowOf(n, { [side + pos]: { atk: 50 } }), [g]);
    expect(gimmickHits(r)).toEqual([
      [1, `s${String(pos)}`, 200],
      [1, `s${String(side + pos)}`, 160],
      [1, `s${String(2 * side + pos)}`, 128],
    ]);
    expect(eventsOf(r, 'gimmick')[0]).toMatchObject({ op: 'lance', lane: pos });
  });

  it('pincer: the first and last creature of every row', () => {
    const r = fightWith(rowOf(n), [everyRound({ op: 'pincer', scope: 'rows', power: 22_000 })]);
    const expected = side === 1 ? [0, 1, 2] : [0, side - 1, side, 2 * side - 1, 2 * side, n - 1];
    expect(gimmickHits(r)).toEqual(expected.map((i) => [1, `s${String(i)}`, 220]));
  });

  it('chain: the strongest first (a Guard in its row steps in), then the next strongest, no repeats', () => {
    const g = everyRound({ op: 'strike_highest_atk', power: 17_000, jumps: 2, decayBp: 5_500 });
    const r = fightWith(rowOf(n, { 0: { atk: 30 }, 1: { atk: 20 }, 2: { atk: 25 } }), [g]);
    const hits = gimmickHits(r);
    expect(hits.map((h) => h[1])).toEqual(['s0', 's2', 's1']);
    expect(hits.map((h) => h[2])).toEqual([170, 93, 51]);
    expect(eventsOf(r, 'gimmick')[0]).toMatchObject({ targets: ['s0', 's2', 's1'] });
  });
});

describe('patterns resolve through hurt()', () => {
  it('a Guard steps in for an aimed slam and the splash spreads from where the Guard stands', () => {
    const g = everyRound({ op: 'slam', aim: 'strongest', power: 10_000, splashBp: 5_000 });
    const r = fightWith(rowOf(9, { 1: { atk: 50 }, 2: { role: 'guard' } }), [g]);
    const hits = eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick');
    expect(hits[0]).toMatchObject({ target: 's2', from: 's1', damage: 100 });
    // Beside s2 (the impact): s1 only (the Front row ends at s2).
    expect(hits.slice(1).map((e) => [e.target, e.damage, e.splash])).toEqual([['s1', 50, true]]);
  });

  it('a Guard in the lane takes its hit and stops the lance', () => {
    const g = everyRound({ op: 'lance', lane: 'strongest', power: 20_000, falloffBp: 8_000 });
    const r = fightWith(rowOf(9, { 1: { atk: 50 }, 4: { role: 'guard' } }), [g]);
    expect(gimmickHits(r)).toEqual([
      [1, 's1', 200],
      [1, 's4', 160],
    ]);
  });

  it('every pattern leaves the knocked-out alone', () => {
    const dead = [0, 1, 4, 8];
    const overrides = Object.fromEntries(dead.map((i) => [i, { hp: 0 }]));
    const gimmicks: Record<string, unknown>[] = [
      { op: 'sweep', rows: ['front'], power: 1_000 },
      { op: 'sweep', rows: ['all'], power: 1_000 },
      { op: 'barrage', shells: { min: 4, max: 6, shareBp: 5_000 }, power: 1_000 },
      { op: 'slam', aim: 'left', power: 1_000, splashBp: 5_000 },
      { op: 'slam', aim: 'random', power: 1_000, splashBp: 5_000 },
      { op: 'slam', aim: 'strongest', power: 1_000, splashBp: 5_000 },
      { op: 'lance', lane: 'random', power: 1_000, falloffBp: 8_000 },
      { op: 'pincer', scope: 'rows', power: 1_000 },
      { op: 'pincer', scope: 'row', power: 1_000 },
      { op: 'strike_highest_atk', power: 1_000, jumps: 3 },
    ];
    for (const g of gimmicks) {
      const r = fightWith(rowOf(9, overrides), [everyRound(g)], { bossAtk: 1, rounds: 6 });
      const hit = eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick');
      expect(hit.length).toBeGreaterThan(0);
      for (const e of hit) expect(dead.map((i) => `s${String(i)}`)).not.toContain(e.target);
    }
  });

  it('Shield Wall halves every pattern that hits the shielded row', () => {
    const wall = (zone: 'front' | 'middle' | 'back') => ({
      finaleAbilities: [
        { playerId: 'p1', abilityId: 'test-half-wall', key: 'w', fireAtRound: 1, params: { zone } },
      ],
    });
    const sweep = fightWith(
      rowOf(9),
      [everyRound({ op: 'sweep', rows: ['middle'], power: 10_000 })],
      {
        extra: wall('middle'),
      },
    );
    expect(gimmickHits(sweep).map((h) => h[2])).toEqual([50, 50, 50]);
    expect(eventsOf(sweep, 'boss_hit').find((e) => e.source === 'gimmick')).toMatchObject({
      reducedBp: 5_000,
    });
    const pincer = fightWith(
      rowOf(9),
      [everyRound({ op: 'pincer', scope: 'rows', power: 10_000 })],
      {
        extra: wall('middle'),
      },
    );
    expect(gimmickHits(pincer).map((h) => h[2])).toEqual([100, 100, 50, 50, 100, 100]);
    const lance = fightWith(
      rowOf(9, { 1: { atk: 9 } }),
      [everyRound({ op: 'lance', lane: 'strongest', power: 10_000, falloffBp: 10_000 })],
      { extra: wall('middle') },
    );
    expect(gimmickHits(lance).map((h) => h[2])).toEqual([100, 50, 100]);
    const barrage = fightWith(
      rowOf(9),
      [everyRound({ op: 'barrage', shells: { min: 9, max: 6, shareBp: 10_000 }, power: 10_000 })],
      {
        extra: wall('middle'),
      },
    );
    // min above max: the clamp keeps the max (6 shells), and the middle row's shells are halved.
    for (const e of eventsOf(barrage, 'boss_hit').filter((x) => x.source === 'gimmick')) {
      const middle = ['s3', 's4', 's5'].includes(e.target);
      expect(e.damage).toBe(middle ? 50 : 100);
    }
  });
});

describe('Shield Wall default timing (firstZoneHit)', () => {
  const walkBoss = () => ({
    ...input([]).boss,
    gimmicks: [
      {
        id: 'wave',
        name: 'Wave',
        trigger: { every: 3 },
        op: 'sweep',
        rows: ['back', 'middle'],
        power: 10_000,
      } as Gimmick,
    ],
  });

  it('learns a single-row sweep: the default Shield Wall lands on its row in its round', () => {
    const wall = TEST_PACK.finaleAbilities.find((a) => a.id === 'shield-wall')!;
    expect(defaultAbilityRound(walkBoss(), wall, 12)).toBe(3);
    const r = fightWith(rowOf(9), walkBoss().gimmicks, {
      rounds: 6,
      extra: { finaleAbilities: [{ playerId: 'p1', abilityId: 'shield-wall', key: 'w' }] },
    });
    expect(eventsOf(r, 'ability')[0]).toMatchObject({ round: 3, zone: 'back', byDefault: true });
    const round3 = inRound(r, 3).filter((e) => e.t === 'boss_hit' && e.source === 'gimmick');
    expect(round3.every((e) => e.t === 'boss_hit' && e.shielded === true)).toBe(true);
    // Firing 2 (round 6) walks on to the Middle row.
    expect(eventsOf(r, 'gimmick').map((e) => e.rows)).toEqual([['back'], ['middle']]);
    expect(firingIndex(walkBoss().gimmicks[0] as Gimmick, 6)).toBe(2);
  });

  it('a sweep of every row names no row, so the default stays the content default', () => {
    const b = {
      ...walkBoss(),
      gimmicks: [
        {
          id: 'w',
          name: 'W',
          trigger: { every: 3 },
          op: 'sweep',
          rows: ['all'],
          power: 1,
        } as Gimmick,
      ],
    };
    const wall = TEST_PACK.finaleAbilities.find((a) => a.id === 'shield-wall')!;
    expect(defaultAbilityRound(b, wall, 12)).toBe(wall.defaultRound);
  });
});

/** An RNG that counts how many 32-bit draws are taken from it. */
function counting(seed: string): Rng & { draws: () => number } {
  const base = createSeededRng(seed);
  let draws = 0;
  return {
    nextU32: () => {
      draws += 1;
      return base.nextU32();
    },
    draws: () => draws,
  };
}

describe('the dice', () => {
  const sweep = everyRound({ op: 'sweep', rows: ['front'], power: 100 });
  const barrage = everyRound({
    op: 'barrage',
    shells: { min: 2, max: 6, shareBp: 1_200 },
    power: 100,
  });

  it('draws 40 per round for a boss with a pattern op, whatever happens in the fight', () => {
    // A strong row that lives all 12 rounds, and a weak one that is wiped out in round 1: both draw
    // exactly 40 dice in each round that is played (these seeds never hit the rejection step).
    for (const hp of [100_000, 1]) {
      const rng = counting('dice-count');
      const r = fightWith(rowOf(9, {}, { hp }), [barrage], {
        rounds: 12,
        rng,
        bossAtk: hp === 1 ? 1000 : 1,
      });
      expect(rng.draws()).toBe(40 * r.rounds);
      if (hp === 1) expect(r.rounds).toBeLessThan(12);
      else expect(r.rounds).toBe(12);
    }
  });

  it('draws nothing for a boss without pattern ops (and without luck)', () => {
    const rng = counting('none');
    fightWith(rowOf(9), [everyRound({ op: 'hit_zone', zone: 'front', power: 100 })], {
      rounds: 5,
      rng,
    });
    expect(rng.draws()).toBe(0);
  });

  it('draws the pattern dice after every die that already existed', () => {
    const luck = {
      critChanceBp: 500,
      critBp: 5_000,
      bossCritChanceBp: 500,
      bossCritBp: 5_000,
      bossRandomTargetBp: 1_500,
      spreadBp: 500,
      surgeChanceBp: 600,
      slumpChanceBp: 600,
      swingBp: 1_500,
      swingRounds: 2,
    };
    const hitZone = everyRound({ op: 'hit_zone', zone: 'front', power: 10_000 });
    const rngA = counting('order');
    const rngB = counting('order');
    const a = fightWith(rowOf(9), [hitZone], { rounds: 1, rng: rngA, extra: { luck } });
    const b = fightWith(rowOf(9), [sweep], { rounds: 1, rng: rngB, extra: { luck } });
    expect(rngB.draws() - rngA.draws()).toBe(40);
    // Every die the old rules drew gives the same player hits (crit, spread) in the first round.
    expect(eventsOf(b, 'hit')).toEqual(eventsOf(a, 'hit'));
  });

  it('is deterministic for a seed and changes with it', () => {
    const run = (seed: string) =>
      gimmickHits(fightWith(rowOf(45), [barrage], { rounds: 10, rng: createSeededRng(seed) }));
    expect(run('seed-a')).toEqual(run('seed-a'));
    expect(run('seed-a')).not.toEqual(run('seed-b'));
  });

  it('a patternless boss is untouched by rules (it draws and hits as before)', () => {
    const plain = (rules?: ReturnType<typeof rulesOf>) =>
      simulateFight(
        { ...input(rowOf(9)), bossAtk: 7, ...(rules === undefined ? {} : { rules }) },
        createSeededRng('same'),
        { pack: TEST_PACK },
      );
    const a = plain();
    const b = plain(rulesOf());
    expect(eventsOf(b, 'boss_hit').map((e) => e.damage)).toEqual(
      eventsOf(a, 'boss_hit').map((e) => e.damage),
    );
  });
});
