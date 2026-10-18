import { NO_LUCK, RULES, createSeededRng, type Element, type Gimmick } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  buildNames,
  describeEvent,
  liveFightRules,
  simulateFight,
  type AbilityChoice,
  type FightInput,
  type FightResult,
  type FightSlot,
  type SlotMods,
} from '../src/index';
import { TEST_PACK, eventsOf, input, randomInput, rng, run, slot } from './helpers';
import { everyRound, fightWith, gimmickHits, rowOf, rulesOf } from './pattern-helpers';

/**
 * The per-creature modifier sheet (`FightSlot.mods`, docs/design/combat-rules.md section 10): each
 * field is read at one step of the fight. Hand-checked numbers: the helper boss is tide unless a
 * test says otherwise, boss Attack 100 in `fightWith` (a power of 10000 deals 100), and creatures
 * of Attack 1000 hit for 1000 at a neutral matchup.
 */

const withMods = (s: FightSlot, mods: SlotMods): FightSlot => ({ ...s, mods });
/** A row of 9 (three rows of three, s0-s2 front) with the mods of one slot. */
const rowWith = (
  index: number,
  mods: SlotMods,
  overrides: Parameters<typeof rowOf>[1] = {},
): FightSlot[] => {
  const row = rowOf(9, overrides);
  row[index] = withMods(row[index] as FightSlot, mods);
  return row;
};
const bossOf = (element: Element, gimmicks: Gimmick[] = []): FightInput['boss'] => ({
  ...input([]).boss,
  element,
  gimmicks,
});
const hitsOf = (r: FightResult, creature: string, round?: number) =>
  eventsOf(r, 'hit').filter(
    (e) => e.creature === creature && (round === undefined || e.round === round),
  );
const firstHit = (r: FightResult, creature: string) =>
  hitsOf(r, creature)[0] as ReturnType<typeof hitsOf>[number];
/** Plain damage of a creature at a given matchup (basis points), with a bonus. */
const plain = (atk: number, matchup: number, bonusBp = 0): number =>
  Math.floor((atk * matchup * (10_000 + bonusBp)) / 100_000_000);

describe('no sheet, no change', () => {
  it('an empty sheet and an all-zero sheet replay exactly like no sheet', () => {
    const zero: SlotMods = {
      vsElementBp: {},
      markedFoeBp: 0,
      firstHitBp: 0,
      markingHitBp: 0,
      strikeBp: 0,
      besideRoleBp: { guard: 0 },
      pierceBp: 0,
      reactionBp: { steam: 0 },
      pounceBp: 0,
      ownerMarkBp: 0,
      keenReactionBp: 0,
      shareBp: 0,
      takenBp: 0,
      areaBp: 0,
      aimedBp: 0,
      reflectedBp: 0,
      chargedBp: 0,
      wardBp: { tide: 0 },
      healReceivedBp: 0,
      armorBp: 0,
      coverBp: 0,
      boostBp: 0,
      mendBp: 0,
      lingerRounds: 0,
      ignoreSilence: 0,
    };
    for (let i = 0; i < 12; i++) {
      const base = randomInput(
        `mods-none-${String(i)}`,
        1 + (i % 5),
        i % 2 === 0 ? 'finale' : 'phase1',
      );
      const variants: FightInput[] = [
        base,
        { ...base, rules: liveFightRules(), luck: RULES.combat.luck },
      ];
      for (const v of variants) {
        const expected = JSON.stringify(simulateFight(v, createSeededRng('same')));
        for (const mods of [{}, zero]) {
          const modded = { ...v, row: v.row.map((s) => ({ ...s, mods })) };
          expect(JSON.stringify(simulateFight(modded, createSeededRng('same')))).toBe(expected);
        }
      }
    }
  });

  it('adds no field to the log of a creature without a sheet', () => {
    const r = fightWith(rowOf(9), [everyRound({ op: 'hit_zone', zone: 'front', power: 10_000 })]);
    for (const e of r.events) {
      expect(e).not.toHaveProperty('sheetBp');
      expect(e).not.toHaveProperty('warded');
    }
  });
});

