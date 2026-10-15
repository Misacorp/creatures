import { RULES, type Gimmick } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { AbilityChoice, FightInput } from '../src/index';
import { eventsOf, run, slot } from './helpers';
import { everyRound, fightWith, gimmickHits, rowOf, rulesOf } from './pattern-helpers';

/**
 * The combat rules follow-ups (docs/design/combat-rules.md): a Shield Wall protects the creature
 * that takes the hit, a chain never hits a creature twice, no overkill in the damage that counts,
 * and a Shield Wall pressed in the announcement round of a charge covers the landing. Each rule is
 * tested with `rules` (the new behaviour) and without (stored fights replay as they were fought).
 * Boss Attack is 100, so a power of 10000 deals 100.
 */

const slamLeft: Gimmick = everyRound({ op: 'slam', aim: 'left', power: 10_000, splashBp: 0 });
const wall = (abilityId: string, round: number, zone: 'front' | 'middle'): AbilityChoice => ({
  key: 'wall',
  playerId: 'p1',
  abilityId,
  fireAtRound: round,
  params: { zone },
});

describe('Shield Wall protects the creature that takes the hit (Q4)', () => {
  // A line of three, as in the dungeon: s0 Front, s1 Middle, s2 Back, each its own zone. The slam
  // is aimed at s0; the Guard s1 beside it steps in and takes it.
  const line = () => rowOf(3, { 1: { role: 'guard' } });
  const adjacent: Partial<FightInput> = { guardReach: 'adjacent' };
  const slamHit = (r: ReturnType<typeof fightWith>) =>
    gimmickHits(r).filter((h) => h[0] === 1)[0]?.[2];
  const fight = (zone: 'front' | 'middle', withRules: boolean) =>
    fightWith(line(), [slamLeft], {
      ...(withRules ? { rules: rulesOf() } : {}),
      extra: { ...adjacent, finaleAbilities: [wall('test-half-wall', 1, zone)] },
    });

  it("with rules, the wall on the Guard's own zone reduces the hit it takes in place", () => {
    expect(slamHit(fight('middle', true))).toBe(50);
    // A wall on the aimed creature's zone no longer counts: the hit does not land there.
    expect(slamHit(fight('front', true))).toBe(100);
  });

  it("without rules, the wall on the aimed creature's zone counts, as before", () => {
    expect(slamHit(fight('front', false))).toBe(50);
    expect(slamHit(fight('middle', false))).toBe(100);
  });

  it('a wall that stops the hit stops it for the Guard: nobody loses HP, the log names both', () => {
    const r = fightWith(line(), [slamLeft], {
      rules: rulesOf(),
      extra: { ...adjacent, finaleAbilities: [wall('shield-wall', 1, 'middle')] },
    });
    const stopped = eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick');
    expect(stopped).toMatchObject({ target: 's1', from: 's0', damage: 0, shielded: true });
    expect(r.perCreature.s1?.damageTaken).toBe(0);
    expect(r.perCreature.s0?.damageTaken).toBe(0);
  });

  it('in the raid the Guard stands in the same zone, so nothing differs', () => {
    const raid = (withRules: boolean) =>
      fightWith(rowOf(9, { 1: { role: 'guard' } }), [slamLeft], {
        ...(withRules ? { rules: rulesOf() } : {}),
        extra: { finaleAbilities: [wall('test-half-wall', 1, 'front')] },
      });
    expect(gimmickHits(raid(true))).toEqual(gimmickHits(raid(false)));
    expect(gimmickHits(raid(true))[0]).toEqual([1, 's1', 50]);
  });
});

