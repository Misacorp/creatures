import { RULES, type Gimmick, type Rng, type StatusEffectDef } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  buildNames,
  describeEvent,
  simulateFight,
  type FightEvent,
  type FightInput,
  type FightOptions,
  type FightResult,
  type FightSlot,
  bossWarnings,
} from '../src/index';
import { BOSS, effectiveSpd } from '../src/fight-effects';
import { NO_MODS } from '../src/mods';
import type { Creature, FightState } from '../src/fight-state';
import { TEST_PACK, eventsOf, input, slot } from './helpers';
import { everyRound, rulesOf } from './pattern-helpers';

/**
 * Status effects (`combat-rules.md` 13). With no luck, no rules and no patterns the only dice a fight
 * draws are the effect dice, so a scripted RNG decides each extra-stack chance exactly.
 */

const BUFF: StatusEffectDef = {
  id: 'zeal',
  name: 'Zeal',
  kind: 'buff',
  maxStacks: 2,
  turns: 2,
  perStack: { damageDealtBp: 2_000 },
};
const SLOW: StatusEffectDef = {
  id: 'sluggish',
  name: 'Sluggish',
  kind: 'debuff',
  maxStacks: 3,
  turns: 2,
  perStack: { spdBp: -1_000 },
};
const PACK = { ...TEST_PACK, statusEffects: [...TEST_PACK.statusEffects, BUFF, SLOW] };

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
  bossAtk?: number;
  gimmicks?: Gimmick[];
  dice?: number | null;
  rng?: Rng;
  extra?: Partial<FightInput>;
  hook?: (round: number, apply: Apply) => void;
  pool?: number;
}

function fight(row: FightSlot[], s: Setup = {}): FightResult {
  const base = input(row);
  const dice = s.dice === undefined ? 4 : s.dice;
  const inp: FightInput = {
    ...base,
    boss: { ...base.boss, gimmicks: s.gimmicks ?? [], finaleRounds: s.rounds ?? 1 },
    phase: 'finale',
    bossAtk: s.bossAtk ?? 100,
    bossHpPool: { max: s.pool ?? 1_000_000_000, current: s.pool ?? 1_000_000_000 },
    turnOrderOverride: 'left_to_right',
    ...(dice === null ? {} : { effects: { dice } }),
    ...s.extra,
  };
  return simulateFight(inp, s.rng ?? scripted(), {
    pack: PACK,
    ...(s.hook === undefined ? {} : { effectHook: s.hook }),
  });
}

const sturdy = (id: string, o: Parameters<typeof slot>[1] = {}): FightSlot =>
  slot(id, { atk: 1_000, hp: 1_000_000, ...o });

/** Applies in one round only. */
const once =
  (round: number, fn: (apply: Apply) => void) =>
  (r: number, apply: Apply): void => {
    if (r === round) fn(apply);
  };

const applies = (r: FightResult) => eventsOf(r, 'effect_apply');

