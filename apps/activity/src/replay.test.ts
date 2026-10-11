import type { EventNames, FightEvent } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import type { ReplayRowEntry } from './raid-api';
import {
  beatEnds,
  indexAfterBeat,
  initialStep,
  keyMoments,
  mineInRow,
  personalRecap,
  recapNotes,
  stateAt,
  turnOrderOfRound,
} from './replay';

const row: ReplayRowEntry[] = [
  {
    position: 0,
    id: 'a',
    name: 'Alpha',
    species: 'splashet',
    element: 'tide',
    role: 'setter',
    level: 5,
    owner: 'm1',
  },
  {
    position: 1,
    id: 'b',
    name: 'Beta',
    species: 'zipmouse',
    element: 'spark',
    role: 'payoff',
    level: 5,
    owner: 'm1',
  },
  {
    position: 2,
    id: 'x',
    name: 'Xi',
    species: 'zipmouse',
    element: 'ember',
    role: 'guard',
    level: 5,
    owner: 'm2',
  },
];

const names: EventNames = {
  boss: 'Boss',
  creatures: { a: 'Alpha', b: 'Beta', x: 'Xi' },
  players: { m1: 'Misa', m2: 'Jun' },
  reactions: { overload: 'Overload' },
  gimmicks: { undertow: 'Undertow' },
  marks: { tide: 'Soaked', ember: 'Scorched' },
  elements: { tide: 'Tide', ember: 'Ember' },
};

const events: FightEvent[] = [
  /* 0 */ { t: 'round_start', round: 1, bossHp: 1000, mark: null },
  /* 1 */ { t: 'turn', round: 1, creature: 'a' },
  /* 2 */ {
    t: 'hit',
    round: 1,
    creature: 'a',
    damage: 100,
    matchupBp: 10_000,
    bonusBp: 0,
    mark: null,
    bossHp: 900,
  },
  /* 3 */ { t: 'mark', round: 1, creature: 'a', player: 'm1', element: 'tide', replaced: null },
  /* 4 */ { t: 'turn', round: 1, creature: 'b' },
  /* 5 */ {
    t: 'hit',
    round: 1,
    creature: 'b',
    damage: 300,
    matchupBp: 10_000,
    bonusBp: 0,
    mark: 'tide',
    bossHp: 600,
  },
  /* 6 */ {
    t: 'reaction',
    round: 1,
    reaction: 'overload',
    setupCreature: 'a',
    setupPlayer: 'm1',
    payoff: 'b',
    bonus: 200,
    reflected: false,
  },
  /* 7 */ { t: 'turn', round: 1, creature: 'x' },
  /* 8 */ {
    t: 'hit',
    round: 1,
    creature: 'x',
    damage: 50,
    matchupBp: 10_000,
    bonusBp: 0,
    mark: null,
    bossHp: 550,
  },
  /* 9 */ { t: 'mark', round: 1, creature: 'x', player: 'm2', element: 'ember', replaced: null },
  /* 10 */ { t: 'gimmick', round: 1, gimmick: 'undertow', op: 'hit_zone' },
  /* 11 */ { t: 'boss_hit', round: 1, source: 'gimmick', target: 'a', damage: 80 },
  /* 12 */ { t: 'knockout', round: 1, creature: 'a' },
  /* 13 */ { t: 'boss_hit', round: 1, source: 'attack', target: 'b', damage: 30 },
  /* 14 */ { t: 'round_end', round: 1, bossHp: 550 },
  /* 15 */ { t: 'round_start', round: 2, bossHp: 550, mark: 'ember' },
  /* 16 */ { t: 'turn', round: 2, creature: 'b' },
  /* 17 */ {
    t: 'hit',
    round: 2,
    creature: 'b',
    damage: 40,
    matchupBp: 10_000,
    bonusBp: 0,
    mark: 'ember',
    bossHp: 510,
  },
  /* 18 */ {
    t: 'mark',
    round: 2,
    creature: 'b',
    player: 'm1',
    element: 'spark',
    replaced: 'ember',
  },
];