describe('a Shield Wall pressed in the announcement round covers the landing (Q5)', () => {
  // Announced in round 2, lands in round 3. Pressing during round 2 fires at the start of round 3
  // (the live server sets `fireAtRound` to the clock round + 1), so a 1-round wall covers the landing.
  const sweep: Gimmick = {
    id: 'c',
    name: 'c',
    trigger: { every: 3 },
    op: 'charge',
    then: { op: 'sweep', rows: ['front'], power: 10_000 },
  };
  const landing = (fireAt: number) =>
    gimmickHits(
      fightWith(rowOf(9), [sweep], {
        rounds: 4,
        extra: { finaleAbilities: [wall('shield-wall', fireAt, 'front')] },
      }),
    ).filter((h) => h[0] === 3);

  it('a 1-round wall fired at the start of the landing round stops the sweep', () => {
    expect(landing(3)).toEqual([
      [3, 's0', 0],
      [3, 's1', 0],
      [3, 's2', 0],
    ]);
  });

  it('a 1-round wall fired in the announcement round itself ends before the landing', () => {
    expect(landing(2).map((h) => h[2])).toEqual([100, 100, 100]);
  });
});

describe('a chain never hits a creature twice (Q6)', () => {
  const chain = everyRound({ op: 'strike_highest_atk', power: 17_000, jumps: 2, decayBp: 5_500 });
  const noCover = rulesOf({ coverBp: 0 });
  // s0 is the strongest, the Guard s1 the second strongest; s0's first hit goes to the Guard.
  const row = () => rowOf(9, { 0: { atk: 30 }, 1: { atk: 25, role: 'guard' }, 2: { atk: 20 } });

  it('with rules, the Guard that stepped in is skipped by the jumps; they go to the next strongest', () => {
    const r = fightWith(row(), [chain], { rules: noCover });
    expect(gimmickHits(r)).toEqual([
      [1, 's1', 170],
      [1, 's2', 93],
      [1, 's3', 51],
    ]);
    expect(eventsOf(r, 'boss_hit')[0]).toMatchObject({ target: 's1', from: 's0' });
  });

  it('without rules, the Guard can take a jump as well, as before', () => {
    const r = fightWith(row(), [chain]);
    expect(gimmickHits(r)).toEqual([
      [1, 's1', 170],
      [1, 's1', 93],
      [1, 's2', 51],
    ]);
  });

  it('is the same with and without rules when the Guard is not in the jumps', () => {
    const weak = () =>
      rowOf(9, { 0: { atk: 30 }, 1: { atk: 1, role: 'guard' }, 2: { atk: 25 } }, { atk: 2 });
    const expected = [
      [1, 's1', 170],
      [1, 's2', 93],
      [1, 's3', 51],
    ];
    expect(gimmickHits(fightWith(weak(), [chain], { rules: noCover }))).toEqual(expected);
    expect(gimmickHits(fightWith(weak(), [chain]))).toEqual(expected);
  });

  it('with rules, a Guard that fell on the first hit is not hit again either', () => {
    const fragile = rowOf(9, {
      0: { atk: 30 },
      1: { atk: 25, role: 'guard', hp: 10 },
      2: { atk: 20 },
    });
    const r = fightWith(fragile, [chain], { rules: rulesOf({ coverBp: 0, guardHpBp: 0 }) });
    expect(gimmickHits(r)).toEqual([
      [1, 's1', 170],
      [1, 's2', 93],
      [1, 's3', 51],
    ]);
    expect(eventsOf(r, 'knockout')[0]).toMatchObject({ creature: 's1' });
  });
});