describe('application power', () => {
  const cases: [string, number, number, number | null][] = [
    // [name, power, die, stacks added (null: a miss)]
    ['100% is one stack, whatever the die', 10_000, 9_999, 1],
    ['200% is two stacks', 20_000, 9_999, 2],
    ['140% with a die under 40%', 14_000, 3_999, 2],
    ['140% with a die at 40%', 14_000, 4_000, 1],
    ['60% with a die under 60%', 6_000, 5_999, 1],
    ['60% with a die at 60%', 6_000, 6_000, null],
    ['0% is a miss', 0, 0, null],
  ];
  for (const [name, power, die, added] of cases) {
    it(name, () => {
      const r = fight([sturdy('a')], {
        dice: 1,
        rng: scripted([die]),
        hook: once(1, (apply) => {
          apply(null, 'mired', power);
        }),
      });
      if (added === null) expect(applies(r)).toEqual([]);
      else {
        expect(applies(r)).toEqual([
          {
            t: 'effect_apply',
            round: 1,
            target: null,
            effect: 'mired',
            stacksAdded: added,
            stacks: added,
            turnsLeft: 3,
          },
        ]);
      }
    });
  }

  it('takes the effect dice in order, one for each application with a fractional power', () => {
    const row = [sturdy('a'), sturdy('b'), sturdy('c')];
    const r = fight(row, {
      dice: 3,
      rng: scripted([5_000, 0, 9_000]),
      hook: once(1, (apply) => {
        apply('a', 'mired', 10_000); // a whole stack: takes no die
        apply('b', 'mired', 6_000); // die 5000: lands
        apply('c', 'mired', 6_000); // die 0: lands
        apply(null, 'mired', 6_000); // die 9000: misses
      }),
    });
    expect(applies(r).map((e) => [e.target, e.stacksAdded])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ]);
  });

  it('counts a chance as a miss once the round`s dice are spent', () => {
    const r = fight([sturdy('a')], {
      dice: 1,
      rng: scripted([0]),
      hook: once(1, (apply) => {
        apply(null, 'mired', 5_000); // the one die, 0: lands
        apply(null, 'mired', 5_000); // spent: a miss, however lucky
      }),
    });
    expect(applies(r)).toHaveLength(1);
  });

  it('draws a fresh pool every round', () => {
    const r = fight([sturdy('a')], {
      rounds: 2,
      dice: 1,
      rng: scripted([9_000, 0]),
      hook: (_, apply) => {
        apply('a', 'sluggish', 5_000);
      },
    });
    // Round 1's die is 9000 (a miss), round 2's die is 0 (lands).
    expect(applies(r).map((e) => e.round)).toEqual([2]);
  });

  it('adds nothing in a fight with effects off', () => {
    const r = fight([sturdy('a')], {
      dice: null,
      hook: once(1, (apply) => {
        apply(null, 'mired', 20_000);
      }),
    });
    expect(applies(r)).toEqual([]);
  });

  it('rejects an unknown effect and a bad power', () => {
    const bad = (effect: string, power: number) => () =>
      fight([sturdy('a')], {
        hook: once(1, (apply) => {
          apply(null, effect, power);
        }),
      });
    expect(bad('nope', 10_000)).toThrow(/unknown status effect/);
    expect(bad('mired', -1)).toThrow(RangeError);
    expect(bad('mired', 1.5)).toThrow(RangeError);
  });

  it('adds a duration bonus from the source', () => {
    const r = fight([sturdy('a')], {
      hook: once(1, (apply) => {
        apply(null, 'mired', 10_000, 2);
      }),
    });
    expect(applies(r)[0]?.turnsLeft).toBe(5);
  });

  it('validates the dice count of the input', () => {
    expect(() => fight([sturdy('a')], { dice: 0 })).toThrow(/effects.dice/);
    expect(() => fight([sturdy('a')], { dice: 257 })).toThrow(/effects.dice/);
  });
});

describe('stacks, the cap and refresh', () => {
  it('adds stacks up to the cap and says how many it really added', () => {
    const r = fight([sturdy('a')], {
      hook: once(1, (apply) => {
        apply(null, 'mired', 20_000);
        apply(null, 'mired', 20_000);
        apply(null, 'mired', 20_000);
        apply(null, 'mired', 20_000);
      }),
    });
    expect(applies(r).map((e) => [e.stacksAdded, e.stacks])).toEqual([
      [2, 2],
      [2, 4],
      [1, 5],
      [0, 5],
    ]);
  });

  it('refreshes the timer to full on any landed application, even at the cap', () => {
    const r = fight([sturdy('a')], {
      rounds: 3,
      hook: (round, apply) => {
        if (round === 1) apply(null, 'mired', 50_000);
        if (round === 2) apply(null, 'mired', 10_000);
      },
    });
    const [first, second] = applies(r);
    expect([first?.stacks, first?.turnsLeft]).toEqual([5, 3]);
    // Round 1's boss turn took one turn off; round 2's application is at the cap and refreshes.
    expect([second?.stacksAdded, second?.stacks, second?.turnsLeft]).toEqual([0, 5, 3]);
    // So it ends at the end of round 4's boss turn, not round 3's (outside this 3 round fight).
    expect(eventsOf(r, 'effect_expire')).toEqual([]);
  });

  it('changes nothing on a missed application', () => {
    const r = fight([sturdy('a')], {
      rounds: 3,
      dice: 1,
      rng: scripted([9_999, 9_999, 9_999]),
      hook: (round, apply) => {
        if (round === 1) apply(null, 'mired', 10_000);
        if (round === 2) apply(null, 'mired', 5_000); // misses: no event, no refresh
      },
    });
    expect(applies(r)).toHaveLength(1);
    // Applied in round 1 for 3 turns, so it still ends at the end of round 3.
    expect(eventsOf(r, 'effect_expire').map((e) => e.round)).toEqual([3]);
  });

  it('keeps each effect on its own timer', () => {
    const r = fight([sturdy('a')], {
      rounds: 3,
      hook: once(1, (apply) => {
        apply(null, 'mired', 10_000); // 3 turns
        apply(null, 'sluggish', 10_000); // 2 turns
      }),
    });
    expect(eventsOf(r, 'effect_expire').map((e) => [e.round, e.effect])).toEqual([
      [2, 'sluggish'],
      [3, 'mired'],
    ]);
  });
});

