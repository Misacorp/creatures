import { RULES, bossAtRank, content, createSeededRng, type LuckConfig } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { bossWarnings, simulateFight, type FightEvent } from '../src/index';
import { planSlam, planSweep, payoffRow } from '../src/patterns';
import { boss, eventsOf, input } from './helpers';
import { everyRound, fightWith, gimmickHits, rowOf, rulesOf } from './pattern-helpers';
import type { PatternContext, PatternCreature } from '../src/patterns';

/**
 * Rank-gated boss mechanics (docs/design/combat-rules.md 2.5, 6.7, 6.9): the boss's plain attack
 * made one to three times a round, the Payoff slam and the Payoff-row sweep. Rows of 9 are three rows
 * of three: s0-s2 front, s3-s5 middle, s6-s8 back. The boss has Attack 100 in `fightWith`, so a
 * power of 10000 deals 100.
 */

function world(
  n: number,
  over: Readonly<Record<number, Partial<PatternCreature>>> = {},
  extra: Partial<PatternContext> = {},
): PatternContext {
  const creatures: PatternCreature[] = Array.from({ length: n }, (_, idx) => ({
    idx,
    id: `s${String(idx)}`,
    atk: 10,
    role: 'setter',
    alive: true,
    ...over[idx],
  }));
  return { creatures, n, firing: 1, dice: Array.from({ length: 10 }, () => 0), ...extra };
}

describe('the Payoff slam (aim: payoff)', () => {
  const slam = (ctx: PatternContext) =>
    planSlam(ctx, { aim: 'payoff', power: 100, splashBp: 4_500 });

  it('aims at the living Payoff with the highest Attack, ties to the lower slot', () => {
    const ctx = world(9, {
      0: { atk: 200 }, // the strongest creature is a Setter
      2: { role: 'payoff', atk: 60 },
      5: { role: 'payoff', atk: 80 },
      7: { role: 'payoff', atk: 80 },
    });
    expect(slam(ctx).targets).toEqual([5]);
    const gone = world(9, {
      5: { role: 'payoff', atk: 80, alive: false },
      7: { role: 'payoff', atk: 80 },
      2: { role: 'payoff', atk: 60 },
    });
    expect(slam(gone).targets).toEqual([7]);
  });

  it('falls back to the strongest creature when no Payoff stands, and to nobody when all are down', () => {
    expect(slam(world(9, { 4: { atk: 99 } })).targets).toEqual([4]);
    expect(slam(world(9, { 4: { role: 'payoff', alive: false }, 6: { atk: 99 } })).targets).toEqual(
      [6],
    );
    const allDown = world(
      3,
      Object.fromEntries([0, 1, 2].map((i) => [i, { alive: false, role: 'payoff' as const }])),
    );
    expect(slam(allDown).hits).toEqual([]);
  });

  it('is one aimed hit that carries the splash share', () => {
    const plan = slam(world(9, { 3: { role: 'payoff' } }));
    expect(plan.hits).toEqual([{ target: 3, powerBp: 100, kind: 'aimed' }]);
    expect(plan.splashBp).toBe(4_500);
  });

  // s7 is the Payoff with the highest Attack; s0 is a stronger Setter, s1 a weaker Payoff.
  const slamFight = (guard: boolean) =>
    fightWith(
      rowOf(9, {
        0: { atk: 200 },
        1: { role: 'payoff', atk: 30 },
        7: { role: 'payoff', atk: 80 },
        ...(guard ? { 8: { role: 'guard' } } : {}),
      }),
      [everyRound({ op: 'slam', aim: 'payoff', power: 20_000, splashBp: 5_000 })],
      { rules: rulesOf() },
    );

  it('without a Guard it hits the Payoff and splashes the creatures beside it', () => {
    const r = slamFight(false);
    const hits = eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick');
    expect(hits.map((e) => [e.target, e.damage, e.splash === true, e.from])).toEqual([
      ['s7', 200, false, undefined],
      ['s6', 100, true, undefined],
      ['s8', 100, true, undefined],
    ]);
    expect(eventsOf(r, 'gimmick')[0]).toMatchObject({ op: 'slam', targets: ['s7'] });
  });

  it('a Guard in the Payoff row takes it, as with any aimed hit: the exposed Payoff is spared', () => {
    const r = slamFight(true);
    const hits = eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick');
    // The Guard (no armor in these rules) takes the 200 and the splash goes beside it.
    expect(hits[0]).toMatchObject({ target: 's8', from: 's7', damage: 200 });
    expect(hits.slice(1).map((e) => [e.target, e.splash])).toEqual([['s7', true]]);
    expect(hits.some((e) => e.target === 's7' && e.splash !== true)).toBe(false);
  });
});

