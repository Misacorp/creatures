import {
  chartBp,
  type ContentPack,
  type Element,
  type FinaleAbilityDef,
  type Gimmick,
  type Rng,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  buildNames,
  describeEvent,
  simulateFight,
  type AbilityChoice,
  type FightInput,
  type FightOptions,
  type FightResult,
  type FightSlot,
  type SlotMods,
} from '../src/index';
import { BOSS, effectiveSpd } from '../src/fight-effects';
import type { Creature, FightState } from '../src/fight-state';
import { TEST_PACK, eventsOf, input, slot } from './helpers';

/**
 * Mire (`docs/design/speed-and-dodge.md` section 5): the reactions Smother and Flare with their riders,
 * the passive abilities of the Guard and Support lines, and the sheet fields of the debuff talents. With
 * no luck, no rules and no patterns the only dice a fight draws are the effect dice, so a scripted RNG
 * decides each extra-stack chance exactly.
 */

/** An RNG that hands out `values` in order, then 9999 (a die no chance below 100% beats). */
function scripted(values: readonly number[] = []): Rng {
  let i = 0;
  return {
    nextU32() {
      const v = values[i] ?? 9_999;
      i += 1;
      return v;
    },
  };
}

type Apply = Parameters<NonNullable<FightOptions['effectHook']>>[1];

interface Setup {
  rounds?: number;
  bossElement?: Element;
  bossAtk?: number;
  gimmicks?: Gimmick[];
  /** Effect dice per round; null: effects are off. */
  dice?: number | null;
  rng?: Rng;
  abilities?: AbilityChoice[];
  passives?: { creatureId: string; abilityId: string }[];
  pack?: ContentPack;
  hook?: (round: number, apply: Apply) => void;
}

function fight(row: FightSlot[], s: Setup = {}): FightResult {
  const base = input(row);
  const dice = s.dice === undefined ? 4 : s.dice;
  const inp: FightInput = {
    ...base,
    boss: {
      ...base.boss,
      element: s.bossElement ?? 'spark',
      gimmicks: s.gimmicks ?? [],
      finaleRounds: s.rounds ?? 1,
    },
    phase: 'finale',
    bossAtk: s.bossAtk ?? 100,
    bossHpPool: { max: 1_000_000_000, current: 1_000_000_000 },
    turnOrderOverride: 'left_to_right',
    finaleAbilities: s.abilities ?? [],
    ...(s.passives === undefined ? {} : { passives: s.passives }),
    ...(dice === null ? {} : { effects: { dice } }),
  };
  return simulateFight(inp, s.rng ?? scripted(), {
    pack: s.pack ?? TEST_PACK,
    ...(s.hook === undefined ? {} : { effectHook: s.hook }),
  });
}

const sturdy = (id: string, o: Parameters<typeof slot>[1] = {}): FightSlot =>
  slot(id, { atk: 1_000, hp: 1_000_000, ...o });
const withMods = (s: FightSlot, mods: SlotMods): FightSlot => ({ ...s, mods });

/** Runs `fn` in one round only. */
const once =
  (round: number, fn: (apply: Apply) => void) =>
  (r: number, apply: Apply): void => {
    if (r === round) fn(apply);
  };

const applies = (r: FightResult) => eventsOf(r, 'effect_apply');
const hitOf = (r: FightResult, creature: string) =>
  eventsOf(r, 'hit').find((h) => h.creature === creature);