describe('the countdown runs on the target`s own turns', () => {
  it('counts the boss down once a round and drops all its stacks together', () => {
    const r = fight([sturdy('a'), sturdy('b')], {
      rounds: 4,
      hook: once(1, (apply) => {
        apply(null, 'mired', 40_000);
      }),
    });
    // 3 turns from round 1: rounds 1, 2 and 3. One expiry for all four stacks.
    expect(eventsOf(r, 'effect_expire')).toEqual([
      { t: 'effect_expire', round: 3, target: null, effect: 'mired' },
    ]);
  });

  it('counts a creature down at the end of its own turn', () => {
    const r = fight([sturdy('a'), sturdy('b')], {
      rounds: 4,
      hook: once(1, (apply) => {
        apply('b', 'mired', 10_000);
      }),
    });
    const expire = eventsOf(r, 'effect_expire');
    expect(expire.map((e) => [e.round, e.target])).toEqual([[3, 'b']]);
    // It falls off after b's own turn, which is after a's in the same round.
    const turns = r.events.filter((e) => e.t === 'turn' && e.round === 3).map((e) => e.t);
    expect(turns).toHaveLength(2);
    const at = r.events.indexOf(expire[0] as FightEvent);
    const bTurn = r.events.findIndex((e) => e.t === 'turn' && e.round === 3 && e.creature === 'b');
    expect(at).toBeGreaterThan(bTurn);
  });

  it('counts a silenced skip as a turn', () => {
    const silence = everyRound({ op: 'silence_ends', scope: 'row', turns: 1 }, 'mute');
    const r = fight([sturdy('a'), sturdy('b')], {
      rounds: 5,
      gimmicks: [silence],
      hook: once(2, (apply) => {
        apply('b', 'mired', 10_000);
      }),
    });
    // Silenced again every round, b skips rounds 2, 3 and 4: the third skipped turn ends the effect.
    const expire = eventsOf(r, 'effect_expire');
    expect(expire.map((e) => [e.round, e.target])).toEqual([[4, 'b']]);
    expect(
      r.events.filter((e) => e.t === 'skip' && e.round === 4 && e.creature === 'b'),
    ).toHaveLength(1);
  });

  it('counts a Morning Haze skip as a turn', () => {
    const r = fight([sturdy('a'), sturdy('b')], {
      rounds: 4,
      extra: { skipFirstTurn: ['b'] },
      hook: once(1, (apply) => {
        apply('b', 'mired', 10_000);
      }),
    });
    // Round 1 (hazed) counts: rounds 1, 2, 3.
    expect(eventsOf(r, 'effect_expire').map((e) => [e.round, e.target])).toEqual([[3, 'b']]);
  });

  it('gives the boss no turn once it has fallen', () => {
    const r = fight([sturdy('a', { atk: 10_000 })], {
      pool: 100,
      hook: once(1, (apply) => {
        apply(null, 'mired', 10_000);
      }),
    });
    expect(r.bossHpEnd).toBe(0);
    expect(eventsOf(r, 'effect_expire')).toEqual([]);
  });

  it('ends a knocked-out creature`s effects at once, with no event', () => {
    const r = fight([sturdy('a', { hp: 1 }), sturdy('b')], {
      rounds: 4,
      bossAtk: 100,
      hook: (round, apply) => {
        if (round === 1) apply('a', 'mired', 10_000);
        if (round === 2) apply('a', 'mired', 10_000); // a is down by now: nothing lands
      },
    });
    expect(eventsOf(r, 'knockout').map((e) => e.creature)).toEqual(['a']);
    expect(applies(r).map((e) => [e.round, e.target])).toEqual([[1, 'a']]);
    expect(eventsOf(r, 'effect_expire')).toEqual([]);
  });
});