describe('the creature hit', () => {
  it('vsElementBp adds damage only against the boss element it names', () => {
    const row = (mods: SlotMods) => [withMods(slot('a', { atk: 1_000 }), mods)];
    const base = run(row({}), { boss: bossOf('grove') });
    expect(firstHit(base, 'a').damage).toBe(1_000);
    const hunter = run(row({ vsElementBp: { grove: 2_000 } }), { boss: bossOf('grove') });
    expect(firstHit(hunter, 'a')).toMatchObject({ damage: 1_200, sheetBp: 2_000 });
    const other = run(row({ vsElementBp: { ember: 2_000 } }), { boss: bossOf('grove') });
    expect(firstHit(other, 'a').damage).toBe(1_000);
    expect(firstHit(other, 'a')).not.toHaveProperty('sheetBp');
  });

  it('markedFoeBp adds to a hit on a marked boss, not to the hit that marks or one that sets off a reaction', () => {
    const row = (mods: SlotMods) => [
      slot('a', { atk: 1_000 }),
      withMods(slot('b', { atk: 1_000, role: 'payoff' }), mods),
    ];
    const boss = bossOf('grove');
    // a (tide) marks Soaked; b (tide, not a Setter) hits a marked boss without a reaction.
    const r = run(row({ markedFoeBp: 1_000 }), { boss });
    expect(hitsOf(r, 'a', 1)[0]?.damage).toBe(1_000);
    expect(hitsOf(r, 'b', 1)[0]?.damage).toBe(1_100);
    // The first hit of b's own (unmarked boss) gets nothing.
    const alone = run([withMods(slot('b', { atk: 1_000 }), { markedFoeBp: 1_000 })], { boss });
    expect(hitsOf(alone, 'b', 1)[0]?.damage).toBe(1_000);
    // A hit that sets off a reaction (a Setter's ember Scorched, cashed by tide) gets no marked-foe bonus.
    const setUp = (mods: SlotMods): FightSlot[] => [
      slot('a', { atk: 1_000, element: 'ember' }),
      withMods(slot('b', { atk: 1_000, role: 'payoff' }), mods),
    ];
    const plainReaction = run(setUp({}), { boss });
    const reaction = run(setUp({ markedFoeBp: 5_000 }), { boss });
    expect(eventsOf(reaction, 'reaction')[0]?.bonus).toBe(
      eventsOf(plainReaction, 'reaction')[0]?.bonus,
    );
    expect(firstHit(reaction, 'b').damage).toBe(firstHit(plainReaction, 'b').damage);
  });

  it('firstHitBp adds to the first turn hit of the fight only, not to later ones or a strike', () => {
    const a = withMods(slot('a', { atk: 1_000 }), { firstHitBp: 1_000 });
    const r = run([a], { boss: bossOf('grove') });
    const damages = hitsOf(r, 'a').map((h) => h.damage);
    expect(damages.slice(0, 3)).toEqual([1_100, 1_000, 1_000]);
    // An ability's strike before the first turn is not the first hit.
    const abilities: AbilityChoice[] = [
      { playerId: 'p1', abilityId: 'test-strike', key: 'k', creatureId: 'a', fireAtRound: 1 },
    ];
    const s = run([a], { boss: bossOf('grove'), finaleAbilities: abilities });
    const first = hitsOf(s, 'a', 1);
    expect(first.map((h) => [h.ability ?? null, h.damage])).toEqual([
      ['test-strike', 2_000],
      [null, 1_100],
    ]);
  });

  it('markingHitBp adds to the hit that leaves a mark and the Setter hit that replaces one', () => {
    const boss = bossOf('grove');
    const row = (mods: SlotMods) => [
      withMods(slot('a', { atk: 1_000, element: 'ember', role: 'payoff' }), mods),
      withMods(slot('b', { atk: 1_000, element: 'spark', role: 'setter' }), mods),
    ];
    const r = run(row({ markingHitBp: 1_000 }), { boss });
    // a (ember vs grove: strong) leaves Scorched; b (spark, weak vs grove) replaces it.
    expect(hitsOf(r, 'a', 1)[0]?.damage).toBe(plain(1_000, 15_000, 1_000));
    expect(hitsOf(r, 'b', 1)[0]?.damage).toBe(plain(1_000, 7_500, 1_000));
    // Round 2: a hits the boss marked Charged (no reaction, not a Setter): no marking bonus.
    expect(hitsOf(r, 'a', 2)[0]?.damage).toBe(plain(1_000, 15_000));
  });

  it('strikeBp adds to an ability strike only', () => {
    const abilities: AbilityChoice[] = [
      { playerId: 'p1', abilityId: 'test-strike', key: 'k', creatureId: 'a', fireAtRound: 1 },
    ];
    const a = withMods(slot('a', { atk: 1_000 }), { strikeBp: 5_000 });
    const r = run([a], { boss: bossOf('grove'), finaleAbilities: abilities });
    const [strike, turn] = hitsOf(r, 'a', 1);
    expect(strike).toMatchObject({ ability: 'test-strike', damage: 3_000 });
    expect(turn?.damage).toBe(1_000);
  });

  it('pierceBp makes the boss adaptation resist less (element and reaction rules)', () => {
    const element = (mods: SlotMods) =>
      run([withMods(slot('a', { atk: 1_000 }), mods)], {
        boss: bossOf('grove'),
        adaptation: { rule: 'resist-top-element', target: 'tide' },
      });
    expect(firstHit(element({}), 'a').damage).toBe(750); // 25% resisted
    expect(firstHit(element({ pierceBp: 5_000 }), 'a').damage).toBe(875); // 12.5%
    expect(firstHit(element({ pierceBp: 10_000 }), 'a').damage).toBe(1_000);

    const reaction = (mods: SlotMods) =>
      run(
        [
          slot('a', { atk: 1_000, element: 'ember' }),
          withMods(slot('b', { atk: 1_000, role: 'payoff' }), mods),
        ],
        {
          boss: bossOf('grove'),
          adaptation: { rule: 'resist-top-reaction', target: 'steam' },
        },
      );
    const bonus = (mods: SlotMods) => eventsOf(reaction(mods), 'reaction')[0]?.bonus;
    // Payoff Steam on 1000: bonus 2125; 50% resisted leaves 1063; pierce 50% resists 25%.
    expect(bonus({})).toBe(2_125 - 1_062);
    expect(bonus({ pierceBp: 5_000 })).toBe(2_125 - 531);
  });
});