describe('Smother', () => {
  // An Ember Setter leaves Scorched; the Mire creature after it sets off Smother.
  const row = () => [
    sturdy('ember', { element: 'ember', role: 'setter' }),
    sturdy('mire', { element: 'mire', role: 'guard' }),
  ];

  it('applies Mired to the boss at 100% power, with the reacting creature as the source', () => {
    const r = fight(row());
    expect(eventsOf(r, 'reaction').map((e) => e.reaction)).toEqual(['smother']);
    expect(applies(r)).toEqual([
      {
        t: 'effect_apply',
        round: 1,
        target: null,
        effect: 'mired',
        stacksAdded: 1,
        stacks: 1,
        turnsLeft: 3,
        source: 'mire',
      },
    ]);
    // The Mired lands after the hit: the reaction event comes first.
    const kinds = r.events.map((e) => e.t).filter((t) => t === 'reaction' || t === 'effect_apply');
    expect(kinds).toEqual(['reaction', 'effect_apply']);
  });

  it('stacks on a second Smother, and the log says it', () => {
    const r = fight(row(), { rounds: 2 });
    const stacks = applies(r).map((e) => e.stacks);
    expect(stacks).toEqual([1, 2]);
    const names = buildNames({ boss: input([]).boss, row: row() }, {}, TEST_PACK);
    const text = applies(r).map((e) => describeEvent(e, names));
    expect(text[1]).toBe('Tidal Colossus is Mired ×2 (3 turns).');
  });

  it('is a plain reaction when effects are off: same damage, nothing applied', () => {
    const off = fight(row(), { dice: null });
    const on = fight(row());
    expect(eventsOf(off, 'reaction').map((e) => e.reaction)).toEqual(['smother']);
    expect(applies(off)).toEqual([]);
    expect(hitOf(off, 'mire')?.damage).toBe(hitOf(on, 'mire')?.damage);
  });

  it('applies nothing when the hit is a reflected reaction', () => {
    const trap: Gimmick = {
      id: 'backdraft',
      name: 'Backdraft',
      trigger: { eachRound: true },
      op: 'reflect_first_reaction',
    };
    const r = fight(row(), { gimmicks: [trap] });
    const reaction = eventsOf(r, 'reaction')[0];
    expect(reaction?.reflected).toBe(true);
    expect(applies(r)).toEqual([]);
  });
});

describe('Flare', () => {
  // A Mire creature leaves Muddied; the Ember creature after it sets off Flare. The boss is Tide, so the
  // Ember hit is neutral... no: Ember into Tide is 75%, which only scales both fights the same.
  const row = () => [
    sturdy('mire', { element: 'mire', role: 'setter' }),
    sturdy('ember', { element: 'ember', role: 'payoff' }),
  ];
  const mired = (stacks: number) =>
    once(1, (apply) => {
      apply(null, 'mired', stacks * 10_000);
    });

  it('burns off every Mired stack and adds +20% of the reaction bonus for each', () => {
    const plain = fight(row(), { bossElement: 'spark' });
    const burned = fight(row(), { bossElement: 'spark', hook: mired(3) });
    expect(eventsOf(burned, 'reaction').map((e) => e.reaction)).toEqual(['flare']);
    const base = hitOf(plain, 'ember');
    const more = hitOf(burned, 'ember');
    if (base === undefined || more === undefined) throw new Error('no hit');
    // The plain hit (no luck, no bonus): Attack x the matchup.
    const matchup = chartBp(TEST_PACK.elementChart, 'ember', 'spark');
    const plainHit = Math.floor((1_000 * matchup) / 10_000);
    const bonus = base.damage - plainHit;
    expect(bonus).toBeGreaterThan(0);
    // Three stacks: the bonus is 160% of itself.
    expect(more.damage - plainHit).toBe(Math.floor((bonus * 16_000) / 10_000));
    expect(eventsOf(burned, 'effect_consume')).toEqual([
      {
        t: 'effect_consume',
        round: 1,
        reaction: 'flare',
        effect: 'mired',
        stacks: 3,
        bonusBp: 6_000,
      },
    ]);
    // The stacks are gone at once: nothing runs out later.
    expect(eventsOf(burned, 'effect_expire')).toEqual([]);
  });

  it('says it in the log: "Flare burns off Mired ×3!"', () => {
    const r = fight(row(), { hook: mired(3) });
    const names = buildNames({ boss: input([]).boss, row: row() }, {}, TEST_PACK);
    const consume = eventsOf(r, 'effect_consume')[0];
    if (consume === undefined) throw new Error('no consume');
    expect(describeEvent(consume, names)).toBe('Flare burns off Mired ×3!');
  });

  it('keeps the Mired of a fight where the reaction does not come (the stacks count down as usual)', () => {
    // Only the Mire creature: no Ember hit, so no Flare, and the effect stays until its turns run out.
    const r = fight([sturdy('mire', { element: 'mire', role: 'setter' })], {
      hook: mired(2),
      rounds: 4,
    });
    expect(eventsOf(r, 'effect_consume')).toEqual([]);
    expect(eventsOf(r, 'effect_expire')).toHaveLength(1);
  });

  it('is a plain reaction with no stacks, or with effects off', () => {
    const none = fight(row(), { bossElement: 'spark' });
    expect(eventsOf(none, 'reaction').map((e) => e.reaction)).toEqual(['flare']);
    expect(eventsOf(none, 'effect_consume')).toEqual([]);
    // Effects off: the hook cannot apply anything either, so the hit is the plain reaction.
    const off = fight(row(), { bossElement: 'spark', dice: null, hook: mired(3) });
    expect(eventsOf(off, 'effect_consume')).toEqual([]);
    expect(hitOf(off, 'ember')?.damage).toBe(hitOf(none, 'ember')?.damage);
  });

  it('does not burn the stacks of a reflected reaction', () => {
    const trap: Gimmick = {
      id: 'backdraft',
      name: 'Backdraft',
      trigger: { eachRound: true },
      op: 'reflect_first_reaction',
    };
    const r = fight(row(), { gimmicks: [trap], hook: mired(3) });
    expect(eventsOf(r, 'reaction')[0]?.reflected).toBe(true);
    expect(eventsOf(r, 'effect_consume')).toEqual([]);
  });
});