describe('what stacks do to the numbers', () => {
  const plain = Math.floor((1_000 * RULES.combat.bossAttackBp) / 10_000);

  it('lowers every boss hit while the boss has damageDealtBp stacks', () => {
    const run = (hook?: (round: number, apply: Apply) => void) =>
      fight([sturdy('a')], { rounds: 4, bossAtk: 1_000, ...(hook === undefined ? {} : { hook }) });
    const damage = (r: FightResult) =>
      eventsOf(r, 'boss_hit')
        .filter((e) => e.source === 'attack')
        .map((e) => e.damage);
    expect(damage(run())).toEqual([plain, plain, plain, plain]);
    // Five stacks of Mired: -15%, for the boss turns of rounds 1 to 3, then it wears off.
    const cut = Math.floor((plain * 8_500) / 10_000);
    expect(
      damage(
        run(
          once(1, (apply) => {
            apply(null, 'mired', 50_000);
          }),
        ),
      ),
    ).toEqual([cut, cut, cut, plain]);
  });

  it('lowers a boss move too', () => {
    const r = fight([sturdy('a'), sturdy('b')], {
      bossAtk: 1_000,
      gimmicks: [everyRound({ op: 'hit_zone', zone: 'middle', power: 10_000 })],
      hook: once(1, (apply) => {
        apply(null, 'mired', 50_000);
      }),
    });
    const hits = eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick');
    expect(hits.map((e) => e.damage)).toEqual([850, 850]);
  });

  it('lowers a creature`s hit and shows the share in the log', () => {
    const run = (hook?: (round: number, apply: Apply) => void) =>
      eventsOf(fight([sturdy('a')], { ...(hook === undefined ? {} : { hook }) }), 'hit')[0];
    const base = run();
    expect(base?.damage).toBe(1_000);
    expect(base?.effectBp).toBeUndefined();
    const slowed = run(
      once(1, (apply) => {
        apply('a', 'mired', 50_000);
      }),
    );
    expect(slowed?.damage).toBe(850);
    expect(slowed?.effectBp).toBe(-1_500);
    expect(slowed?.bonusBp).toBe(-1_500);
  });

  it('works for a buff: positive damageDealtBp adds', () => {
    const hits = (stacks: number) =>
      eventsOf(
        fight([sturdy('a')], {
          hook: once(1, (apply) => {
            apply('a', 'zeal', stacks * 10_000);
          }),
        }),
        'hit',
      )[0]?.damage;
    expect(hits(1)).toBe(1_200);
    expect(hits(2)).toBe(1_400);
    expect(hits(5)).toBe(1_400); // capped at 2 stacks
  });

  it('adds up the stacks of different effects in one combined bonus with the other bonuses', () => {
    const r = fight([sturdy('a')], {
      hook: once(1, (apply) => {
        apply('a', 'zeal', 10_000); // +20%
        apply('a', 'mired', 20_000); // -6%
      }),
    });
    const hit = eventsOf(r, 'hit')[0];
    expect(hit?.effectBp).toBe(1_400);
    expect(hit?.damage).toBe(1_140);
  });

  it('folds Speed in with effectiveSpd (dodge reads it)', () => {
    const state = {
      effectDefs: new Map(PACK.statusEffects.map((e) => [e.id, e])),
      boss: {},
      bossEffects: [{ id: 'mired', stacks: 5, turnsLeft: 3 }],
    } as unknown as FightState;
    const c = {
      spd: 100,
      mods: NO_MODS,
      effects: [
        { id: 'mired', stacks: 3, turnsLeft: 1 },
        { id: 'sluggish', stacks: 3, turnsLeft: 1 },
      ],
    } as unknown as Creature;
    // -9% and -30%: 100 x 61%.
    expect(effectiveSpd(state, c)).toBe(61);
    expect(effectiveSpd(state, { ...c, effects: [] })).toBe(100);
    // A boss without a `baseSpd` has no Speed; with one, its effects (Mired, 5 x -3%) fold in.
    expect(effectiveSpd(state, BOSS)).toBe(0);
    const fast = { ...state, boss: { baseSpd: 200 } } as unknown as FightState;
    expect(effectiveSpd(fast, BOSS)).toBe(170);
  });
});

