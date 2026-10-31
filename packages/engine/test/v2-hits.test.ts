/**
 * Combat v2: a creature's hit on the boss (damage, the crit step, Sure Crits, Steady Rhythm, counters, hit bonuses by position and
 * state, Cull and the killing blow). Creatures and boss are built by hand and effects are named directly; the dice are scripted
 * (`YES` passes any chance above 0, `NO` fails any chance below 100%; with none given nothing below 100% ever happens), so no seed
 * decides and every number is exact. These were the lab's `fightRules`, `luck` and `talents` rule tests.
 */
import { mergeFx } from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import {
  NO,
  YES,
  boss,
  by,
  count,
  kinds,
  play,
  playScripted,
  spec,
  striker,
  texts,
} from './v2-helpers';

describe('R6.3b: the crit is rolled after the dodge and the choice of the reaction', () => {
  it('a dodged hit draws no crit roll, and a hit that lands draws it after the dodge', () => {
    // Boss Speed 10 is 1% dodge: the first draw is the dodge, the second (if any) the crit.
    const golem = boss({ spd: 10 });
    const dodged = playScripted(golem, [spec()], [YES]);
    expect(count(dodged.res, 'boss-dodge')).toBe(1);
    expect(dodged.draws).toBe(1);
    expect(count(dodged.res, 'crit')).toBe(0);
    expect(dodged.res.damage).toBe(0);
    const crit = playScripted(golem, [spec()], [NO, YES]);
    expect(crit.draws).toBe(2);
    expect(count(crit.res, 'crit')).toBe(1);
    expect(crit.res.damage).toBe(200);
  });

  it('the reaction works on the crit hit: its bonus doubles with the crit, and the crit is logged before the reaction', () => {
    // A tide Setter marks tide; a spark Payoff cashes it. Draw 1 is the Setter's crit roll, draw 2 the Payoff's.
    const team = [
      spec({ name: 'Setter' }),
      spec({ name: 'Payoff', role: 'payoff', element: 'spark', col: 1 }),
    ];
    const bonus = (r: { events: readonly { kind: string; text: string }[] }) =>
      Number(r.events.find((e) => e.kind === 'reaction')?.text.split('+')[1]);
    const plain = playScripted(boss({ cols: 2 }), team, [NO, NO]);
    const crit = playScripted(boss({ cols: 2 }), team, [NO, YES]);
    expect(plain.res.reactions).toBe(1);
    // Plain hit 100, a Payoff's reaction adds plain x (2 - 1) = 100; a crit makes both 200.
    expect(bonus(plain.res)).toBe(100);
    expect(bonus(crit.res)).toBe(200);
    const order = kinds(crit.res.events);
    expect(order.indexOf('crit')).toBeGreaterThan(-1);
    expect(order.indexOf('crit')).toBeLessThan(order.indexOf('reaction'));
  });
});

describe('a crit doubles the hit and its chance and damage stack (R7.1)', () => {
  it('a hit that crits deals twice the plain hit, armour comes off the doubled hit; one that does not deals the plain hit', () => {
    const golem = boss({ armour: 20 });
    expect(play(golem, [spec()]).damage).toBe(80);
    expect(playScripted(golem, [spec()], [YES]).res.damage).toBe(180);
  });

  it('the base chance is 5%: the roll just under it crits, the roll at it does not', () => {
    expect(playScripted(boss(), [spec()], [499]).res.damage).toBe(200);
    expect(playScripted(boss(), [spec()], [500]).res.damage).toBe(100);
  });

  it('crit damage adds to the double and stacks with itself (mergeFx adds the numbers)', () => {
    // +100% twice on top of the double: a crit deals four times (+300%).
    const fx = mergeFx([{ critDamageBp: 10_000 }, { critDamageBp: 10_000 }]);
    expect(playScripted(boss(), [spec({ fx })], [YES]).res.damage).toBe(400);
    // Without a crit the damage line does nothing.
    expect(playScripted(boss(), [spec({ fx })], [NO]).res.damage).toBe(100);
  });

  it('the species, the Knack and the talents all add: chance, and damage on top of the double', () => {
    // Species: +10 points of chance, +50 points of damage. Knack: a softer hit (80%), +20 points, +50 points. Talent: +100 points.
    const fighter = spec({
      critChanceBp: 1_000,
      critDamageBp: 5_000,
      fx: mergeFx([
        { plainBp: 8_000, critChanceBp: 2_000, critDamageBp: 5_000 },
        { critDamageBp: 10_000 },
      ]),
    });
    // Chance 500 + 1000 + 2000 = 3500: a roll of 3499 crits, 3500 does not. The crit is 80 x (2 + 0.5 + 0.5 + 1) = 320.
    expect(playScripted(boss(), [fighter], [3_499]).res.damage).toBe(320);
    expect(playScripted(boss(), [fighter], [3_500]).res.damage).toBe(80);
  });

  it('a chance past 100% still crits every hit (the roll caps there)', () => {
    const lucky = spec({ fx: { critChanceBp: 12_000 } });
    const r = play(boss({ rounds: 5 }), [lucky]);
    expect(count(r, 'crit')).toBe(5);
    expect(r.damage).toBe(1_000);
  });
});

