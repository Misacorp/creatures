import { describe, expect, it } from 'vitest';
import {
  describeEvent,
  simulateFight,
  buildNames,
  type FightEvent,
  type FightInput,
} from '../src/index';
import { boss, input, randomInput, rng, run, slot } from './helpers';

describe('describeEvent', () => {
  it('renders every event type seen across varied fights as non-empty text', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const inp = randomInput(`describe-${i}`, 1 + (i % 6), i % 2 === 0 ? 'finale' : 'phase1');
      const names = buildNames(inp);
      for (const e of simulateFight(inp, rng()).events) {
        seen.add(e.t);
        const line = describeEvent(e, names);
        expect(line.length).toBeGreaterThan(5);
        expect(line).not.toContain('undefined');
      }
    }
    expect([...seen].sort()).toEqual(
      [
        'ability',
        'adaptation',
        'boss_hit',
        'charge',
        'gimmick',
        'hit',
        'knockout',
        'mark',
        'reaction',
        'round_end',
        'round_start',
        'silence',
        'skip',
        'support_buff',
        'turn',
      ].sort(),
    );
  });

  it('describes shield, guard interception, reflect and purge lines', () => {
    const names = { boss: 'Boss', creatures: { a: 'Ann', b: 'Bob' }, players: { p: 'Pat' } };
    const lines = (events: FightEvent[]) => events.map((e) => describeEvent(e, names));
    expect(
      lines([
        { t: 'boss_hit', round: 1, source: 'attack', target: 'a', damage: 0, shielded: true },
        { t: 'boss_hit', round: 1, source: 'gimmick', target: 'b', damage: 7, from: 'a' },
        { t: 'boss_hit', round: 1, source: 'reflect', target: 'a', damage: 9 },
        { t: 'adaptation', round: 2, rule: 'x', target: 't', status: 'purged' },
        { t: 'ability', round: 3, player: 'p', ability: 'rally', key: 'k', byDefault: true },
        { t: 'silence', round: 2, creature: 'a', turns: 2 },
      ]),
    ).toEqual([
      'Boss attacks Ann, but a Shield Wall stops it.',
      'Bob takes the hit meant for Ann (7).',
      'Boss reflects damage onto Ann for 9.',
      "Boss's adaptation is purged.",
      'Pat uses rally at its default time.',
      'Ann is silenced for 2 turns.',
    ]);
  });

  it('names the creature and its ability: "Cindle\'s Flare Strike"', () => {
    const names = {
      boss: 'Boss',
      creatures: { c: 'Cindle' },
      players: { p: 'Pat' },
      abilities: { 'flare-strike': 'Flare Strike' },
    };
    const lines = (events: FightEvent[]) => events.map((e) => describeEvent(e, names));
    expect(
      lines([
        {
          t: 'ability',
          round: 5,
          player: 'p',
          ability: 'flare-strike',
          key: 'c:ability',
          creature: 'c',
          byDefault: true,
        },
        {
          t: 'hit',
          round: 5,
          creature: 'c',
          damage: 90,
          matchupBp: 10_000,
          bonusBp: 0,
          mark: null,
          bossHp: 500,
          ability: 'flare-strike',
          key: 'c:ability',
        },
        { t: 'boss_hit', round: 5, source: 'attack', target: 'c', damage: 30, reducedBp: 5_000 },
        { t: 'adaptation', round: 6, rule: 'x', target: 't', status: 'restored' },
      ]),
    ).toEqual([
      "Pat uses Cindle's Flare Strike at its default time.",
      "Cindle's Flare Strike hits Boss for 90; 500 HP left.",
      'Boss attacks Cindle for 30 (a Shield Wall softens it by 50%).',
      "Boss's adaptation returns.",
    ]);
  });

  it('describes spikes pricking the hitter', () => {
    const names = { boss: 'Imp', creatures: { a: 'Ann' }, players: {} };
    const line = (e: FightEvent) => describeEvent(e, names);
    expect(line({ t: 'boss_hit', round: 1, source: 'spikes', target: 'a', damage: 4 })).toBe(
      "Imp's spikes prick Ann for 4.",
    );
    expect(
      line({
        t: 'boss_hit',
        round: 1,
        source: 'spikes',
        target: 'a',
        damage: 20,
        capped: true,
      }),
    ).toBe("Imp's spikes prick Ann for 20. The hit is capped.");
  });

  it('falls back to ids for unknown names and shows reflected reactions', () => {
    const r = run(
      [
        slot('s', { element: 'tide', role: 'setter' }),
        slot('p', { element: 'spark', role: 'payoff' }),
      ],
      { boss: { ...boss('cinder-wyrm'), element: 'tide' } },
    );
    const reaction = r.events.find((e) => e.t === 'reaction')!;
    expect(
      describeEvent(reaction, { boss: 'Wyrm', creatures: {}, reactions: { overload: 'Overload' } }),
    ).toBe('Overload! Wyrm reflects 318 bonus damage onto p.');
    expect(input([slot('x')]).row).toHaveLength(1);
  });
});