describe('the position line (besideRoleBp)', () => {
  const damageOfA = (row: FightSlot[]): number => {
    const r = run(row, {});
    return hitsOf(r, 'a', 1)[0]?.damage as number;
  };
  const a = (mods: SlotMods = { besideRoleBp: { guard: 1_500 } }) =>
    withMods(slot('a', { atk: 1_000 }), mods);

  it('adds damage while a living Guard stands beside it, in its own row', () => {
    const row = (guardAt: number, guard: Partial<FightSlot> = {}): FightSlot[] => {
      const r = rowOf(9);
      r[1] = a();
      r[guardAt] = { ...slot('g', { role: 'guard' }), ...guard };
      return r;
    };
    expect(damageOfA(row(0))).toBe(1_150);
    expect(damageOfA(row(2))).toBe(1_150);
    // A Guard in another row is not beside it, and a knocked-out Guard no longer stands.
    expect(damageOfA(row(3))).toBe(1_000);
    expect(damageOfA(row(0, { hp: 0 }))).toBe(1_000);
    // No sheet, no bonus; a Guard on both sides counts once.
    const both = rowOf(9);
    both[1] = a();
    both[0] = slot('g0', { role: 'guard' });
    both[2] = slot('g2', { role: 'guard' });
    expect(damageOfA(both)).toBe(1_150);
    const none = rowOf(9);
    none[1] = a({});
    none[0] = slot('g', { role: 'guard' });
    expect(damageOfA(none)).toBe(1_000);
  });

  it('adds up across roles, and stops at the row edge in the raid but not in the dungeon reach', () => {
    const row = rowOf(9);
    row[1] = a({ besideRoleBp: { guard: 1_000, support: 500 } });
    row[0] = slot('g', { role: 'guard' });
    row[2] = slot('s', { role: 'support' });
    // The Support's boost adds to the creature's hit as well (+15%): 1000 + 10% + 5% + 15%.
    expect(damageOfA(row)).toBe(plain(1_000, 10_000, 1_000 + 500 + RULES.combat.supportBuffBp));
    // Row of three: one slot per row, so nobody is beside anyone; with `adjacent` reach everyone is.
    const three = [slot('g', { role: 'guard' }), a(), slot('x')];
    expect(hitsOf(run(three), 'a', 1)[0]?.damage).toBe(1_000);
    expect(hitsOf(run(three, { guardReach: 'adjacent' }), 'a', 1)[0]?.damage).toBe(1_150);
    expect(hitsOf(run(three, { guardReach: 'adjacent' }), 'a', 1)[0]).toMatchObject({
      sheetBp: 1_500,
    });
  });
});

