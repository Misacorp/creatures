import { RULES, createSeededRng, type Gimmick, type Rng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { liveFightRules, simulateFight } from '../src/index';
import { eventsOf, input, slot } from './helpers';
import { everyRound, fightWith, rowOf, rulesOf } from './pattern-helpers';

/**
 * Guard armor, the Guard taking reflects, and the random pick among several Guards (rules only).
 * Boss Attack is 100, so a power of 10000 deals 100.
 */

const ARMOR = rulesOf({ guardHpBp: 0, guardArmorBp: 2_500 });
const slamAt = (aim: 'front' | 'strongest' | 'left' = 'strongest'): Gimmick =>
  everyRound({ op: 'slam', aim, power: 10_000, splashBp: 0 });
const BACKDRAFT: Gimmick = {
  id: 'r',
  name: 'r',
  trigger: { eachRound: true },
  op: 'reflect_first_reaction',
};

describe('Guard HP', () => {
  const hpMax = (rules?: ReturnType<typeof rulesOf>): number => {
    const row = [slot('g', { role: 'guard', hp: 100 }), slot('x')];
    const base = input(row);
    const r = simulateFight(
      { ...base, ...(rules === undefined ? {} : { rules }) },
      createSeededRng('hp'),
    );
    return r.hpMax.g as number;
  };

  it('has the extra HP of the rules, or the old +30% without rules', () => {
    expect(hpMax(rulesOf({ guardHpBp: 0 }))).toBe(100);
    expect(hpMax(rulesOf({ guardHpBp: 1_000 }))).toBe(110);
    expect(hpMax()).toBe(130);
    expect(hpMax()).toBe(100 + (100 * RULES.combat.guardHpBp) / 10_000);
  });

  it('takes the live Guard from the shipped rules', () => {
    const live = liveFightRules();
    expect(live.guardHpBp).toBe(RULES.combat.guard.hpBp);
    expect(live.guardArmorBp).toBe(RULES.combat.guard.armorBp);
    expect(hpMax(live)).toBe(100 + Math.floor((100 * live.guardHpBp) / 10_000));
  });
});

describe('Guard armor', () => {
  it('takes armorBp less from a hit aimed at it, and does not credit its own armor', () => {
    const r = fightWith(rowOf(9, { 1: { role: 'guard' } }), [], { rules: ARMOR });
    const hit = eventsOf(r, 'boss_hit')[0];
    expect(hit).toMatchObject({ source: 'attack', target: 's1', damage: 75, armored: 25 });
    expect(hit?.from).toBeUndefined();
    expect(r.perCreature.s1?.damageTaken).toBe(75);
    // Own hit: guardOwnCreditBp of what it took, nothing for the 25 armor prevented.
    expect(r.perCreature.s1?.guardCredit).toBe(75);
  });

  it('has no armor without rules, or with armor 0', () => {
    const plain = fightWith(rowOf(9, { 1: { role: 'guard' } }), []);
    expect(eventsOf(plain, 'boss_hit')[0]).toMatchObject({ target: 's1', damage: 100 });
    expect(eventsOf(plain, 'boss_hit')[0]?.armored).toBeUndefined();
    const none = fightWith(rowOf(9, { 1: { role: 'guard' } }), [], {
      rules: rulesOf({ guardArmorBp: 0 }),
    });
    expect(eventsOf(none, 'boss_hit')[0]?.armored).toBeUndefined();
  });

  it('credits the damage its armor prevents on a hit it takes in place of another creature', () => {
    // The slam is aimed at s0 (the strongest); the Guard s1 steps in and takes 75 of the 100.
    const r = fightWith(rowOf(9, { 0: { atk: 50 }, 1: { role: 'guard' } }), [slamAt()], {
      rules: ARMOR,
    });
    const slam = eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick');
    expect(slam).toMatchObject({ target: 's1', from: 's0', damage: 75, armored: 25 });
    // 75 taken for s0 (in full) + 25 armor prevented there + 75 of the plain attack on itself.
    expect(r.perCreature.s1?.guardCredit).toBe(75 + 25 + 75);
    expect(r.perCreature.s1?.damageTaken).toBe(150);
  });

  it('applies to area hits and to enrage hits on the Guard', () => {
    const sweep = everyRound({ op: 'sweep', rows: ['front'], power: 10_000 });
    const r = fightWith(rowOf(9, { 1: { role: 'guard' } }), [sweep], {
      rules: rulesOf({ guardHpBp: 0, guardArmorBp: 2_500, coverBp: 0 }),
      extra: { enrage: { rounds: 1, powerBp: 20_000 } },
    });
    const onGuard = (source: string) =>
      eventsOf(r, 'boss_hit').find((e) => e.source === source && e.target === 's1');
    expect(onGuard('gimmick')).toMatchObject({ damage: 75, armored: 25 });
    expect(onGuard('enrage')).toMatchObject({ damage: 150, armored: 50 });
    // The others in the zone take the full hit (cover is off here).
    expect(
      eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick' && e.target === 's0'),
    ).toMatchObject({ damage: 100 });
  });

  it('comes after intercept and before the single-hit cap; the cap hides what it would have cut anyway', () => {
    // The Guard has 1000 HP, so the cap (5%) is 50. Armor takes 100 to 75 and the cap cuts it to 50:
    // the cap alone would have cut 100 to 50, so armor really saved nothing (no `armored`, no credit).
    const r = fightWith(rowOf(9, { 0: { atk: 50 }, 1: { role: 'guard', hp: 1_000 } }), [slamAt()], {
      rules: rulesOf({ guardHpBp: 0, guardArmorBp: 2_500, maxHitBp: 500 }),
    });
    const slam = eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick');
    expect(slam).toMatchObject({ target: 's1', from: 's0', damage: 50, capped: true });
    expect(slam?.armored).toBeUndefined();
    expect(r.perCreature.s1?.guardCredit).toBe(50 + 50);
  });

  it('never stacks with cover: a Guard is not covered', () => {
    const sweep = everyRound({ op: 'sweep', rows: ['front'], power: 10_000 });
    const r = fightWith(rowOf(9, { 0: { role: 'guard' }, 1: { role: 'guard' } }), [sweep], {
      rules: ARMOR,
    });
    const hits = eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick');
    expect(hits[0]).toMatchObject({ target: 's0', damage: 75, armored: 25 });
    expect(hits[0]?.covered).toBeUndefined();
    expect(hits[2]).toMatchObject({ target: 's2', damage: 60 });
  });
});

describe('Guards take reflected hits (rules only)', () => {
  const raidRow = () =>
    rowOf(9, {
      0: { role: 'setter', element: 'tide', atk: 100 },
      1: { role: 'payoff', element: 'spark', atk: 100 },
      2: { role: 'guard', hp: 1_000 },
    });
  const reflectOf = (r: ReturnType<typeof fightWith>) =>
    eventsOf(r, 'boss_hit').find((e) => e.source === 'reflect');

  it('without rules the reflect hits the hitter and nothing intercepts it', () => {
    const r = fightWith(raidRow(), [BACKDRAFT]);
    expect(reflectOf(r)).toMatchObject({ target: 's1' });
    expect(reflectOf(r)?.from).toBeUndefined();
  });

  it("goes to the Guard of the hitter's zone, armored, uncapped and uncovered", () => {
    const r = fightWith(raidRow(), [BACKDRAFT], {
      rules: rulesOf({ guardHpBp: 0, guardArmorBp: 2_500, maxHitBp: 500 }),
    });
    const bonus = eventsOf(r, 'reaction')[0]?.bonus ?? 0;
    expect(bonus).toBeGreaterThan(200);
    const armored = Math.floor((bonus * 2_500) / 10_000);
    const hit = reflectOf(r);
    expect(hit).toMatchObject({ target: 's2', from: 's1', damage: bonus - armored, armored });
    // The cap would be 50 (5% of 1000): the reflect is not a boss attack, so it is not capped.
    expect(hit?.capped).toBeUndefined();
    expect(hit?.covered).toBeUndefined();
    // Credited as taken in place of s1, armor included.
    expect(r.perCreature.s2?.guardCredit).toBeGreaterThanOrEqual(bonus);
  });

  it('is still taken by the hitter when no Guard stands in its zone', () => {
    const row = rowOf(9, {
      0: { role: 'setter', element: 'tide', atk: 100 },
      1: { role: 'payoff', element: 'spark', atk: 100 },
      3: { role: 'guard' },
    });
    const r = fightWith(row, [BACKDRAFT], { rules: ARMOR });
    expect(reflectOf(r)).toMatchObject({ target: 's1' });
    expect(reflectOf(r)?.from).toBeUndefined();
  });

  it('a Guard that is the hitter takes it itself, armored', () => {
    const row = rowOf(9, {
      0: { role: 'setter', element: 'tide', atk: 100 },
      1: { role: 'guard', element: 'spark', atk: 100 },
    });
    const r = fightWith(row, [BACKDRAFT], { rules: ARMOR });
    const bonus = eventsOf(r, 'reaction')[0]?.bonus ?? 0;
    const armored = Math.floor((bonus * 2_500) / 10_000);
    expect(reflectOf(r)).toMatchObject({ target: 's1', damage: bonus - armored, armored });
    expect(reflectOf(r)?.from).toBeUndefined();
  });

  it('in the dungeon the Guard beside the hitter takes it', () => {
    const row = [
      slot('s', { role: 'setter', element: 'tide', atk: 100 }),
      slot('p', { role: 'payoff', element: 'spark', atk: 100 }),
      slot('g', { role: 'guard' }),
    ];
    const r = fightWith(row, [BACKDRAFT], { rules: ARMOR, extra: { guardReach: 'adjacent' } });
    const bonus = eventsOf(r, 'reaction')[0]?.bonus ?? 0;
    const armored = Math.floor((bonus * 2_500) / 10_000);
    expect(reflectOf(r)).toMatchObject({ target: 'g', from: 'p', damage: bonus - armored });
    // Without rules the hitter takes it.
    expect(
      reflectOf(fightWith(row, [BACKDRAFT], { extra: { guardReach: 'adjacent' } })),
    ).toMatchObject({ target: 'p' });
  });
});

describe('several Guards that could take a hit: a random pick (rules only)', () => {
  const SEEDS = 40;
  const victims = (
    row: ReturnType<typeof rowOf>,
    gimmicks: Gimmick[],
    seed: string,
    extra: Parameters<typeof fightWith>[2] = {},
  ): string[] =>
    eventsOf(
      fightWith(row, gimmicks, {
        ...extra,
        rules: rulesOf({ guardHpBp: 0, guardArmorBp: 0 }),
        rng: createSeededRng(seed),
      }),
      'boss_hit',
    )
      .filter((e) => e.source === 'gimmick' && e.splash !== true)
      .map((e) => e.target);

  const raidRow = () => rowOf(9, { 0: { atk: 50 }, 1: { role: 'guard' }, 2: { role: 'guard' } });

  it('picks either Guard of the zone across seeds, and the same seed always picks the same', () => {
    const picked = new Set<string>();
    for (let i = 0; i < SEEDS; i++) {
      const seed = `pick-${String(i)}`;
      const first = victims(raidRow(), [slamAt()], seed);
      expect(victims(raidRow(), [slamAt()], seed)).toEqual(first);
      expect(first).toHaveLength(1);
      picked.add(first[0] as string);
    }
    expect([...picked].sort()).toEqual(['s1', 's2']);
  });

  it('picks near evenly', () => {
    let s1 = 0;
    for (let i = 0; i < 200; i++) {
      if (victims(raidRow(), [slamAt()], `even-${String(i)}`)[0] === 's1') s1++;
    }
    expect(s1).toBeGreaterThan(60);
    expect(s1).toBeLessThan(140);
  });

  it('picks among the Guards on both sides in the dungeon', () => {
    const row = () => [
      slot('g0', { role: 'guard', atk: 1 }),
      slot('x', { role: 'setter', atk: 50 }),
      slot('g1', { role: 'guard', atk: 1 }),
    ];
    const picked = new Set<string>();
    for (let i = 0; i < SEEDS; i++) {
      picked.add(
        victims(row(), [slamAt()], `side-${String(i)}`, {
          extra: { guardReach: 'adjacent' },
        })[0] as string,
      );
    }
    expect([...picked].sort()).toEqual(['g0', 'g1']);
  });

  it('picks among the Guards for a reflect, too', () => {
    const row = () =>
      rowOf(9, {
        0: { role: 'setter', element: 'tide', atk: 100 },
        1: { role: 'payoff', element: 'spark', atk: 100 },
        2: { role: 'guard' },
      });
    // One Front Guard (9 slots: Front is s0..s2): always s2.
    const only = new Set<string>();
    // Two Front Guards (12 slots: Front is s0..s3: setter, payoff, Guard, Guard).
    const two = new Set<string>();
    for (let i = 0; i < SEEDS; i++) {
      const rules = rulesOf({ guardHpBp: 0, guardArmorBp: 0 });
      const reflect = (r: ReturnType<typeof rowOf>) =>
        eventsOf(
          fightWith(r, [BACKDRAFT], { rules, rng: createSeededRng(`reflect-${String(i)}`) }),
          'boss_hit',
        ).find((e) => e.source === 'reflect');
      only.add(reflect(row())?.target as string);
      const twelve = rowOf(12, {
        0: { role: 'setter', element: 'tide', atk: 100 },
        1: { role: 'payoff', element: 'spark', atk: 100 },
        2: { role: 'guard' },
        3: { role: 'guard' },
      });
      two.add(reflect(twelve)?.target as string);
    }
    expect([...only]).toEqual(['s2']);
    expect([...two].sort()).toEqual(['s2', 's3']);
  });

  it('picks among the Guards for the boss plain attack too', () => {
    const picked = new Set<string>();
    for (let i = 0; i < SEEDS; i++) {
      const r = fightWith(rowOf(9, { 1: { role: 'guard' }, 2: { role: 'guard' } }), [], {
        rules: rulesOf({ guardHpBp: 0, guardArmorBp: 0 }),
        rng: createSeededRng(`plain-${String(i)}`),
      });
      picked.add(eventsOf(r, 'boss_hit')[0]?.target as string);
    }
    expect([...picked].sort()).toEqual(['s1', 's2']);
  });

  it('without rules the left Guard always takes it', () => {
    for (let i = 0; i < 10; i++) {
      const r = fightWith(raidRow(), [slamAt()], { rng: createSeededRng(`left-${String(i)}`) });
      expect(eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick')?.target).toBe('s1');
    }
  });
});

describe('the Guard dice', () => {
  /** A seeded RNG that counts its draws. */
  function counting(seed: string): { rng: Rng; draws: () => number } {
    const inner = createSeededRng(seed);
    let n = 0;
    return {
      rng: {
        nextU32: () => {
          n++;
          return inner.nextU32();
        },
      },
      draws: () => n,
    };
  }

  it('are drawn only with rules: one per slot per round, whatever happens', () => {
    const row = () => rowOf(9, { 1: { role: 'guard' } });
    const none = counting('dice');
    fightWith(row(), [], { rounds: 3, rng: none.rng });
    expect(none.draws()).toBe(0);
    const withRules = counting('dice');
    fightWith(row(), [], { rounds: 3, rules: ARMOR, rng: withRules.rng });
    expect(withRules.draws()).toBe(3 * 9);
    // Also with no Guard in the row.
    const noGuard = counting('dice');
    fightWith(rowOf(9), [], { rounds: 3, rules: ARMOR, rng: noGuard.rng });
    expect(noGuard.draws()).toBe(3 * 9);
  });

  it('come after every other die: round 1 is the same as without rules when the rules do nothing', () => {
    const luck = RULES.combat.luck;
    const quiet = rulesOf({ coverBp: 0, maxHitBp: 0, guardHpBp: 0, guardArmorBp: 0 });
    const row = () => rowOf(9, {}, { role: 'payoff' });
    const plain = fightWith(row(), [], { rounds: 4, extra: { luck } });
    const withRules = fightWith(row(), [], { rounds: 4, extra: { luck }, rules: quiet });
    const round1 = (r: typeof plain) => r.events.filter((e) => e.round === 1);
    expect(round1(withRules)).toEqual(round1(plain));
    // Not vacuous: dice were rolled (some hit carries luck).
    expect(round1(plain).some((e) => e.t === 'hit' && e.luckBp !== undefined)).toBe(true);
  });
});
