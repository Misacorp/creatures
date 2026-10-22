import { createSeededRng, type Rng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { simulateFight, type FightInput, type FightRules } from '../src/index';
import { TEST_PACK, eventsOf, input, run, slot } from './helpers';

// The dungeon's two reflect rules (combat-rules.md 5.5 and 5.6): spiky armour (`spikes`) and the
// reflective shield (`reflect_chance`). Both are standing effects: no `gimmick` event is written.

const RULES_CAP: FightRules = {
  coverBp: 0,
  maxHitBp: 5_000,
  guardHpBp: 0,
  guardArmorBp: 0,
  supportFx: {},
};

type Gimmicks = FightInput['boss']['gimmicks'];
const SPIKES = (bp: number): Gimmicks => [
  { id: 'thorns', name: 'Thorns', trigger: { eachRound: true }, op: 'spikes', bp },
];
const SHIELD = (chanceBp: number): Gimmicks => [
  {
    id: 'molten-shell',
    name: 'Molten Shell',
    trigger: { eachRound: true },
    op: 'reflect_chance',
    chanceBp,
  },
];

const fight = (
  row: ReturnType<typeof slot>[],
  gimmicks: Gimmicks,
  extra: Partial<FightInput> = {},
) => run(row, { boss: { ...input([]).boss, gimmicks }, rules: RULES_CAP, ...extra });

describe('spikes (spiky armour)', () => {
  it('sends a share of every plain hit back at the hitter, as a boss_hit with source spikes', () => {
    const r = fight([slot('a', { atk: 100, hp: 10_000 })], SPIKES(2_500), {
      guardReach: 'adjacent',
    });
    const hits = eventsOf(r, 'hit');
    const spikes = eventsOf(r, 'boss_hit').filter((e) => e.source === 'spikes');
    expect(spikes.length).toBe(hits.length);
    for (const [i, s] of spikes.entries()) {
      expect(s.target).toBe('a');
      expect(s.damage).toBe(Math.floor(((hits[i]?.damage ?? 0) * 2_500) / 10_000));
    }
    // A standing effect writes no announcement.
    expect(eventsOf(r, 'gimmick')).toHaveLength(0);
  });

  it('sends back only the plain damage: a reaction costs the same as a plain hit', () => {
    const r = fight(
      [
        slot('s', { element: 'tide', role: 'setter', atk: 100, hp: 100_000 }),
        slot('p', { element: 'spark', role: 'payoff', atk: 100, hp: 100_000 }),
      ],
      SPIKES(2_000),
    );
    const reaction = eventsOf(r, 'reaction')[0];
    expect(reaction).toBeDefined();
    const events = r.events;
    const at = events.findIndex((e) => e.t === 'reaction');
    const payoffHit = events
      .slice(0, at)
      .reverse()
      .find((e) => e.t === 'hit');
    const prick = events.slice(at).find((e) => e.t === 'boss_hit' && e.source === 'spikes');
    if (payoffHit?.t !== 'hit' || prick?.t !== 'boss_hit') throw new Error('events missing');
    const plain = payoffHit.damage - (reaction?.bonus ?? 0);
    expect(plain).toBeGreaterThan(0);
    expect(prick.damage).toBe(Math.floor((plain * 2_000) / 10_000));
    expect(prick.damage).toBeLessThan(Math.floor((payoffHit.damage * 2_000) / 10_000));
  });

  it('is capped like any hit (50% of max HP here), and can knock the hitter out', () => {
    const r = fight([slot('a', { atk: 100, hp: 40 })], SPIKES(10_000));
    const first = eventsOf(r, 'boss_hit').find((e) => e.source === 'spikes');
    expect(first).toMatchObject({ target: 'a', damage: 20, capped: true });
    expect(eventsOf(r, 'knockout')[0]).toMatchObject({ creature: 'a' });
  });

  it('is not taken by a Guard and cannot be dodged: it is always the hitter that is pricked', () => {
    const r = fight(
      [slot('g', { role: 'guard', atk: 1, hp: 100_000 }), slot('a', { atk: 100, hp: 100_000 })],
      SPIKES(2_500),
      { guardReach: 'adjacent' },
    );
    const spikes = eventsOf(r, 'boss_hit').filter((e) => e.source === 'spikes');
    expect(spikes.some((e) => e.target === 'a')).toBe(true);
    for (const s of spikes) expect(s.from).toBeUndefined();
  });

  it('writes no hit when the share rounds to nothing, and nothing once the foe has fallen', () => {
    const tiny = fight([slot('a', { atk: 1, hp: 1_000 })], SPIKES(1));
    expect(eventsOf(tiny, 'boss_hit').filter((e) => e.source === 'spikes')).toHaveLength(0);
    const kill = run([slot('a', { atk: 1_000, hp: 1_000 })], {
      boss: { ...input([]).boss, gimmicks: SPIKES(10_000) },
      bossHpPool: { max: 100, current: 100 },
      rules: RULES_CAP,
    });
    expect(eventsOf(kill, 'boss_hit').filter((e) => e.source === 'spikes')).toHaveLength(0);
    expect(kill.bossHpEnd).toBe(0);
  });

  it('comes back from an ability strike too', () => {
    const r = fight([slot('a', { atk: 100, hp: 100_000, element: 'tide' })], SPIKES(2_500), {
      finaleAbilities: [
        { playerId: 'p1', abilityId: 'test-strike', key: 'k', creatureId: 'a', fireAtRound: 1 },
      ],
    });
    const round1 = r.events.filter((e) => 'round' in e && e.round === 1);
    const strike = round1.find((e) => e.t === 'hit' && e.ability === 'test-strike');
    expect(strike).toBeDefined();
    const at = round1.indexOf(strike as (typeof round1)[number]);
    const prick = round1.slice(at).find((e) => e.t === 'boss_hit');
    expect(prick).toMatchObject({ t: 'boss_hit', source: 'spikes', target: 'a' });
  });
});

describe('reflect_chance (reflective shield)', () => {
  const row = () => [
    slot('s1', { owner: 'a', element: 'tide', role: 'setter', atk: 100, hp: 100_000 }),
    slot('p1', { owner: 'b', element: 'spark', role: 'payoff', atk: 100, hp: 100_000 }),
    slot('s2', { owner: 'c', element: 'tide', role: 'setter', atk: 100, hp: 100_000 }),
    slot('p2', { owner: 'd', element: 'spark', role: 'payoff', atk: 100, hp: 100_000 }),
  ];
  const turns = (r: ReturnType<typeof run>, round: number) =>
    eventsOf(r, 'reaction').filter((e) => e.round === round);

  it('at 100% reflects every reaction, not just the first of a round (no once-a-round limit)', () => {
    const r = fight(row(), SHIELD(10_000), { guardReach: 'adjacent' });
    expect(turns(r, 1)).toMatchObject([
      { payoff: 'p1', reflected: true },
      { payoff: 'p2', reflected: true },
    ]);
    // A reflected reaction deals plain damage only and earns the setup no credit.
    expect(r.perPlayer.a?.setupCredit).toBe(0);
    expect(r.perPlayer.c?.setupCredit).toBe(0);
  });

  it('at 0 chance in the content (no op) reflects nothing', () => {
    const r = fight(row(), []);
    expect(eventsOf(r, 'reaction').every((e) => !e.reflected)).toBe(true);
  });

  it('puts the reflected hit on the payoff, under the single-hit cap', () => {
    const r = fight(
      [
        slot('s', { element: 'tide', role: 'setter', atk: 1_000, hp: 1_000_000 }),
        slot('p', { element: 'spark', role: 'payoff', atk: 1_000, hp: 1_000 }),
      ],
      SHIELD(10_000),
    );
    const hit = eventsOf(r, 'boss_hit').find((e) => e.source === 'reflect');
    expect(hit).toMatchObject({ target: 'p', damage: 500, capped: true });
    expect(eventsOf(r, 'reaction')[0]).toMatchObject({ reflected: true });
  });

  it('the raid trap (reflect_first_reaction) stays uncapped', () => {
    const r = fight(
      [
        slot('s', { element: 'tide', role: 'setter', atk: 1_000, hp: 1_000_000 }),
        slot('p', { element: 'spark', role: 'payoff', atk: 1_000, hp: 1_000 }),
      ],
      [
        {
          id: 'backdraft',
          name: 'Backdraft',
          trigger: { eachRound: true },
          op: 'reflect_first_reaction',
        },
      ],
    );
    const hit = eventsOf(r, 'boss_hit').find((e) => e.source === 'reflect');
    expect(hit?.capped).toBeUndefined();
    expect(hit?.damage).toBeGreaterThan(500);
  });

  it('a Guard beside the payoff takes the reflected hit instead', () => {
    const r = fight(
      [
        slot('s', { element: 'tide', role: 'setter', atk: 100, hp: 100_000 }),
        slot('p', { element: 'spark', role: 'payoff', atk: 100, hp: 100_000 }),
        slot('g', { role: 'guard', atk: 1, hp: 100_000 }),
      ],
      SHIELD(10_000),
      { guardReach: 'adjacent' },
    );
    const hit = eventsOf(r, 'boss_hit').find((e) => e.source === 'reflect');
    expect(hit).toMatchObject({ target: 'g', from: 'p' });
  });

  it('a gear set that turns reflections aside (unreflected) works against it, once', () => {
    const proofRow = row().map((s) =>
      s.id === 'p1' ? { ...s, mods: { unreflected: 1 as const } } : s,
    );
    const r = run(proofRow, {
      boss: { ...input([]).boss, gimmicks: SHIELD(10_000) },
      rules: RULES_CAP,
    });
    const own = eventsOf(r, 'reaction').filter((e) => e.payoff === 'p1');
    expect(own[0]).toMatchObject({ reflected: false, proof: true });
    expect(own[1]).toMatchObject({ reflected: true });
  });

  it('draws a die only for a reaction while the shield is on: other fights draw exactly as before', () => {
    const count = (gimmicks: Gimmicks, slots = row()) => {
      const inner = createSeededRng('count');
      let draws = 0;
      const rng: Rng = {
        nextU32: () => {
          draws += 1;
          return inner.nextU32();
        },
      };
      simulateFight(
        input(slots, { boss: { ...input([]).boss, gimmicks }, rules: RULES_CAP }),
        rng,
        {
          pack: TEST_PACK,
        },
      );
      return draws;
    };
    const base = count([]);
    expect(count(SPIKES(1_000))).toBe(base);
    expect(count(SHIELD(500))).toBeGreaterThan(base);
    // No reaction in the row (one element), so no die is drawn even with the shield up.
    const flat = [
      slot('x', { element: 'tide', role: 'payoff', atk: 100 }),
      slot('y', { element: 'tide', role: 'payoff', atk: 100 }),
    ];
    expect(count(SHIELD(500), flat)).toBe(count([], flat));
  });

  it('a chance in between reflects some reactions and not others, the same way every time', () => {
    const play = () => eventsOf(fight(row(), SHIELD(5_000)), 'reaction').map((e) => e.reflected);
    const a = play();
    expect(a).toEqual(play());
    expect(a).toContain(true);
    expect(a).toContain(false);
  });
});