describe('Sure Crits are spent only by a hit that lands and is not already a crit (R7.1)', () => {
  /** A boss that hits the front creature once a round with `atk` 1 (it never knocks anything out). */
  const heavy = (over = {}) => striker({ rounds: 3, ...over });
  /** Perfect Timing: a dodge stores a Sure Crit; the guaranteed crit deals +100% more. The fighter dodges 1% (Speed 10). */
  const timing = () => [spec({ spd: 10, fx: { dodgeCritBp: 10_000 } })];

  it('a hit that is a crit by its roll keeps the charge; the next plain hit spends it for the double and its extra', () => {
    // Per round the draws are: the creature's crit roll, then its dodge of the boss's attack.
    const { res } = playScripted(heavy(), timing(), [NO, YES, YES, NO, NO, NO]);
    // Round 1 stores one (1x), round 2 is a crit by its roll (2x, charge kept), round 3 spends it (2x + 1x).
    expect(count(res, 'sure-crit', 'A stores')).toBe(1);
    expect(count(res, 'sure-crit', 'A spends')).toBe(1);
    expect(by(res, 'A').sureCrits).toBe(0);
    expect(res.damage).toBe(100 * (1 + 2 + 3));
    expect(res.events.find((e) => e.text.includes('spends'))?.round).toBe(3);
    expect(by(res, 'A').fires['dodgeCritBp']).toBe(1);
  });

  it('a hit the boss dodges keeps the charge', () => {
    // Round 1: not dodged, no crit; it dodges the boss and stores. Round 2: the boss dodges its hit (no crit roll).
    // Round 3: the hit lands and spends the charge. Draws per round: the boss's dodge, the crit roll, its own dodge.
    const { res } = playScripted(heavy({ dodgeBp: 5_000 }), timing(), [
      NO,
      NO,
      YES,
      YES,
      NO,
      NO,
      NO,
      NO,
    ]);
    expect(count(res, 'boss-dodge')).toBe(1);
    expect(count(res, 'sure-crit', 'A spends')).toBe(1);
    expect(res.events.find((e) => e.text.includes('spends'))?.round).toBe(3);
    expect(res.damage).toBe(100 * (1 + 3));
  });

  it('a Blocked hit keeps the charge (it did not land)', () => {
    const { res } = playScripted(heavy({ armour: 10_000 }), timing(), [NO, YES]);
    expect(count(res, 'blocked', "A's hit")).toBe(3);
    expect(count(res, 'sure-crit', 'A stores')).toBe(1);
    expect(count(res, 'sure-crit', 'A spends')).toBe(0);
    expect(by(res, 'A').sureCrits).toBe(1);
  });

  it('only a dodge stores a charge, not a Guard taking the hit for it', () => {
    const team = [
      spec({ name: 'A', fx: { dodgeCritBp: 10_000 } }),
      spec({ name: 'G', role: 'guard', col: 1 }),
    ];
    const r = play(striker({ rounds: 4, cols: 2 }), team);
    expect(r.intercepts).toBe(4);
    expect(count(r, 'sure-crit')).toBe(0);
  });

  it('a creature stores at most three charges (a fourth dodge stores none)', () => {
    // Its own hits are Blocked, so the charges are never spent.
    const r = playScripted(striker({ rounds: 5, armour: 10_000 }), timing(), [
      NO,
      YES,
      NO,
      YES,
      NO,
      YES,
      NO,
      YES,
      NO,
      YES,
    ]).res;
    expect(by(r, 'A').sureCrits).toBe(3);
    expect(count(r, 'sure-crit', 'A stores')).toBe(3);
    expect(by(r, 'A').fires['dodgeCritBp']).toBe(3);
  });

  describe('Hold the Line', () => {
    /** A Guard of 1000 HP stores a Sure Crit for every 250 damage it takes for others; the boss hits the front creature for 90. */
    const wall = (fx: object) => [
      spec({ name: 'A', maxHp: 100_000 }),
      spec({ name: 'G', role: 'guard', col: 1, maxHp: 1_000, fx }),
    ];
    const taken = (r: Parameters<typeof texts>[0]) =>
      texts(r, 'hit')
        .filter((t) => t.startsWith('G takes '))
        .reduce((sum, t) => sum + Number(t.split(' ')[2]), 0);

    it('a Guard stores a charge each time the hits it takes for others add up to a share of its max HP', () => {
      const r = play(striker({ rounds: 8, cols: 2, atk: 90 }), wall({ guardCritBp: 10_000 }));
      expect(r.intercepts).toBe(8);
      expect(taken(r)).toBe(720);
      // 720 over 250 a charge: two stored, and each is spent on the Guard's next hit (a crit with its extra: 100 x (2 + 1)).
      expect(count(r, 'sure-crit', 'G stores')).toBe(2);
      expect(count(r, 'sure-crit', 'G spends')).toBe(2);
      expect(by(r, 'G').damageDealt).toBe(6 * 100 + 2 * 300);
      // Without the effect it never stores one.
      const plain = play(striker({ rounds: 8, cols: 2, atk: 90 }), wall({}));
      expect(count(plain, 'sure-crit')).toBe(0);
    });

    it('a hit it takes for itself builds nothing: only intercepted damage counts', () => {
      // The Guard is the front creature: the boss aims at it, nothing is intercepted.
      const alone = [spec({ name: 'G', role: 'guard', maxHp: 1_000, fx: { guardCritBp: 10_000 } })];
      expect(count(play(striker({ rounds: 6, atk: 90 }), alone), 'sure-crit')).toBe(0);
    });
  });
});

