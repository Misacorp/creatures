import { describe, expect, it } from 'vitest';
import { eventsOf, inRound, input, boss, run, slot } from './helpers';

const six = () => ['f0', 'f1', 'm2', 'm3', 'b4', 'b5'].map((id) => slot(id, { atk: 1 }));
const withGimmicks = (gimmicks: ReturnType<typeof boss>['gimmicks']) => ({
  ...input([]).boss,
  gimmicks,
});

describe('hit_zone (Undertow)', () => {
  it('hits every living creature of the zone on every 3rd round, without interception', () => {
    const r = run(
      [
        slot('f0', { atk: 1 }),
        slot('f1', { atk: 1, role: 'guard' }),
        slot('m2', { atk: 1 }),
        slot('m3', { atk: 1 }),
        slot('b4', { atk: 1 }),
        slot('b5', { atk: 1 }),
      ],
      { boss: boss('tidal-colossus'), bossAtk: 100 },
    );
    const zoneHits = eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick');
    expect(zoneHits.map((e) => [e.round, e.target, e.damage])).toEqual(
      [3, 6, 9].flatMap((round) => [
        [round, 'f0', 80],
        [round, 'f1', 80],
      ]),
    );
    expect(eventsOf(r, 'gimmick').map((e) => e.round)).toEqual([3, 6, 9]);
    expect(eventsOf(r, 'gimmick')[0]).toMatchObject({ gimmick: 'undertow', op: 'hit_zone' });
    // The guard did not absorb the zone hit meant for f0 (f0 took its own 80 each time, above). All
    // the guard's credit is for the zone hits aimed at itself, none for f0's.
    expect(r.perCreature.f0!.damageTaken).toBeGreaterThanOrEqual(3 * 80);
    expect(r.perCreature.f1!.guardCredit).toBe(r.perCreature.f1!.damageTaken);
  });

  it('skips knocked-out creatures and empty zones', () => {
    const r = run([...six().slice(0, 4), slot('b4', { hp: 500 }), slot('b5', { hp: 500 })], {
      bossAtk: 1000,
      boss: withGimmicks([
        {
          id: 'z',
          name: 'Z',
          trigger: { eachRound: true },
          op: 'hit_zone',
          zone: 'back',
          power: 10_000,
        },
      ]),
    });
    const round1 = inRound(r, 1).filter((e) => e.t === 'boss_hit' && e.source === 'gimmick');
    expect(round1).toHaveLength(2);
    // Everyone in the back zone is knocked out by round 1, so round 2 has no zone hits.
    expect(inRound(r, 2).filter((e) => e.t === 'boss_hit' && e.source === 'gimmick')).toHaveLength(
      0,
    );
  });
});

describe('silence_ends (Bramble Bind)', () => {
  it('silences the creatures at both ends of the row for their next turn, every 2nd round', () => {
    const r = run(
      ['a', 'b', 'c', 'd'].map((id) => slot(id, { atk: 1 })),
      { boss: boss('thornmother') },
    );
    expect(eventsOf(r, 'silence').filter((e) => e.round === 2)).toEqual([
      { t: 'silence', round: 2, creature: 'a', turns: 1 },
      { t: 'silence', round: 2, creature: 'd', turns: 1 },
    ]);
    // Thornmother acts right to left: round 3 turn order is d (skipped), c, b, a (skipped).
    expect(inRound(r, 3).filter((e) => e.t === 'turn' || e.t === 'skip')).toEqual([
      { t: 'skip', round: 3, creature: 'd', reason: 'silenced' },
      { t: 'turn', round: 3, creature: 'c' },
      { t: 'turn', round: 3, creature: 'b' },
      { t: 'skip', round: 3, creature: 'a', reason: 'silenced' },
    ]);
    // Silence lasts one turn only.
    expect(inRound(r, 4).filter((e) => e.t === 'turn')).toHaveLength(4);
    expect(r.perCreature.a!.damage).toBeGreaterThan(0);
  });

  it('silences a single creature once when the row has one slot and respects multi-turn silence', () => {
    const r = run([slot('solo', { atk: 1 })], {
      boss: withGimmicks([
        { id: 's', name: 'S', trigger: { every: 5 }, op: 'silence_ends', turns: 2 },
      ]),
    });
    expect(eventsOf(r, 'silence').filter((e) => e.round === 5)).toHaveLength(1);
    expect(eventsOf(r, 'skip').map((e) => e.round)).toEqual([6, 7]);
    expect(inRound(r, 8).filter((e) => e.t === 'turn')).toHaveLength(1);
  });

  it('does not silence knocked-out creatures', () => {
    const r = run([slot('a', { hp: 1 }), slot('b'), slot('c')], {
      bossAtk: 10,
      boss: withGimmicks([
        { id: 's', name: 'S', trigger: { every: 2 }, op: 'silence_ends', turns: 1 },
      ]),
    });
    expect(eventsOf(r, 'silence').every((e) => e.creature !== 'a')).toBe(true);
  });
});