describe('the Guard passive (on_hit_taken)', () => {
  const choice = (abilityId: string, creatureId: string): AbilityChoice => ({
    playerId: 'p1',
    abilityId,
    key: `${creatureId}:ability`,
    creatureId,
  });
  /** The boss hits the front creature every round. */
  const slap: Gimmick = {
    id: 'slap',
    name: 'Slap',
    trigger: { eachRound: true },
    op: 'hit_zone',
    zone: 'front',
    power: 10_000,
  };
  const guard = () => sturdy('g', { element: 'mire', role: 'guard' });

  it('leaves Mired on the boss when the Guard takes a hit, at 60% power on the effect die', () => {
    const hit = fight([guard()], {
      gimmicks: [slap],
      abilities: [choice('mud-wall', 'g')],
      rng: scripted([5_999]),
    });
    expect(applies(hit)).toEqual([
      expect.objectContaining({ target: null, effect: 'mired', stacks: 1, source: 'g' }),
    ]);
    // A die of 6000 or more misses (60%).
    const miss = fight([guard()], {
      gimmicks: [slap],
      abilities: [choice('mud-wall', 'g')],
      rng: scripted([6_000]),
    });
    expect(applies(miss)).toEqual([]);
  });

  it('works from round 1, before the ability itself has fired', () => {
    // Mud Wall fires in round 3 at the earliest, in a fight of one round it never fires; the passive is on.
    const r = fight([guard()], {
      gimmicks: [slap],
      abilities: [choice('mud-wall', 'g')],
      rng: scripted([0]),
    });
    expect(eventsOf(r, 'ability')).toEqual([]);
    expect(applies(r)).toHaveLength(1);
  });

  it('is stronger on Bogwarden (80%)', () => {
    const r = fight([guard()], {
      gimmicks: [slap],
      abilities: [choice('bog-hold', 'g')],
      rng: scripted([7_999]),
    });
    expect(applies(r)).toHaveLength(1);
    const miss = fight([guard()], {
      gimmicks: [slap],
      abilities: [choice('bog-hold', 'g')],
      rng: scripted([8_000]),
    });
    expect(applies(miss)).toEqual([]);
  });

  it('applies once for each hit the Guard takes, in every round', () => {
    // No move: only the boss's plain attack, which here lands on the Guard.
    const r = fight([sturdy('a', { role: 'payoff' }), guard()], {
      abilities: [choice('mud-wall', 'g')],
      rounds: 2,
      dice: 1,
      rng: scripted([0, 0]),
    });
    const taken = eventsOf(r, 'boss_hit').filter((h) => h.source === 'attack');
    expect(taken.map((h) => h.target)).toEqual(['g', 'g']);
    expect(applies(r).map((e) => [e.round, e.source])).toEqual([
      [1, 'g'],
      [2, 'g'],
    ]);
  });

  it('applies nothing when effects are off, and nothing for a creature without the ability', () => {
    const off = fight([guard()], {
      gimmicks: [slap],
      abilities: [choice('mud-wall', 'g')],
      dice: null,
    });
    expect(applies(off)).toEqual([]);
    expect(eventsOf(off, 'boss_hit').length).toBeGreaterThan(0);
    const bare = fight([guard()], { gimmicks: [slap] });
    expect(applies(bare)).toEqual([]);
  });

  it('applies nothing for a hit that deals no damage because a Shield Wall stopped it', () => {
    const stop: AbilityChoice = {
      playerId: 'p1',
      abilityId: 'shield-wall',
      key: 'p1:basic',
      fireAtRound: 1,
      // A row of one stands in the middle zone.
      params: { zone: 'middle' },
    };
    const r = fight([guard()], {
      gimmicks: [slap],
      abilities: [choice('mud-wall', 'g'), stop],
      rng: scripted([0]),
    });
    const hit = eventsOf(r, 'boss_hit').find((h) => h.source === 'gimmick');
    expect(hit?.shielded).toBe(true);
    expect(applies(r)).toEqual([]);
  });
});

