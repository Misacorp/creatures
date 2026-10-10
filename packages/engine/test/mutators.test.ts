import { describe, expect, it } from 'vitest';
import { simulateFight, type Mutator } from '../src/index';
import { eventsOf, input, rng, run, slot } from './helpers';

const row = () => [
  slot('s', { owner: 'a', element: 'tide', role: 'setter', atk: 100, hp: 60 }),
  slot('p', { owner: 'b', element: 'spark', role: 'payoff', atk: 100 }),
];

/** Example seasonal mutator, for tests only. */
const frost: Mutator = {
  id: 'season-test-frost',
  hooks: {
    onFightStart: () => ({ bossDamageBonusBp: 10_000 }), // boss hits twice as hard
    onRoundStart: (ctx) => (ctx.round === 1 ? { damageBonusBp: 1000 } : undefined),
    onBeforeHit: (ctx) => (ctx.creature.role === 'payoff' ? { damageBonusBp: 2000 } : undefined),
    onReaction: () => ({ bonusBp: 5000 }),
  },
};

describe('mutators', () => {
  it('change numbers only through their return values', () => {
    const base = run(row(), { bossAtk: 10 });
    const withFrost = run(row(), { bossAtk: 10, mutators: [frost.id] }, { mutators: [frost] });
    // Round 1: s gets +10% (round start), p gets +10% + 20%.
    const hits = eventsOf(withFrost, 'hit').filter((h) => h.round === 1);
    expect(hits[0]).toMatchObject({ creature: 's', bonusBp: 1000, damage: 110 });
    // plain = 100 x 1.5 x 1.3 = 195; reaction x3.125 = 609, bonus 414, x1.5 from the hook = 621
    expect(hits[1]).toMatchObject({ creature: 'p', bonusBp: 3000, damage: 195 + 621 });
    // Boss damage doubled: 10 -> 20.
    expect(eventsOf(base, 'boss_hit')[0]!.damage).toBe(10);
    expect(eventsOf(withFrost, 'boss_hit')[0]!.damage).toBe(20);
    // Round 2 has no round-start bonus.
    expect(eventsOf(withFrost, 'hit').find((h) => h.round === 2)!.bonusBp).toBe(0);
  });

  it('never runs when disabled, unregistered, or unknown', () => {
    const calls: string[] = [];
    const spy: Mutator = {
      id: 'spy',
      hooks: {
        onFightStart: () => void calls.push('start'),
        onBeforeHit: () => void calls.push('hit'),
        onFightEnd: () => void calls.push('end'),
      },
    };
    run(row(), {}, { mutators: [spy] }); // registered but not enabled
    run(row(), { mutators: ['spy'] }); // enabled but not registered
    run(row(), { mutators: ['other'] }, { mutators: [spy] });
    expect(calls).toEqual([]);
    run(row(), { mutators: ['spy'] }, { mutators: [spy] });
    expect(calls.filter((c) => c === 'start')).toHaveLength(1);
    expect(calls.filter((c) => c === 'end')).toHaveLength(1);
    expect(calls.filter((c) => c === 'hit').length).toBeGreaterThan(0);
  });

  it('runs in the order of the enabled list, once each', () => {
    const calls: string[] = [];
    const make = (id: string): Mutator => ({
      id,
      hooks: { onFightStart: () => void calls.push(id) },
    });
    run(row(), { mutators: ['b', 'a', 'b'] }, { mutators: [make('a'), make('b')] });
    expect(calls).toEqual(['b', 'a']);
  });

  it('calls observer hooks: knockout, round end, fight end, with read-only snapshots', () => {
    const log: string[] = [];
    const observer: Mutator = {
      id: 'obs',
      hooks: {
        onKnockout: (ctx) => {
          log.push(`ko:${ctx.creature.id}:${ctx.round}`);
          (ctx.creature as { hp: number }).hp = 999; // changing the snapshot must not matter
        },
        onRoundEnd: (ctx) => void log.push(`end:${ctx.round}`),
        onFightEnd: (ctx) => void log.push(`fight:${ctx.cleared}:${ctx.phase}`),
      },
    };
    const r = run(row(), { bossAtk: 40, mutators: ['obs'] }, { mutators: [observer] });
    expect(log.slice(0, 3)).toEqual(['end:1', 'ko:s:2', 'end:2']); // 60 HP, 40 per boss hit
    expect(log).toContain('end:1');
    expect(log.at(-1)).toBe('fight:false:phase1');
    expect(r.perCreature.s!.knockedOutRound).toBe(2);
  });

  it('can use the injected RNG, and the fight stays deterministic', () => {
    const roller: Mutator = {
      id: 'roller',
      hooks: { onRoundStart: (ctx) => ({ damageBonusBp: ctx.rng.nextU32() % 1000 }) },
    };
    const go = () =>
      simulateFight(input(row(), { mutators: ['roller'] }), rng(), { mutators: [roller] });
    expect(go()).toEqual(go());
  });

  it('ignores non-numeric and out-of-range hook values', () => {
    const bad: Mutator = {
      id: 'bad',
      hooks: {
        onBeforeHit: () => ({ damageBonusBp: Number.NaN }),
        onRoundStart: () => ({ damageBonusBp: -1_000_000 }),
      },
    };
    const r = run(row(), { mutators: ['bad'] }, { mutators: [bad] });
    // Clamped to -100%: damage is 0 but nothing throws or goes negative.
    for (const h of eventsOf(r, 'hit')) expect(h.damage).toBeGreaterThanOrEqual(0);
  });
});
