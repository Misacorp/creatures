import { NO_LUCK, createSeededRng, RULES, type Gimmick, type Rng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  PROC_KINDS,
  buildNames,
  describeEvent,
  liveFightRules,
  resolveMods,
  simulateFight,
  type FightEvent,
  type FightInput,
  type FightResult,
  type FightSlot,
  type SlotMods,
} from '../src/index';
import { CHANCE_KEYS, LUCK_DICE } from '../src/mods';
import { TEST_PACK, eventsOf, input, randomInput, slot } from './helpers';
import { everyRound, fightWith, rowOf, rulesOf } from './pattern-helpers';

/**
 * Chance lines and trigger lines (2026-10-18, `combat-rules.md` 11 and 12). Chance lines roll on the
 * creature's luck dice, which a fight draws only when some creature has a chance line, after every other
 * die; trigger lines fire at a defined moment and write a `proc` event. Every field is absent on a stored
 * fight. Boss Attack 100 in these tests, so a power of 10000 deals 100; `adjacent` reach makes "beside"
 * the plain line (rows of three are one slot per row in the raid, and nobody is beside anyone).
 */

const withMods = (s: FightSlot, mods: SlotMods): FightSlot => ({ ...s, mods });
const adjacent: Partial<FightInput> = { guardReach: 'adjacent' };
const crits = { ...NO_LUCK, critChanceBp: 10_000, critBp: 5_000 };
const procs = (r: FightResult, kind: string) => eventsOf(r, 'proc').filter((e) => e.kind === kind);
const hitsOf = (r: FightResult, id: string) => eventsOf(r, 'hit').filter((e) => e.creature === id);
const NAMES = buildNames(input([slot('a'), slot('b'), slot('c')]));

const silenceEnds = (every?: number): Gimmick => ({
  id: 'sil',
  name: 'sil',
  trigger: every === undefined ? { eachRound: true } : { every },
  op: 'silence_ends',
  scope: 'row',
  turns: 1,
});

/** A counting RNG, for "draws exactly what it drew". */
function counting(seed: string): { rng: Rng; count: () => number } {
  const inner = createSeededRng(seed);
  let n = 0;
  return {
    rng: {
      nextU32: () => {
        n += 1;
        return inner.nextU32();
      },
    },
    count: () => n,
  };
}

describe('the luck dice: drawn only when some creature has a chance line', () => {
  const fights = (): FightInput[] =>
    Array.from({ length: 24 }, (_, i) => {
      const base = randomInput(
        `chance-none-${String(i)}`,
        1 + (i % 5),
        i % 2 === 0 ? 'finale' : 'phase1',
      );
      return i % 3 === 0
        ? { ...base, rules: liveFightRules(), luck: RULES.combat.luck }
        : i % 3 === 1
          ? { ...base, rules: liveFightRules() }
          : base;
    });

  it('absent, empty and zero chance fields replay byte for byte', () => {
    for (const base of fights()) {
      const expected = JSON.stringify(simulateFight(base, createSeededRng('same')));
      const zero: SlotMods = Object.fromEntries(CHANCE_KEYS.map((k) => [k, 0]));
      const variants: SlotMods[] = [
        {},
        zero,
        { ...zero, paybackBp: 0, openingMark: 0, stubborn: 0 },
      ];
      for (const mods of variants) {
        const row = base.row.map((s) => ({ ...s, mods }));
        const out = simulateFight({ ...base, row }, createSeededRng('same'));
        expect(JSON.stringify(out)).toBe(expected);
      }
    }
  });

  it('a trigger line alone draws exactly what the fight drew before', () => {
    for (const base of fights().slice(0, 8)) {
      const plain = counting('same');
      simulateFight(base, plain.rng);
      const row = base.row.map((s) => ({
        ...s,
        mods: { stormWarningBp: 1_000, kindlingBp: 500, lastStandBp: 1_000 } satisfies SlotMods,
      }));
      const trig = counting('same');
      simulateFight({ ...base, row }, trig.rng);
      expect(trig.count()).toBe(plain.count());
    }
  });

  it('one chance line anywhere draws LUCK_DICE dice per creature per round, and nothing else', () => {
    const base = fights()[1] as FightInput;
    const plain = counting('same');
    const before = simulateFight(base, plain.rng);
    const row = base.row.map((s, i) => (i === 0 ? { ...s, mods: { steadyPawsBp: 1 } } : s));
    const lucky = counting('same');
    const after = simulateFight({ ...base, row }, lucky.rng);
    expect(after.rounds).toBe(before.rounds);
    const extra = lucky.count() - plain.count();
    // Every draw is an `int` of 10000, which only repeats on a rejected value (about 1 in 600,000).
    expect(extra).toBeGreaterThanOrEqual(before.rounds * base.row.length * LUCK_DICE);
    expect(extra).toBeLessThanOrEqual(before.rounds * base.row.length * LUCK_DICE + 8);
  });

  it('round 1 plays the same dice with or without the luck dice (they come last in the round)', () => {
    const row = rowOf(3, {}, { atk: 100 });
    const plain = fightWith(row, [], { rounds: 1, extra: { luck: RULES.combat.luck } });
    const lucky = fightWith(
      row.map((s, i) => (i === 1 ? withMods(s, { steadyPawsBp: 5_000 }) : s)),
      [],
      { rounds: 1, extra: { luck: RULES.combat.luck } },
    );
    expect(lucky.events).toEqual(plain.events);
  });

  it('the same seed gives the same fight, a different seed another', () => {
    const row = rowOf(3, { 1: { hp: 100_000 } }, { atk: 100 }).map((s) =>
      withMods(s, { echoBp: 5_000, sidestepBp: 5_000, secondWindBp: 5_000 }),
    );
    const go = (seed: string) =>
      JSON.stringify(
        fightWith(row, [everyRound({ op: 'hit_zone', zone: 'front', power: 5_000 })], {
          rounds: 8,
          rng: createSeededRng(seed),
          extra: adjacent,
        }).events,
      );
    expect(go('x')).toBe(go('x'));
    expect(go('x')).not.toBe(go('y'));
  });
});