describe('Steady Rhythm counts only hits that land (R20.6)', () => {
  const rhythm = () => [spec({ fx: { steadyRhythm: true } })];

  it('every third hit is a crit, with no luck', () => {
    const two = play(boss({ rounds: 2 }), rhythm());
    expect(by(two, 'A').fires['steadyRhythm']).toBeUndefined();
    const nine = play(boss({ rounds: 9 }), rhythm());
    expect(by(nine, 'A').fires['steadyRhythm']).toBe(3);
    expect(nine.damage).toBe(6 * 100 + 3 * 200);
    expect(play(boss({ rounds: 9 }), [spec()]).damage).toBe(900);
  });

  it('a dodged hit is not counted: the third hit that lands is the crit, whatever the dodges', () => {
    // Hits 1 and 3 are dodged; the landed ones (rounds 2, 4, 5) count, and the third of them (round 5) crits with no luck.
    const { res } = playScripted(boss({ rounds: 5, dodgeBp: 5_000 }), rhythm(), [
      YES,
      NO,
      NO,
      YES,
      NO,
      NO,
      NO,
      NO,
    ]);
    expect(count(res, 'boss-dodge')).toBe(2);
    expect(by(res, 'A').hitsMade).toBe(3);
    expect(by(res, 'A').fires['steadyRhythm']).toBe(1);
    expect(count(res, 'crit')).toBe(1);
    expect(res.events.find((e) => e.kind === 'crit')?.round).toBe(5);
  });

  it('a Blocked hit is not counted either', () => {
    const res = play(boss({ rounds: 6, armour: 10_000 }), rhythm());
    expect(count(res, 'blocked')).toBe(6);
    expect(by(res, 'A').hitsMade).toBe(0);
    expect(count(res, 'crit')).toBe(0);
  });
});