describe('purge and cleanse', () => {
  it('purges the boss`s debuffs in its move order, and keeps its buffs', () => {
    const purge = everyRound({ op: 'purge' }, 'wash');
    const hitter = everyRound({ op: 'hit_zone', zone: 'middle', power: 10_000 }, 'blow');
    const r = fight([sturdy('a')], {
      bossAtk: 1_000,
      gimmicks: [purge, hitter],
      hook: once(1, (apply) => {
        apply(null, 'mired', 50_000);
        apply(null, 'zeal', 10_000);
      }),
    });
    expect(eventsOf(r, 'effect_purge')).toEqual([
      { t: 'effect_purge', round: 1, removed: [{ effect: 'mired', stacks: 5 }] },
    ]);
    // The purge comes first in the boss's list, so the move after it is no longer cut by Mired
    // (full 1000), and Zeal (a buff, +20%) is still there.
    expect(eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick')?.damage).toBe(1_200);
  });

  it('writes no purge event when there is nothing to remove, and the buff stays', () => {
    const r = fight([sturdy('a')], {
      rounds: 3,
      gimmicks: [{ id: 'wash', name: 'wash', trigger: { every: 2 }, op: 'purge' }],
      hook: once(1, (apply) => {
        apply(null, 'zeal', 10_000);
      }),
    });
    expect(eventsOf(r, 'effect_purge')).toEqual([]);
    expect(eventsOf(r, 'gimmick').map((e) => e.round)).toEqual([2]);
    // The buff ends on its own timer (2 turns), not by the purge.
    expect(eventsOf(r, 'effect_expire').map((e) => [e.round, e.effect])).toEqual([[2, 'zeal']]);
  });

  it('lets a cleanse remove a neighbour`s debuffs but not its buffs', () => {
    const rules = rulesOf({ supportFx: { tide: { cleanse: true } } });
    const row = [sturdy('a'), sturdy('s', { role: 'support', element: 'tide' })];
    const r = fight(row, {
      rounds: 3,
      extra: { rules },
      hook: once(1, (apply) => {
        apply('a', 'mired', 30_000);
        apply('a', 'zeal', 10_000);
        apply('s', 'mired', 10_000); // the Support does not cleanse itself
      }),
    });
    expect(eventsOf(r, 'effect_cleanse')).toEqual([
      {
        t: 'effect_cleanse',
        round: 1,
        supporter: 's',
        target: 'a',
        effect: 'mired',
        stacks: 3,
      },
    ]);
    // The buff was untouched: it still runs out on its own after 2 of a's turns.
    expect(eventsOf(r, 'effect_expire').map((e) => [e.round, e.target, e.effect])).toEqual([
      [2, 'a', 'zeal'],
      [3, 's', 'mired'],
    ]);
  });

  it('does not cleanse without a cleansing Support', () => {
    const rules = rulesOf({ supportFx: { ember: {} } });
    const row = [sturdy('a'), sturdy('s', { role: 'support', element: 'ember' })];
    const r = fight(row, {
      extra: { rules },
      hook: once(1, (apply) => {
        apply('a', 'mired', 10_000);
      }),
    });
    expect(eventsOf(r, 'effect_cleanse')).toEqual([]);
  });
});

describe('the forecast', () => {
  it('has no warning for a purge, which aims at nobody', () => {
    const base = input([sturdy('a')]).boss;
    const boss = { ...base, gimmicks: [everyRound({ op: 'purge' }, 'wash')] };
    expect(bossWarnings(boss, 1)).toEqual([]);
  });
});

describe('a boss move that applies an effect', () => {
  const rider = { effect: 'mired', powerBp: 10_000 };
  /** A move that fires every round and carries the rider (the type of `everyRound` is loose on purpose). */
  const carrying = (
    g: Record<string, unknown>,
    applies: Record<string, unknown> = rider,
  ): Gimmick => everyRound({ ...g, applies });

  it('puts it on every creature the move hits, after the hit', () => {
    const r = fight([sturdy('a'), sturdy('b'), sturdy('c')], {
      gimmicks: [carrying({ op: 'sweep', rows: ['all'], power: 10_000 })],
    });
    const log = r.events.filter((e) => e.t === 'boss_hit' || e.t === 'effect_apply');
    expect(log.map((e) => [e.t, 'target' in e ? e.target : null])).toEqual([
      ['boss_hit', 'a'],
      ['effect_apply', 'a'],
      ['boss_hit', 'b'],
      ['effect_apply', 'b'],
      ['boss_hit', 'c'],
      ['effect_apply', 'c'],
      // The plain attack carries nothing.
      ['boss_hit', 'a'],
    ]);
  });

  it('gives the taker the effect when a Guard steps in, and the splash takers too', () => {
    const slam = carrying(
      { op: 'slam', aim: 'left', power: 10_000, splashBp: 5_000 },
      { ...rider, durationTurns: 1 },
    );
    const row = [sturdy('g', { role: 'guard' }), sturdy('b'), sturdy('c')];
    const r = fight(row, { gimmicks: [slam], extra: { guardReach: 'adjacent' } });
    const got = applies(r);
    // The slam aims at g (a Guard, so it stays on it); the splash lands on b beside it.
    expect(got.map((e) => e.target)).toEqual(['g', 'b']);
    expect(got.every((e) => e.turnsLeft === 4)).toBe(true);
  });

  it('does nothing in a fight with effects off', () => {
    const r = fight([sturdy('a')], {
      dice: null,
      gimmicks: [carrying({ op: 'hit_zone', zone: 'middle', power: 10_000 })],
    });
    expect(applies(r)).toEqual([]);
    expect(eventsOf(r, 'boss_hit')).toHaveLength(2);
  });

  it('weakens the damage of a creature it landed on', () => {
    const r = fight([sturdy('a')], {
      rounds: 2,
      gimmicks: [
        carrying(
          { op: 'hit_zone', zone: 'middle', power: 10_000 },
          { effect: 'mired', powerBp: 30_000 },
        ),
      ],
    });
    const hits = eventsOf(r, 'hit');
    expect(hits[0]?.effectBp).toBeUndefined();
    // After round 1's move a carries 3 stacks (-9%), so its round 2 hit is cut.
    expect(hits[1]?.effectBp).toBe(-900);
    expect(hits[1]?.damage).toBe(910);
  });
});

describe('dice and replays', () => {
  const counting = (): { rng: Rng; used: () => number } => {
    let n = 0;
    return {
      rng: {
        nextU32() {
          n += 1;
          return 5;
        },
      },
      used: () => n,
    };
  };

  it('draws no die with effects off and `dice` a round with them on', () => {
    const off = counting();
    fight([sturdy('a')], { rounds: 3, dice: null, rng: off.rng });
    expect(off.used()).toBe(0);
    const on = counting();
    fight([sturdy('a')], { rounds: 3, dice: 5, rng: on.rng });
    expect(on.used()).toBe(15);
  });

  it('draws the effect dice after every other die of the round', () => {
    // With boss crits on, a round draws the boss's crit dice first (2 per creature), then the effect dice.
    const luck = { ...RULES.combat.luck, critChanceBp: 0, bossCritChanceBp: 500 };
    const seen: number[] = [];
    let n = 0;
    const rng: Rng = {
      nextU32() {
        n += 1;
        seen.push(n);
        return 9_999;
      },
    };
    fight([sturdy('a')], { dice: 2, rng, extra: { luck } });
    // 2 boss crit dice for the one creature, then 2 effect dice, in that order.
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it('replays the same fight from the same input and dice', () => {
    const setup: Setup = {
      rounds: 4,
      bossAtk: 500,
      hook: (_, apply) => {
        apply(null, 'mired', 14_000);
        apply('a', 'mired', 6_000);
      },
    };
    const a = fight([sturdy('a'), sturdy('b')], {
      ...setup,
      rng: scripted([1, 9_000, 3_000, 8_000]),
    });
    const b = fight([sturdy('a'), sturdy('b')], {
      ...setup,
      rng: scripted([1, 9_000, 3_000, 8_000]),
    });
    expect(a.events).toEqual(b.events);
  });
});

describe('the log text', () => {
  const names = buildNames(input([sturdy('a')]), {}, PACK);
  const effects = Object.fromEntries(PACK.statusEffects.map((e) => [e.id, e.name]));
  const say = (e: FightEvent): string =>
    describeEvent(e, { ...names, effects, boss: 'Old Bogback' });

  it('says each event in a plain sentence', () => {
    const base = { t: 'effect_apply', round: 2, effect: 'mired', stacksAdded: 1 } as const;
    expect(say({ ...base, target: null, stacks: 3, turnsLeft: 3 })).toBe(
      'Old Bogback is Mired ×3 (3 turns).',
    );
    expect(say({ ...base, target: 'a', stacks: 1, turnsLeft: 1 })).toBe('a is Mired ×1 (1 turn).');
    expect(say({ t: 'effect_expire', round: 2, target: null, effect: 'mired' })).toBe(
      'Old Bogback is no longer Mired.',
    );
    expect(
      say({
        t: 'effect_purge',
        round: 2,
        removed: [
          { effect: 'mired', stacks: 2 },
          { effect: 'sluggish', stacks: 1 },
        ],
      }),
    ).toBe('Old Bogback shakes off Mired and Sluggish.');
    expect(
      say({
        t: 'effect_cleanse',
        round: 2,
        supporter: 's',
        target: 'a',
        effect: 'mired',
        stacks: 2,
      }),
    ).toBe('s clears Mired from a.');
  });
});