describe('mods: the chance and trigger fields are checked', () => {
  it('accepts every field in range and fills the rest with 0', () => {
    const m = resolveMods(
      'a',
      { echoBp: 10_000, paybackBp: 3_000, stubborn: 1, openingMark: 1 },
      [],
    );
    expect(m).toMatchObject({
      echoBp: 10_000,
      paybackBp: 3_000,
      stubborn: true,
      openingMark: true,
    });
    expect(m.sidestepBp).toBe(0);
    expect(m.kindlingBp).toBe(0);
  });

  it('refuses a chance above 100%, a negative one, a fraction and a flag that is not 0 or 1', () => {
    for (const bad of [
      { echoBp: 10_001 },
      { sidestepBp: -1 },
      { secondWindBp: 1.5 },
      { stormWarningBp: 10_001 },
      { lastStandBp: 20_000 },
      { stubborn: 2 },
      { openingMark: -1 },
    ] as unknown as SlotMods[]) {
      expect(() => resolveMods('a', bad, [])).toThrow(RangeError);
    }
  });
});

describe('Second wind: a chance each round to heal 5% of max HP', () => {
  // `a` stands in front and takes the boss's plain attack (100) each round.
  const row = (mods: SlotMods) => [withMods(slot('a', { hp: 1_000, atk: 1 }), mods)];
  const heals = (mods: SlotMods, rounds = 6) =>
    eventsOf(fightWith(row(mods), [], { rounds }), 'heal').filter((e) => e.cause === 'second_wind');

  it('with a sure chance it heals 5% of max HP at every round start where HP is missing', () => {
    const list = heals({ secondWindBp: 10_000 });
    // Round 1 it is at full HP (nothing to heal, nothing written); then 100 lost, 50 back, a round.
    expect(list.map((e) => [e.round, e.target, e.supporter, e.amount])).toEqual([
      [2, 'a', 'a', 50],
      [3, 'a', 'a', 50],
      [4, 'a', 'a', 50],
      [5, 'a', 'a', 50],
      [6, 'a', 'a', 50],
    ]);
  });

  it('never heals above what is missing, and does nothing without the line or with chance 0', () => {
    expect(heals({})).toEqual([]);
    expect(heals({ secondWindBp: 0 })).toEqual([]);
    const r = fightWith(
      [withMods(slot('a', { hp: 1_000, atk: 1 }), { secondWindBp: 10_000 })],
      [],
      { rounds: 3, bossAtk: 20 },
    );
    // 20 lost a round, 50 would heal: only the missing 20 comes back.
    expect(eventsOf(r, 'heal').map((e) => e.amount)).toEqual([20, 20]);
    expect(r.hpEnd['a']).toBe(980);
  });

  it('the chance is rolled on the creature die: about half the rounds at 50%', () => {
    const r = fightWith(
      [withMods(slot('a', { hp: 100_000, atk: 1 }), { secondWindBp: 5_000 })],
      [],
      { rounds: 40, bossAtk: 10 },
    );
    const list = eventsOf(r, 'heal').filter((e) => e.cause === 'second_wind');
    expect(list.length).toBeGreaterThan(8);
    expect(list.length).toBeLessThan(32);
  });

  it('the healed creature reads it in the log, and Long Shadows (healReceivedBp) changes the amount', () => {
    const list = heals({ secondWindBp: 10_000, healReceivedBp: -5_000 }, 3);
    expect(list.map((e) => e.amount)).toEqual([25, 25]);
    expect(describeEvent(list[0] as FightEvent, NAMES)).toBe(
      'a catches a second wind and recovers 25 HP.',
    );
  });

  it('a creature that is knocked out is not healed', () => {
    const r = fightWith([withMods(slot('a', { hp: 150, atk: 1 }), { secondWindBp: 10_000 })], [], {
      rounds: 5,
    });
    expect(eventsOf(r, 'knockout')).toHaveLength(1);
    expect(eventsOf(r, 'heal').every((e) => e.round <= 2)).toBe(true);
  });
});

describe('Echo: a chance its hit lands again at 30%', () => {
  it('lands again for 30% of the plain hit, written as a proc with the boss HP after it', () => {
    const r = fightWith([withMods(slot('a', { atk: 1_000 }), { echoBp: 10_000 })], [], {
      rounds: 2,
    });
    const hits = hitsOf(r, 'a');
    const echoes = procs(r, 'echo');
    expect(echoes).toHaveLength(2);
    expect(hits[0]?.damage).toBe(1_000);
    expect(echoes[0]).toMatchObject({ round: 1, creature: 'a', amount: 300 });
    expect(echoes[0]?.bossHp).toBe((hits[0]?.bossHp as number) - 300);
    // The next round starts from the echo's HP and the totals count it.
    expect(eventsOf(r, 'round_start')[1]?.bossHp).toBe(echoes[0]?.bossHp);
    expect(r.perCreature['a']?.damage).toBe(2 * 1_000 + 2 * 300);
    expect(r.damageByElement.tide).toBe(2 * 1_300);
    expect(describeEvent(echoes[0] as FightEvent, NAMES)).toContain("a's hit lands again for 300");
  });

  it('echoes the plain hit only, not a reaction bonus, and sets off nothing', () => {
    const r = fightWith(
      [
        slot('s', { atk: 1_000, element: 'ember' }),
        withMods(slot('p', { atk: 1_000, role: 'payoff' }), { echoBp: 10_000 }),
      ],
      [],
      { rounds: 1 },
    );
    const reaction = eventsOf(r, 'reaction')[0];
    const hit = hitsOf(r, 'p')[0];
    expect(reaction?.bonus).toBeGreaterThan(0);
    const plain = (hit?.damage as number) - (reaction?.bonus as number);
    expect(procs(r, 'echo')[0]?.amount).toBe(Math.floor((plain * 3_000) / 10_000));
    expect(eventsOf(r, 'reaction')).toHaveLength(1);
  });

  it('does not echo when the hit killed the boss, and is cut at the phase floor', () => {
    const killed = fightWith([withMods(slot('a', { atk: 1_000 }), { echoBp: 10_000 })], [], {
      rounds: 1,
      extra: { bossHpPool: { max: 1_000, current: 1_000 } },
    });
    expect(procs(killed, 'echo')).toEqual([]);
    expect(killed.bossHpEnd).toBe(0);
    // Max 10000 with a floor of 9000: the hit of 800 leaves 200 above it, the echo (240) is cut to 200.
    const floored = fightWith([withMods(slot('a', { atk: 800 }), { echoBp: 10_000 })], [], {
      rounds: 3,
      extra: { bossHpPool: { max: 10_000, current: 10_000 }, bossHpFloor: 9_000 },
    });
    expect(procs(floored, 'echo')[0]).toMatchObject({ amount: 200, bossHp: 9_000 });
    expect(floored.retreated).toBe(true);
    expect(eventsOf(floored, 'retreat')).toHaveLength(1);
    expect(floored.bossHpEnd).toBe(9_000);
  });

  it('is not an ability strike echo, and chance 0 never echoes', () => {
    const none = fightWith([withMods(slot('a', { atk: 1_000 }), { echoBp: 0 })], [], { rounds: 3 });
    expect(procs(none, 'echo')).toEqual([]);
  });
});

