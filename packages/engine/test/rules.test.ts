import { RULES, type Gimmick, type SupportFx } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { liveFightRules } from '../src/index';
import { eventsOf, inRound, boss } from './helpers';
import { everyRound, fightWith, gimmickHits, rowOf, rulesOf } from './pattern-helpers';

const sweep = (power: number, rows: ('front' | 'middle' | 'back' | 'all')[] = ['front']): Gimmick =>
  everyRound({ op: 'sweep', rows, power });

describe('Guard cover (area hits)', () => {
  const row = () => rowOf(9, { 1: { role: 'guard' } });

  it('softens an area hit on the creatures beside a Guard by coverBp and credits the Guard', () => {
    const r = fightWith(row(), [sweep(10_000)], { rules: rulesOf() });
    expect(gimmickHits(r)).toEqual([
      [1, 's0', 60],
      [1, 's1', 100],
      [1, 's2', 60],
    ]);
    const covered = eventsOf(r, 'boss_hit').flatMap((e) => (e.covered === undefined ? [] : [e]));
    expect(covered.map((e) => [e.target, e.covered])).toEqual([
      ['s0', { guard: 's1', prevented: 40 }],
      ['s2', { guard: 's1', prevented: 40 }],
    ]);
    // The Guard took the sweep (100) and the plain attack (100) aimed at it, and is credited for its
    // own damage plus the 80 its cover saved.
    expect(r.perCreature.s1!.damageTaken).toBe(200);
    expect(r.perCreature.s1!.guardCredit).toBe(200 + 80);
  });

  it('does nothing without rules, and a Guard is never covered itself', () => {
    const r = fightWith(row(), [sweep(10_000)]);
    expect(gimmickHits(r)).toEqual([
      [1, 's0', 100],
      [1, 's1', 100],
      [1, 's2', 100],
    ]);
    expect(eventsOf(r, 'boss_hit').some((e) => e.covered !== undefined)).toBe(false);
    const two = fightWith(
      rowOf(9, { 0: { role: 'guard' }, 1: { role: 'guard' } }),
      [sweep(10_000)],
      {
        rules: rulesOf(),
      },
    );
    // s0 and s1 are Guards beside each other: neither is covered. s2 is beside a Guard.
    expect(gimmickHits(two)).toEqual([
      [1, 's0', 100],
      [1, 's1', 100],
      [1, 's2', 60],
    ]);
  });

  it("stops at the row's edge in the raid, and uses the plain line with guardReach adjacent", () => {
    // s2 is the last Front slot: the Guard at s3 (first Middle slot) is not beside it in the raid.
    const raid = fightWith(rowOf(9, { 3: { role: 'guard' } }), [sweep(10_000, ['front'])], {
      rules: rulesOf(),
    });
    expect(gimmickHits(raid)).toEqual([
      [1, 's0', 100],
      [1, 's1', 100],
      [1, 's2', 100],
    ]);
    const line = fightWith(rowOf(3, { 1: { role: 'guard' } }), [sweep(10_000, ['all'])], {
      rules: rulesOf(),
      extra: { guardReach: 'adjacent' },
    });
    expect(gimmickHits(line)).toEqual([
      [1, 's0', 60],
      [1, 's1', 100],
      [1, 's2', 60],
    ]);
  });

  it('does not soften an aimed hit (the Guard steps in instead) or a hit_zone it is not beside', () => {
    const aimed = fightWith(
      rowOf(9, { 1: { role: 'guard' }, 0: { atk: 99 } }),
      [everyRound({ op: 'strike_highest_atk', power: 10_000 })],
      { rules: rulesOf() },
    );
    expect(eventsOf(aimed, 'boss_hit')[0]).toMatchObject({ target: 's1', from: 's0', damage: 100 });
    expect(eventsOf(aimed, 'boss_hit')[0]!.covered).toBeUndefined();
  });

  it('covers a hit_zone strike too (it is an area hit)', () => {
    const r = fightWith(row(), [everyRound({ op: 'hit_zone', zone: 'front', power: 10_000 })], {
      rules: rulesOf(),
    });
    expect(gimmickHits(r).map((h) => h[2])).toEqual([60, 100, 60]);
  });

  it('a 300% slam the Guard takes gives each neighbour 150 if the Guard fell, 90 if it still stands', () => {
    const slam = everyRound({ op: 'slam', aim: 'front', power: 30_000, splashBp: 5_000 });
    // Guard with 100 HP (130 max) falls to the slam: nothing covers the splash when it lands.
    const fell = fightWith(rowOf(9, { 1: { role: 'guard', hp: 100 } }), [slam], {
      rules: rulesOf(),
    });
    // The hit is logged at its full damage (300, more than the Guard had left); the splash is 50% of the 300.
    expect(gimmickHits(fell)).toEqual([
      [1, 's1', 300],
      [1, 's0', 150],
      [1, 's2', 150],
    ]);
    expect(eventsOf(fell, 'boss_hit').filter((e) => e.splash === true)).toHaveLength(2);
    // A healthy Guard still stands: cover is 40% off the splash.
    const stood = fightWith(row(), [slam], { rules: rulesOf() });
    expect(gimmickHits(stood)).toEqual([
      [1, 's1', 300],
      [1, 's0', 90],
      [1, 's2', 90],
    ]);
    expect(eventsOf(stood, 'boss_hit')[1]).toMatchObject({
      splash: true,
      covered: { guard: 's1', prevented: 60 },
    });
  });
});