describe('the reaction', () => {
  /** An Ember Setter leaves Scorched on a grove boss, a Tide Payoff cashes Steam on 1000 Attack. */
  const rowFor = (setter: SlotMods, payoff: SlotMods, support?: SlotMods): FightSlot[] => [
    withMods(slot('a', { atk: 1_000, element: 'ember' }), setter),
    withMods(slot('b', { atk: 1_000, role: 'payoff' }), payoff),
    ...(support === undefined ? [] : [withMods(slot('s', { role: 'support', atk: 1 }), support)]),
  ];
  const reactionOf = (row: FightSlot[], extra: Partial<FightInput> = {}) =>
    eventsOf(run(row, { boss: bossOf('grove'), ...extra }), 'reaction')[0] as {
      bonus: number;
      sheetBp?: number;
    };
  // Payoff Steam on 1000: plain 1000, multiplier 25000 x 12500 / 10000 = 31250, bonus 2125.
  const BASE = 2_125;

  it('has the baseline the other tests build on', () => {
    expect(reactionOf(rowFor({}, {})).bonus).toBe(BASE);
    expect(reactionOf(rowFor({}, {}))).not.toHaveProperty('sheetBp');
  });

  it("reactionBp adds to that reaction's bonus only", () => {
    expect(reactionOf(rowFor({}, { reactionBp: { steam: 1_000 } }))).toMatchObject({
      bonus: Math.floor((BASE * 11_000) / 10_000),
      sheetBp: 1_000,
    });
    expect(reactionOf(rowFor({}, { reactionBp: { wildfire: 1_000 } })).bonus).toBe(BASE);
  });

  it('pounceBp adds to the reaction multiplier, on top of a Payoff bonus', () => {
    // 25000 x (12500 + 800) / 10000 = 33250: bonus 3325 - 1000.
    expect(reactionOf(rowFor({}, { pounceBp: 800 }))).toMatchObject({ bonus: 2_325, sheetBp: 800 });
  });

  it("ownerMarkBp counts on the Setter's sheet, not the Payoff's", () => {
    expect(reactionOf(rowFor({ ownerMarkBp: 2_000 }, {})).bonus).toBe(
      Math.floor((BASE * 12_000) / 10_000),
    );
    expect(reactionOf(rowFor({}, { ownerMarkBp: 2_000 })).bonus).toBe(BASE);
  });

  it('keenReactionBp raises crit chance on a reaction hit only, under the crit cap', () => {
    const luck = { ...NO_LUCK, critChanceBp: 1, critBp: 5_000 };
    const crits = (mods: SlotMods, cap?: number) => {
      const r = run(rowFor({}, mods), {
        boss: bossOf('grove'),
        luck: cap === undefined ? luck : { ...luck, critMaxChanceBp: cap },
      });
      const cashing = (round: number) => hitsOf(r, 'b', round)[0]?.crit === true;
      return {
        reactionCrits: eventsOf(r, 'reaction').filter((e) => cashing(e.round)).length,
        reactions: eventsOf(r, 'reaction').length,
        markerCrits: eventsOf(r, 'hit').filter((h) => h.creature === 'a' && h.crit === true).length,
      };
    };
    const base = crits({});
    const keen = crits({ keenReactionBp: 9_999 });
    expect(keen.reactions).toBeGreaterThan(5);
    expect(keen.reactionCrits).toBe(keen.reactions);
    expect(base.reactionCrits).toBeLessThan(base.reactions);
    // The setter's marking hit is not a reaction hit: nothing changes for it.
    expect(keen.markerCrits).toBe(base.markerCrits);
    // The cap holds: at 0% cap-the-chance-is-the-cap, a capped creature crits no more than the cap allows.
    const capped = crits({ keenReactionBp: 9_999 }, 1);
    expect(capped.reactionCrits).toBeLessThan(capped.reactions);
  });

  it("shareBp is a Support's bonus for the reaction its neighbour sets off", () => {
    const withShare = reactionOf(rowFor({}, {}, { shareBp: 1_500 }), { guardReach: 'adjacent' });
    const without = reactionOf(rowFor({}, {}, {}), { guardReach: 'adjacent' });
    expect(withShare.bonus).toBe(Math.floor((without.bonus * 11_500) / 10_000));
    // Beside the Payoff only: with the Support at the far end it does nothing.
    const farOf = (support: SlotMods): FightSlot[] => {
      const row = rowFor({}, {}, support);
      return [row[2] as FightSlot, row[0] as FightSlot, row[1] as FightSlot];
    };
    expect(reactionOf(farOf({ shareBp: 1_500 }), { guardReach: 'adjacent' }).bonus).toBe(
      reactionOf(farOf({}), { guardReach: 'adjacent' }).bonus,
    );
    // The Support is credited with what it added.
    const credited = run(rowFor({}, {}, { shareBp: 1_500 }), {
      boss: bossOf('grove'),
      guardReach: 'adjacent',
    });
    const plainRun = run(rowFor({}, {}, {}), { boss: bossOf('grove'), guardReach: 'adjacent' });
    expect(credited.perCreature.s?.supportCredit).toBeGreaterThan(
      plainRun.perCreature.s?.supportCredit ?? 0,
    );
  });
});