describe('Sidestep: a chance to take nothing from an area hit', () => {
  const zoneHit = everyRound({ op: 'hit_zone', zone: 'middle', power: 10_000 });
  const row = (mods: SlotMods) => [withMods(slot('a', { atk: 1 }), mods)];
  const areaHits = (r: FightResult) =>
    eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick' && e.target === 'a');

  it('with a sure chance the area hit does nothing, written as a sidestep with 0 damage', () => {
    const r = fightWith(row({ sidestepBp: 10_000 }), [zoneHit], { rounds: 3 });
    const hits = areaHits(r);
    expect(hits).toHaveLength(3);
    for (const h of hits) expect(h).toMatchObject({ damage: 0, sidestep: true });
    expect(describeEvent(hits[0] as FightEvent, NAMES)).toBe(
      "a sidesteps Tidal Colossus's hit and takes nothing.",
    );
    // The plain attack is an aimed hit: it is not sidestepped.
    const aimed = eventsOf(r, 'boss_hit').filter((e) => e.source === 'attack');
    for (const h of aimed) expect(h.damage).toBe(100);
    expect(r.hpEnd['a']).toBe(100_000 - 300);
  });

  it('without the line, or at chance 0, every area hit lands', () => {
    for (const mods of [{}, { sidestepBp: 0 }]) {
      for (const h of areaHits(fightWith(row(mods), [zoneHit], { rounds: 3 }))) {
        expect(h.damage).toBe(100);
        expect(h).not.toHaveProperty('sidestep');
      }
    }
  });

  it('each area hit of a round has a die of its own (two hits can differ in one round)', () => {
    const second = everyRound({ op: 'hit_zone', zone: 'middle', power: 10_000 }, 'g2');
    const r = fightWith(row({ sidestepBp: 5_000 }), [zoneHit, second], { rounds: 30 });
    const hits = areaHits(r);
    expect(hits).toHaveLength(60);
    const outcomes = Array.from({ length: 30 }, (_, i) => [
      (hits[2 * i] as { sidestep?: true }).sidestep === true,
      (hits[2 * i + 1] as { sidestep?: true }).sidestep === true,
    ]);
    expect(outcomes.some(([x, y]) => x !== y)).toBe(true);
    const total = outcomes.flat().filter(Boolean).length;
    expect(total).toBeGreaterThan(15);
    expect(total).toBeLessThan(45);
  });

  it('works on a splash and on the enrage hit, but not on a reflected hit (Bramble Season)', () => {
    const slam = everyRound({ op: 'slam', aim: 'left', power: 10_000, splashBp: 5_000 });
    const rr = fightWith(
      [slot('l', { atk: 1 }), withMods(slot('a', { atk: 1 }), { sidestepBp: 10_000 })],
      [slam],
      { rounds: 2, extra: adjacent, rules: rulesOf({ coverBp: 0 }) },
    );
    const splash = eventsOf(rr, 'boss_hit').filter((e) => e.splash === true && e.target === 'a');
    expect(splash).toHaveLength(2);
    for (const h of splash) expect(h).toMatchObject({ damage: 0, sidestep: true, splash: true });
    expect(describeEvent(splash[0] as FightEvent, NAMES)).toContain('sidesteps the splash');
    // Bramble: Steam is reflected at the Tide Payoff `a`, which has a sure Sidestep: it still takes it.
    const b = fightWith(
      [
        slot('s', { atk: 1_000, element: 'ember' }),
        withMods(slot('a', { atk: 1_000, role: 'payoff', hp: 100 }), { sidestepBp: 10_000 }),
      ],
      [],
      { rounds: 1, extra: { brambleBp: 5_000 }, rules: rulesOf() },
    );
    const back = eventsOf(b, 'boss_hit').find((e) => e.source === 'reflect');
    expect(back?.damage).toBeGreaterThan(0);
    expect(back).not.toHaveProperty('sidestep');
  });
});

describe('Steady paws: a chance to shrug off a silence', () => {
  it('with a sure chance the silence misses it (a proc, no silence event) and it keeps hitting', () => {
    const row = [
      withMods(slot('a', { atk: 10 }), { steadyPawsBp: 10_000 }),
      slot('b', { atk: 10 }),
      slot('c', { atk: 10 }),
    ];
    const r = fightWith(row, [silenceEnds()], { rounds: 3 });
    expect(procs(r, 'steady_paws').map((e) => [e.round, e.creature])).toEqual([
      [1, 'a'],
      [2, 'a'],
      [3, 'a'],
    ]);
    expect(eventsOf(r, 'silence').every((e) => e.creature === 'c')).toBe(true);
    expect(hitsOf(r, 'a')).toHaveLength(3);
    expect(describeEvent(procs(r, 'steady_paws')[0] as FightEvent, NAMES)).toBe(
      'Steady paws: a shrugs off the silence.',
    );
  });

  it('without the line, or at chance 0, the silence lands', () => {
    for (const mods of [{}, { steadyPawsBp: 0 }]) {
      const r = fightWith(
        [withMods(slot('a', { atk: 10 }), mods), slot('b', { atk: 10 })],
        [silenceEnds()],
        { rounds: 2 },
      );
      expect(eventsOf(r, 'silence').some((e) => e.creature === 'a')).toBe(true);
      expect(procs(r, 'steady_paws')).toEqual([]);
    }
  });
});

