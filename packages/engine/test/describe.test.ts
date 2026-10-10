import { describe, expect, it } from 'vitest';
import { describeEvent, simulateFight, buildNames, type FightEvent } from '../src/index';
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
        { t: 'ability', round: 3, player: 'p', ability: 'rally', byDefault: true },
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