describe('the taker', () => {
  const plainAttackOn = (r: FightResult, target = 's0') =>
    eventsOf(r, 'boss_hit').find((e) => e.source === 'attack' && e.target === target);
  const frontHit: Gimmick = everyRound({ op: 'hit_zone', zone: 'front', power: 10_000 });

  it('takenBp reduces every hit, and says so in the log', () => {
    const base = plainAttackOn(fightWith(rowOf(9), []));
    expect(base?.damage).toBe(100);
    expect(base).not.toHaveProperty('warded');
    const r = fightWith(rowWith(0, { takenBp: 2_000 }), []);
    expect(plainAttackOn(r)).toMatchObject({ damage: 80, warded: 20 });
    expect(r.perCreature.s0?.damageTaken).toBe(80);
    // A negative reduction makes it take more.
    expect(plainAttackOn(fightWith(rowWith(0, { takenBp: -2_500 }), []))).toMatchObject({
      damage: 125,
      warded: -25,
    });
  });

  it('aimedBp reduces aimed hits only; areaBp area hits only; reflectedBp neither', () => {
    const mods: SlotMods = { aimedBp: 1_000, areaBp: 5_000, reflectedBp: 9_000 };
    const r = fightWith(rowWith(0, mods), [frontHit]);
    expect(plainAttackOn(r)?.damage).toBe(90);
    const area = eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick' && e.target === 's0');
    expect(area?.damage).toBe(50);
    // Others in the row take the plain 100.
    expect(gimmickHits(r)).toEqual([
      [1, 's0', 50],
      [1, 's1', 100],
      [1, 's2', 100],
    ]);
  });

  it('wardBp reduces hits from a boss of that element only', () => {
    const tide = fightWith(rowWith(0, { wardBp: { tide: 5_000 } }), []);
    expect(plainAttackOn(tide)?.damage).toBe(50);
    const ember = fightWith(rowWith(0, { wardBp: { ember: 5_000 } }), []);
    expect(plainAttackOn(ember)?.damage).toBe(100);
  });

  it('chargedBp reduces the landing of a charged move, not the plain attack', () => {
    const charge: Gimmick = {
      id: 'c',
      name: 'c',
      trigger: { every: 3 },
      op: 'charge',
      then: { op: 'sweep', rows: ['front'], power: 10_000 },
    };
    const r = fightWith(rowWith(0, { chargedBp: 5_000 }), [charge], { rounds: 3 });
    expect(gimmickHits(r).find(([, t]) => t === 's0')).toEqual([3, 's0', 50]);
    expect(gimmickHits(r).find(([, t]) => t === 's1')).toEqual([3, 's1', 100]);
    expect(plainAttackOn(r)?.damage).toBe(100);
    // An uncharged sweep is not "charged".
    const plainSweep = fightWith(rowWith(0, { chargedBp: 5_000 }), [frontHit]);
    expect(gimmickHits(plainSweep)[0]).toEqual([1, 's0', 100]);
  });

  it('reflectedBp reduces a reflected hit', () => {
    const reflect: Gimmick = {
      id: 'r',
      name: 'r',
      trigger: { eachRound: true },
      op: 'reflect_first_reaction',
    };
    const row = (mods: SlotMods): FightSlot[] => [
      slot('a', { atk: 1_000 }),
      withMods(slot('b', { atk: 1_000, element: 'spark', role: 'payoff' }), mods),
    ];
    const reflected = (mods: SlotMods) =>
      eventsOf(fightWith(row(mods), [reflect]), 'boss_hit').find((e) => e.source === 'reflect');
    const base = reflected({});
    expect(base?.damage).toBeGreaterThan(100);
    expect(reflected({ reflectedBp: 5_000 })).toMatchObject({
      damage: Math.floor((base?.damage as number) / 2),
      warded: (base?.damage as number) - Math.floor((base?.damage as number) / 2),
    });
    expect(reflected({ aimedBp: 5_000, areaBp: 5_000 })?.damage).toBe(base?.damage);
  });

  it('applies ward, then charged, then shape, then every hit, each rounding down', () => {
    // 11: a 10% ward leaves 9, then 25% off every hit leaves 6 (the other way round would be 7).
    const r = fightWith(rowWith(0, { wardBp: { tide: 1_000 }, takenBp: 2_500 }), [], {
      bossAtk: 11,
    });
    expect(plainAttackOn(r)?.damage).toBe(6);
    // The shape's step comes before every hit's too.
    const s = fightWith(rowWith(0, { aimedBp: 1_000, takenBp: 2_500 }), [], { bossAtk: 11 });
    expect(plainAttackOn(s)?.damage).toBe(6);
  });

  it('applies after armor and after cover, and before the single-hit cap', () => {
    const armor = rulesOf({ guardHpBp: 0, guardArmorBp: 2_500 });
    // Armor first: 11 - 2 = 9, then 10% off leaves 8 (sheet first would be 9, then armor, 7).
    const g = fightWith(rowWith(0, { takenBp: 1_000 }, { 0: { role: 'guard' } }), [], {
      bossAtk: 11,
      rules: armor,
    });
    expect(plainAttackOn(g)?.damage).toBe(8);
    // Cover first: 100 less 40% is 60, then 50% off area hits leaves 30; the Guard is credited 20.
    const cover = fightWith(rowWith(1, { areaBp: 5_000 }, { 0: { role: 'guard' } }), [frontHit], {
      rules: rulesOf({ guardHpBp: 0 }),
    });
    const hit = eventsOf(cover, 'boss_hit').find(
      (e) => e.source === 'gimmick' && e.target === 's1',
    );
    expect(hit).toMatchObject({ damage: 30, covered: { guard: 's0', prevented: 20 } });
    expect(cover.perCreature.s0?.guardCredit).toBeGreaterThanOrEqual(20);
    // The cap comes last: 400 halved is 200, still above the cap of 100, so 100 and "capped".
    const capped = fightWith(rowWith(0, { takenBp: 5_000 }, { 0: { hp: 1_000 } }), [], {
      bossAtk: 400,
      rules: rulesOf({ maxHitBp: 1_000 }),
    });
    expect(plainAttackOn(capped)).toMatchObject({ damage: 100, capped: true, warded: 200 });
  });

  it('healReceivedBp scales the Mend a creature receives, in either direction', () => {
    const rules = rulesOf({ supportFx: { tide: { healBp: 400 } } });
    const heal = (mods: SlotMods) => {
      const row: FightSlot[] = [
        withMods({ ...slot('s0', { hp: 1_000, atk: 1 }), hp: 500 }, mods),
        slot('sup', { role: 'support', atk: 1 }),
      ];
      return eventsOf(fightWith(row, [], { rules }), 'heal')[0]?.amount;
    };
    expect(heal({})).toBe(40);
    expect(heal({ healReceivedBp: 5_000 })).toBe(60);
    expect(heal({ healReceivedBp: -5_000 })).toBe(20);
  });
});