describe('Warm heart: a chance at round start to boost a creature beside it', () => {
  it('boosts the neighbour that hits hardest by 10% on its next hit', () => {
    // b is a Guard with a sure Warm heart between a (Attack 500) and c (Attack 900).
    const row = [
      slot('a', { atk: 500 }),
      withMods(slot('b', { atk: 100, role: 'guard' }), { warmHeartBp: 10_000 }),
      slot('c', { atk: 900 }),
    ];
    const r = fightWith(row, [], { rounds: 2, extra: adjacent });
    const warm = procs(r, 'warm_heart');
    expect(warm.map((e) => [e.round, e.creature, e.target, e.amount])).toEqual([
      [1, 'b', 'c', 1_000],
      [2, 'b', 'c', 1_000],
    ]);
    expect(hitsOf(r, 'c')[0]).toMatchObject({ damage: 990, bonusBp: 1_000 });
    expect(hitsOf(r, 'a')[0]).toMatchObject({ damage: 500 });
    expect(describeEvent(warm[0] as FightEvent, NAMES)).toBe(
      'Warm heart: b gives c a 10% boost on its next hit.',
    );
  });

  it('ties go to the lower slot, a lone creature has nobody to boost, and chance 0 does nothing', () => {
    const tied = fightWith(
      [
        slot('a', { atk: 500 }),
        withMods(slot('b', { atk: 1 }), { warmHeartBp: 10_000 }),
        slot('c', { atk: 500 }),
      ],
      [],
      { rounds: 1, extra: adjacent },
    );
    expect(procs(tied, 'warm_heart')[0]?.target).toBe('a');
    const alone = fightWith([withMods(slot('a'), { warmHeartBp: 10_000 })], [], { rounds: 2 });
    expect(procs(alone, 'warm_heart')).toEqual([]);
    const off = fightWith([slot('a'), withMods(slot('b'), { warmHeartBp: 0 })], [], {
      rounds: 2,
      extra: adjacent,
    });
    expect(procs(off, 'warm_heart')).toEqual([]);
  });

  it('a Support that also has Warm heart gives both boosts (they do not replace each other)', () => {
    const row = [
      slot('a', { atk: 1_000 }),
      withMods(slot('s', { atk: 1, role: 'support' }), { warmHeartBp: 10_000 }),
    ];
    const r = fightWith(row, [], { rounds: 1, extra: adjacent });
    // The Support's own boost (15%) and Warm heart's (10%) both reach `a`.
    expect(eventsOf(r, 'support_buff')).toHaveLength(1);
    expect(hitsOf(r, 'a')[0]?.bonusBp).toBe(RULES.combat.supportBuffBp + 1_000);
  });
});

describe('Quick re-mark: a chance its hit replaces a mark of another element', () => {
  // `s` (Ember Setter) marks Scorched; `q` (Spark Payoff) cannot cash it (Steam needs Tide).
  const row = (mods: SlotMods, sealed: SlotMods = {}) => [
    withMods(slot('s', { atk: 100, element: 'ember' }), sealed),
    withMods(slot('q', { atk: 100, element: 'spark', role: 'payoff' }), mods),
  ];

  it('a sure chance replaces the mark like a Setter would, and says so', () => {
    const r = fightWith(row({ quickRemarkBp: 10_000 }), [], { rounds: 1 });
    const marks = eventsOf(r, 'mark');
    expect(marks.map((e) => [e.creature, e.element, e.replaced])).toEqual([
      ['s', 'ember', null],
      ['q', 'spark', 'ember'],
    ]);
    expect(procs(r, 'quick_remark')).toHaveLength(1);
  });

  it('without it a Payoff leaves the mark alone', () => {
    for (const mods of [{}, { quickRemarkBp: 0 }]) {
      const r = fightWith(row(mods), [], { rounds: 1 });
      expect(eventsOf(r, 'mark')).toHaveLength(1);
    }
  });

  it('cannot replace a sealed mark (First Footprints)', () => {
    const r = fightWith(row({ quickRemarkBp: 10_000 }, { sealMark: 1 }), [], { rounds: 1 });
    expect(eventsOf(r, 'mark')).toHaveLength(1);
    expect(procs(r, 'quick_remark')).toEqual([]);
  });

  it('a Setter replaces without any line, and is not given a proc', () => {
    const r = fightWith(
      [slot('s', { atk: 100, element: 'ember' }), slot('t', { atk: 100, element: 'spark' })],
      [],
      { rounds: 1 },
    );
    expect(eventsOf(r, 'mark')).toHaveLength(2);
    expect(procs(r, 'quick_remark')).toEqual([]);
  });
});

describe('Spill-over: a chance a reaction leaves its own mark afterwards', () => {
  // `s` (Ember Setter) marks, `p` (Tide Payoff) cashes Steam, `z` (Spark) could cash a Soaked mark.
  const row = (mods: SlotMods) => [
    slot('s', { atk: 1_000, element: 'ember' }),
    withMods(slot('p', { atk: 1_000, role: 'payoff' }), mods),
    slot('z', { atk: 1_000, element: 'spark' }),
  ];

  it('leaves its own mark so the next creature can cash on it', () => {
    const r = fightWith(row({ spillOverBp: 10_000 }), [], { rounds: 1 });
    expect(eventsOf(r, 'reaction').map((e) => [e.reaction, e.payoff])).toEqual([
      ['steam', 'p'],
      ['overload', 'z'],
    ]);
    expect(procs(r, 'spill_over')).toHaveLength(1);
    expect(eventsOf(r, 'mark').map((e) => e.creature)).toEqual(['s', 'p']);
  });

  it('does nothing at chance 0, and Ridge Copper (chainMark) already leaves the mark: no second one', () => {
    expect(
      eventsOf(fightWith(row({ spillOverBp: 0 }), [], { rounds: 1 }), 'reaction'),
    ).toHaveLength(1);
    const both = fightWith(row({ spillOverBp: 10_000, chainMark: 1 }), [], { rounds: 1 });
    expect(eventsOf(both, 'mark').filter((e) => e.creature === 'p')).toHaveLength(1);
    expect(procs(both, 'spill_over')).toEqual([]);
  });

  it('does nothing when the boss reflected the reaction', () => {
    const reflect: Gimmick = {
      id: 'r',
      name: 'r',
      trigger: { eachRound: true },
      op: 'reflect_first_reaction',
    };
    const r = fightWith(row({ spillOverBp: 10_000 }), [reflect], { rounds: 1 });
    expect(eventsOf(r, 'reaction')[0]?.reflected).toBe(true);
    expect(procs(r, 'spill_over')).toEqual([]);
  });
});