describe('stepping', () => {
  it('starts with the full boss and nothing played', () => {
    expect(initialStep(1000)).toMatchObject({ index: 0, bossHp: 1000, mark: null, actor: null });
    expect(stateAt(events, 0, 1000)).toEqual(initialStep(1000));
  });

  it('tracks the actor, boss HP and mark as events apply', () => {
    const afterFirstTurn = stateAt(events, 3, 1000);
    expect(afterFirstTurn).toMatchObject({
      index: 3,
      round: 1,
      actor: 'a',
      bossHp: 900,
      mark: null,
    });
    const marked = stateAt(events, 4, 1000);
    expect(marked.mark).toBe('tide');
    const cashedIn = stateAt(events, 7, 1000);
    expect(cashedIn).toMatchObject({ actor: 'b', bossHp: 600, mark: null, acted: ['a'] });
  });

  it('shows the boss acting and the knockouts', () => {
    const state = stateAt(events, 13, 1000);
    expect(state.bossActing).toBe(true);
    expect(state.actor).toBeNull();
    expect(state.knockedOut).toEqual(['a']);
    expect(state.acted).toEqual(['a', 'b', 'x']);
  });

  it('resets the round at round start and takes the mark from it', () => {
    const state = stateAt(events, 16, 1000);
    expect(state).toMatchObject({ round: 2, bossHp: 550, mark: 'ember', actor: null, acted: [] });
    expect(state.knockedOut).toEqual(['a']);
  });

  it('ends on the last mark', () => {
    expect(stateAt(events, events.length, 1000)).toMatchObject({ mark: 'spark', bossHp: 510 });
  });

  it('clamps out-of-range positions', () => {
    expect(stateAt(events, -5, 1000).index).toBe(0);
    expect(stateAt(events, 9999, 1000).index).toBe(events.length);
    expect(stateAt([], 3, 77)).toEqual(initialStep(77));
  });

  it('does not mutate earlier states', () => {
    const early = stateAt(events, 4, 1000);
    stateAt(events, events.length, 1000);
    expect(early.knockedOut).toEqual([]);
    expect(early.actor).toBe('a');
    expect(early.acted).toEqual([]);
  });
});

describe('beats', () => {
  it('groups events into steps that end where the next turn or boss action begins', () => {
    expect(beatEnds(events)).toEqual([1, 4, 7, 10, 13, 14, 15, 16, events.length]);
    expect(beatEnds([])).toEqual([]);
    expect(beatEnds(events.slice(0, 1))).toEqual([1]);
  });

  it('maps a step count to an event count', () => {
    const ends = beatEnds(events);
    expect(indexAfterBeat(ends, 0)).toBe(0);
    expect(indexAfterBeat(ends, 2)).toBe(4);
    expect(indexAfterBeat(ends, ends.length)).toBe(events.length);
    expect(indexAfterBeat(ends, 999)).toBe(events.length);
    expect(indexAfterBeat([], 3)).toBe(0);
  });
});

describe('turn order', () => {
  it('lists who acts in a round, in order', () => {
    expect(turnOrderOfRound(events, 1)).toEqual(['a', 'b', 'x']);
    expect(turnOrderOfRound(events, 2)).toEqual(['b']);
    expect(turnOrderOfRound(events, 3)).toEqual([]);
  });

  it('includes silenced creatures', () => {
    const silenced: FightEvent[] = [
      { t: 'turn', round: 1, creature: 'a' },
      { t: 'skip', round: 1, creature: 'b', reason: 'silenced' },
    ];
    expect(turnOrderOfRound(silenced, 1)).toEqual(['a', 'b']);
  });
});

describe('keyMoments', () => {
  it('picks the notable events in order of importance', () => {
    const moments = keyMoments(events, names);
    expect(moments.map((m) => m.kind)).toEqual([
      'reaction',
      'hit',
      'gimmick',
      'knockout',
      'wasted',
    ]);
    expect(moments[0]?.text).toBe(
      'Overload! Beta cashes in the mark set by Alpha for 200 bonus damage.',
    );
    expect(moments[1]?.text).toContain('Beta hits Boss for 300');
    expect(moments[2]?.text).toBe('Boss strikes Alpha for 80.');
    expect(moments[3]?.text).toBe('Alpha is knocked out.');
  });

  it('never returns more than five', () => {
    const many: FightEvent[] = [
      ...events,
      { t: 'knockout', round: 2, creature: 'b' },
      {
        t: 'reaction',
        round: 2,
        reaction: 'overload',
        setupCreature: 'a',
        setupPlayer: 'm1',
        payoff: 'b',
        bonus: 10,
        reflected: true,
      },
    ];
    expect(keyMoments(many, names).length).toBeLessThanOrEqual(5);
  });

  it('reports a silence when there is no gimmick damage, and nothing for an empty fight', () => {
    const silenced: FightEvent[] = [{ t: 'silence', round: 2, creature: 'a', turns: 1 }];
    expect(keyMoments(silenced, names)).toEqual([
      { kind: 'gimmick', round: 2, title: 'Boss gimmick', text: 'Alpha is silenced for 1 turn.' },
    ]);
    expect(keyMoments([], names)).toEqual([]);
  });

  it('ignores gimmick hits that a Shield Wall stopped', () => {
    const shielded: FightEvent[] = [
      { t: 'boss_hit', round: 1, source: 'gimmick', target: 'a', damage: 0, shielded: true },
    ];
    expect(keyMoments(shielded, names)).toEqual([]);
  });

  it('keeps the first of equally big hits', () => {
    const ties: FightEvent[] = [
      {
        t: 'hit',
        round: 1,
        creature: 'a',
        damage: 10,
        matchupBp: 10_000,
        bonusBp: 0,
        mark: null,
        bossHp: 90,
      },
      {
        t: 'hit',
        round: 2,
        creature: 'b',
        damage: 10,
        matchupBp: 10_000,
        bonusBp: 0,
        mark: null,
        bossHp: 80,
      },
    ];
    expect(keyMoments(ties, names)[0]?.round).toBe(1);
  });
});