describe('roles', () => {
  const supportRow = (support: SlotMods, element: Element = 'tide'): FightSlot[] => [
    { ...slot('s0', { hp: 1_000, atk: 1 }), hp: 500 },
    withMods(slot('sup', { role: 'support', atk: 1, element }), support),
  ];

  it('armorBp adds to the rules armor of a Guard', () => {
    const rules = rulesOf({ guardHpBp: 0, guardArmorBp: 2_500 });
    const hit = (mods: SlotMods) =>
      eventsOf(fightWith(rowWith(0, mods, { 0: { role: 'guard' } }), [], { rules }), 'boss_hit')[0];
    expect(hit({})).toMatchObject({ damage: 75, armored: 25 });
    expect(hit({ armorBp: 1_000 })).toMatchObject({ damage: 65, armored: 35 });
    // Not a Guard: no armor to add to.
    const notGuard = fightWith(rowWith(0, { armorBp: 1_000 }), [], { rules });
    expect(eventsOf(notGuard, 'boss_hit')[0]?.damage).toBe(100);
  });

  it("coverBp is the covering Guard's, not the covered creature's", () => {
    const frontHit = everyRound({ op: 'hit_zone', zone: 'front', power: 10_000 });
    const rules = rulesOf({ guardHpBp: 0 });
    const hitOnS1 = (guard: SlotMods, covered: SlotMods) => {
      const row = rowOf(9, { 0: { role: 'guard' } });
      row[0] = withMods(row[0] as FightSlot, guard);
      row[1] = withMods(row[1] as FightSlot, covered);
      return gimmickHits(fightWith(row, [frontHit], { rules })).find(([, t]) => t === 's1')?.[2];
    };
    expect(hitOnS1({}, {})).toBe(60);
    expect(hitOnS1({ coverBp: 1_000 }, {})).toBe(50);
    expect(hitOnS1({}, { coverBp: 1_000 })).toBe(60);
  });

  it('boostBp adds to the Support boost of its neighbours', () => {
    const buff = (mods: SlotMods) =>
      eventsOf(fightWith(supportRow(mods), [], { rules: rulesOf() }), 'support_buff')[0]?.bp;
    expect(buff({})).toBe(RULES.combat.supportBuffBp);
    expect(buff({ boostBp: 300 })).toBe(RULES.combat.supportBuffBp + 300);
    // Ember's own boost is replaced by its fx and the sheet adds to that.
    const ember = eventsOf(
      fightWith(supportRow({ boostBp: 300 }, 'ember'), [], {
        rules: rulesOf({ supportFx: { ember: { buffBp: 2_500 } } }),
      }),
      'support_buff',
    )[0]?.bp;
    expect(ember).toBe(2_800);
  });

  it("mendBp adds to a Support's heal, and gives one to a Support that did not heal", () => {
    const heal = (mods: SlotMods, rules = rulesOf()) =>
      eventsOf(fightWith(supportRow(mods), [], { rules }), 'heal')[0]?.amount;
    expect(heal({})).toBeUndefined();
    expect(heal({ mendBp: 200 })).toBe(20);
    expect(heal({ mendBp: 200 }, rulesOf({ supportFx: { tide: { healBp: 400 } } }))).toBe(60);
  });
});