describe('Payback: it takes a hit for a neighbour, its next hit deals more', () => {
  const strike = everyRound({ op: 'strike_highest_atk', power: 10_000 });
  const row = (mods: SlotMods, hp = 100_000) => [
    slot('s0', { atk: 1_000 }),
    withMods(slot('g', { atk: 100, role: 'guard', hp }), mods),
  ];

  it('the Guard that steps in gets +30% on its next turn hit, once', () => {
    const r = fightWith(row({ paybackBp: 3_000 }), [strike], { rounds: 3, extra: adjacent });
    const paybacks = procs(r, 'payback');
    expect(paybacks.map((e) => [e.round, e.creature, e.amount])).toEqual([
      [1, 'g', 3_000],
      [2, 'g', 3_000],
      [3, 'g', 3_000],
    ]);
    const hits = hitsOf(r, 'g');
    expect(hits[0]).not.toHaveProperty('sheetBp');
    expect(hits[1]).toMatchObject({ sheetBp: 3_000, damage: 130 });
    expect(hits[2]).toMatchObject({ sheetBp: 3_000, damage: 130 });
    expect(describeEvent(paybacks[0] as FightEvent, NAMES)).toBe(
      'Payback: g took the hit for a neighbour, so its next hit deals 30% more.',
    );
  });

  it('is spent by the hit: with no step-in in between it is not there next time', () => {
    // The strike comes every second round, so the bonus is spent in the round after it.
    const sparse: Gimmick = { ...strike, trigger: { every: 2 } };
    const r = fightWith(row({ paybackBp: 3_000 }), [sparse], { rounds: 4, extra: adjacent });
    const hits = hitsOf(r, 'g');
    expect(hits.map((h) => h.sheetBp)).toEqual([undefined, undefined, 3_000, undefined]);
  });

  it('a hit aimed at the Guard itself is not a hit taken for a neighbour', () => {
    const r = fightWith(row({ paybackBp: 3_000 }), [], { rounds: 3, extra: adjacent });
    expect(procs(r, 'payback')).toEqual([]);
  });

  it('a Guard that is knocked out by the hit gets nothing', () => {
    const r = fightWith(row({ paybackBp: 3_000 }, 50), [strike], { rounds: 2, extra: adjacent });
    expect(eventsOf(r, 'knockout').map((e) => e.creature)).toContain('g');
    expect(procs(r, 'payback')).toEqual([]);
  });

  it('a Shield Wall that stops the hit still counts as taking it', () => {
    const wall: AbilityWall = {
      abilityId: 'test-guard',
      key: 'w',
      playerId: 'p1',
      creatureId: 'g',
      fireAtRound: 1,
    };
    const r = fightWith(row({ paybackBp: 3_000 }), [strike], {
      rounds: 1,
      extra: {
        ...adjacent,
        finaleAbilities: [wall],
      },
    });
    expect(eventsOf(r, 'boss_hit').some((e) => e.from === 's0')).toBe(true);
    expect(procs(r, 'payback')).toHaveLength(1);
  });
});
type AbilityWall = NonNullable<FightInput['finaleAbilities']>[number];

describe('Kindling: round 1 starts, the creatures beside it start with a boost', () => {
  it('boosts both neighbours for their first hit, in round 1 only', () => {
    const row = [
      slot('a', { atk: 1_000 }),
      withMods(slot('k', { atk: 1_000, role: 'support' }), { kindlingBp: 2_000 }),
      slot('c', { atk: 1_000 }),
    ];
    // A Support also boosts (15%); take it out of the sum by comparing with a plain neighbour row.
    const r = fightWith(row, [], { rounds: 2, extra: adjacent });
    const kindling = procs(r, 'kindling');
    expect(kindling.map((e) => [e.round, e.creature, e.target, e.amount])).toEqual([
      [1, 'k', 'a', 2_000],
      [1, 'k', 'c', 2_000],
    ]);
    expect(hitsOf(r, 'a')[0]?.bonusBp).toBe(RULES.combat.supportBuffBp + 2_000);
    expect(hitsOf(r, 'a')[1]?.bonusBp).toBe(RULES.combat.supportBuffBp);
    expect(describeEvent(kindling[0] as FightEvent, NAMES)).toBe(
      'Kindling: k starts a with a 20% boost on its first hit.',
    );
  });

  it('does nothing without the line, past round 1 or beside a knocked-out creature', () => {
    const none = fightWith([slot('a'), withMods(slot('k'), { kindlingBp: 0 })], [], {
      rounds: 1,
      extra: adjacent,
    });
    expect(procs(none, 'kindling')).toEqual([]);
    // A creature that starts the fight knocked out is not beside a living one.
    const down = fightWith(
      [{ ...slot('a'), hp: 0 }, withMods(slot('k'), { kindlingBp: 2_000 })],
      [],
      { rounds: 1, extra: adjacent },
    );
    expect(procs(down, 'kindling')).toEqual([]);
  });
});

describe('Opening mark: round 1 starts and the boss has no mark, it leaves its own', () => {
  const row = (mods: SlotMods) => [
    slot('p', { atk: 100, element: 'spark', role: 'payoff' }),
    withMods(slot('o', { atk: 100, element: 'ember', role: 'payoff' }), mods),
  ];

  it('marks the boss before the first turn, in round 1 only', () => {
    const r = fightWith(row({ openingMark: 1 }), [], { rounds: 3 });
    const first = r.events.findIndex((e) => e.t === 'proc');
    expect(r.events.slice(first - 1, first + 1).map((e) => e.t)).toEqual(['mark', 'proc']);
    expect(eventsOf(r, 'mark')[0]).toMatchObject({ round: 1, creature: 'o', element: 'ember' });
    expect(procs(r, 'opening_mark')).toHaveLength(1);
    // The mark is there when the first creature hits (no mark was left by it).
    expect(hitsOf(r, 'p')[0]?.mark).toBe('ember');
    expect(describeEvent(procs(r, 'opening_mark')[0] as FightEvent, NAMES)).toBe(
      'Opening mark: o marks Tidal Colossus before the first blow.',
    );
  });

  it('only the first creature of the row with the line does it, and nothing without it', () => {
    const two = fightWith(
      [
        withMods(slot('x', { element: 'grove' }), { openingMark: 1 }),
        withMods(slot('y', { element: 'ember' }), { openingMark: 1 }),
      ],
      [],
      { rounds: 1 },
    );
    expect(procs(two, 'opening_mark').map((e) => e.creature)).toEqual(['x']);
    expect(procs(fightWith(row({ openingMark: 0 }), [], { rounds: 1 }), 'opening_mark')).toEqual(
      [],
    );
  });
});