describe('Support element effects (rules.supportFx)', () => {
  const adjacent = { guardReach: 'adjacent' as const };

  it('buffBp replaces the shared buff in support_buff.bp and the next hit', () => {
    const row = () => rowOf(3, { 1: { role: 'support', element: 'ember' } });
    const plain = fightWith(row(), [], { extra: adjacent });
    expect(eventsOf(plain, 'support_buff').map((e) => e.bp)).toEqual([1500, 1500]);
    const withFx = fightWith(row(), [], {
      rules: rulesOf({ supportFx: { ember: { buffBp: 2_500 } } }),
      extra: adjacent,
    });
    expect(eventsOf(withFx, 'support_buff').map((e) => e.bp)).toEqual([2500, 2500]);
    // A rules table without an entry for the Support's element keeps the shared buff.
    const other = fightWith(row(), [], {
      rules: rulesOf({ supportFx: { tide: { buffBp: 3_000 } } }),
      extra: adjacent,
    });
    expect(eventsOf(other, 'support_buff').map((e) => e.bp)).toEqual([1500, 1500]);
    // The buff is read at the neighbour's hit: s0 hits 100 x 1.25 = 125 against a Tide boss.
    expect(eventsOf(withFx, 'hit').find((h) => h.creature === 's0')).toMatchObject({
      bonusBp: 2500,
    });
  });

  describe('Mend', () => {
    const tideFx = rulesOf({ supportFx: { tide: { healBp: 400, cleanse: true } } });

    it('heals each neighbour a share of its max HP, capped at what is missing, credited to the Support', () => {
      // s0: 1000 max HP, 500 now (heal 40). s2: 995 of 1000 (heal 5, capped).
      const row = rowOf(3, {
        0: { hp: 1000 },
        1: { role: 'support', element: 'tide', hp: 1000 },
        2: { hp: 1000 },
      });
      row[0] = { ...row[0]!, hp: 500 };
      row[2] = { ...row[2]!, hp: 995 };
      const r = fightWith(row, [], { rules: tideFx, extra: adjacent });
      expect(eventsOf(r, 'heal')).toEqual([
        { t: 'heal', round: 1, supporter: 's1', target: 's0', amount: 40 },
        { t: 'heal', round: 1, supporter: 's1', target: 's2', amount: 5 },
      ]);
      expect(r.perCreature.s1!.supportCredit).toBe(45);
      expect(r.perPlayer.p1!.supportCredit).toBe(45);
      // Nobody is healed above their max HP; a full-HP neighbour gets no event.
      expect(r.hpMax.s0).toBe(1000);
    });

    it('never revives a knocked-out neighbour', () => {
      const row = rowOf(3, { 1: { role: 'support', element: 'tide', hp: 1000 } });
      row[0] = { ...row[0]!, hp: 0 };
      const r = fightWith(row, [], { rules: tideFx, extra: adjacent, rounds: 3 });
      expect(eventsOf(r, 'heal').every((e) => e.target !== 's0')).toBe(true);
      expect(r.hpEnd.s0).toBe(0);
    });

    it('a knocked-out Support gives nothing', () => {
      const row = rowOf(3, { 1: { role: 'support', element: 'tide', hp: 1000 } });
      row[0] = { ...row[0]!, hp: 10 };
      row[1] = { ...row[1]!, hp: 0 };
      const r = fightWith(row, [], { rules: tideFx, extra: adjacent, rounds: 2 });
      expect(eventsOf(r, 'heal')).toEqual([]);
      expect(eventsOf(r, 'support_buff')).toEqual([]);
    });

    it('a silenced Support gives nothing that round', () => {
      // Round 1 silences both row ends; the Support at the left end is silenced in round 2.
      const silence = everyRound({ op: 'silence_ends', turns: 1 });
      const row = rowOf(4, { 0: { role: 'support', element: 'tide', hp: 1000 } });
      row[1] = { ...row[1]!, hp: 500 };
      const r = fightWith(row, [silence], { rules: tideFx, extra: adjacent, rounds: 2 });
      expect(eventsOf(r, 'heal').map((e) => e.round)).toEqual([1]);
      expect(inRound(r, 2).some((e) => e.t === 'support_buff')).toBe(false);
    });

    it('cleanse clears a neighbour silence at round start, so it acts that round', () => {
      const silence = everyRound({ op: 'silence_ends', turns: 1 });
      // The ends (s0, s3) are silenced in round 1; the Tide Support at s1 stands beside s0.
      const row = rowOf(4, { 1: { role: 'support', element: 'tide' } });
      const withFx = fightWith(row, [silence], { rules: tideFx, extra: adjacent, rounds: 2 });
      expect(eventsOf(withFx, 'cleanse')).toEqual([
        { t: 'cleanse', round: 2, supporter: 's1', target: 's0' },
      ]);
      expect(inRound(withFx, 2).some((e) => e.t === 'skip' && e.creature === 's0')).toBe(false);
      expect(inRound(withFx, 2).some((e) => e.t === 'turn' && e.creature === 's0')).toBe(true);
      const without = fightWith(row, [silence], { extra: adjacent, rounds: 2 });
      expect(eventsOf(without, 'cleanse')).toEqual([]);
      expect(inRound(without, 2).some((e) => e.t === 'skip' && e.creature === 's0')).toBe(true);
    });
  });

  describe('Overcharge (reactionBp)', () => {
    // s0 (Tide setter) marks; s1 (Spark payoff) cashes Overload; the Spark Support acts last.
    // Against a Tide boss, as the golden fight.
    const fx = rulesOf({ supportFx: { spark: { reactionBp: 1_500 } } });
    const reactionOf = (r: ReturnType<typeof fightWith>) =>
      eventsOf(r, 'reaction').find((e) => e.round === 1 && e.payoff === 's1')!;
    const hitOf = (r: ReturnType<typeof fightWith>) =>
      eventsOf(r, 'hit').find((e) => e.round === 1 && e.creature === 's1')!;
    const near = () =>
      rowOf(3, {
        0: { role: 'setter', element: 'tide', atk: 100 },
        1: { role: 'payoff', element: 'spark', atk: 100 },
        2: { role: 'support', element: 'spark', atk: 1 },
      });
    const far = () =>
      rowOf(4, {
        0: { role: 'setter', element: 'tide', atk: 100 },
        1: { role: 'payoff', element: 'spark', atk: 100 },
        2: { role: 'payoff', element: 'ember', atk: 1 },
        3: { role: 'support', element: 'spark', atk: 1 },
      });
    const overrides = { extra: adjacent, rounds: 1 };

    it('adds its share of the reaction bonus when a neighbour cashes it in, credited to the Support', () => {
      const base = fightWith(near(), [], overrides);
      const boosted = fightWith(near(), [], { ...overrides, rules: fx });
      const bonus = reactionOf(base).bonus;
      expect(bonus).toBeGreaterThan(0);
      expect(reactionOf(boosted).bonus).toBe(Math.floor((bonus * 11_500) / 10_000));
      const gain = hitOf(boosted).damage - hitOf(base).damage;
      expect(gain).toBeGreaterThan(0);
      expect(boosted.perCreature.s2!.supportCredit - base.perCreature.s2!.supportCredit).toBe(gain);
      // Credit is zero-sum: the Support's extra comes out of what the payoff is credited for.
      const total = (r: ReturnType<typeof fightWith>) =>
        Object.values(r.perPlayer).reduce((s, p) => s + p.contribution, 0);
      expect(total(boosted) - total(base)).toBe(gain);
    });

    it('keeps damage, setup and support credit equal to the damage dealt with the live rules', () => {
      // A Spark Support and an Ember Support (shared buff, Stoke) both beside the payoff, so the
      // buffs and Overcharge both move credit; once with a phase floor that cuts the hit short.
      const row = () =>
        rowOf(4, {
          0: { role: 'setter', element: 'tide', atk: 100 },
          1: { role: 'support', element: 'ember', atk: 1 },
          2: { role: 'payoff', element: 'spark', atk: 100 },
          3: { role: 'support', element: 'spark', atk: 1 },
        });
      const check = (floor: number | undefined): void => {
        const r = fightWith(row(), [], {
          rules: liveFightRules(),
          extra: { ...adjacent, ...(floor === undefined ? {} : { bossHpFloor: floor }) },
          rounds: 3,
        });
        const dealt = eventsOf(r, 'hit').reduce((s, e) => s + e.damage, 0);
        const credited = Object.values(r.perCreature).reduce(
          (s, c) => s + c.damage + c.setupCredit + c.supportCredit,
          0,
        );
        expect(dealt).toBeGreaterThan(0);
        expect(credited).toBe(dealt);
        // Both Supports were paid, and nobody has negative credit.
        expect(r.perCreature.s3!.supportCredit).toBeGreaterThan(0);
        expect(r.perCreature.s1!.supportCredit).toBeGreaterThan(0);
        for (const c of Object.values(r.perCreature)) expect(c.damage).toBeGreaterThanOrEqual(0);
      };
      check(undefined);
      // The payoff's first hit would take the boss well below this floor.
      check(1_000_000_000 - 300);
    });

    it('does nothing for a reaction cashed in away from the Support, ', () => {
      const base = fightWith(far(), [], overrides);
      const boosted = fightWith(far(), [], { ...overrides, rules: fx });
      expect(reactionOf(boosted).bonus).toBe(reactionOf(base).bonus);
      expect(boosted.perCreature.s3!.supportCredit).toBe(base.perCreature.s3!.supportCredit);
    });

    it('does not apply to a plain hit with no reaction', () => {
      const row = rowOf(2, {
        0: { role: 'payoff', element: 'spark', atk: 100 },
        1: { role: 'support', element: 'spark', atk: 1 },
      });
      const a = fightWith(row, [], { ...overrides });
      const b = fightWith(row, [], { ...overrides, rules: fx });
      expect(eventsOf(b, 'hit')).toEqual(eventsOf(a, 'hit'));
    });
  });

  it('is entirely absent without rules: no heal, no cleanse, shared buff', () => {
    const row = rowOf(4, { 1: { role: 'support', element: 'tide' } });
    const r = fightWith(row, [everyRound({ op: 'silence_ends', turns: 1 })], {
      extra: adjacent,
      rounds: 3,
    });
    expect(eventsOf(r, 'heal')).toEqual([]);
    expect(eventsOf(r, 'cleanse')).toEqual([]);
    expect(eventsOf(r, 'support_buff').every((e) => e.bp === RULES.combat.supportBuffBp)).toBe(
      true,
    );
  });
});