describe('personalRecap', () => {
  it('finds my creatures by my owner key in the fight', () => {
    expect(mineInRow(row, 'm1')).toEqual(['a', 'b']);
    expect(mineInRow(row, 'm2')).toEqual(['x']);
    expect(mineInRow(row, 'm9')).toEqual([]);
  });

  it('treats nothing as mine when I was not in the fight, and never a guest', () => {
    expect(mineInRow(row, null)).toEqual([]);
    const withGuest: ReplayRowEntry[] = [
      ...row,
      { ...(row[0] as ReplayRowEntry), id: 'g', owner: null },
    ];
    expect(mineInRow(withGuest, null)).toEqual([]);
    expect(mineInRow(withGuest, 'm1')).toEqual(['a', 'b']);
  });

  it('adds up damage, setup credit and reactions for my creatures only', () => {
    const recap = personalRecap(events, row, ['a', 'b']);
    const a = recap.creatures.find((c) => c.id === 'a');
    const b = recap.creatures.find((c) => c.id === 'b');
    expect(a).toMatchObject({
      damage: 100,
      setupCredit: 100,
      setups: 1,
      payoffs: 0,
      knockedOutRound: 1,
    });
    expect(b).toMatchObject({ damage: 340, setupCredit: 0, setups: 0, payoffs: 1, wasted: 0 });
    expect(recap.damage).toBe(440);
    expect(recap.setups).toBe(1);
    expect(recap.creatures.find((c) => c.id === 'x')).toBeUndefined();
  });

  it('counts a setup as wasted for the creature whose mark was overwritten', () => {
    const recap = personalRecap(events, row, ['x']);
    expect(recap.creatures[0]).toMatchObject({ id: 'x', wasted: 1, damage: 50 });
  });

  it('does not credit reflected reactions', () => {
    const reflected: FightEvent[] = [
      {
        t: 'reaction',
        round: 1,
        reaction: 'overload',
        setupCreature: 'a',
        setupPlayer: 'm1',
        payoff: 'b',
        bonus: 90,
        reflected: true,
      },
    ];
    const recap = personalRecap(reflected, row, ['a', 'b']);
    expect(recap.setups).toBe(0);
    expect(recap.setupCredit).toBe(0);
  });

  it('states that a team set up nothing, without advice', () => {
    const recap = personalRecap(events, row, ['b']);
    expect(recap.notes).toContain('None of your creatures set up a reaction.');
  });

  it('handles a player who had no creatures in the fight', () => {
    const recap = personalRecap(events, row, []);
    expect(recap.creatures).toEqual([]);
    expect(recap.notes).toEqual(['None of your creatures were in this fight.']);
  });
});

describe('recapNotes', () => {
  const base = {
    id: 'a',
    name: 'Alpha',
    role: 'setter',
    damage: 0,
    setupCredit: 0,
    setups: 1,
    payoffs: 0,
    wasted: 0,
    knockedOutRound: null,
  };

  it('counts wasted setups, with plurals', () => {
    expect(recapNotes([{ ...base, wasted: 1 }])).toEqual([
      '1 of your setups was overwritten before anyone cashed it in.',
    ]);
    expect(recapNotes([{ ...base, wasted: 2 }])).toEqual([
      '2 of your setups were overwritten before anyone cashed them in.',
    ]);
  });

  it('says when a creature was knocked out', () => {
    expect(recapNotes([{ ...base, knockedOutRound: 4 }])).toEqual([
      'Alpha was knocked out in round 4.',
    ]);
  });

  it('has nothing to say when all went well', () => {
    expect(recapNotes([base])).toEqual([]);
  });

  it('never gives advice', () => {
    const everything = recapNotes([
      { ...base, setups: 0, wasted: 3, knockedOutRound: 2 },
      { ...base, id: 'b', name: 'Beta' },
    ]).join(' ');
    expect(everything).not.toMatch(/\b(try|should|put|consider|better|instead)\b/i);
  });
});