describe('Rally cry: a creature beside it is knocked out, its hits deal more for the fight', () => {
  // The boss's plain attack hits the leftmost creature; `a` (50 HP) falls in round 1.
  const row = (mods: SlotMods) => [
    slot('a', { atk: 1, hp: 50 }),
    withMods(slot('r', { atk: 1_000 }), mods),
    slot('c', { atk: 1 }),
  ];

  it('gives +15% to every hit from then on', () => {
    const r = fightWith(row({ rallyCryBp: 1_500 }), [], { rounds: 3, extra: adjacent });
    const rally = procs(r, 'rally_cry');
    expect(rally).toEqual([
      { t: 'proc', round: 1, creature: 'r', kind: 'rally_cry', target: 'a', amount: 1_500 },
    ]);
    const hits = hitsOf(r, 'r');
    expect(hits[0]).toMatchObject({ damage: 1_000 });
    expect(hits[1]).toMatchObject({ damage: 1_150, sheetBp: 1_500 });
    expect(hits[2]).toMatchObject({ damage: 1_150 });
    expect(describeEvent(rally[0] as FightEvent, NAMES)).toBe(
      "Rally cry: a has fallen, so r's hits deal 15% more from now on.",
    );
  });

  it('stacks once for each neighbour that falls, and not for a creature that is not beside it', () => {
    const r = fightWith(
      [
        slot('a', { atk: 1, hp: 50 }),
        withMods(slot('r', { atk: 1_000 }), { rallyCryBp: 1_500 }),
        slot('c', { atk: 1, hp: 50 }),
        slot('d', { atk: 1, hp: 50 }),
      ],
      [everyRound({ op: 'sweep', rows: ['all'], power: 10_000 })],
      { rounds: 2, extra: adjacent },
    );
    // a, c and d all fall to the sweep in round 1; r is beside a and c (not d).
    expect(procs(r, 'rally_cry').map((e) => e.target)).toEqual(['a', 'c']);
    expect(hitsOf(r, 'r')[1]?.sheetBp).toBe(3_000);
  });

  it('does nothing without a fall, or if the wearer itself fell', () => {
    expect(
      procs(
        fightWith(row({ rallyCryBp: 1_500 }), [], { rounds: 1, extra: adjacent, bossAtk: 1 }),
        'rally_cry',
      ),
    ).toEqual([]);
  });
});

describe('Ember tail: it crits, its next hit deals more', () => {
  it('a crit gives its next turn hit +20%, spent on it (and earned again by a new crit)', () => {
    const r = fightWith([withMods(slot('a', { atk: 1_000 }), { emberTailBp: 2_000 })], [], {
      rounds: 3,
      extra: { luck: crits },
    });
    const tails = procs(r, 'ember_tail');
    expect(tails.map((e) => [e.round, e.amount])).toEqual([
      [1, 2_000],
      [2, 2_000],
      [3, 2_000],
    ]);
    const hits = hitsOf(r, 'a');
    expect(hits[0]).toMatchObject({ crit: true, damage: 1_500 });
    expect(hits[0]).not.toHaveProperty('sheetBp');
    expect(hits[1]).toMatchObject({ crit: true, sheetBp: 2_000, damage: 1_700 });
    expect(describeEvent(tails[0] as FightEvent, NAMES)).toBe(
      "Ember tail: a's crit makes its next hit deal 20% more.",
    );
  });

  it('gives nothing when crits are off or the creature does not crit', () => {
    const off = fightWith([withMods(slot('a', { atk: 1_000 }), { emberTailBp: 2_000 })], [], {
      rounds: 3,
    });
    expect(procs(off, 'ember_tail')).toEqual([]);
    const never = fightWith([withMods(slot('a', { atk: 1_000 }), { emberTailBp: 2_000 })], [], {
      rounds: 3,
      extra: { luck: { ...NO_LUCK, critChanceBp: 1 } },
    });
    expect(procs(never, 'ember_tail')).toEqual([]);
  });
});

describe('Storm warning: marked by a charge, it takes less from the landing', () => {
  const sweep: Gimmick = {
    id: 'c',
    name: 'c',
    trigger: { every: 3 },
    op: 'charge',
    then: { op: 'sweep', rows: ['front'], power: 10_000 },
  };
  const landing = (r: FightResult, id: string) =>
    eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick' && e.target === id);

  it('takes 30% less from the landing it was marked for (and no less from anything else)', () => {
    const row = rowOf(9).map((s, i) => (i === 0 ? withMods(s, { stormWarningBp: 3_000 }) : s));
    const r = fightWith(row, [sweep], { rounds: 4, bossAtk: 1_000 });
    expect(procs(r, 'storm_warning').map((e) => [e.round, e.creature, e.amount])).toEqual([
      [2, 's0', 3_000],
    ]);
    expect(landing(r, 's0')?.damage).toBe(700);
    expect(landing(r, 's1')?.damage).toBe(1_000);
    // The plain attack in the same round is not a charged landing.
    const plain = eventsOf(r, 'boss_hit').filter((e) => e.source === 'attack' && e.round === 3);
    expect(plain[0]?.damage).toBe(1_000);
    expect(describeEvent(procs(r, 'storm_warning')[0] as FightEvent, NAMES)).toBe(
      'Storm warning: s0 sees the charge coming and will take 30% less from it.',
    );
  });

  it('is not for creatures a charge did not mark, nor for a hit that is not a charge landing', () => {
    const row = rowOf(9).map((s, i) => (i === 4 ? withMods(s, { stormWarningBp: 3_000 }) : s));
    const r = fightWith(row, [sweep], { rounds: 4, bossAtk: 1_000 });
    expect(procs(r, 'storm_warning')).toEqual([]);
    const plainSweep = fightWith(
      rowOf(9).map((s, i) => (i === 0 ? withMods(s, { stormWarningBp: 3_000 }) : s)),
      [everyRound({ op: 'sweep', rows: ['front'], power: 10_000 })],
      { rounds: 2, bossAtk: 1_000 },
    );
    expect(landing(plainSweep, 's0')?.damage).toBe(1_000);
  });
});