describe('RULES ceilings (docs/design/attack-patterns.md 4.7)', () => {
  it('keeps every element effect at or under the steep end of the study', () => {
    for (const [element, fx] of Object.entries<SupportFx>(RULES.combat.supportFx)) {
      expect(fx.buffBp ?? 0, `${element} buffBp`).toBeLessThanOrEqual(3_500);
      expect(fx.reactionBp ?? 0, `${element} reactionBp`).toBeLessThanOrEqual(2_000);
      expect(fx.healBp ?? 0, `${element} healBp`).toBeLessThanOrEqual(800);
    }
  });

  it('liveFightRules copies RULES.combat so a stored fight keeps the rules it used', () => {
    const rules = liveFightRules();
    expect(rules.coverBp).toBe(RULES.combat.coverBp);
    expect(rules.maxHitBp).toBe(RULES.combat.maxHitBp);
    expect(rules.supportFx).toEqual(RULES.combat.supportFx);
    expect(rules.supportFx).not.toBe(RULES.combat.supportFx);
  });
});

describe('single-hit cap switched off (shipped rules)', () => {
  it('0 means no cap: the live rules leave a big hit as big as it is', () => {
    const live = liveFightRules();
    expect(RULES.combat.maxHitBp).toBe(0);
    expect(live.maxHitBp).toBe(0);
    const row = rowOf(3, { 0: { hp: 1000 }, 1: { hp: 1000 }, 2: { hp: 1000 } });
    // 1000% of Attack 100 is 1000 on every creature: all of its HP, not half.
    const r = fightWith(row, [sweep(100_000, ['all'])], { rules: live });
    expect(gimmickHits(r).map((h) => h[2])).toEqual([1000, 1000, 1000]);
    expect(eventsOf(r, 'boss_hit').some((e) => e.capped === true)).toBe(false);
  });
});