describe('the Payoff-row sweep (rows: payoffs)', () => {
  const sweep = (ctx: PatternContext) => planSweep(ctx, { rows: ['payoffs'], power: 100 });
  const payoffs = (...slots: number[]) =>
    Object.fromEntries(slots.map((i) => [i, { role: 'payoff' as const }]));

  it('picks the row with the most living Payoffs; a tie goes to the front-most row', () => {
    expect(sweep(world(9, payoffs(0, 3, 4, 6))).rows).toEqual(['middle']);
    expect(sweep(world(9, payoffs(0, 3, 6))).rows).toEqual(['front']);
    expect(sweep(world(9, payoffs(3, 6))).rows).toEqual(['middle']);
    expect(sweep(world(9, payoffs(6, 7))).targets).toEqual([6, 7, 8]);
  });

  it('counts only the living, and with no Payoff hits the front-most row with someone up', () => {
    const dead = { role: 'payoff' as const, alive: false };
    // Middle has one Payoff down and one up, Back one up: a tie, so the front-most of them.
    expect(sweep(world(9, { ...payoffs(3, 4, 6), 3: dead })).rows).toEqual(['middle']);
    expect(sweep(world(9, { ...payoffs(3, 4, 6), 3: dead, 4: dead })).rows).toEqual(['back']);
    expect(sweep(world(9)).rows).toEqual(['front']);
    const frontDown = Object.fromEntries([0, 1, 2].map((i) => [i, { alive: false }]));
    expect(sweep(world(9, frontDown)).rows).toEqual(['middle']);
    const allDown = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i, { alive: false }]));
    expect(sweep(world(9, allDown)).hits).toEqual([]);
    expect(payoffRow(world(9, allDown))).toBeUndefined();
  });

  it('walks like any sweep: a walk can mix named rows and the Payoff row', () => {
    const spec = { rows: ['back', 'payoffs'] as const, power: 100 };
    const ctx = (firing: number) => world(9, payoffs(3, 4), { firing });
    expect(planSweep(ctx(1), spec).rows).toEqual(['back']);
    expect(planSweep(ctx(2), spec).rows).toEqual(['middle']);
    expect(planSweep(ctx(3), spec).rows).toEqual(['back']);
  });

  it('hits the whole row; a Guard beside a creature covers it, and a Guard does not step in', () => {
    const r = fightWith(
      rowOf(9, { 3: { role: 'payoff' }, 4: { role: 'payoff' }, 5: { role: 'guard' } }),
      [everyRound({ op: 'sweep', rows: ['payoffs'], power: 10_000 })],
      { rules: rulesOf() },
    );
    expect(gimmickHits(r)).toEqual([
      [1, 's3', 100], // not beside the Guard
      [1, 's4', 60], // beside the Guard at s5: 40% less
      [1, 's5', 100], // the Guard itself (no armor in these rules)
    ]);
    expect(eventsOf(r, 'gimmick')[0]).toMatchObject({ op: 'sweep', rows: ['middle'] });
  });

  it('as a charge, the row is picked when it is announced and the marks land a round later', () => {
    const g = {
      id: 'c',
      name: 'c',
      trigger: { every: 3 },
      op: 'charge',
      then: { op: 'sweep', rows: ['payoffs'], power: 10_000 },
    };
    const r = fightWith(
      rowOf(9, { 0: { role: 'payoff' }, 6: { role: 'payoff' }, 7: { role: 'payoff' } }),
      [g as never],
      { rounds: 3 },
    );
    expect(eventsOf(r, 'charge')[0]).toMatchObject({
      round: 2,
      landing: 3,
      marks: ['s6', 's7', 's8'],
      rows: ['back'],
    });
    expect(gimmickHits(r)).toEqual([
      [3, 's6', 100],
      [3, 's7', 100],
      [3, 's8', 100],
    ]);
  });
});