describe('counters and heals (R21.7, R16)', () => {
  it('a counter never crits and never spends a Sure Crit, and on a dodge it fires before the charge is stored', () => {
    // Retaliate hits back on a dodge for half its Attack; Perfect Timing stores a Sure Crit on it. The boss's armour Blocks the
    // creature's own hits, so the only damage it deals is its counters, and the charges it stores stay.
    const fighter = spec({
      spd: 10,
      fx: { retaliateBp: 5_000, dodgeCritBp: 10_000, critChanceBp: 12_000, critDamageBp: 10_000 },
    });
    const { res } = playScripted(
      striker({ rounds: 4, armour: 10_000 }),
      [fighter],
      [NO, YES, NO, YES, NO, YES, NO, YES],
    );
    expect(count(res, 'counter')).toBe(4);
    expect(by(res, 'A').damageDealt).toBe(4 * 50);
    expect(count(res, 'sure-crit', 'A spends')).toBe(0);
    expect(by(res, 'A').sureCrits).toBe(3);
    // Each dodge: the counter, then the charge (the fourth is past the limit and not stored).
    expect(
      res.events.filter((e) => e.kind === 'counter' || e.kind === 'sure-crit').map((e) => e.kind),
    ).toEqual(['counter', 'sure-crit', 'counter', 'sure-crit', 'counter', 'sure-crit', 'counter']);
  });

  it("a Guard's strike-back when it intercepts never crits, even with every crit talent", () => {
    const team = [
      spec({ name: 'A' }),
      spec({
        name: 'G',
        role: 'guard',
        col: 1,
        fx: { interceptHitBackBp: 5_000, critChanceBp: 12_000, critDamageBp: 10_000 },
      }),
    ];
    const res = play(striker({ rounds: 6, armour: 10_000, atk: 20, cols: 2 }), team);
    expect(res.intercepts).toBe(6);
    expect(count(res, 'counter')).toBe(6);
    // Its own hits are Blocked: what it dealt is the six strike-backs, 50 each, uncrit.
    expect(by(res, 'G').damageDealt).toBe(6 * 50);
  });

  it('a heal crits at the base chance only, whatever crit chance its healer has, for one and a half times', () => {
    const team = [
      spec({ name: 'Healer', role: 'support', fx: { critChanceBp: 3_600 } }),
      spec({ name: 'Hurt', col: 1 }),
    ];
    const heal = (draw: number) =>
      playScripted(boss({ cols: 2 }), team, [draw], { carryHp: new Map([['Hurt', 1]]) }).res.healed;
    // A tide Support heals 4% of Max HP: 16 of 400, and 24 when it crits. 6% is above the base 5% and below the healer's own
    // stacked 41%: no crit. 4% is a crit.
    expect(heal(600)).toBe(16);
    expect(heal(400)).toBe(24);
  });
});