describe('single-hit cap (rules.maxHitBp)', () => {
  const cap = rulesOf({ maxHitBp: 5_000 });

  it('cuts an aimed or area hit to the share of the victim max HP and marks it capped', () => {
    const row = () => rowOf(3, { 0: { hp: 1000 }, 1: { hp: 1000 }, 2: { hp: 1000 } });
    // 1000% of Attack 100 = 1000 per hit; half of 1000 HP is 500.
    const area = fightWith(row(), [sweep(100_000, ['all'])], {
      rules: cap,
      extra: { guardReach: 'adjacent' },
    });
    expect(gimmickHits(area).map((h) => h[2])).toEqual([500, 500, 500]);
    expect(
      eventsOf(area, 'boss_hit')
        .filter((e) => e.source === 'gimmick')
        .every((e) => e.capped === true),
    ).toBe(true);
    // A hit under the cap is not marked.
    const small = fightWith(row(), [sweep(10_000, ['all'])], { rules: cap });
    expect(eventsOf(small, 'boss_hit').some((e) => e.capped === true)).toBe(false);
    // Aimed: the plain attack too (boss Attack 1000, a Guard's cap is on its larger max HP).
    const attack = fightWith(rowOf(3, { 0: { role: 'guard', hp: 1000 } }), [], {
      rules: cap,
      bossAtk: 1000,
    });
    expect(eventsOf(attack, 'boss_hit')[0]).toMatchObject({
      target: 's0',
      damage: 650,
      capped: true,
    });
  });

  it('is absent without rules', () => {
    const r = fightWith(rowOf(3, { 0: { hp: 1000 } }), [sweep(100_000, ['all'])]);
    expect(gimmickHits(r)[0]).toEqual([1, 's0', 1000]);
    expect(eventsOf(r, 'boss_hit').some((e) => e.capped !== undefined)).toBe(false);
  });

  it('never cuts a reflected hit', () => {
    const wyrm = { ...boss('cinder-wyrm'), element: 'tide' as const };
    const row = rowOf(4, {
      0: { role: 'setter', element: 'tide', atk: 100 },
      1: { role: 'payoff', element: 'spark', atk: 100, hp: 400 },
      2: { role: 'setter', element: 'tide', atk: 100 },
      3: { role: 'payoff', element: 'spark', atk: 100 },
    });
    const r = fightWith(row, wyrm.gimmicks, { rules: cap, bossAtk: 1 });
    const reflect = eventsOf(r, 'boss_hit').find((e) => e.source === 'reflect')!;
    expect(reflect.target).toBe('s1');
    // The bonus of the reaction is far above half of s1's 400 HP.
    expect(reflect.damage).toBeGreaterThan(200);
    expect(reflect.capped).toBeUndefined();
  });
});