describe('reflect_first_reaction (Backdraft)', () => {
  const row = () => [
    slot('s1', { owner: 'a', element: 'tide', role: 'setter', atk: 100 }),
    slot('p1', { owner: 'b', element: 'spark', role: 'payoff', atk: 100 }),
    slot('s2', { owner: 'c', element: 'tide', role: 'setter', atk: 100 }),
    slot('p2', { owner: 'd', element: 'spark', role: 'payoff', atk: 100 }),
  ];
  const cinder = () => run(row(), { boss: { ...boss('cinder-wyrm'), element: 'tide' } });

  it('reflects the first reaction each round onto the triggering creature and still consumes the mark', () => {
    const r = cinder();
    const reactions = eventsOf(r, 'reaction').filter((e) => e.round === 1);
    expect(reactions).toMatchObject([
      { setupCreature: 's1', payoff: 'p1', bonus: 318, reflected: true },
      { setupCreature: 's2', payoff: 'p2', bonus: 318, reflected: false },
    ]);
    // The reflected hit deals only its plain damage to the boss; the bonus goes to p1.
    const hits = eventsOf(r, 'hit').filter((e) => e.round === 1);
    expect(hits.find((h) => h.creature === 'p1')!.damage).toBe(150);
    expect(hits.find((h) => h.creature === 'p2')!.damage).toBe(468);
    const reflect = eventsOf(r, 'boss_hit').find((e) => e.source === 'reflect')!;
    expect(reflect).toMatchObject({ round: 1, target: 'p1', damage: 318 });
    expect(r.perCreature.p1!.damageTaken).toBeGreaterThanOrEqual(318 * 10);
    // No bonus was dealt, so there is no setup credit for the reflected reaction.
    expect(r.perPlayer.a!.setupCredit).toBe(0);
    expect(r.perPlayer.c!.setupCredit).toBe(10 * 190); // 60% of the 318 bonus
    expect(r.perPlayer.b!.damage).toBe(10 * 150);
    // Reflected reactions still count as reactions; the mark was consumed (s2 re-applied it).
    expect(r.reactions.total).toBe(20);
  });

  it('can knock out the triggering creature', () => {
    const r = run(
      [
        slot('s', { element: 'tide', role: 'setter', atk: 100 }),
        slot('p', { element: 'spark', role: 'payoff', atk: 100, hp: 200 }),
      ],
      { boss: { ...boss('cinder-wyrm'), element: 'tide' } },
    );
    expect(eventsOf(r, 'knockout')[0]).toMatchObject({ creature: 'p', round: 1 });
  });

  it('is armed again every round', () => {
    const r = cinder();
    for (let round = 1; round <= 10; round++) {
      const first = inRound(r, round).find((e) => e.t === 'reaction');
      expect(first).toMatchObject({ reflected: true });
    }
  });
});

describe('strike_highest_atk (Lightning Rod)', () => {
  it('strikes the highest-Attack living creature, ties by position', () => {
    const r = run([slot('a', { atk: 50 }), slot('b', { atk: 90 }), slot('c', { atk: 90 })], {
      boss: boss('storm-sovereign'),
      bossAtk: 100,
    });
    const strikes = eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick');
    expect(strikes[0]).toMatchObject({ round: 1, target: 'b', damage: 120 });
    expect(eventsOf(r, 'gimmick')).toHaveLength(10);
  });

  it('moves on to the next creature when the target is knocked out', () => {
    const r = run(
      [slot('a', { atk: 50 }), slot('b', { atk: 90, hp: 100 }), slot('c', { atk: 10 })],
      {
        boss: boss('storm-sovereign'),
        bossAtk: 100,
      },
    );
    const strikes = eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick');
    expect(strikes[0]!.target).toBe('b');
    expect(eventsOf(r, 'knockout')[0]).toMatchObject({ creature: 'b' });
    expect(strikes[1]!.target).toBe('a');
  });
});