describe('the Guard passive on a hit that deals no damage', () => {
  it('does not fire when the hit is cut to 0 damage', () => {
    const nothing: Gimmick = {
      id: 'tap',
      name: 'Tap',
      trigger: { eachRound: true },
      op: 'hit_zone',
      zone: 'front',
      power: 10_000,
    };
    // A full ward against the boss's element cuts every hit to 0.
    const warded = withMods(sturdy('g', { element: 'mire', role: 'guard' }), {
      wardBp: { spark: 10_000 },
    });
    const r = fight([warded], {
      gimmicks: [nothing],
      abilities: [{ playerId: 'p1', abilityId: 'mud-wall', key: 'g:ability', creatureId: 'g' }],
      rng: scripted([0]),
    });
    const hits = eventsOf(r, 'boss_hit');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.damage === 0)).toBe(true);
    expect(applies(r)).toEqual([]);
  });
});

describe('passives without a finale choice (Phases 1 and 2)', () => {
  const slap: Gimmick = {
    id: 'slap',
    name: 'Slap',
    trigger: { eachRound: true },
    op: 'hit_zone',
    zone: 'front',
    power: 10_000,
  };
  const guard = () => sturdy('g', { element: 'mire', role: 'guard' });

  it('works from `passives` alone: the effect lands, but the ability never fires', () => {
    const r = fight([guard()], {
      gimmicks: [slap],
      passives: [{ creatureId: 'g', abilityId: 'mud-wall' }],
      rounds: 4,
      rng: scripted([0]),
    });
    expect(applies(r)).toHaveLength(1);
    expect(eventsOf(r, 'ability')).toEqual([]);
    // Its Shield Wall is not on: the hit is not shielded, in any round.
    expect(eventsOf(r, 'boss_hit').some((h) => h.shielded === true)).toBe(false);
  });

  it('works for a Support too, and counts once when the ability is also a finale choice', () => {
    const support = () => sturdy('s', { element: 'mire', role: 'support' });
    const alone = fight([support()], {
      passives: [{ creatureId: 's', abilityId: 'squelch-song' }],
      rounds: 2,
      dice: 1,
      rng: scripted([0, 0]),
    });
    expect(applies(alone).map((e) => [e.round, e.stacks])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    const both = fight([support()], {
      passives: [{ creatureId: 's', abilityId: 'squelch-song' }],
      abilities: [{ playerId: 'p1', abilityId: 'squelch-song', key: 's:ability', creatureId: 's' }],
      rounds: 2,
      dice: 1,
      rng: scripted([0, 0]),
    });
    expect(applies(both).map((e) => [e.round, e.stacks])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it('refuses an unknown ability or creature', () => {
    expect(() => fight([guard()], { passives: [{ creatureId: 'g', abilityId: 'nope' }] })).toThrow(
      /passive/,
    );
    expect(() =>
      fight([guard()], { passives: [{ creatureId: 'x', abilityId: 'mud-wall' }] }),
    ).toThrow(/passive/);
  });
});

describe('the Support passive (round_start)', () => {
  const choice = (abilityId: string): AbilityChoice => ({
    playerId: 'p1',
    abilityId,
    key: 's:ability',
    creatureId: 's',
  });
  const support = (mods?: SlotMods) => {
    const s = sturdy('s', { element: 'mire', role: 'support' });
    return mods === undefined ? s : withMods(s, mods);
  };

  it('leaves Mired on the boss each round with its Support action', () => {
    const r = fight([support(), sturdy('a')], {
      abilities: [choice('squelch-song')],
      rounds: 3,
      dice: 1,
      rng: scripted([0, 0, 0]),
    });
    expect(applies(r).map((e) => [e.round, e.stacks, e.source])).toEqual([
      [1, 1, 's'],
      [2, 2, 's'],
      [3, 3, 's'],
    ]);
  });

  it('draws one effect die for each application: 60% for Squelch, 80% for Croakmire', () => {
    const miss = fight([support()], {
      abilities: [choice('squelch-song')],
      rng: scripted([6_000]),
    });
    expect(applies(miss)).toEqual([]);
    const hit = fight([support()], { abilities: [choice('deep-croak')], rng: scripted([7_999]) });
    expect(applies(hit)).toHaveLength(1);
    const miss2 = fight([support()], { abilities: [choice('deep-croak')], rng: scripted([8_000]) });
    expect(applies(miss2)).toEqual([]);
  });

  it('does nothing with effects off, when knocked out, or without the ability', () => {
    expect(
      applies(fight([support()], { abilities: [choice('squelch-song')], dice: null })),
    ).toEqual([]);
    const dead = withMods(slot('s', { element: 'mire', role: 'support', hp: 0 }), {});
    expect(
      applies(
        fight([dead, sturdy('a')], { abilities: [choice('squelch-song')], rng: scripted([0]) }),
      ),
    ).toEqual([]);
    expect(applies(fight([support()]))).toEqual([]);
  });

  it('is skipped while the Support is silenced (it loses its action)', () => {
    const silence: Gimmick = {
      id: 'hush',
      name: 'Hush',
      trigger: { eachRound: true },
      op: 'silence_ends',
      scope: 'row',
      turns: 2,
    };
    const r = fight([support()], {
      abilities: [choice('squelch-song')],
      gimmicks: [silence],
      rounds: 3,
      rng: scripted([0, 0, 0]),
    });
    // Round 1 happens before the boss silences it; after that it is silenced for the rest.
    expect(applies(r).map((e) => e.round)).toEqual([1]);
  });
});

describe('the sheet fields of the debuff talents', () => {
  const mired = (target: string, power: number) =>
    once(1, (apply) => {
      apply(target, 'mired', power);
    });

  it('debuffResistBp cuts the per-stack numbers of debuffs on the wearer (Mired x2: -6% becomes -3%)', () => {
    const bare = fight([sturdy('a')], { hook: mired('a', 20_000) });
    const coated = fight([withMods(sturdy('a'), { debuffResistBp: 5_000 })], {
      hook: mired('a', 20_000),
    });
    expect(hitOf(bare, 'a')?.effectBp).toBe(-600);
    expect(hitOf(coated, 'a')?.effectBp).toBe(-300);
    // Full resistance: the stacks are there but weigh nothing.
    const immune = fight([withMods(sturdy('a'), { debuffResistBp: 10_000 })], {
      hook: mired('a', 20_000),
    });
    expect(hitOf(immune, 'a')?.effectBp).toBeUndefined();
    expect(hitOf(immune, 'a')?.damage).toBe(hitOf(fight([sturdy('a')]), 'a')?.damage);
  });

  it('debuffResistBp also protects Speed (effectiveSpd)', () => {
    const state = {
      effectDefs: new Map(TEST_PACK.statusEffects.map((e) => [e.id, e])),
      boss: {},
      bossEffects: [],
    } as unknown as FightState;
    const creature = (resist: number): Creature =>
      ({
        spd: 100,
        mods: { debuffResistBp: resist },
        effects: [{ id: 'mired', stacks: 5, turnsLeft: 1 }],
      }) as unknown as Creature;
    // 5 x -3% = -15%: 85. With 50% resist each stack is -1.5%: 5 x -1.5% = -7.5%, so 92 (rounded down).
    expect(effectiveSpd(state, creature(0))).toBe(85);
    expect(effectiveSpd(state, creature(5_000))).toBe(92);
    // The boss has no sheet: its debuffs are never cut.
    expect(effectiveSpd(state, BOSS)).toBe(0);
  });

  it('debuffPowerBp and debuffDurationTurns make the debuffs a creature applies stronger and longer', () => {
    const plain = fight([withMods(sturdy('s', { element: 'mire', role: 'support' }), {})], {
      abilities: [{ playerId: 'p1', abilityId: 'squelch-song', key: 'k', creatureId: 's' }],
      rng: scripted([9_000]),
    });
    expect(applies(plain)).toEqual([]);
    // +40% power turns the 60% of Squelch Song into a sure stack (60% + 40% = 100%), +2 turns on top.
    const boosted = fight(
      [
        withMods(sturdy('s', { element: 'mire', role: 'support' }), {
          debuffPowerBp: 4_000,
          debuffDurationTurns: 2,
        }),
      ],
      {
        abilities: [{ playerId: 'p1', abilityId: 'squelch-song', key: 'k', creatureId: 's' }],
        rng: scripted([9_000]),
      },
    );
    expect(applies(boosted)).toEqual([
      expect.objectContaining({ stacksAdded: 1, stacks: 1, turnsLeft: 5, source: 's' }),
    ]);
  });

  it('does not change what the boss applies, or a buff', () => {
    // A boss move has no source creature, so no sheet is read.
    const hook = once(1, (apply) => {
      apply(null, 'mired', 10_000);
    });
    const r = fight([withMods(sturdy('a'), { debuffPowerBp: 50_000, debuffDurationTurns: 5 })], {
      hook,
    });
    expect(applies(r)).toEqual([expect.objectContaining({ stacks: 1, turnsLeft: 3 })]);
  });
});

describe('passive abilities and the prefix property', () => {
  const PASSIVE: FinaleAbilityDef = {
    id: 'test-passive',
    name: 'Test Passive',
    description: 'Mires the boss whenever it takes a hit.',
    kind: 'creature',
    effects: [{ op: 'on_hit_taken', apply: { effect: 'mired', powerBp: 10_000 } }],
    defaultRound: 5,
  };
  const pack: ContentPack = {
    ...TEST_PACK,
    finaleAbilities: [...TEST_PACK.finaleAbilities, PASSIVE],
  };
  const slap: Gimmick = {
    id: 'slap',
    name: 'Slap',
    trigger: { eachRound: true },
    op: 'hit_zone',
    zone: 'front',
    power: 10_000,
  };

  it('does not depend on the round the ability fires in: only its own event moves', () => {
    const at = (round: number | undefined): FightResult =>
      fight([sturdy('g', { role: 'guard' })], {
        pack,
        gimmicks: [slap],
        rounds: 8,
        abilities: [
          {
            playerId: 'p1',
            abilityId: 'test-passive',
            key: 'k',
            creatureId: 'g',
            ...(round === undefined ? {} : { fireAtRound: round }),
          },
        ],
      });
    const early = at(2);
    const late = at(7);
    const dflt = at(undefined);
    const withoutAbilityEvents = (r: FightResult) => r.events.filter((e) => e.t !== 'ability');
    expect(withoutAbilityEvents(late)).toEqual(withoutAbilityEvents(early));
    expect(withoutAbilityEvents(dflt)).toEqual(withoutAbilityEvents(early));
    expect(eventsOf(early, 'ability').map((e) => e.round)).toEqual([2]);
    expect(eventsOf(late, 'ability').map((e) => e.round)).toEqual([7]);
    // The passive really did something in round 1.
    expect(applies(early)[0]?.round).toBe(1);
  });

  it('needs a creature, like a strike', () => {
    expect(() =>
      fight([sturdy('g', { role: 'guard' })], {
        pack,
        abilities: [{ playerId: 'p1', abilityId: 'test-passive', key: 'k' }],
      }),
    ).toThrow(/needs a creature/);
  });
});