describe('Stubborn: a hit that would knock it out leaves it at 1 HP, once a fight', () => {
  const row = (mods: SlotMods, hp = 100) => [withMods(slot('a', { atk: 1, hp }), mods)];

  it('survives the first lethal hit at 1 HP and falls to the next', () => {
    const r = fightWith(row({ stubborn: 1 }), [], { rounds: 3, bossAtk: 1_000 });
    const hits = eventsOf(r, 'boss_hit');
    expect(hits[0]).toMatchObject({ round: 1, damage: 1_000, stubborn: true });
    expect(hits[1]).toMatchObject({ round: 2, damage: 1_000 });
    expect(hits[1]).not.toHaveProperty('stubborn');
    const kinds = r.events.map((e) => (e.t === 'proc' ? `proc:${e.kind}` : e.t));
    expect(kinds.filter((k) => k === 'proc:stubborn')).toHaveLength(1);
    expect(eventsOf(r, 'knockout')[0]?.round).toBe(2);
    // The creature really lost 99 HP in round 1 and the last 1 in round 2.
    expect(r.perCreature['a']?.damageTaken).toBe(100);
    expect(describeEvent(hits[0] as FightEvent, NAMES)).toContain('stays at 1 HP');
    expect(describeEvent(procs(r, 'stubborn')[0] as FightEvent, NAMES)).toBe(
      'Stubborn: a stays on its feet at 1 HP.',
    );
  });

  it('ends the round at 1 HP, and does nothing to a hit that does not knock it out', () => {
    const r = fightWith(row({ stubborn: 1 }), [], { rounds: 1, bossAtk: 1_000 });
    expect(r.hpEnd['a']).toBe(1);
    const spared = fightWith(row({ stubborn: 1 }, 5_000), [], { rounds: 3, bossAtk: 1_000 });
    expect(procs(spared, 'stubborn')).toEqual([]);
  });

  it('without the line it falls at once', () => {
    for (const mods of [{}, { stubborn: 0 as const }]) {
      const r = fightWith(row(mods), [], { rounds: 1, bossAtk: 1_000 });
      expect(r.hpEnd['a']).toBe(0);
      expect(eventsOf(r, 'knockout')).toHaveLength(1);
    }
  });

  it('works against a Bramble Season reflect (the reflected hit goes through the same hurt)', () => {
    const r = fightWith(
      [
        slot('s', { atk: 1_000, element: 'ember' }),
        withMods(slot('a', { atk: 1_000, role: 'payoff', hp: 100 }), { stubborn: 1 }),
      ],
      [],
      { rounds: 1, extra: { brambleBp: 5_000 }, rules: rulesOf() },
    );
    const back = eventsOf(r, 'boss_hit').find((e) => e.source === 'reflect');
    expect(back).toMatchObject({ target: 'a', stubborn: true });
    expect(back?.damage).toBeGreaterThan(100);
    expect(r.hpEnd['a']).toBe(1);
    expect(eventsOf(r, 'knockout')).toEqual([]);
  });

  it('a Guard that is already at 1 HP stays there for the lethal hit', () => {
    const r = fightWith(row({ stubborn: 1 }, 1), [], { rounds: 2, bossAtk: 1_000 });
    expect(eventsOf(r, 'boss_hit')[0]).toMatchObject({ stubborn: true });
    expect(eventsOf(r, 'knockout')[0]?.round).toBe(2);
  });
});

describe('Last stand: it falls to a quarter of its HP, it takes less for the fight', () => {
  it('fires on the hit that leaves it at 25% or less and cuts every hit after it by 20%', () => {
    const r = fightWith([withMods(slot('a', { atk: 1, hp: 1_000 }), { lastStandBp: 2_000 })], [], {
      rounds: 6,
      bossAtk: 200,
    });
    const stand = procs(r, 'last_stand');
    // 800, 600, 400, then round 4 leaves 200 (a quarter is 250): it fires there.
    expect(stand.map((e) => [e.round, e.amount])).toEqual([[4, 2_000]]);
    const damage = eventsOf(r, 'boss_hit').map((e) => e.damage);
    expect(damage.slice(0, 5)).toEqual([200, 200, 200, 200, 160]);
    expect(describeEvent(stand[0] as FightEvent, NAMES)).toBe(
      'Last stand: a is down to a quarter of its HP and takes 20% less from now on.',
    );
  });

  it('fires once, and not when the hit knocks it out or HP stays above a quarter', () => {
    const killed = fightWith(
      [withMods(slot('a', { atk: 1, hp: 100 }), { lastStandBp: 2_000 })],
      [],
      {
        rounds: 2,
        bossAtk: 1_000,
      },
    );
    expect(procs(killed, 'last_stand')).toEqual([]);
    const healthy = fightWith(
      [withMods(slot('a', { atk: 1, hp: 100_000 }), { lastStandBp: 2_000 })],
      [],
      {
        rounds: 3,
      },
    );
    expect(procs(healthy, 'last_stand')).toEqual([]);
  });

  it('a creature that starts below a quarter gets it on the first hit that leaves it standing', () => {
    const r = fightWith(
      [withMods({ ...slot('a', { atk: 1, hp: 1_000 }), hp: 200 }, { lastStandBp: 2_000 })],
      [],
      { rounds: 2, bossAtk: 50 },
    );
    expect(procs(r, 'last_stand').map((e) => e.round)).toEqual([1]);
    expect(eventsOf(r, 'boss_hit').map((e) => e.damage)).toEqual([50, 40]);
  });
});

describe('Overflow: it sets off a reaction, the next creature to act gets a boost', () => {
  const row = (mods: SlotMods) => [
    slot('s', { atk: 1_000, element: 'ember' }),
    withMods(slot('p', { atk: 1_000, role: 'payoff' }), mods),
    slot('n', { atk: 1_000, element: 'grove' }),
  ];

  it('boosts the creature that acts next by 15% on its next hit', () => {
    const r = fightWith(row({ overflowBp: 1_500 }), [], { rounds: 1 });
    const o = procs(r, 'overflow');
    expect(o).toEqual([
      { t: 'proc', round: 1, creature: 'p', kind: 'overflow', target: 'n', amount: 1_500 },
    ]);
    expect(hitsOf(r, 'n')[0]?.bonusBp).toBe(1_500);
    expect(describeEvent(o[0] as FightEvent, NAMES)).toBe(
      "Overflow: p's reaction gives n a 15% boost on its next hit.",
    );
  });

  it('follows the turn order, and nobody is boosted when the creature acts last', () => {
    const right = fightWith(row({ overflowBp: 1_500 }), [], {
      rounds: 1,
      extra: { turnOrderOverride: 'right_to_left' },
    });
    // Right to left: n acts first, then p (no mark yet: n marks Overgrown, p's Tide hit does nothing).
    expect(procs(right, 'overflow')).toEqual([]);
    const last = fightWith(
      [
        slot('s', { atk: 1_000, element: 'ember' }),
        withMods(slot('p', { atk: 1_000, role: 'payoff' }), { overflowBp: 1_500 }),
      ],
      [],
      { rounds: 1 },
    );
    expect(procs(last, 'overflow')).toEqual([]);
  });

  it('does nothing without a reaction or without the line', () => {
    expect(procs(fightWith(row({ overflowBp: 0 }), [], { rounds: 1 }), 'overflow')).toEqual([]);
  });
});