describe('hit bonuses by position and state (the talent hooks)', () => {
  /** The damage the creature named `name` dealt in a one-round fight of a row of `cols` slots. */
  const dealt = (cols: number, fighters: ReturnType<typeof spec>[], name = 'T') =>
    by(play(boss({ cols }), fighters), name).damageDealt;
  const kin = (col: number, element = 'tide') => spec({ name: `K${col}`, element, col });

  it('a bonus for each neighbour of its element, at most 2', () => {
    const talent = (col: number) => spec({ name: 'T', col, fx: { perKindredBesideBp: 500 } });
    expect(dealt(3, [kin(0), talent(1), kin(2)])).toBe(110);
    expect(dealt(3, [kin(0, 'ember'), talent(1), kin(2)])).toBe(105);
    expect(dealt(3, [kin(0, 'ember'), talent(1), kin(2, 'ember')])).toBe(100);
    // Only the creatures right beside it count: kindred two slots away give nothing.
    expect(dealt(5, [kin(0), kin(1, 'ember'), talent(2), kin(3, 'ember'), kin(4)])).toBe(100);
  });

  it('Odd One Out: a bonus while no creature beside it shares its element, also with nobody beside it', () => {
    const talent = (col: number) => spec({ name: 'T', col, fx: { oddOneOutBp: 1_500 } });
    expect(dealt(3, [kin(0, 'ember'), talent(1), kin(2, 'ember')])).toBe(115);
    expect(dealt(3, [kin(0), talent(1), kin(2, 'ember')])).toBe(100);
    expect(dealt(1, [talent(0)])).toBe(115);
  });

  it('Edge-walker: a bonus in the arena end slots (column 0 and the last column), nothing in the middle', () => {
    const edge = (col: number) => spec({ name: 'T', col, fx: { rowEndBp: 1_000 } });
    const row = (col: number) => [
      edge(col),
      ...[0, 1, 2].filter((c) => c !== col).map((c) => kin(c, 'ember')),
    ];
    expect(dealt(3, row(0))).toBe(110);
    expect(dealt(3, row(2))).toBe(110);
    expect(dealt(3, row(1))).toBe(100);
    // The slot decides, not the end creature: alone in column 1 it is not at a row end, alone in column 0 it is.
    expect(dealt(3, [edge(1)])).toBe(100);
    expect(dealt(3, [edge(0)])).toBe(110);
    // Nobody to its left does not make column 1 an end.
    expect(dealt(3, [edge(1), kin(2)])).toBe(100);
  });

  it('Slow Burn: a bonus per round from round 2, up to its cap', () => {
    // +10% a round from round 2, at most +25%: rounds deal 100, 110, 120, 125, 125.
    const burn = spec({ fx: { slowBurnBp: 1_000, slowBurnCapBp: 2_500 } });
    expect(play(boss({ rounds: 1 }), [burn]).damage).toBe(100);
    expect(play(boss({ rounds: 3 }), [burn]).damage).toBe(100 + 110 + 120);
    expect(play(boss({ rounds: 5 }), [burn]).damage).toBe(100 + 110 + 120 + 125 + 125);
  });

  it('Finisher: a bonus while the boss is below a third of its HP', () => {
    const golem = boss({ hp: 900_000 });
    const finisher = [spec({ fx: { finisherBp: 1_500 } })];
    expect(play(golem, finisher, { bossHp: 299_000 }).damage).toBe(115);
    expect(play(golem, finisher, { bossHp: 301_000 }).damage).toBe(100);
  });

  it('Momentum: after it dodges, its next hit deals a bonus', () => {
    // One tiny boss hit a round on a creature that dodges 1%: it dodges in round 1 (scripted), so round 2's hit is boosted once.
    const fighter = spec({ spd: 10, fx: { momentumBp: 1_500 } });
    const { res } = playScripted(
      striker({ rounds: 3, atk: 1_000 }, { anchor: 'front', shape: 'single' }, 1, 100),
      [fighter],
      [NO, YES, NO, NO, NO, NO],
    );
    expect(res.fighters[0]?.damageDealt).toBe(100 + 115 + 100);
    expect(by(res, 'A').fires['momentumBp']).toBe(1);
  });

  it('Momentum: a hit aimed at it that a Guard takes counts like a dodge', () => {
    // The boss aims at the front creature every round; the Guard beside it takes the hit (no dodge for either).
    const team = [
      spec({ name: 'A', fx: { momentumBp: 1_500 } }),
      spec({ name: 'G', role: 'guard', col: 1 }),
    ];
    const on = play(striker({ rounds: 2, cols: 2 }), team);
    expect(on.intercepts).toBe(2);
    expect(by(on, 'A').damageDealt).toBe(100 + 115);
    // With nobody to take the hit nothing is armed (it does not dodge either).
    const alone = play(striker({ rounds: 2 }), [spec({ name: 'A', fx: { momentumBp: 1_500 } })]);
    expect(alone.intercepts).toBe(0);
    expect(by(alone, 'A').fires['momentumBp']).toBeUndefined();
  });

  it('Rally Cry: a bonus for the rest of the fight, only after a creature beside it is knocked out', () => {
    // Column 0 falls at the end of round 1: column 1 stands beside it, column 2 does not.
    const team = (rally: number) =>
      [0, 1, 2].map((col) =>
        spec({ name: `C${col}`, col, ...(col === rally ? { fx: { vengefulBp: 1_000 } } : {}) }),
      );
    const fight = (rally: number) => play(striker({ rounds: 2, cols: 3, atk: 5_000 }), team(rally));
    expect(by(fight(1), 'C1').damageDealt).toBe(100 + 110);
    expect(by(fight(2), 'C2').damageDealt).toBe(100 + 100);
  });

  it("Guard's Shadow and Territorial: a Payoff's bonus depends on who stands beside it", () => {
    const payoff = (fx: object, over: object = {}) =>
      spec({ name: 'T', role: 'payoff', element: 'spark', col: 1, fx, ...over });
    const beside = (other: ReturnType<typeof spec>, fx: object) => dealt(2, [other, payoff(fx)]);
    const guard = spec({ name: 'G', role: 'guard' });
    const rival = spec({ name: 'R', role: 'payoff', element: 'spark' });
    // Its hits deal 20% more while a living Guard stands beside it.
    expect(beside(guard, { besideGuardBp: 2_000 })).toBe(120);
    expect(beside(rival, { besideGuardBp: 2_000 })).toBe(100);
    // Its hits deal 20% more while no other Payoff stands beside it; with another Payoff in the row it adds nothing.
    expect(beside(guard, { alonePayoffBp: 2_000 })).toBe(120);
    expect(beside(rival, { alonePayoffBp: 2_000 })).toBe(100);
    expect(dealt(1, [payoff({ alonePayoffBp: 2_000 }, { col: 0 })])).toBe(120);
  });

  it('the Attack, boost and bonus lines add inside one cap (R15): bonuses never pass the cap', () => {
    // +100% from three effects at once: the sum is held at the cap (+150%).
    const greedy = spec({ fx: { oddOneOutBp: 6_000, rowEndBp: 6_000, finisherBp: 6_000 } });
    expect(play(boss({ hp: 900_000 }), [greedy], { bossHp: 100_000 }).damage).toBe(250);
  });
});