describe('abilities and silence', () => {
  const abilityOf = (abilityId: string, key = 'k', fireAtRound = 1): AbilityChoice => ({
    playerId: 'p1',
    abilityId,
    key,
    creatureId: 's0',
    fireAtRound,
  });
  const reduced = (r: FightResult) =>
    eventsOf(r, 'boss_hit')
      .filter((e) => e.source === 'attack' && e.target === 's0')
      .map((e) => e.round * (e.reducedBp === undefined ? -1 : 1));

  it('lingerRounds makes Shield Wall and Rally of its own ability last longer', () => {
    const wall = (linger: number) =>
      reduced(
        fightWith(rowWith(0, { lingerRounds: linger }), [], {
          rounds: 5,
          extra: { finaleAbilities: [abilityOf('test-guard')] },
        }),
      );
    expect(wall(0)).toEqual([1, 2, -3, -4, -5]);
    expect(wall(1)).toEqual([1, 2, 3, -4, -5]);
    expect(wall(3)).toEqual([1, 2, 3, 4, 5]);

    const rally = (linger: number) => {
      const r = fightWith(rowWith(0, { lingerRounds: linger }, { 0: { atk: 1_000 } }), [], {
        rounds: 5,
        extra: { finaleAbilities: [abilityOf('test-setter')] },
      });
      return hitsOf(r, 's0')
        .filter((h) => h.bonusBp === 1_000)
        .map((h) => h.round);
    };
    expect(rally(0)).toEqual([1, 2]);
    expect(rally(1)).toEqual([1, 2, 3]);
  });

  it('lingerRounds makes a timed Purge last longer', () => {
    const restored = (linger: number) => {
      const r = fightWith(rowWith(0, { lingerRounds: linger }), [], {
        rounds: 7,
        extra: {
          adaptation: { rule: 'resist-top-element', target: 'tide' },
          finaleAbilities: [abilityOf('test-purge', 'k', 2)],
        },
      });
      return eventsOf(r, 'adaptation').find((e) => e.status === 'restored')?.round;
    };
    expect(restored(0)).toBe(4);
    expect(restored(2)).toBe(6);
  });

  it('lingerRounds does nothing for a basic ability, which belongs to no creature', () => {
    const basic: AbilityChoice = {
      playerId: 'p1',
      abilityId: 'rally',
      key: 'p1:basic',
      fireAtRound: 1,
    };
    const rallyRounds = (linger: number) =>
      hitsOf(
        fightWith(rowWith(0, { lingerRounds: linger }, { 0: { atk: 1_000 } }), [], {
          rounds: 4,
          extra: { finaleAbilities: [basic] },
        }),
        's0',
      )
        .filter((h) => h.bonusBp === 4_000)
        .map((h) => h.round);
    expect(rallyRounds(2)).toEqual(rallyRounds(0));
    expect(rallyRounds(0)).toEqual([1]);
  });

  it('ignoreSilence lets a creature at the row end keep acting', () => {
    const bind: Gimmick = {
      id: 'bind',
      name: 'Bind',
      trigger: { every: 2 },
      op: 'silence_ends',
      scope: 'row',
      turns: 1,
    };
    const skips = (mods: SlotMods) => {
      const row = rowOf(9);
      row[0] = withMods(row[0] as FightSlot, mods);
      const r = fightWith(row, [bind], { rounds: 4 });
      return {
        skipped: eventsOf(r, 'skip').map((e) => `${String(e.round)}:${e.creature}`),
        silences: eventsOf(r, 'silence').map((e) => `${String(e.round)}:${e.creature}`),
      };
    };
    expect(skips({}).skipped).toEqual(['3:s0', '3:s8']);
    expect(skips({ ignoreSilence: 1 })).toEqual({
      skipped: ['3:s8'],
      silences: ['2:s8', '4:s8'],
    });
  });
});