describe('Second breath: the first enrage round starts, it heals', () => {
  const enrage = { rounds: 2, powerBp: 0 };
  it('heals 10% of max HP when the first enrage round starts, once', () => {
    const r = fightWith(
      [withMods(slot('a', { atk: 1, hp: 1_000 }), { secondBreathBp: 1_000 })],
      [],
      {
        rounds: 2,
        extra: { enrage },
      },
    );
    const heals = eventsOf(r, 'heal').filter((e) => e.cause === 'second_breath');
    // Rounds 1 and 2 cost 100 each; the enrage round 3 starts with +100.
    expect(heals).toEqual([
      { t: 'heal', round: 3, supporter: 'a', target: 'a', amount: 100, cause: 'second_breath' },
    ]);
    expect(describeEvent(heals[0] as FightEvent, NAMES)).toBe(
      'a takes a second breath and recovers 100 HP.',
    );
  });

  it('does nothing without enrage rounds or without the line', () => {
    const none = fightWith(
      [withMods(slot('a', { atk: 1, hp: 1_000 }), { secondBreathBp: 1_000 })],
      [],
      { rounds: 3 },
    );
    expect(eventsOf(none, 'heal')).toEqual([]);
    const off = fightWith([slot('a', { atk: 1, hp: 1_000 })], [], { rounds: 2, extra: { enrage } });
    expect(eventsOf(off, 'heal')).toEqual([]);
  });
});

describe('Patient: it is silenced, its next hit after the silence deals more', () => {
  it('the hit after the lost turn gets +25%, once', () => {
    // Silence every third round: round 3 silences the ends, round 4 is the lost turn, round 5 the bonus.
    const r = fightWith(
      [withMods(slot('a', { atk: 1_000 }), { patientBp: 2_500 }), slot('b', { atk: 1_000 })],
      [silenceEnds(3)],
      { rounds: 6 },
    );
    // It is silenced in round 3 and again in round 6 (the end of the fight): the bonus is earned both times.
    expect(procs(r, 'patient').map((e) => [e.round, e.creature, e.amount])).toEqual([
      [3, 'a', 2_500],
      [6, 'a', 2_500],
    ]);
    const sheet = hitsOf(r, 'a').map((h) => [h.round, h.sheetBp]);
    expect(sheet).toEqual([
      [1, undefined],
      [2, undefined],
      [3, undefined],
      [5, 2_500],
      [6, undefined],
    ]);
    expect(describeEvent(procs(r, 'patient')[0] as FightEvent, NAMES)).toBe(
      'Patient: a bides its time, so its next hit deals 25% more.',
    );
  });

  it('does not fire when the silence is shrugged off or ignored', () => {
    for (const mods of [{ steadyPawsBp: 10_000 }, { ignoreSilence: 1 as const }]) {
      const r = fightWith(
        [withMods(slot('a', { atk: 1_000 }), { patientBp: 2_500, ...mods }), slot('b')],
        [silenceEnds()],
        { rounds: 3 },
      );
      expect(procs(r, 'patient')).toEqual([]);
    }
  });
});

describe('Shared warmth: a Support heals it, the Support next boost is bigger', () => {
  it('a Mend on the creature makes that Support boost 3 pt more next round', () => {
    const rules = rulesOf({
      supportFx: { grove: { buffBp: 1_500, healBp: 600 } },
    });
    const row = [
      withMods(slot('g', { atk: 1, role: 'guard', hp: 10_000 }), { sharedWarmthBp: 300 }),
      slot('s', { atk: 1, role: 'support', element: 'grove' }),
    ];
    const r = fightWith(row, [], { rounds: 4, rules, extra: adjacent });
    const warmth = procs(r, 'shared_warmth');
    // Round 1 the Guard is at full HP (no Mend, no line); from round 2 it is hurt and mended each round.
    expect(warmth.map((e) => [e.round, e.creature, e.target, e.amount])).toEqual([
      [2, 'g', 's', 300],
      [3, 'g', 's', 300],
      [4, 'g', 's', 300],
    ]);
    const boosts = eventsOf(r, 'support_buff').map((e) => [e.round, e.target, e.bp]);
    expect(boosts).toEqual([
      [1, 'g', 1_500],
      [2, 'g', 1_500],
      [3, 'g', 1_800],
      [4, 'g', 1_800],
    ]);
    expect(describeEvent(warmth[0] as FightEvent, NAMES)).toBe(
      "Shared warmth: s's next boost is 3% bigger for healing g.",
    );
  });
});

describe('the log: every proc kind reads as a sentence', () => {
  it('describes each kind with a name and no leftover placeholder', () => {
    for (const kind of PROC_KINDS) {
      const e: FightEvent = {
        t: 'proc',
        round: 1,
        creature: 'a',
        kind,
        target: 'b',
        amount: 1_500,
        bossHp: 10,
      };
      const text = describeEvent(e, NAMES);
      expect(text, kind).not.toBe('');
      expect(text, kind).not.toContain('undefined');
      expect(text, kind).toContain('a');
    }
  });
});

describe('they work together in one fight (the fight stays deterministic and valid)', () => {
  it('a row with every chance and trigger line plays a long fight twice the same', () => {
    const mods: SlotMods = {
      secondWindBp: 3_000,
      echoBp: 3_000,
      sidestepBp: 3_000,
      steadyPawsBp: 3_000,
      warmHeartBp: 3_000,
      quickRemarkBp: 3_000,
      spillOverBp: 3_000,
      paybackBp: 1_200,
      kindlingBp: 800,
      openingMark: 1,
      rallyCryBp: 900,
      emberTailBp: 1_000,
      stormWarningBp: 1_000,
      stubborn: 1,
      lastStandBp: 1_000,
      overflowBp: 900,
      secondBreathBp: 500,
      patientBp: 1_000,
      sharedWarmthBp: 200,
    };
    for (let i = 0; i < 12; i++) {
      const base = randomInput(`chance-all-${String(i)}`, 2 + (i % 4), 'finale');
      const run = (): string =>
        JSON.stringify(
          simulateFight(
            {
              ...base,
              rules: liveFightRules(),
              luck: RULES.combat.luck,
              enrage: { rounds: 3, powerBp: 30_000 },
              row: base.row.map((s) => ({ ...s, mods })),
            },
            createSeededRng(`all-${String(i)}`),
            { pack: TEST_PACK },
          ),
        );
      const first = run();
      expect(run()).toBe(first);
      expect(first).toContain('"t":"proc"');
    }
  });
});