describe('armour, the cap and Pierce (R13)', () => {
  it('a hit at or below armour is Blocked, and a Setter still marks', () => {
    const r = play(boss({ armour: 10_000 }), [spec()]);
    expect(r.damage).toBe(0);
    expect(count(r, 'blocked')).toBe(1);
    expect(texts(r, 'mark')).toEqual(['tide x1']);
  });

  it('armour comes off the hit, and Pierce ignores a share of it (its own, or from a creature beside it)', () => {
    const golem = boss({ cols: 2, armour: 20 });
    expect(play(golem, [spec()]).damage).toBe(80);
    expect(play(golem, [spec({ fx: { pierceOwnBp: 5_000 } })]).damage).toBe(90);
    const aura = play(golem, [
      spec({ name: 'A' }),
      spec({ name: 'B', col: 1, fx: { pierceBesideBp: 5_000 } }),
    ]);
    // A's hit gets the half Pierce from B beside it; B's own hit does not (the aura is for the creatures beside it).
    expect(by(aura, 'A').damageDealt).toBe(90);
    expect(by(aura, 'B').damageDealt).toBe(80);
  });

  it('a cap on one hit (Stone Skin) comes before the armour', () => {
    expect(play(boss({ armour: 20, mods: { capPerHit: 60 } }), [spec()]).damage).toBe(40);
  });
});