describe('forecast of the new aims', () => {
  it('names the Payoff slam and the Payoff-row sweep', () => {
    const b = {
      ...boss('storm-sovereign'),
      gimmicks: [
        {
          id: 's',
          name: 'S',
          trigger: { eachRound: true },
          op: 'slam',
          aim: 'payoff',
          power: 1,
          splashBp: 1,
        },
        {
          id: 'w',
          name: 'W',
          trigger: { eachRound: true },
          op: 'sweep',
          rows: ['payoffs'],
          power: 1,
        },
        {
          id: 'c',
          name: 'C',
          trigger: { every: 2 },
          op: 'charge',
          then: { op: 'sweep', rows: ['payoffs'], power: 1 },
        },
      ],
    };
    const targets = bossWarnings(b as never, 2).map((w) => w.target);
    expect(targets).toEqual([
      { kind: 'slam', aim: 'payoff' },
      { kind: 'payoffs' },
      { kind: 'charge', stage: 'landing', inner: { kind: 'payoffs' } },
    ]);
  });

  it('shows only the moves of the rank the week is fought at', () => {
    const wyrm = boss('cinder-wyrm');
    const names = (rank: number, round: number) =>
      bossWarnings(bossAtRank(wyrm, rank), round)
        .map((w) => w.gimmick)
        .filter((id) => id !== 'backdraft');
    // Magma Spit (from rank 4) is due in round 5; Eruption (from rank 7) lands in round 7.
    expect(names(1, 5)).toEqual([]);
    expect(names(3, 5)).toEqual([]);
    expect(names(4, 5)).toEqual(['magma-spit']);
    expect(names(4, 7)).toEqual([]);
    expect(names(7, 7)).toEqual(['eruption']);
    // The gathering warning a round before.
    expect(names(7, 6)).toContain('eruption');
    expect(names(6, 6)).not.toContain('eruption');
  });
});

describe('fights of the shipped bosses at each rank', () => {
  it('play only the moves of their rank, and the stored boss is the one fought', () => {
    const wyrm = content.bosses.find((b) => b.id === 'cinder-wyrm');
    if (wyrm === undefined) throw new Error('missing boss');
    const row = rowOf(9, { 1: { role: 'payoff', atk: 50 } });
    const play = (rank: number) => {
      const base = input(row);
      return simulateFight(
        {
          ...base,
          boss: bossAtRank(wyrm, rank),
          phase: 'finale',
          bossAtk: 1,
          bossHpPool: { max: 10 ** 9, current: 10 ** 9 },
          turnOrderOverride: 'left_to_right',
        },
        createSeededRng('rank-fight'),
      );
    };
    const fired = (rank: number) => new Set(eventsOf(play(rank), 'gimmick').map((e) => e.gimmick));
    expect(fired(1)).toEqual(new Set(['backdraft', 'cinder-fall', 'coil-crush']));
    expect(fired(4)).toEqual(new Set(['backdraft', 'cinder-fall', 'coil-crush', 'magma-spit']));
    expect(fired(7)).toEqual(
      new Set(['backdraft', 'cinder-fall', 'coil-crush', 'magma-spit', 'eruption']),
    );
    // A replay of the stored input is the same fight whatever the content says later.
    const base = input(row);
    const stored = {
      ...base,
      boss: bossAtRank(wyrm, 4),
      phase: 'finale' as const,
      bossAtk: 1,
      bossHpPool: { max: 10 ** 9, current: 10 ** 9 },
    };
    const again = JSON.parse(JSON.stringify(stored)) as typeof stored;
    expect(simulateFight(again, createSeededRng('s')).events).toEqual(
      simulateFight(stored, createSeededRng('s')).events,
    );
  });
});