describe('no overkill (Q7)', () => {
  const finale: Partial<FightInput> = {
    phase: 'finale',
    bossAtk: 100,
    turnOrderOverride: 'left_to_right',
  };
  const pool = (max: number) => ({ bossHpPool: { max, current: max } });

  it('with rules, a killing blow counts only the HP the boss had left', () => {
    const row = () => [slot('a', { atk: 500 }), slot('b', { atk: 500 })];
    const r = run(row(), { ...finale, ...pool(1_000), rules: rulesOf() });
    expect(eventsOf(r, 'hit')).toHaveLength(2);
    // Two hits kill it: the second counts only down to 0.
    const [first, second] = eventsOf(r, 'hit');
    expect((first?.damage ?? 0) + (second?.damage ?? 0)).toBe(1_000);
    expect(second?.bossHp).toBe(0);
    expect(r.bossHpStart - r.bossHpEnd).toBe(1_000);
    expect(r.perPlayer.p1?.damage).toBe(1_000);
    expect(Object.values(r.damageByElement).reduce((a, b) => a + b, 0)).toBe(1_000);
    // A single killing blow: the whole hit is more than the pool.
    const single = run([slot('a', { atk: 5_000 })], {
      ...finale,
      ...pool(1_000),
      rules: rulesOf(),
    });
    expect(eventsOf(single, 'hit')[0]).toMatchObject({ damage: 1_000, bossHp: 0 });
    expect(single.perCreature.a?.damage).toBe(1_000);
    expect(single.damageByElement.tide).toBe(1_000);
  });

  it('without rules, the overkill still counts as dealt, as before', () => {
    const r = run([slot('a', { atk: 5_000 })], { ...finale, ...pool(1_000) });
    const hit = eventsOf(r, 'hit')[0];
    expect(hit?.damage).toBeGreaterThan(1_000);
    expect(hit?.bossHp).toBe(0);
    expect(r.perCreature.a?.damage).toBe(hit?.damage);
  });

  it('with rules, the reaction bonus gets only what is left after the plain hit', () => {
    const row = () => [
      slot('a', { atk: 100, element: 'tide', role: 'setter' }),
      slot('b', { atk: 100, element: 'spark', role: 'payoff' }),
    ];
    const probe = run(row(), { ...finale, ...pool(1_000_000), rules: rulesOf() });
    const [pa, pb] = eventsOf(probe, 'hit');
    const reaction = eventsOf(probe, 'reaction')[0];
    expect(reaction?.bonus).toBeGreaterThan(0);
    const plainB = (pb?.damage ?? 0) - (reaction?.bonus ?? 0);
    // The boss has `plainB + 10` left when b hits: the plain hit fits, the bonus gets only 10.
    const max = (pa?.damage ?? 0) + plainB + 10;
    const r = run(row(), { ...finale, ...pool(max), rules: rulesOf() });
    expect(eventsOf(r, 'hit')[1]).toMatchObject({ damage: plainB + 10, bossHp: 0 });
    expect(eventsOf(r, 'reaction')[0]?.bonus).toBe(10);
    expect(r.bossHpStart - r.bossHpEnd).toBe(max);
    const setup = Math.floor((10 * RULES.combat.setupShareBp) / 10_000);
    expect(r.perCreature.a?.setupCredit).toBe(setup);
    expect(r.damageByElement.spark).toBe(plainB + 10);
  });

  it('a boss hit on a creature shows its full damage, while HP lost and credit stop at the HP left', () => {
    // The slam is aimed at s0; the Guard s1 (40 HP, 25% armor) steps in. Armor would prevent 25 of
    // the 100, but only 40 HP are left, so it prevents nothing real: credit is the 40 taken.
    const armor = rulesOf({ guardHpBp: 0, guardArmorBp: 2_500 });
    const slam = everyRound({ op: 'slam', aim: 'strongest', power: 10_000, splashBp: 0 });
    const guarded = () => rowOf(9, { 0: { atk: 50 }, 1: { role: 'guard', hp: 40 } });
    const r = fightWith(guarded(), [slam], { rules: armor });
    const hit = eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick');
    expect(hit).toMatchObject({ target: 's1', from: 's0', damage: 75 });
    expect(r.perCreature.s1?.damageTaken).toBe(40);
    expect(r.perCreature.s1?.guardCredit).toBe(40);
    expect(eventsOf(r, 'knockout')[0]).toMatchObject({ creature: 's1' });
    // Without rules the log keeps the whole amount (an old fight replays as it was fought).
    const old = fightWith(guarded(), [slam]);
    expect(eventsOf(old, 'boss_hit').find((e) => e.source === 'gimmick')?.damage).toBe(100);
  });

  it('a plain attack on a creature with less HP than the hit shows the whole hit', () => {
    const r = fightWith([slot('a', { hp: 30 }), slot('b')], [], { rules: rulesOf() });
    expect(eventsOf(r, 'boss_hit')[0]?.damage).toBeGreaterThan(30);
    expect(r.perCreature.a?.damageTaken).toBe(30);
  });
});