describe('Cull and the killing blow', () => {
  const golem = boss({ hp: 4_000 });
  const cull = () => [spec({ fx: { cullBp: 500 } })];

  it('a hit that leaves the boss below its Cull share of its full HP defeats it; the HP left is the killing blow, not damage', () => {
    // The hit deals 100. 100 HP left is under 5% of 4000 (200): culled.
    const culled = play(golem, cull(), { bossHp: 200 });
    expect(culled.won).toBe(true);
    expect(culled.bossHpLeft).toBe(0);
    // The 100 HP Cull removed are not damage the creature dealt.
    expect(culled.damage).toBe(100);
    expect(by(culled, 'A').damageDealt).toBe(100);
    expect(culled.killingBlow).toMatchObject({ name: 'A', culled: true, round: 1 });
    const plain = play(golem, [spec()], { bossHp: 200 });
    expect(plain.won).toBe(false);
    expect(plain.bossHpLeft).toBe(100);
    expect(plain.killingBlow).toBeNull();
    // 300 left is not under 200: no cull. The share is of the boss's full HP, not of what is left.
    expect(play(golem, cull(), { bossHp: 400 }).won).toBe(false);
    expect(play(golem, cull(), { bossHp: 250 }).won).toBe(true);
  });

  it('the killing blow is the creature whose damage took the last HP', () => {
    const two = [spec({ name: 'First' }), spec({ name: 'Second', col: 1 })];
    // First's hit leaves 1 HP and Second lands the killing blow.
    const r = play(boss({ hp: 4_000, cols: 2 }), two, { bossHp: 101 });
    expect(r.won).toBe(true);
    expect(r.killingBlow).toMatchObject({ name: 'Second', culled: false });
    expect(play(boss({ hp: 4_000, cols: 2 }), two, { bossHp: 4_000 }).killingBlow).toBeNull();
  });
});

describe('counters are not hits, and the fight ends the moment the boss is down (panel 3)', () => {
  /** Armour no hit gets past: only counters (which ignore armour) hurt the boss. The boss aims at the strongest creature, `hits` times. */
  const armoured = (hits: number) =>
    striker(
      { hp: 1_000, cols: 2, armour: 10_000, atk: 110 },
      { anchor: 'strongest', shape: 'single' },
      hits,
    );
  const pair = (guardFx: object) => [
    spec({ name: 'Front', atk: 150 }),
    spec({ name: 'Guard', role: 'guard', col: 1, fx: guardFx }),
  ];
  /** Shoulder Charge strikes back for a share of the Guard's Attack of 100. */
  const counter = 50;
  const strike = { interceptHitBackBp: 5_000 };

  it('a strike-back is damage but never sets off Cull or a talent on its hits', () => {
    // One intercept leaves the boss 20 HP, under 5% of 1000: a hit would cull it, a counter does not.
    const r = play(armoured(1), pair({ ...strike, cullBp: 500, firstHitBp: 5_000 }), {
      bossHp: counter + 20,
    });
    expect(r.intercepts).toBe(1);
    expect(by(r, 'Guard').damageDealt).toBe(counter);
    // Its own hit was Blocked, so its first hit has not landed; the counter did not use it up.
    expect(by(r, 'Guard').hitsLanded).toBe(0);
    expect(r.won).toBe(false);
    expect(r.bossHpLeft).toBe(20);
    expect(r.killingBlow).toBeNull();
  });

  it('a counter can land the killing blow, and nothing of the boss acts after it', () => {
    // Four plain hits at the strongest creature; the first intercept's strike-back takes the last HP.
    const r = play(armoured(4), pair(strike), { bossHp: counter });
    expect(r.won).toBe(true);
    expect(r.killingBlow).toMatchObject({ name: 'Guard', culled: false });
    expect(r.intercepts).toBe(1);
    // The intercepted hit does not land either: the killing blow is the last thing that happens.
    expect(r.events.at(-1)?.kind).toBe('killing-blow');
    expect(count(r, 'hit')).toBe(0);
  });

  it('no creature hits after the boss is down, and no later row acts', () => {
    const team = [
      spec({ name: 'A' }),
      spec({ name: 'B', col: 1 }),
      spec({ name: 'C', col: 2 }),
      spec({ name: 'D', row: 1 }),
    ];
    const r = play(striker({ rows: 2, cols: 3, rounds: 3, atk: 110 }), team, { bossHp: 1 });
    expect(r.won).toBe(true);
    expect(r.fighters.map((f) => f.damageDealt > 0)).toEqual([true, false, false, false]);
    // The boss never took its turn after row 0, or any later one.
    expect(
      r.events.filter((e) => ['hit', 'blocked', 'dodge', 'intercept', 'move'].includes(e.kind)),
    ).toHaveLength(0);
  });
});