describe('a bad sheet', () => {
  const fightOf = (mods: unknown) => () => run([{ ...slot('a'), mods: mods as SlotMods }]);

  it('is refused: unknown fields, fractions, out-of-range numbers and unknown keys', () => {
    expect(fightOf({ nope: 1 })).toThrow(/unknown field "nope"/);
    expect(fightOf({ takenBp: 1.5 })).toThrow(/takenBp must be an integer/);
    expect(fightOf({ takenBp: 10_001 })).toThrow(/takenBp must be an integer/);
    expect(fightOf({ pierceBp: -1 })).toThrow(/pierceBp must be an integer/);
    expect(fightOf({ lingerRounds: 4 })).toThrow(/lingerRounds/);
    expect(fightOf({ ignoreSilence: 2 })).toThrow(/ignoreSilence/);
    expect(fightOf({ markedFoeBp: '5' })).toThrow(/markedFoeBp must be an integer/);
    expect(fightOf({ wardBp: { water: 100 } })).toThrow(/unknown key "water"/);
    expect(fightOf({ reactionBp: { blaze: 100 } })).toThrow(/unknown key "blaze"/);
    expect(fightOf({ besideRoleBp: { boss: 100 } })).toThrow(/unknown key "boss"/);
    expect(fightOf([])).toThrow(/must be an object/);
  });

  it('accepts a sheet with every allowed value at its edge', () => {
    expect(fightOf({ takenBp: 10_000, markedFoeBp: 100_000, lingerRounds: 3 })).not.toThrow();
  });
});

describe('the log text', () => {
  it('says when a hit, a reaction or a taken hit changed because of modifiers', () => {
    const names = buildNames(input([slot('a'), slot('b')]));
    const line = (e: Parameters<typeof describeEvent>[0]) => describeEvent(e, names);
    expect(
      line({
        t: 'hit',
        round: 1,
        creature: 'a',
        damage: 120,
        matchupBp: 10_000,
        bonusBp: 2_000,
        mark: null,
        bossHp: 880,
        sheetBp: 1_250,
      }),
    ).toBe('a hits Tidal Colossus for 120 (+12.5% from modifiers); 880 HP left.');
    expect(
      line({
        t: 'reaction',
        round: 1,
        reaction: 'steam',
        setupCreature: 'a',
        setupPlayer: 'p1',
        payoff: 'b',
        bonus: 300,
        reflected: false,
        sheetBp: 900,
      }),
    ).toContain('for 300 bonus damage (+9% from modifiers).');
    expect(
      line({ t: 'boss_hit', round: 1, source: 'attack', target: 'a', damage: 80, warded: 20 }),
    ).toBe('Tidal Colossus attacks a for 80. Its modifiers take off 20.');
    expect(
      line({ t: 'boss_hit', round: 1, source: 'attack', target: 'a', damage: 125, warded: -25 }),
    ).toBe('Tidal Colossus attacks a for 125. Its modifiers add 25.');
    expect(
      line({
        t: 'hit',
        round: 1,
        creature: 'a',
        damage: 90,
        matchupBp: 10_000,
        bonusBp: -1_000,
        mark: null,
        bossHp: 910,
        sheetBp: -1_000,
      }),
    ).toContain('(-10% from modifiers)');
  });

  it('writes the log lines of a real fight with sheets as plain text', () => {
    const r = run(
      [
        withMods(slot('a', { atk: 1_000 }), { firstHitBp: 1_000, takenBp: 1_000 }),
        withMods(slot('b', { atk: 1_000, element: 'spark', role: 'payoff' }), { pounceBp: 500 }),
      ],
      {},
    );
    const names = buildNames(input([slot('a'), slot('b')]));
    const text = r.events.map((e) => describeEvent(e, names));
    expect(text.some((t) => t.includes('from modifiers'))).toBe(true);
    for (const t of text) expect(t).not.toContain('undefined');
  });
});

describe('determinism', () => {
  it('a fight with sheets repeats exactly for the same seed', () => {
    const row = rowOf(9, { 0: { role: 'guard', atk: 50 }, 1: { atk: 800 }, 2: { atk: 900 } });
    const modded = row.map((s, i) =>
      withMods(s, { takenBp: 100 * i, firstHitBp: 500, markedFoeBp: 300, pounceBp: 200 }),
    );
    const a = simulateFight(input(modded), rng(), { pack: TEST_PACK });
    const b = simulateFight(input(modded), rng(), { pack: TEST_PACK });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
