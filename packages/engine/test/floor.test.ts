import { describe, expect, it } from 'vitest';
import { phaseFloorHp, type FightInput } from '../src/index';
import { eventsOf, run, slot } from './helpers';
import { rowOf } from './pattern-helpers';

/**
 * The phase floor (`FightInput.bossHpFloor`): the boss's HP never goes below it. A hit that reaches
 * it counts only down to it (no overkill in the damage, the reaction bonus, the credit or the
 * element totals), the boss retreats and the fight ends at once.
 */

const FINALE: Partial<FightInput> = {
  phase: 'finale',
  bossAtk: 100,
  turnOrderOverride: 'left_to_right',
};
const pool = (max: number, current = max) => ({ bossHpPool: { max, current } });

describe('the phase floor', () => {
  it('clamps the hit that reaches it, retreats at once and ends the fight', () => {
    const r = run([slot('a', { atk: 500 }), slot('b', { atk: 500 })], {
      ...FINALE,
      ...pool(1_000),
      bossHpFloor: 900,
    });
    // a hits for 500 or more, but only the 100 down to the floor counts.
    const hits = eventsOf(r, 'hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ creature: 'a', damage: 100, bossHp: 900 });
    expect(eventsOf(r, 'retreat')).toEqual([{ t: 'retreat', round: 1, bossHp: 900 }]);
    // No further turns, boss actions or rounds: b never acts and the boss never attacks.
    expect(eventsOf(r, 'turn').map((e) => e.creature)).toEqual(['a']);
    expect(eventsOf(r, 'boss_hit')).toEqual([]);
    expect(r.rounds).toBe(1);
    // The hit comes before the retreat in the log, and the round is closed with the floor as HP.
    const types = r.events.map((e) => e.t);
    expect(types.indexOf('hit')).toBeLessThan(types.indexOf('retreat'));
    expect(r.events.at(-1)).toEqual({ t: 'round_end', round: 1, bossHp: 900 });
    // The result.
    expect(r.retreated).toBe(true);
    expect(r.cleared).toBe(true);
    expect(r.enraged).toBe(false);
    expect(r.bossHpEnd).toBe(900);
  });

  it('counts no overkill in the credit, the player and creature totals or the element totals', () => {
    const r = run([slot('a', { atk: 500, element: 'ember' }), slot('b', { atk: 500 })], {
      ...FINALE,
      ...pool(1_000),
      bossHpFloor: 900,
    });
    expect(r.perCreature.a?.damage).toBe(100);
    expect(r.perCreature.a?.contribution).toBe(100);
    expect(r.perPlayer.p1?.damage).toBe(100);
    expect(r.perPlayer.p1?.contribution).toBe(100);
    expect(r.damageByElement).toEqual({ tide: 0, ember: 100, grove: 0, spark: 0 });
    expect(r.bossHpStart - r.bossHpEnd).toBe(100);
    expect(r.perCreature.b?.damage).toBe(0);
  });

  it('counts a hit that lands exactly on the floor in full, and retreats', () => {
    // Work out one hit's damage first, then put the floor exactly that far down.
    const probe = run([slot('a', { atk: 300 })], { ...FINALE, ...pool(10_000) });
    const damage = eventsOf(probe, 'hit')[0]?.damage ?? 0;
    expect(damage).toBeGreaterThan(0);
    const r = run([slot('a', { atk: 300 }), slot('b', { atk: 300 })], {
      ...FINALE,
      ...pool(10_000),
      bossHpFloor: 10_000 - damage,
    });
    expect(eventsOf(r, 'hit')[0]).toMatchObject({ damage, bossHp: 10_000 - damage });
    expect(r.retreated).toBe(true);
    expect(eventsOf(r, 'turn')).toHaveLength(1);
  });

  it('does nothing while the boss is above the floor, and the fight goes on', () => {
    const r = run([slot('a', { atk: 10 })], {
      ...FINALE,
      ...pool(1_000_000),
      bossHpFloor: 500_000,
    });
    expect(r.retreated).toBe(false);
    expect(eventsOf(r, 'retreat')).toEqual([]);
    expect(r.rounds).toBe(12);
    expect(r.cleared).toBe(false);
  });

  it('absent or 0 means no floor: the boss can fall, with its overkill counted as before', () => {
    const base = run([slot('a', { atk: 500 })], { ...FINALE, ...pool(300) });
    const zero = run([slot('a', { atk: 500 })], { ...FINALE, ...pool(300), bossHpFloor: 0 });
    expect(zero).toEqual(base);
    expect(base.bossHpEnd).toBe(0);
    expect(base.retreated).toBe(false);
    expect(eventsOf(base, 'retreat')).toEqual([]);
    expect(eventsOf(base, 'hit')[0]?.damage).toBeGreaterThan(300);
  });

  it('works on the first creature too when a fight starts at the floor: the first hit retreats for nothing', () => {
    const r = run([slot('a', { atk: 500 })], { ...FINALE, ...pool(1_000, 900), bossHpFloor: 900 });
    expect(eventsOf(r, 'hit')[0]).toMatchObject({ damage: 0, bossHp: 900 });
    expect(r.retreated).toBe(true);
    expect(r.bossHpEnd).toBe(900);
  });

  it('clamps an ability strike that reaches the floor, and ends the fight', () => {
    const r = run([slot('a', { atk: 100 }), slot('b', { atk: 100 })], {
      ...FINALE,
      ...pool(1_000),
      bossHpFloor: 900,
      finaleAbilities: [
        {
          key: 's',
          playerId: 'p1',
          abilityId: 'test-strike',
          creatureId: 'b',
          fireAtRound: 1,
        },
      ],
    });
    // The strike (200% of Attack) fires at round start, before any turn.
    const hits = eventsOf(r, 'hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      creature: 'b',
      ability: 'test-strike',
      damage: 100,
      bossHp: 900,
    });
    expect(eventsOf(r, 'turn')).toEqual([]);
    expect(r.retreated).toBe(true);
    expect(r.perCreature.b?.damage).toBe(100);
  });

  describe('with a reaction on the hit that reaches it', () => {
    // s1 (tide setter) marks the boss; p1 (spark payoff) then cashes the mark in. Without a floor
    // p1 deals a plain hit plus a reaction bonus of 318 (boss Attack and stats as in the Backdraft
    // tests); here the floor leaves room for the plain hit and a part of the bonus.
    const row = () => [
      slot('s1', { owner: 'a', element: 'tide', role: 'setter', atk: 100 }),
      slot('p1', { owner: 'b', element: 'spark', role: 'payoff', atk: 100 }),
    ];
    const free = run(row(), { ...FINALE, ...pool(100_000) });
    const hits = eventsOf(free, 'hit').filter((h) => h.round === 1);
    const setterDamage = hits[0]?.damage ?? 0;
    const payoffFull = hits[1]?.damage ?? 0;
    const bonusFull = eventsOf(free, 'reaction')[0]?.bonus ?? 0;
    const plain = payoffFull - bonusFull;

    it('has the numbers this test relies on', () => {
      expect(setterDamage).toBe(100);
      expect(plain).toBe(150);
      expect(bonusFull).toBe(318);
    });

    it('cuts the bonus first: the plain hit counts whole, the bonus gets what is left', () => {
      const room = plain + 50; // 50 of the 318 bonus fits under the floor
      const max = 10_000;
      const floor = max - setterDamage - room;
      const r = run(row(), { ...FINALE, ...pool(max), bossHpFloor: floor });
      const p1 = eventsOf(r, 'hit').find((h) => h.creature === 'p1');
      expect(p1).toMatchObject({ damage: room, bossHp: floor });
      expect(eventsOf(r, 'reaction')[0]).toMatchObject({
        payoff: 'p1',
        bonus: 50,
        reflected: false,
      });
      expect(r.retreated).toBe(true);
      // Credit: the setter gets its 60% share of the 50 that was dealt; the payoff the rest.
      expect(r.perCreature.s1?.setupCredit).toBe(30);
      expect(r.perCreature.p1?.damage).toBe(room - 30);
      expect(r.perPlayer.a?.contribution).toBe(setterDamage + 30);
      expect(r.perPlayer.b?.contribution).toBe(room - 30);
      // Everything dealt is accounted for exactly once.
      const dealt = r.bossHpStart - r.bossHpEnd;
      expect(dealt).toBe(setterDamage + room);
      expect(r.perPlayer.a!.contribution + r.perPlayer.b!.contribution).toBe(dealt);
      expect(r.damageByElement.tide + r.damageByElement.spark).toBe(dealt);
    });

    it('drops the whole bonus when the floor falls inside the plain hit', () => {
      const max = 10_000;
      const floor = max - setterDamage - 100; // room 100 < the plain hit (150)
      const r = run(row(), { ...FINALE, ...pool(max), bossHpFloor: floor });
      expect(eventsOf(r, 'hit').find((h) => h.creature === 'p1')).toMatchObject({ damage: 100 });
      expect(eventsOf(r, 'reaction')[0]).toMatchObject({ bonus: 0 });
      expect(r.perCreature.s1?.setupCredit).toBe(0);
      expect(r.perCreature.p1?.damage).toBe(100);
    });
  });

  describe('with Support buffs on the hit that reaches it', () => {
    it('never credits the supporters more than was dealt', () => {
      // A row of 9 so the middle zone is s3 to s5: the hitter has a Support on each side.
      const row = () =>
        rowOf(9, {
          3: { owner: 'a', role: 'support' },
          4: { owner: 'b', atk: 1_000 },
          5: { owner: 'c', role: 'support' },
        });
      const r = run(row(), {
        ...FINALE,
        ...pool(100_000),
        bossHpFloor: 99_980,
        // Less room than the buffed hit would deal.
      });
      expect(r.retreated).toBe(true);
      const dealt = r.bossHpStart - r.bossHpEnd;
      // The support creatures act (and deal 1) before or after the hitter depending on the order;
      // whatever happened, every credit adds up to exactly what was dealt.
      const total = Object.values(r.perPlayer).reduce((sum, p) => sum + p.contribution, 0);
      expect(total).toBe(dealt);
      for (const c of Object.values(r.perCreature)) expect(c.damage).toBeGreaterThanOrEqual(0);
      // The supporters did earn something from the buffed hit, so this is not vacuous.
      expect(r.perCreature.s3!.supportCredit + r.perCreature.s5!.supportCredit).toBeGreaterThan(0);
    });
  });

  it('clears a phase fight: phaseFloorHp is where a boss that is driven down retreats', () => {
    const max = 10_000;
    const floor = phaseFloorHp(max, 'phase1');
    expect(floor).toBe(7_000);
    const r = run([slot('a', { atk: 4_000 }), slot('b', { atk: 4_000 })], {
      phase: 'phase1',
      bossAtk: 1,
      turnOrderOverride: 'left_to_right',
      ...pool(max),
      bossHpFloor: floor,
    });
    expect(r.retreated).toBe(true);
    expect(r.cleared).toBe(true);
    expect(r.bossHpEnd).toBe(floor);
    // The phase-1 adaptation notice is still made.
    expect(eventsOf(r, 'adaptation').some((e) => e.status === 'suggested')).toBe(true);
  });

  it('refuses a floor that is not a whole number from 0 to the pool maximum', () => {
    for (const bossHpFloor of [-1, 1.5, Number.NaN, 1_001]) {
      expect(() => run([slot('a')], { ...FINALE, ...pool(1_000), bossHpFloor })).toThrow(
        /bossHpFloor/,
      );
    }
  });
});
