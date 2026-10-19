import { describe, expect, it } from 'vitest';
import { eventsOf, inRound, input, boss, run, slot } from './helpers';

const six = () => ['f0', 'f1', 'm2', 'm3', 'b4', 'b5'].map((id) => slot(id, { atk: 1 }));
const withGimmicks = (gimmicks: ReturnType<typeof boss>['gimmicks']) => ({
  ...input([]).boss,
  gimmicks,
});

// The first moves of the shipped bosses, frozen here so these mechanic tests do not move when the
// content is retuned or a boss gains new moves.
const UNDERTOW: ReturnType<typeof boss>['gimmicks'][number] = {
  id: 'undertow',
  name: 'Undertow',
  trigger: { every: 3 },
  op: 'hit_zone',
  zone: 'front',
  power: 8_000,
};
const LIGHTNING_ROD: ReturnType<typeof boss>['gimmicks'][number] = {
  id: 'lightning-rod',
  name: 'Lightning Rod',
  trigger: { eachRound: true },
  op: 'strike_highest_atk',
  power: 12_000,
};

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
      { boss: withGimmicks([UNDERTOW]), bossAtk: 100 },
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

  it('skips knocked-out creatures, and a zone with nobody standing falls to the nearest one', () => {
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
    // Everyone in the back zone is knocked out by round 1, so the round 2 strike goes to the
    // Middle zone (m2, m3) instead of missing; nobody who is down is hit.
    const round2 = inRound(r, 2).flatMap((e) =>
      e.t === 'boss_hit' && e.source === 'gimmick' ? [e.target] : [],
    );
    expect(round2).toEqual(['m2', 'm3']);
  });
});

describe('silence_ends (Bramble Bind)', () => {
  const bind = (scope: 'rows' | 'row') =>
    withGimmicks([
      { id: 'bind', name: 'Bind', trigger: { every: 2 }, op: 'silence_ends', scope, turns: 1 },
    ]);
  const silencedIn = (r: ReturnType<typeof run>) =>
    eventsOf(r, 'silence')
      .filter((e) => e.round === 2)
      .map((e) => e.creature);

  it('scope rows silences the ends of each row of the board, not of the line', () => {
    const row = Array.from({ length: 13 }, (_, i) => slot(`s${String(i)}`, { atk: 1 }));
    // A board of 15 (rows of 5) with a gap at the end of the middle row and of the back row.
    const board = { length: 15, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13] };
    const withShape = run(row, { boss: bind('rows'), board });
    expect(silencedIn(withShape)).toEqual(['s0', 's4', 's5', 's8', 's9', 's12']);
    // Without a shape the rows are the length formula's 4 / 5 / 4.
    expect(silencedIn(run(row, { boss: bind('rows') }))).toEqual([
      's0',
      's3',
      's4',
      's8',
      's9',
      's12',
    ]);
    // The whole line keeps its two ends, whatever the shape.
    expect(silencedIn(run(row, { boss: bind('row'), board }))).toEqual(['s0', 's12']);
  });

  it('scope rows silences a row with one creature standing once, and skips an empty row', () => {
    const row = ['a', 'b', 'c'].map((id) => slot(id, { atk: 1 }));
    // Front 1, middle 1, back 1: each is the end of its own row, silenced once.
    expect(
      silencedIn(run(row, { boss: bind('rows'), board: { length: 3, slots: [0, 1, 2] } })),
    ).toEqual(['a', 'b', 'c']);
    // An empty middle row is skipped.
    expect(
      silencedIn(run(row, { boss: bind('rows'), board: { length: 9, slots: [0, 1, 6] } })),
    ).toEqual(['a', 'b', 'c']);
    // A fallen row end passes the silence to the next one standing in its row.
    const hurt = [slot('a', { hp: 1 }), slot('b'), slot('c'), slot('d')];
    expect(
      silencedIn(
        run(hurt, { bossAtk: 10, boss: bind('rows'), board: { length: 9, slots: [0, 1, 6, 7] } }),
      ),
    ).toEqual(['b', 'c', 'd']);
  });

  it('silences the creatures at both ends of the row for their next turn, every 2nd round', () => {
    const r = run(
      ['a', 'b', 'c', 'd'].map((id) => slot(id, { atk: 1 })),
      { boss: { ...bind('row'), turnOrder: 'right_to_left' } },
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
        { id: 's', name: 'S', trigger: { every: 5 }, op: 'silence_ends', scope: 'row', turns: 2 },
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
        { id: 's', name: 'S', trigger: { every: 2 }, op: 'silence_ends', scope: 'row', turns: 1 },
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
  // Pinned to the old speed order (all Speeds equal: left to right) so the hand-checked numbers hold.
  const cinder = () =>
    run(row(), { boss: { ...boss('cinder-wyrm'), element: 'tide', turnOrder: 'speed' } });

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
      { boss: { ...boss('cinder-wyrm'), element: 'tide', turnOrder: 'speed' } },
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

  it('announces the trap once per armed round, when it is armed (not again on the boss turn)', () => {
    const trap = (trigger: { eachRound: true } | { every: number }) =>
      run(row(), {
        boss: {
          ...withGimmicks([
            { id: 'backdraft', name: 'Backdraft', trigger, op: 'reflect_first_reaction' },
          ]),
          element: 'tide',
        },
      });
    const each = trap({ eachRound: true });
    expect(eventsOf(each, 'gimmick')).toHaveLength(each.rounds);
    for (let round = 1; round <= each.rounds; round++) {
      const events = inRound(each, round);
      const announced = events.filter((e) => e.t === 'gimmick');
      expect(announced).toHaveLength(1);
      // Written at round start, before any creature acts.
      expect(events.findIndex((e) => e.t === 'gimmick')).toBeLessThan(
        events.findIndex((e) => e.t === 'turn'),
      );
    }
    const third = trap({ every: 3 });
    expect(eventsOf(third, 'gimmick').map((e) => e.round)).toEqual([3, 6, 9]);
  });
});

describe('strike_highest_atk (Lightning Rod)', () => {
  it('strikes the highest-Attack living creature, ties by position', () => {
    const r = run([slot('a', { atk: 50 }), slot('b', { atk: 90 }), slot('c', { atk: 90 })], {
      boss: withGimmicks([LIGHTNING_ROD]),
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
        boss: withGimmicks([LIGHTNING_ROD]),
        bossAtk: 100,
      },
    );
    const strikes = eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick');
    expect(strikes[0]!.target).toBe('b');
    expect(eventsOf(r, 'knockout')[0]).toMatchObject({ creature: 'b' });
    expect(strikes[1]!.target).toBe('a');
  });
});