describe('describeEvent for the retune events', () => {
  const names = {
    boss: 'Boss',
    creatures: { a: 'Ann', b: 'Bob', c: 'Cat', d: 'Dan', e: 'Eve', g: 'Gus' },
    gimmicks: { wave: 'Great Wave', rake: 'Rake' },
  };
  const line = (e: FightEvent) => describeEvent(e, names);

  it('names the creatures a pattern picked, and a charge, its marks and its landing', () => {
    expect(
      line({
        t: 'gimmick',
        round: 2,
        gimmick: 'rake',
        op: 'sweep',
        targets: ['a', 'b'],
        rows: ['front'],
      }),
    ).toBe('Boss uses Rake (front row) on Ann and Bob.');
    expect(
      line({ t: 'gimmick', round: 2, gimmick: 'rake', op: 'lance', targets: ['a'], lane: 1 }),
    ).toBe('Boss uses Rake on Ann.');
    expect(line({ t: 'gimmick', round: 2, gimmick: 'rake', op: 'barrage', targets: [] })).toBe(
      'Boss uses Rake on nobody.',
    );
    expect(
      line({
        t: 'gimmick',
        round: 2,
        gimmick: 'rake',
        op: 'barrage',
        targets: ['a', 'b', 'c', 'd', 'e', 'g'],
      }),
    ).toBe('Boss uses Rake on Ann, Bob, Cat, Dan and 2 more.');
    // A gimmick event with no targets is the old line.
    expect(line({ t: 'gimmick', round: 2, gimmick: 'rake', op: 'hit_zone' })).toBe(
      'Boss uses Rake.',
    );
    expect(
      line({
        t: 'charge',
        round: 4,
        landing: 5,
        gimmick: 'wave',
        op: 'sweep',
        marks: ['a', 'b', 'c'],
        rows: ['middle', 'back'],
      }),
    ).toBe(
      'Boss gathers Great Wave (middle and back rows), aimed at Ann, Bob and Cat. It lands in round 5.',
    );
    expect(
      line({ t: 'charge', round: 4, landing: 5, gimmick: 'wave', op: 'slam', marks: ['g'] }),
    ).toBe('Boss gathers Great Wave, aimed at Gus. It lands in round 5.');
    expect(
      line({
        t: 'gimmick',
        round: 5,
        gimmick: 'wave',
        op: 'charge',
        targets: ['a', 'b'],
        rows: ['front'],
      }),
    ).toBe('Great Wave lands (front row): Ann and Bob are hit.');
    expect(line({ t: 'gimmick', round: 5, gimmick: 'wave', op: 'charge', targets: ['a'] })).toBe(
      'Great Wave lands: Ann is hit.',
    );
    expect(line({ t: 'gimmick', round: 5, gimmick: 'wave', op: 'charge', targets: [] })).toBe(
      'Great Wave lands: nobody is hit.',
    );
  });

  it('says what a splash, cover, the cap and enrage did', () => {
    expect(
      line({ t: 'boss_hit', round: 4, source: 'gimmick', target: 'b', damage: 45, splash: true }),
    ).toBe('Bob is caught in the splash for 45.');
    expect(
      line({
        t: 'boss_hit',
        round: 4,
        source: 'gimmick',
        target: 'b',
        damage: 60,
        covered: { guard: 'g', prevented: 40 },
      }),
    ).toBe('Boss strikes Bob for 60. Gus covers 40 of it.');
    expect(
      line({
        t: 'boss_hit',
        round: 4,
        source: 'gimmick',
        target: 'b',
        damage: 45,
        splash: true,
        covered: { guard: 'g', prevented: 30 },
        capped: true,
      }),
    ).toBe('Bob is caught in the splash for 45. Gus covers 30 of it. The hit is capped.');
    expect(
      line({ t: 'boss_hit', round: 4, source: 'attack', target: 'a', damage: 50, capped: true }),
    ).toBe('Boss attacks Ann for 50. The hit is capped.');
    expect(line({ t: 'boss_hit', round: 13, source: 'enrage', target: 'a', damage: 300 })).toBe(
      'Boss rages at Ann for 300.',
    );
    expect(
      line({
        t: 'boss_hit',
        round: 13,
        source: 'enrage',
        target: 'a',
        damage: 0,
        shielded: true,
      }),
    ).toBe('Boss rages at Ann, but a Shield Wall stops it.');
  });

  it('describes the retreat, the enrage, heals and cleanses', () => {
    expect(line({ t: 'retreat', round: 4, bossHp: 7_000 })).toBe(
      'Boss reaches its limit at 7000 HP and retreats, out of reach. The phase is over.',
    );
    expect(line({ t: 'enrage', round: 13, first: true })).toBe('Out of time: Boss is enraged!');
    expect(line({ t: 'enrage', round: 14, first: false })).toBe('Boss is still enraged.');
    expect(line({ t: 'heal', round: 2, supporter: 'a', target: 'b', amount: 12 })).toBe(
      'Ann mends Bob (+12 HP).',
    );
    expect(line({ t: 'cleanse', round: 2, supporter: 'a', target: 'b' })).toBe(
      "Ann clears Bob's silence.",
    );
  });

  it('renders every event of fights with charges, a floor and enrage as non-empty text', () => {
    const seen = new Set<string>();
    const bosses = ['tidal-colossus', 'thornmother', 'cinder-wyrm', 'storm-sovereign'];
    for (let i = 0; i < 40; i++) {
      const base = randomInput(`describe-retune-${i}`, 1 + (i % 5), 'finale');
      const inp: FightInput = {
        ...base,
        boss: boss(bosses[i % 4] ?? 'tidal-colossus'),
        enrage: { rounds: 2, powerBp: 30_000 },
        rules: {
          coverBp: 4_000,
          maxHitBp: 5_000,
          guardHpBp: 0,
          guardArmorBp: 2_500,
          supportFx: { tide: { healBp: 400, cleanse: true } },
        },
        ...(i % 3 === 0 ? { bossHpFloor: Math.floor(base.bossHpPool.max * 0.9) } : {}),
      };
      for (const e of simulateFight(inp, rng()).events) {
        seen.add(e.t);
        const text = describeEvent(e, buildNames(inp));
        expect(text.length).toBeGreaterThan(5);
        expect(text).not.toContain('undefined');
      }
    }
    for (const t of ['charge', 'enrage', 'retreat']) expect(seen.has(t), t).toBe(true);
  });
});
