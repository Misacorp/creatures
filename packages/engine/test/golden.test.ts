import { describe, expect, it } from 'vitest';
import { describeEvent, buildNames, type FightEvent } from '../src/index';
import { input, run, slot } from './helpers';

/**
 * A fixed fight worked out by hand. Row: A (Tide setter, Attack 100), C (Ember support, Attack 20),
 * B (Spark payoff, Attack 100), left to right, against a Tide boss with 1000 HP and no gimmicks.
 *
 * Round 1: C buffs A and B (+15%).
 *   A: 100 x 1.00 x 1.15 = 115 and leaves Soaked. 1000 -> 885.
 *   C: 20 x 0.75 = 15 (Ember into Tide). 885 -> 870.
 *   B: 100 x 1.5 x 1.15 = 172.5 -> 172; Overload: x3.125 = 537.5 -> 537, bonus 365.
 *      Setup (A) 219 (60% of the bonus, rounded down), payoff (B) 146. 870 -> 333. Support credit for C: 537 - 468 = 69
 *      (taken from B's credit). Likewise C gets 15 of A's 115.
 *   The boss hits the front creature A for 10.
 * Round 2: the same hits; B's 537 takes the last 203 HP and ends the fight.
 */
describe('golden fight', () => {
  const row = () => [
    slot('A', { owner: 'pa', element: 'tide', role: 'setter', atk: 100, hp: 100 }),
    slot('C', { owner: 'pc', element: 'ember', role: 'support', atk: 20, hp: 100 }),
    slot('B', { owner: 'pb', element: 'spark', role: 'payoff', atk: 100, hp: 100 }),
  ];
  const fight = () =>
    run(row(), {
      bossAtk: 10,
      bossHpPool: { max: 1000, current: 1000 },
      turnOrderOverride: 'left_to_right',
      // The plain line (the dungeon's adjacency): the raid's zone-edge rule would leave C with no
      // neighbours in a row of three, and this test is about the arithmetic, not the reach.
      guardReach: 'adjacent',
    });

  const roundEvents = (round: number, bossHpAtStart: number, hits: number[]): FightEvent[] => {
    const [a, c, b] = hits as [number, number, number];
    const afterA = bossHpAtStart - a;
    const afterC = afterA - c;
    const afterB = Math.max(0, afterC - b);
    const events: FightEvent[] = [
      { t: 'round_start', round, bossHp: bossHpAtStart, mark: null },
      { t: 'support_buff', round, supporter: 'C', target: 'A', bp: 1500 },
      { t: 'support_buff', round, supporter: 'C', target: 'B', bp: 1500 },
      { t: 'turn', round, creature: 'A' },
      {
        t: 'hit',
        round,
        creature: 'A',
        damage: a,
        matchupBp: 10_000,
        bonusBp: 1500,
        mark: null,
        bossHp: afterA,
      },
      { t: 'mark', round, creature: 'A', player: 'pa', element: 'tide', replaced: null },
      { t: 'turn', round, creature: 'C' },
      {
        t: 'hit',
        round,
        creature: 'C',
        damage: c,
        matchupBp: 7500,
        bonusBp: 0,
        mark: 'tide',
        bossHp: afterC,
      },
      { t: 'turn', round, creature: 'B' },
      {
        t: 'hit',
        round,
        creature: 'B',
        damage: b,
        matchupBp: 15_000,
        bonusBp: 1500,
        mark: 'tide',
        bossHp: afterB,
      },
      {
        t: 'reaction',
        round,
        reaction: 'overload',
        setupCreature: 'A',
        setupPlayer: 'pa',
        payoff: 'B',
        bonus: 365,
        reflected: false,
      },
    ];
    if (afterB > 0)
      events.push({ t: 'boss_hit', round, source: 'attack', target: 'A', damage: 10 });
    events.push({ t: 'round_end', round, bossHp: afterB });
    return events;
  };

  it('produces the hand-checked event sequence', () => {
    const r = fight();
    expect(r.events).toEqual([
      ...roundEvents(1, 1000, [115, 15, 537]),
      ...roundEvents(2, 333, [115, 15, 537]),
      {
        t: 'adaptation',
        round: 2,
        rule: 'resist-top-reaction',
        target: 'overload',
        status: 'suggested',
      },
    ]);
  });

  it('produces the hand-checked totals', () => {
    const r = fight();
    expect(r).toMatchObject({ rounds: 2, bossHpStart: 1000, bossHpEnd: 0, cleared: true });
    expect(r.perPlayer).toEqual({
      pa: {
        damage: 2 * (115 - 15),
        setupCredit: 438,
        supportCredit: 0,
        guardCredit: 0,
        contribution: 638,
      },
      pc: {
        damage: 30,
        setupCredit: 0,
        supportCredit: 2 * (15 + 69),
        guardCredit: 0,
        contribution: 198,
      },
      pb: {
        damage: 2 * (537 - 219 - 69),
        setupCredit: 0,
        supportCredit: 0,
        guardCredit: 0,
        contribution: 498,
      },
    });
    expect(r.perCreature.A).toMatchObject({
      ownerId: 'pa',
      damageTaken: 10,
      knockedOutRound: null,
    });
    expect(r.reactions).toEqual({
      byType: { overload: 2, grounding: 0, wildfire: 0, steam: 0 },
      total: 2,
    });
    expect(r.damageByElement).toEqual({ tide: 230, ember: 30, grove: 0, spark: 1074 });
    // Phase 1 ends with the counter for phase 2 (the helper boss uses the reaction rule).
    expect(r.adaptationSuggestion).toMatchObject({
      rule: 'resist-top-reaction',
      target: 'overload',
      resistBp: 5000,
    });
  });

  it('renders the log as plain English', () => {
    const r = fight();
    const names = buildNames(input(row(), { phase: 'phase1' }), { pa: 'Ann' });
    const lines = r.events.slice(0, 11).map((e) => describeEvent(e, names));
    expect(lines).toEqual([
      'Round 1: Tidal Colossus has 1000 HP.',
      'C powers up A (+15% damage on its next hit).',
      'C powers up B (+15% damage on its next hit).',
      'A acts.',
      'A hits Tidal Colossus for 115; 885 HP left.',
      'A leaves Tidal Colossus Soaked.',
      'C acts.',
      'C hits Tidal Colossus for 15 (weak matchup); 870 HP left.',
      'B acts.',
      'B hits Tidal Colossus for 537 (strong matchup); 333 HP left.',
      'Overload! B cashes in the mark set by A for 365 bonus damage.',
    ]);
  });
});
