import { describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import { simulateFight } from '../src/index';
import { eventsOf, input, inRound, rng, run, slot } from './helpers';

// Boss is Tide in these tests: Spark hits it at x1.5, Ember at x0.75, Tide and Grove at x1.

describe('basic hits and matchups', () => {
  it('deals attack times matchup, floored', () => {
    const r = run([slot('s', { element: 'spark', atk: 100 })]);
    expect(eventsOf(r, 'hit')[0]).toMatchObject({ damage: 150, matchupBp: 15_000 });
    const e = run([slot('e', { element: 'ember', atk: 101 })]);
    expect(eventsOf(e, 'hit')[0]).toMatchObject({ damage: 75, matchupBp: 7_500 }); // 75.75
    const n = run([slot('n', { element: 'tide', atk: 33 })]);
    expect(eventsOf(n, 'hit')[0]).toMatchObject({ damage: 33, matchupBp: 10_000 });
  });

  it('computes stats from the species when the slot has none and gives guards +30% HP', () => {
    const withStats = slot('a', { role: 'guard', hp: 100, atk: 10 });
    const noStats = { ...slot('b', { role: 'guard' }), speciesId: 'sproutle', level: 1 };
    delete (noStats as { stats?: unknown }).stats;
    // Guard max HP 130 means three 50-damage hits knock it out in round 3 (not round 2).
    const r = run([withStats, slot('c'), slot('d')], { bossAtk: 50 });
    expect(eventsOf(r, 'knockout')[0]).toMatchObject({ creature: 'a', round: 3 });
    const sp = content.creatures.find((c) => c.id === 'sproutle')!;
    const r2 = run([noStats, slot('c'), slot('d')], { bossAtk: sp.baseStats.hp });
    // 160 base HP x 1.3 = 208: survives one hit of 160, dies on the second.
    expect(eventsOf(r2, 'knockout')[0]).toMatchObject({ creature: 'b', round: 2 });
  });
});

describe('marks and reactions', () => {
  it('applies the hit element as the mark when the boss has none', () => {
    const r = run([slot('s', { element: 'ember', role: 'payoff' })]);
    expect(eventsOf(r, 'mark')[0]).toMatchObject({
      creature: 's',
      element: 'ember',
      replaced: null,
    });
  });

  it('only Setters overwrite a different mark; the same element changes nothing', () => {
    const row = [
      slot('a', { element: 'ember', role: 'payoff' }),
      slot('b', { element: 'grove', role: 'payoff' }), // not a setter: leaves the mark
      slot('c', { element: 'grove', role: 'setter' }), // overwrites
      slot('d', { element: 'grove', role: 'setter' }), // same element: no change
      slot('e', { element: 'ember', role: 'payoff' }), // Ember triggers Overgrown
    ];
    const r = run(row, { turnOrderOverride: 'left_to_right' });
    const round1 = inRound(r, 1);
    expect(round1.filter((e) => e.t === 'mark')).toEqual([
      { t: 'mark', round: 1, creature: 'a', player: 'p1', element: 'ember', replaced: null },
      { t: 'mark', round: 1, creature: 'c', player: 'p1', element: 'grove', replaced: 'ember' },
    ]);
    expect(round1.filter((e) => e.t === 'reaction')).toMatchObject([
      { reaction: 'wildfire', setupCreature: 'c', payoff: 'e', reflected: false },
    ]);
  });

  it('fires the right reaction for every mark/trigger pair and consumes the mark', () => {
    for (const reaction of content.reactions) {
      const r = run([
        slot('s', { element: reaction.markElement, role: 'setter' }),
        slot('p', { element: reaction.triggerElement, role: 'payoff' }),
        slot('q', { element: reaction.markElement, role: 'payoff' }),
      ]);
      const first = eventsOf(r, 'reaction')[0];
      expect(first).toMatchObject({ reaction: reaction.id, setupCreature: 's', payoff: 'p' });
      // The triggering hit does not apply a new mark; the next hit (q, the mark's own element) does.
      const marks = inRound(r, 1).filter((e) => e.t === 'mark');
      expect(marks).toHaveLength(2);
      expect(marks[1]).toMatchObject({ creature: 'q', replaced: null });
    }
  });

  it('does not react to a hit that is not the trigger element', () => {
    const r = run([
      slot('s', { element: 'tide', role: 'setter' }),
      slot('x', { element: 'grove', role: 'payoff' }), // Soaked is triggered by Spark only
    ]);
    expect(eventsOf(r, 'reaction')).toHaveLength(0);
  });

  it('splits the reaction bonus 50/50 between setup and payoff, summing exactly', () => {
    for (const atk of [1, 37, 38, 99, 100, 101, 250]) {
      const r = run([
        slot('s', { owner: 'ps', element: 'tide', role: 'setter', atk: 100 }),
        slot('p', { owner: 'pp', element: 'spark', role: 'payoff', atk }),
      ]);
      const reaction = eventsOf(r, 'reaction')[0]!;
      const plain = Math.floor((atk * 15_000) / 10_000);
      // Payoff multiplier: 2.5 x 1.25 = x3.125 on the hit.
      const full = Math.floor((plain * 31_250) / 10_000);
      const bonus = full - plain;
      expect(reaction.bonus).toBe(bonus);
      const setup = Math.floor(bonus / 2);
      expect(r.perPlayer.ps!.setupCredit).toBe(10 * setup);
      expect(r.perPlayer.pp!.damage).toBe(10 * (full - setup));
      // Nothing is lost or invented: credits add up to the damage dealt.
      const dealt = eventsOf(r, 'hit').reduce((sum, e) => sum + e.damage, 0);
      const t = r.perPlayer;
      expect(t.ps!.damage + t.ps!.setupCredit + t.pp!.damage).toBe(dealt);
    }
  });

  it('gives the exact bonus numbers for a known case', () => {
    const r = run([
      slot('s', { owner: 'ps', element: 'tide', role: 'setter', atk: 100 }),
      slot('p', { owner: 'pp', element: 'spark', role: 'payoff', atk: 100 }),
    ]);
    // plain 150, x3.125 = 468, bonus 318 split 159 / 159
    expect(eventsOf(r, 'hit')[1]).toMatchObject({ creature: 'p', damage: 468 });
    expect(eventsOf(r, 'reaction')[0]!.bonus).toBe(318);
    expect(r.perPlayer.ps).toMatchObject({ damage: 1000, setupCredit: 1590, contribution: 2590 });
    expect(r.perPlayer.pp).toMatchObject({ damage: 10 * (468 - 159), setupCredit: 0 });
  });

  it('applies the x1.25 payoff bonus only to Payoff creatures', () => {
    const base = (role: 'payoff' | 'guard') =>
      run([
        slot('s', { element: 'tide', role: 'setter', atk: 100 }),
        slot('p', { element: 'spark', role, atk: 100 }),
      ]);
    expect(eventsOf(base('payoff'), 'hit')[1]!.damage).toBe(468); // 150 x 3.125
    expect(eventsOf(base('guard'), 'hit')[1]!.damage).toBe(375); // 150 x 2.5
  });

  it('counts reactions by type', () => {
    const r = run([
      slot('s', { element: 'tide', role: 'setter' }),
      slot('p', { element: 'spark', role: 'payoff' }),
    ]);
    expect(r.reactions.total).toBe(10);
    expect(r.reactions.byType).toEqual({ overload: 10, grounding: 0, wildfire: 0, steam: 0 });
  });

  it('credits setup to the creature only for guests (no player)', () => {
    const r = run(
      [
        slot('g', { owner: null, element: 'tide', role: 'setter' }),
        slot('p', { owner: 'pp', element: 'spark', role: 'payoff' }),
      ],
      { players: ['pp'] },
    );
    expect(r.perCreature.g!.setupCredit).toBeGreaterThan(0);
    expect(Object.keys(r.perPlayer)).toEqual(['pp']);
  });
});

describe('support', () => {
  const row = () => [
    slot('a', { owner: 'pa', element: 'tide', role: 'payoff', atk: 100 }),
    slot('s', { owner: 'ps', element: 'ember', role: 'support', atk: 10 }),
    slot('b', { owner: 'pb', element: 'tide', role: 'payoff', atk: 100 }),
  ];

  it('gives both neighbours +15% on their next hit and credits the supporter', () => {
    const r = run(row());
    const round1 = inRound(r, 1);
    expect(round1.filter((e) => e.t === 'support_buff')).toEqual([
      { t: 'support_buff', round: 1, supporter: 's', target: 'a', bp: 1500 },
      { t: 'support_buff', round: 1, supporter: 's', target: 'b', bp: 1500 },
    ]);
    const hits = eventsOf(r, 'hit').filter((e) => e.round === 1);
    expect(hits.map((h) => [h.creature, h.damage, h.bonusBp])).toEqual([
      ['a', 115, 1500],
      ['s', 7, 0], // Ember into Tide, x0.75
      ['b', 115, 1500],
    ]);
    expect(r.perPlayer.ps!.supportCredit).toBe(10 * (15 + 15));
    // Zero-sum: the 15 extra damage per buffed hit moves from the hitter to the supporter.
    expect(r.perPlayer.pa!.damage).toBe(10 * (115 - 15));
    expect(r.perPlayer.pb!.damage).toBe(10 * (115 - 15));
    const dealt = eventsOf(r, 'hit').reduce((sum, e) => sum + e.damage, 0);
    const t = r.perPlayer;
    expect(t.pa!.contribution + t.ps!.contribution + t.pb!.contribution).toBe(dealt);
    expect(r.perPlayer.pa!.supportCredit).toBe(0);
  });

  it('consumes the buff on the hit and does not stack unused buffs', () => {
    // Boss silences the row ends every 2nd round: a and b skip round 3 and keep one buff only.
    const gimmicks = [
      { id: 'bind', name: 'Bind', trigger: { every: 2 }, op: 'silence_ends', turns: 1 },
    ] as const;
    const r = run(row(), { boss: { ...input([]).boss, gimmicks: [...gimmicks] } });
    const round3 = inRound(r, 3);
    expect(round3.filter((e) => e.t === 'skip')).toHaveLength(2);
    expect(
      round3.filter((e) => e.t === 'hit').map((e) => (e as { creature: string }).creature),
    ).toEqual(['s']);
    const a4 = eventsOf(r, 'hit').find((e) => e.round === 4 && e.creature === 'a')!;
    expect(a4.bonusBp).toBe(1500);
    expect(a4.damage).toBe(115);
  });

  it('does not buff while the supporter is silenced', () => {
    const gimmicks = [
      { id: 'bind', name: 'Bind', trigger: { every: 2 }, op: 'silence_ends', turns: 1 },
    ] as const;
    const r = run(
      [
        slot('s', { element: 'ember', role: 'support', atk: 10 }),
        slot('x', { atk: 100 }),
        slot('y', { atk: 100 }),
      ],
      { boss: { ...input([]).boss, gimmicks: [...gimmicks] } },
    );
    expect(inRound(r, 3).filter((e) => e.t === 'support_buff')).toHaveLength(0);
    expect(inRound(r, 4).filter((e) => e.t === 'support_buff')).toHaveLength(1);
  });
});

describe('guard and boss targeting', () => {
  const strike = (power: number) =>
    ({
      id: 'rod',
      name: 'Rod',
      trigger: { eachRound: true },
      op: 'strike_highest_atk',
      power,
    }) as const;

  it('intercepts hits meant for its zone, absorbs them and gets the credit', () => {
    // Row of 6: zones [0,1] [2,3] [4,5]. The highest-Attack creature is 'hi' (middle); 'g' guards the middle.
    const row = [
      slot('f0', { atk: 10 }),
      slot('f1', { atk: 10 }),
      slot('hi', { atk: 500 }),
      slot('g', { owner: 'pg', role: 'guard', hp: 1000, atk: 10 }),
      slot('b0', { atk: 10 }),
      slot('b1', { atk: 10 }),
    ];
    const r = run(row, {
      players: ['p1', 'pg'],
      bossAtk: 100,
      boss: { ...input([]).boss, gimmicks: [strike(10_000)] },
    });
    const first = eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick')!;
    expect(first).toMatchObject({ target: 'g', from: 'hi', damage: 100 });
    expect(r.perCreature.hi!.damageTaken).toBe(0);
    expect(r.perCreature.g!.damageTaken).toBe(10 * 100);
    expect(r.perCreature.g!.guardCredit).toBe(1000);
    expect(r.perPlayer.pg!.guardCredit).toBe(1000);
    expect(r.perPlayer.pg!.contribution).toBe(r.perPlayer.pg!.damage + 1000);
  });

  it('credits only the damage the guard could actually absorb, then stops intercepting when it falls', () => {
    const row = [
      slot('f0', { atk: 10 }),
      slot('f1', { atk: 10 }),
      slot('hi', { atk: 500 }),
      slot('g', { role: 'guard', hp: 10, atk: 10 }), // 13 HP with the guard bonus
      slot('b0', { atk: 10 }),
      slot('b1', { atk: 10 }),
    ];
    const r = run(row, { bossAtk: 100, boss: { ...input([]).boss, gimmicks: [strike(10_000)] } });
    expect(r.perCreature.g!.guardCredit).toBe(13);
    expect(r.perCreature.g!.knockedOutRound).toBe(1);
    const strikes = eventsOf(r, 'boss_hit').filter((e) => e.source === 'gimmick');
    expect(strikes[0]).toMatchObject({ target: 'g', from: 'hi' });
    expect(strikes[1]).toMatchObject({ target: 'hi' });
    expect(strikes[1]).not.toHaveProperty('from');
  });

  it('the boss attack goes front zone first and guards first, then moves back when a zone falls', () => {
    const row = [
      slot('f0', { hp: 1 }),
      slot('f1', { hp: 1 }),
      slot('m2'),
      slot('m3', { role: 'guard' }),
      slot('b4'),
      slot('b5'),
    ];
    const r = run(row, { bossAtk: 50 });
    const attacks = eventsOf(r, 'boss_hit').filter((e) => e.source === 'attack');
    expect(attacks.slice(0, 4).map((e) => e.target)).toEqual(['f0', 'f1', 'm3', 'm3']);
    const guardFront = run(
      [slot('x'), slot('y', { role: 'guard' }), slot('z'), slot('w'), slot('v'), slot('u')],
      { bossAtk: 5 },
    );
    expect(eventsOf(guardFront, 'boss_hit')[0]).toMatchObject({ target: 'y' });
  });

  it('knocks creatures out: they stop acting but keep their credit', () => {
    const r = run([slot('a', { hp: 10, atk: 100 }), slot('b'), slot('c')], { bossAtk: 50 });
    expect(eventsOf(r, 'knockout')).toEqual([{ t: 'knockout', round: 1, creature: 'a' }]);
    const turnsOfA = eventsOf(r, 'turn').filter((e) => e.creature === 'a');
    expect(turnsOfA).toHaveLength(1);
    expect(r.perCreature.a).toMatchObject({ damage: 100, knockedOutRound: 1, damageTaken: 10 });
    expect(r.perPlayer.p1!.damage).toBeGreaterThan(100);
  });

  it('ends the fight when every creature is knocked out', () => {
    const r = run([slot('a', { hp: 5 })], { bossAtk: 50 });
    expect(r.rounds).toBe(1);
    expect(r.cleared).toBe(false);
  });
});

describe('ending and clearing', () => {
  it('ends early when the pool reaches 0 and skips everything after the killing blow', () => {
    const r = run([slot('a', { atk: 100 }), slot('b', { atk: 100 }), slot('c', { atk: 100 })], {
      bossHpPool: { max: 1000, current: 350 },
      phase: 'finale',
    });
    expect(r.rounds).toBe(2);
    expect(r.bossHpEnd).toBe(0);
    expect(r.cleared).toBe(true);
    expect(eventsOf(r, 'turn').map((e) => e.creature)).toEqual(['a', 'b', 'c', 'a']);
    const last = r.events[r.events.length - 1]!;
    expect(last).toEqual({ t: 'round_end', round: 2, bossHp: 0 });
    // No boss attack after the killing blow.
    expect(eventsOf(r, 'boss_hit').filter((e) => e.round === 2)).toHaveLength(0);
  });

  it('never takes the pool below 0', () => {
    const r = run([slot('a', { atk: 5000 })], { bossHpPool: { max: 10, current: 10 } });
    expect(r.bossHpEnd).toBe(0);
    expect(eventsOf(r, 'hit')[0]!.bossHp).toBe(0);
  });

  it('applies the clear thresholds to cumulative loss and carries the pool across phases', () => {
    const one = (atk: number) => [slot('a', { atk })]; // tide into tide: atk per round
    const pool = { max: 1000, current: 1000 };
    // Phase 1: 10 rounds x 30 = 300 = exactly 30% -> cleared; 29 per round is not.
    const p1 = run(one(30), { phase: 'phase1', bossHpPool: pool });
    expect(p1).toMatchObject({ rounds: 10, bossHpEnd: 700, cleared: true });
    expect(run(one(29), { phase: 'phase1', bossHpPool: pool }).cleared).toBe(false);
    // Phase 2 starts from what phase 1 left: needs 600 lost in total.
    const p2 = run(one(30), { phase: 'phase2', bossHpPool: { max: 1000, current: p1.bossHpEnd } });
    expect(p2).toMatchObject({ bossHpStart: 700, bossHpEnd: 400, cleared: true });
    expect(run(one(29), { phase: 'phase2', bossHpPool: { max: 1000, current: 700 } }).cleared).toBe(
      false,
    );
    // Finale: only a dead boss counts, and it runs boss.finaleRounds rounds (12).
    const f = run(one(30), { phase: 'finale', bossHpPool: { max: 1000, current: 400 } });
    expect(f).toMatchObject({ rounds: 12, bossHpEnd: 40, cleared: false });
    const f2 = run(one(40), { phase: 'finale', bossHpPool: { max: 1000, current: 400 } });
    expect(f2).toMatchObject({ rounds: 10, bossHpEnd: 0, cleared: true });
  });

  it('a pool already past the threshold counts as cleared', () => {
    const r = run([slot('a', { atk: 1 })], { bossHpPool: { max: 1000, current: 100 } });
    expect(r.cleared).toBe(true);
  });

  it('uses the boss finaleRounds for the finale only', () => {
    const b = { ...input([]).boss, finaleRounds: 5 };
    expect(run([slot('a', { atk: 1 })], { boss: b, phase: 'finale' }).rounds).toBe(5);
    expect(run([slot('a', { atk: 1 })], { boss: b, phase: 'phase2' }).rounds).toBe(10);
  });
});

describe('adaptation', () => {
  const elementRule = { rule: 'resist-top-element', target: 'spark' };
  const reactionRule = { rule: 'resist-top-reaction', target: 'overload' };

  it('resists the chosen element by 25%', () => {
    const r = run([slot('p', { element: 'spark', atk: 100 })], { adaptation: elementRule });
    expect(eventsOf(r, 'hit')[0]!.damage).toBe(112); // 150 x 0.75
    expect(eventsOf(r, 'adaptation')[0]).toMatchObject({ round: 0, status: 'active' });
    const other = run([slot('p', { element: 'tide', atk: 100 })], { adaptation: elementRule });
    expect(eventsOf(other, 'hit')[0]!.damage).toBe(100);
  });

  it('halves the bonus damage of the chosen reaction only', () => {
    const row = [
      slot('s', { owner: 'ps', element: 'tide', role: 'setter', atk: 100 }),
      slot('p', { owner: 'pp', element: 'spark', role: 'payoff', atk: 100 }),
    ];
    const r = run(row, { adaptation: reactionRule });
    // bonus 318 - 159 = 159; hit = 150 + 159
    expect(eventsOf(r, 'reaction')[0]!.bonus).toBe(159);
    expect(eventsOf(r, 'hit')[1]!.damage).toBe(309);
    expect(r.perPlayer.ps!.setupCredit).toBe(10 * 79);
    const other = run(row, { adaptation: { rule: 'resist-top-reaction', target: 'steam' } });
    expect(eventsOf(other, 'reaction')[0]!.bonus).toBe(318);
  });

  it('suggests a counter after phase 1 and none in other phases', () => {
    const row = [
      slot('s', { element: 'tide', role: 'setter', atk: 100 }),
      slot('p', { element: 'spark', role: 'payoff', atk: 100 }),
    ];
    const reaction = run(row, { boss: { ...input([]).boss, adaptation: 'resist-top-reaction' } });
    expect(reaction.adaptationSuggestion).toMatchObject({
      rule: 'resist-top-reaction',
      target: 'overload',
      resistBp: 5000,
    });
    expect(reaction.adaptationSuggestion!.description).toBe(
      'Tidal Colossus now resists Overload by 50% (the reaction used most).',
    );
    expect(eventsOf(reaction, 'adaptation').at(-1)).toMatchObject({
      status: 'suggested',
      target: 'overload',
    });
    const element = run(row, { boss: { ...input([]).boss, adaptation: 'resist-top-element' } });
    // Spark dealt the most damage (468 per round against 100).
    expect(element.adaptationSuggestion).toMatchObject({ target: 'spark', resistBp: 2500 });
    expect(element.adaptationSuggestion!.description).toBe(
      'Tidal Colossus now resists Spark damage by 25% (the element that dealt the most damage).',
    );
    expect(run(row, { phase: 'phase2' }).adaptationSuggestion).toBeNull();
    expect(run(row, { phase: 'finale' }).adaptationSuggestion).toBeNull();
  });

  it('suggests nothing to resist when no reaction happened', () => {
    const r = run([slot('a')], { boss: { ...input([]).boss, adaptation: 'resist-top-reaction' } });
    expect(r.adaptationSuggestion).toMatchObject({ target: null });
    expect(r.adaptationSuggestion!.description).toContain('no reactions');
  });

  it('breaks ties by content order', () => {
    // One Overload (tide mark, spark trigger) and one Steam (ember mark, tide trigger) in round 1 only.
    const r = run(
      [
        slot('s1', { element: 'tide', role: 'setter' }),
        slot('p1', { element: 'spark', role: 'payoff' }),
        slot('s2', { element: 'ember', role: 'setter' }),
        slot('p2', { element: 'tide', role: 'payoff' }),
      ],
      { boss: { ...input([]).boss, adaptation: 'resist-top-reaction' } },
    );
    const byType = r.reactions.byType;
    expect(byType.overload).toBe(byType.steam);
    expect(r.adaptationSuggestion!.target).toBe('overload');
  });
});

describe('input checks', () => {
  const ok = () => input([slot('a')]);

  it('rejects broken inputs', () => {
    expect(() => simulateFight(input([]), rng())).toThrow(RangeError);
    expect(() => simulateFight(input([slot('a'), slot('a')]), rng())).toThrow(/duplicate creature/);
    expect(() => simulateFight({ ...ok(), bossHpPool: { max: 10, current: 11 } }, rng())).toThrow(
      RangeError,
    );
    expect(() => simulateFight({ ...ok(), bossHpPool: { max: 0, current: 0 } }, rng())).toThrow(
      RangeError,
    );
    expect(() => simulateFight({ ...ok(), bossAtk: 0 }, rng())).toThrow(RangeError);
    expect(() => simulateFight({ ...ok(), players: ['p1', 'p1'] }, rng())).toThrow(
      /duplicate player/,
    );
    expect(() => simulateFight({ ...ok(), players: ['other'] }, rng())).toThrow(/not signed up/);
    expect(() =>
      simulateFight({ ...ok(), adaptation: { rule: 'nope', target: 'x' } }, rng()),
    ).toThrow(/adaptation/);
    expect(() =>
      simulateFight({ ...ok(), finaleAbilities: [{ playerId: 'p1', abilityId: 'nope' }] }, rng()),
    ).toThrow(/finale ability/);
    expect(() =>
      simulateFight(
        { ...ok(), finaleAbilities: [{ playerId: 'ghost', abilityId: 'rally' }] },
        rng(),
      ),
    ).toThrow(/unknown player/);
    expect(() =>
      simulateFight(
        { ...ok(), finaleAbilities: [{ playerId: 'p1', abilityId: 'rally', fireAtRound: 0 }] },
        rng(),
      ),
    ).toThrow(/fireAtRound/);
  });

  it('does not change its input', () => {
    const i = ok();
    const before = JSON.stringify(i);
    simulateFight(i, rng());
    expect(JSON.stringify(i)).toBe(before);
  });
});