describe('bossAttacks: the plain attack made more than once a round', () => {
  const plain = (r: { events: FightEvent[] }, round?: number) =>
    eventsOf(r as never, 'boss_hit').filter(
      (e) => e.source === 'attack' && (round === undefined || e.round === round),
    );
  const base = (bossAttacks?: number, luck?: LuckConfig, rounds = 3) => ({
    rounds,
    rules: rulesOf(),
    extra: {
      ...(bossAttacks === undefined ? {} : { bossAttacks }),
      ...(luck === undefined ? {} : { luck }),
    },
  });

  it('is 1 to 3 whole attacks and nothing else', () => {
    for (const bad of [0, 4, 1.5, -1, Number.NaN]) {
      expect(() => fightWith(rowOf(3), [], base(bad))).toThrow(/bossAttacks/);
    }
    for (const ok of [1, 2, 3]) expect(() => fightWith(rowOf(3), [], base(ok))).not.toThrow();
  });

  it('makes that many attacks each round, each a full aimed hit on the front-most creature', () => {
    for (const k of [1, 2, 3]) {
      const r = fightWith(rowOf(9), [], base(k));
      expect(plain(r)).toHaveLength(3 * k);
      for (const round of [1, 2, 3]) {
        expect(plain(r, round).map((e) => [e.target, e.damage])).toEqual(
          Array.from({ length: k }, () => ['s0', 100]),
        );
      }
    }
  });

  it('each attack picks its target when it is made: a creature that fell is not aimed at again', () => {
    // s0 has 100 HP and takes 100 from the first attack; the 2nd goes for the next front creature, and
    // the 3rd for the next after that. Without a Guard each goes to the leftmost living creature.
    const row = rowOf(9, { 0: { hp: 100 }, 1: { hp: 100 }, 2: { hp: 100 } });
    const r = fightWith(row, [], base(3, undefined, 1));
    expect(plain(r).map((e) => e.target)).toEqual(['s0', 's1', 's2']);
    expect(eventsOf(r, 'knockout').map((e) => e.creature)).toEqual(['s0', 's1', 's2']);
  });

  it('every attack goes for the Guard of the front row, as the plain attack does', () => {
    const r = fightWith(rowOf(9, { 2: { role: 'guard' } }), [], base(2, undefined, 2));
    expect(plain(r).map((e) => e.target)).toEqual(['s2', 's2', 's2', 's2']);
  });

  it('comes after the moves, in the boss turn, and also in enrage rounds', () => {
    const g = everyRound({ op: 'sweep', rows: ['front'], power: 10_000 });
    const r = fightWith(rowOf(9), [g], base(2, undefined, 1));
    const order = eventsOf(r, 'boss_hit').map((e) => e.source);
    expect(order).toEqual(['gimmick', 'gimmick', 'gimmick', 'attack', 'attack']);
    const over = fightWith(rowOf(9), [], {
      rounds: 1,
      rules: rulesOf(),
      extra: { bossAttacks: 3, enrage: { rounds: 2, powerBp: 10_000 } },
    });
    const enraged = eventsOf(over, 'boss_hit').filter((e) => e.round > 1);
    expect(enraged.filter((e) => e.source === 'attack')).toHaveLength(6);
  });

  describe('crit dice', () => {
    const CRITS: LuckConfig = {
      ...RULES.combat.luck,
      critChanceBp: 0,
      bossCritChanceBp: 3_000,
      bossRandomTargetBp: 0,
      spreadBp: 0,
      surgeChanceBp: 0,
      slumpChanceBp: 0,
    };

    it('gives every attack its own die: one can crit while the other does not', () => {
      const r = fightWith(rowOf(9), [], {
        rounds: 200,
        rules: rulesOf(),
        extra: { bossAttacks: 2, luck: CRITS },
      });
      const rounds = Array.from({ length: 200 }, (_, i) => plain(r, i + 1));
      const crit = (e: { crit?: true } | undefined) => e?.crit === true;
      const first = rounds.filter((hits) => crit(hits[0])).length;
      const second = rounds.filter((hits) => crit(hits[1])).length;
      const differing = rounds.filter((hits) => crit(hits[0]) !== crit(hits[1])).length;
      // About 30% each, and not the same die twice.
      expect(first).toBeGreaterThan(40);
      expect(second).toBeGreaterThan(40);
      expect(differing).toBeGreaterThan(40);
      // A crit adds +50% (the shipped boss crit damage) to that hit only.
      for (const hits of rounds) {
        for (const e of hits) expect(e.damage).toBe(e.crit === true ? 150 : 100);
      }
    });

    it('draws no extra dice for one attack: absent and 1 play the very same fight', () => {
      const play = (bossAttacks?: number) =>
        fightWith(
          rowOf(9, { 1: { role: 'payoff' } }),
          [everyRound({ op: 'sweep', rows: ['payoffs'], power: 5_000 })],
          {
            rounds: 12,
            rules: rulesOf(),
            rng: createSeededRng('same'),
            extra: {
              luck: RULES.combat.luck,
              ...(bossAttacks === undefined ? {} : { bossAttacks }),
            },
          },
        );
      expect(play(1).events).toEqual(play(undefined).events);
    });

    it('a second attack never moves the dice of anything else in the first round', () => {
      const play = (bossAttacks: number) =>
        fightWith(rowOf(9), [], {
          rounds: 1,
          rules: rulesOf(),
          rng: createSeededRng('dice'),
          extra: { luck: { ...RULES.combat.luck, critChanceBp: 3_000 }, bossAttacks },
        });
      const mine = (r: { events: FightEvent[] }) =>
        eventsOf(r as never, 'hit').map((e) => [e.creature, e.damage, e.crit]);
      expect(mine(play(2))).toEqual(mine(play(1)));
      expect(mine(play(3))).toEqual(mine(play(1)));
      // The first attack of the round is the same hit whether or not there is a second.
      expect(plain(play(2), 1)[0]).toEqual(plain(play(1), 1)[0]);
    });
  });
});
