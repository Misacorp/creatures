/**
 * Combat v2: marks and reactions (R3 to R7), the Support verbs and heals, and the Guard that leaves a mark when it intercepts. Creatures
 * and boss are built by hand with their effects named directly; the dice are scripted, so every number is exact. These were the lab's
 * `fight`, `engine` and `talents` rule tests about marks and Support. The shipped chart: tide cashes ember, ember cashes grove and
 * mire, grove spark, spark tide, mire ember.
 */
import { describe, expect, it } from 'vitest';
import {
  boss,
  by,
  count,
  marks,
  move,
  play,
  spec,
  striker,
  texts,
  type SpecOver,
} from './v2-helpers';

/** A Setter of `element` at `col`. */
const setter = (col: number, element = 'tide', over: SpecOver = {}) =>
  spec({ name: `S${col}`, role: 'setter', element, col, ...over });
/** A Payoff of `element` at `col`. */
const payoff = (col: number, element = 'spark', over: SpecOver = {}) =>
  spec({ name: `P${col}`, role: 'payoff', element, col, ...over });

describe('marks (R3 to R5)', () => {
  it('without a Setter nothing marks, so nothing reacts', () => {
    const team = [
      spec({ name: 'G', role: 'guard', fx: { taunt: true } }),
      payoff(1, 'spark', { fx: { twinStrikeBp: 5_000 } }),
      payoff(2, 'ember'),
    ];
    const r = play(boss({ cols: 3, rounds: 6 }), team);
    expect(count(r, 'mark')).toBe(0);
    expect(r.reactions).toBe(0);
  });

  it('only a Payoff cashes; a reaction leaves no mark, unless an effect says so (a trail)', () => {
    const arena = boss({ cols: 2 });
    const plain = play(arena, [setter(0), payoff(1)]);
    expect(plain.reactions).toBe(1);
    expect(marks(plain)).toEqual(['tide x1']);
    // A Setter's own hit does not cash a mark, even one it could: it marks again.
    const twoSetters = play(arena, [setter(0), setter(1, 'spark')]);
    expect(twoSetters.reactions).toBe(0);
    expect(marks(twoSetters)).toEqual(['tide x1', 'spark x1']);
    const trail = play(arena, [setter(0), payoff(1, 'spark', { fx: { trail: true } })]);
    expect(marks(trail)).toEqual(['tide x1', 'spark x1']);
  });

  it('Twin Strike: each of its two hits can set off a reaction, while the mark has counts', () => {
    const twin = payoff(1, 'spark', { fx: { twinStrikeBp: 5_000 } });
    expect(play(boss({ cols: 2 }), [setter(0), twin]).reactions).toBe(1);
    expect(
      play(boss({ cols: 2 }), [setter(0, 'tide', { fx: { markStacks: 2 } }), twin]).reactions,
    ).toBe(2);
  });

  it('a mark holds at most 3 stacks', () => {
    const r = play(boss({ rounds: 6 }), [setter(0)]);
    expect(marks(r).at(-1)).toBe('tide x3');
    expect(marks(r)).toEqual(['tide x1', 'tide x2', 'tide x3', 'tide x3', 'tide x3', 'tide x3']);
  });

  it('a reaction on a trail mark leaves no further trail (the chain cap)', () => {
    const trail = { trail: true };
    const r = play(boss({ cols: 4 }), [
      setter(0),
      payoff(1, 'spark', { fx: trail }),
      payoff(2, 'grove', { fx: trail }),
      payoff(3, 'ember', { fx: trail }),
    ]);
    // Tide x1 (Setter), then spark x1 (the trail); the Grove Payoff cashes the trail mark and leaves none: the Ember Payoff has nothing.
    expect(marks(r)).toEqual(['tide x1', 'spark x1']);
    expect(r.reactions).toBe(2);
  });

  it('Fizzle: a mark left by a reaction cannot be cashed before the next boss turn', () => {
    const team = [setter(0), payoff(1, 'spark', { fx: { trail: true } }), payoff(2, 'grove')];
    expect(play(boss({ cols: 3, mods: { fizzle: true } }), team).reactions).toBe(1);
    expect(play(boss({ cols: 3 }), team).reactions).toBe(2);
  });

  it('a minimum count is checked before picking the oldest mark', () => {
    // Mire x1 is the oldest mark, grove x3 the newer: the Ember Payoff needs 3 counts, so it cashes the grove mark.
    const team = [
      setter(0, 'mire'),
      setter(1, 'grove', { fx: { markStacks: 3 } }),
      payoff(2, 'ember', { fx: { minStacks: 3 } }),
    ];
    const r = play(boss({ cols: 3 }), team);
    expect(r.reactions).toBe(1);
    expect(texts(r, 'reaction')).toEqual(['P2 cashes grove x1 for +100']);
    // With only the thin mark there is nothing to cash.
    expect(
      play(boss({ cols: 2 }), [setter(0, 'mire'), payoff(1, 'ember', { fx: { minStacks: 3 } })])
        .reactions,
    ).toBe(0);
  });

  it('Seal, All at Once: a Payoff that spends every count adds a share of the bonus for each extra one', () => {
    const team = [
      setter(0, 'tide', { fx: { markStacks: 3 } }),
      payoff(1, 'spark', { fx: { spendAllBp: 5_000 } }),
    ];
    const r = play(boss({ cols: 2 }), team);
    // Three counts spent: factor 1 + 2 x 50% = 2: the bonus is plain 100 x 2.
    expect(texts(r, 'reaction')).toEqual(['P1 cashes tide x3 for +200']);
  });

  it('Clean Scales sheds only the marks that were on the boss when its turn began', () => {
    const r = play(boss({ rounds: 2, cols: 2, mods: { shedMarks: true } }), [
      setter(0),
      spec({ name: 'G', role: 'guard', col: 1 }),
    ]);
    // Each round the Setter marks again: the count never grows past 1 because it is shed each boss turn.
    expect(marks(r)).toEqual(['tide x1', 'tide x1']);
  });

  it('Seal: a sealed mark is not shed by the boss', () => {
    const r = play(boss({ rounds: 2, mods: { shedMarks: true } }), [
      setter(0, 'tide', { fx: { seal: true } }),
    ]);
    expect(marks(r)).toEqual(['tide x1', 'tide x2']);
  });
});

describe('Primed by Pain and Baked Shell', () => {
  const twoHits = (rounds: number) =>
    boss({
      cols: 2,
      rounds,
      atk: 50,
      moves: ['m0', 'm1'].map((id) =>
        move({ anchor: 'front', shape: 'single' }, { id, name: id, powerBp: 5_000 }),
      ),
    });
  const team = (fx: object) => [
    setter(0),
    spec({ name: 'G', role: 'guard', element: 'grove', col: 1, fx }),
  ];
  const groveMarks = (r: Parameters<typeof marks>[0]) =>
    marks(r).filter((m) => m.startsWith('grove'));

  it('each interception leaves a mark, once a round: two interceptions in a round leave one', () => {
    // Two aimed hits each round at the front Setter; the Guard beside it takes both (it never dodges).
    const r = play(twoHits(4), team({ primeOnIntercept: true }));
    expect(r.intercepts).toBe(8);
    expect(groveMarks(r)).toHaveLength(4);
    // The mark is two counts, up to the most a mark holds.
    expect(groveMarks(r)).toEqual(['grove x2', 'grove x3', 'grove x3', 'grove x3']);
    // Without the effect the Guard marks nothing.
    expect(groveMarks(play(twoHits(4), team({})))).toEqual([]);
  });

  it('Primed by Pain beats Clean Scales: a mark left during the boss turn is not shed', () => {
    const strike = striker({ cols: 3, rounds: 2, atk: 60, mods: { shedMarks: true } });
    const crew = (fx: object) => [
      setter(0),
      spec({ name: 'G', role: 'guard', element: 'grove', col: 1, fx }),
      payoff(2, 'ember'),
    ];
    // The Guard's grove mark is still there when the Ember Payoff acts next round.
    const r = play(strike, crew({ primeOnIntercept: true }));
    expect(texts(r, 'reaction')).toEqual(['P2 cashes grove x1 for +100']);
    // Nothing else leaves a grove mark: without the effect there is nothing to cash.
    expect(play(strike, crew({})).reactions).toBe(0);
  });

  it('Baked Shell: Heat builds at every round start, up to three, and by damage', () => {
    const shell = () => spec({ name: 'K', role: 'guard', fx: { bakedShell: true } });
    const heat = (rounds: number) => by(play(boss({ rounds }), [shell()]), 'K').store;
    expect(heat(1)).toBe(1);
    expect(heat(2)).toBe(2);
    expect(heat(6)).toBe(3);
    // A hit it takes builds one too: a round start and a hit make two.
    expect(by(play(striker({ atk: 10 }), [shell()]), 'K').store).toBe(2);
  });

  it('Baked Shell: at three Heat the next reaction beside it deals double bonus, and spends the Heat', () => {
    const r = play(boss({ cols: 3, rounds: 4 }), [
      setter(0),
      payoff(1),
      spec({ name: 'K', role: 'guard', col: 2, fx: { bakedShell: true } }),
    ]);
    // Heat is 3 at round 3's start: that round's reaction doubles (+200), then it starts again from 0.
    expect(texts(r, 'reaction').map((t) => t.split('+')[1])).toEqual(['100', '100', '200', '100']);
  });
});

describe('reaction bonuses (R7)', () => {
  const trio = boss({ cols: 2, rounds: 3 });
  /** A Setter that leaves two counts a round and a Payoff with `fx`: its damage over three rounds, and the last reaction's bonus. */
  const pair = (fx: object, markFx: object = { markStacks: 2 }) => [
    setter(0, 'tide', { fx: markFx }),
    payoff(1, 'spark', { fx }),
  ];
  const bonuses = (r: Parameters<typeof texts>[0]) =>
    texts(r, 'reaction').map((t) => Number(t.split('+')[1]));

  it('Opportunist: a bigger reaction when it cashes a mark at x2 or more', () => {
    // Two counts a round, and the Payoff cashes one: every round it cashes a mark of x2 or x3.
    const on = play(trio, pair({ cashHighBp: 5_000 }));
    expect(by(on, 'P1').fires['cashHighBp']).toBe(3);
    expect(bonuses(on)).toEqual([150, 150, 150]);
    expect(by(on, 'P1').damageDealt).toBe(3 * 250);
    expect(by(play(trio, pair({})), 'P1').damageDealt).toBe(3 * 200);
    // With single marks (x1 when cashed) it never holds, and nothing changes.
    const single = play(trio, pair({ cashHighBp: 5_000 }, {}));
    expect(by(single, 'P1').fires['cashHighBp']).toBeUndefined();
    expect(single.damage).toBe(play(trio, pair({}, {})).damage);
  });

  it('reaction raises multiply, then the factor is capped at x3', () => {
    // In round 3 the Payoff cashes a mark at x3, set this boss turn: both raises hold.
    const last = (fx: object) => bonuses(play(trio, pair(fx))).at(-1);
    expect(last({})).toBe(100);
    // The two raises multiply (not add): 1.5 x 1.5 = 2.25, under the cap.
    expect(last({ cashHighBp: 5_000, freshMarkBp: 5_000 })).toBe(225);
    // A third raise would make 3.375: the factor stops at 3 (RULES.maxBonusFactorBp is 30000).
    expect(last({ cashHighBp: 5_000, freshMarkBp: 5_000, reactionBonusBp: 5_000 })).toBe(300);
  });

  it('Quick Draw: a bigger reaction on a mark set this boss turn, not one from an earlier row', () => {
    const a = play(trio, pair({ freshMarkBp: 5_000 }, {}));
    expect(by(a, 'P1').fires['freshMarkBp']).toBe(3);
    expect(by(a, 'P1').damageDealt).toBe(3 * 250);
    // The boss takes a turn between the rows, so the mark is no longer fresh.
    const rows = boss({ rows: 2, rounds: 3 });
    const split = (fx: object) => [setter(0), payoff(0, 'spark', { row: 1, fx })];
    const b = play(rows, split({ freshMarkBp: 5_000 }));
    expect(by(b, 'P0').fires['freshMarkBp']).toBeUndefined();
    expect(b.damage).toBe(play(rows, split({})).damage);
  });

  it("Owner's Mark: reactions on a mark it left are bigger, whoever cashes them", () => {
    const team = (setterFx: object, payoffFx: object) => [
      setter(0, 'tide', { fx: setterFx }),
      payoff(1, 'spark', { fx: payoffFx }),
    ];
    const owner = play(trio, team({ ownMarkBp: 5_000 }, {}));
    expect(by(owner, 'S0').fires['ownMarkBp']).toBe(3);
    expect(by(owner, 'P1').damageDealt).toBe(3 * 250);
    // On a creature that left none of the marks it does nothing.
    const other = play(trio, team({}, { ownMarkBp: 5_000 }));
    expect(other.damage).toBe(play(trio, team({}, {})).damage);
  });

  it('Deep Ink: its first mark each fight starts bigger by its count (a mark holds three at most)', () => {
    const r = play(boss({ rounds: 2 }), [setter(0, 'tide', { fx: { firstMarkExtra: 1 } })]);
    expect(marks(r)).toEqual(['tide x2', 'tide x3']);
    expect(marks(play(boss({ rounds: 2 }), [setter(0)]))).toEqual(['tide x1', 'tide x2']);
  });

  it('a heal-on-reaction effect heals the creature that set off a reaction on a mark of its element', () => {
    const team = [
      setter(0),
      spec({
        name: 'Mender',
        role: 'guard',
        element: 'tide',
        col: 1,
        fx: { healOnReactionBp: 1_000 },
      }),
      payoff(2),
    ];
    const r = play(boss({ cols: 3 }), team, { carryHp: new Map([['P2', 100]]) });
    expect(by(r, 'P2').hp).toBe(140);
  });
});

describe('Support verbs and heals (R16)', () => {
  const quiet = boss({ cols: 4 });
  /** A tide Support at `col`: it heals 4% of the Max HP of the creatures beside it and boosts their next hit by 15%. */
  const healer = (col: number, fx: object = {}, over: SpecOver = {}) =>
    spec({ name: 'H', role: 'support', element: 'tide', col, fx, ...over });
  const hurt = (...uids: [string, number][]) => ({ carryHp: new Map(uids) });

  it('the base verb heals and boosts the creatures beside it, not the ones further away', () => {
    const team = [
      spec({ name: 'W', col: 0 }),
      healer(1),
      spec({ name: 'N', col: 2 }),
      spec({ name: 'F', col: 3 }),
    ];
    const r = play(quiet, team, hurt(['W', 100], ['N', 100], ['F', 100]));
    expect([by(r, 'W').hp, by(r, 'N').hp, by(r, 'F').hp]).toEqual([116, 116, 100]);
    expect([by(r, 'W').damageDealt, by(r, 'N').damageDealt, by(r, 'F').damageDealt]).toEqual([
      115, 115, 100,
    ]);
  });

  it('Sunbeam heals the creature in front of it in its column, where a normal Support heals only beside it', () => {
    const arena = boss({ rows: 2, cols: 1 });
    const team = (fx: object) => [spec({ name: 'T' }), healer(0, fx, { row: 1 })];
    const hp = (fx: object) => by(play(arena, team(fx), hurt(['T', 100])), 'T').hp;
    // A Support heals at least 6% with it: 24 of 400.
    expect(hp({ support: 'sunbeam' })).toBe(124);
    expect(hp({})).toBe(100);
  });

  it('a row heal heals the whole row and a row boost boosts it, in place of the Support verb', () => {
    const team = (fx: object) => [
      spec({ name: 'W', col: 0 }),
      healer(1, fx),
      spec({ name: 'N', col: 2 }),
      spec({ name: 'F', col: 3 }),
    ];
    const hp = (fx: object) => {
      const r = play(quiet, team(fx), hurt(['W', 100], ['N', 100], ['F', 100]));
      return ['W', 'N', 'F'].map((n) => by(r, n).hp);
    };
    // The base verb never reaches F; the row heal heals 5% of Max HP (20) everywhere.
    expect(hp({})).toEqual([116, 116, 100]);
    expect(hp({ support: 'rowRain' })).toEqual([120, 120, 120]);
    // F stands two places away: only a row-wide boost reaches it (15% less 5% points, 10% to every creature in the row).
    const dmg = (fx: object) =>
      ['W', 'N', 'F'].map((n) => by(play(quiet, team(fx)), n).damageDealt);
    expect(dmg({})).toEqual([115, 115, 100]);
    expect(dmg({ support: 'rowBoost' })).toEqual([110, 110, 110]);
  });

  it('Bright Boost: every second boost it gives is doubled', () => {
    const team = [
      spec({ name: 'N', col: 0 }),
      healer(1, { brightBoost: true }, { element: 'spark' }),
    ];
    // Spark boost 15%: round 2 gives 30%.
    const r = play(boss({ cols: 2, rounds: 3 }), team);
    expect(by(r, 'N').damageDealt).toBe(115 + 130 + 115);
  });

  it('Kindred Boost: a bigger boost on creatures of its own element only', () => {
    const team = (element: string) => [
      spec({ name: 'N', element, col: 0 }),
      healer(1, { kindredBoostBp: 1_000 }, { element: 'spark' }),
    ];
    expect(by(play(boss({ cols: 2 }), team('spark')), 'N').damageDealt).toBe(125);
    expect(by(play(boss({ cols: 2 }), team('tide')), 'N').damageDealt).toBe(115);
  });

  it('Triage: the heal goes to the most hurt creature beside it, bigger', () => {
    const team = (fx: object, over: SpecOver = {}) => [
      spec({ name: 'W', col: 0 }),
      healer(1, fx, over),
      spec({ name: 'N', col: 2 }),
    ];
    const start = hurt(['W', 100], ['N', 300]);
    // Without it both are healed 16; with it only the most hurt (W) gets one heal, 50% bigger: 24.
    expect(play(boss({ cols: 3 }), team({}), start).healed).toBe(32);
    const triage = play(boss({ cols: 3 }), team({ triageBp: 5_000 }), start);
    expect(triage.healed).toBe(24);
    expect([by(triage, 'W').hp, by(triage, 'N').hp]).toEqual([124, 300]);
  });

  it('Triage is idle under a Support shape Knack: its own base verb is replaced, so nothing is aimed', () => {
    // Curl Up heals beside it like a normal Support, tripled for a creature below half HP; with Triage idle it stays that.
    const team = (fx: object) => [
      spec({ name: 'W', col: 0 }),
      healer(1, { support: 'curlUp', ...fx }, { triageIdle: true }),
      spec({ name: 'N', col: 2 }),
    ];
    const start = hurt(['W', 100], ['N', 300]);
    const withTriage = play(boss({ cols: 3 }), team({ triageBp: 5_000 }), start);
    expect(withTriage.healed).toBe(play(boss({ cols: 3 }), team({}), start).healed);
    // W below half: 3 x 16 = 48; N: 16.
    expect(withTriage.healed).toBe(64);
  });

  it('Overheal Spill: healing past full HP passes to the most hurt creature in the row of the one healed', () => {
    // N stands beside H (the healer), not beside W: N is one HP short, so its heal mostly overflows; W is at half.
    const team = (fx: object) => [
      spec({ name: 'W', col: 0 }),
      spec({ name: 'N', col: 1 }),
      healer(2, fx),
    ];
    const start = hurt(['N', 399], ['W', 200]);
    expect(by(play(boss({ cols: 3 }), team({}), start), 'W').hp).toBe(200);
    // The heal of 16: 1 fills N, 15 passes on.
    expect(by(play(boss({ cols: 3 }), team({ spillOver: true }), start), 'W').hp).toBe(215);
  });

  it('Overheal Spill reaches a hurt creature anywhere in the row, not only beside the one healed', () => {
    const team = (fx: object) => [
      spec({ name: 'W', col: 0 }),
      spec({ name: 'M', col: 1 }),
      spec({ name: 'N', col: 2 }),
      healer(3, fx),
    ];
    const start = hurt(['N', 399], ['W', 200]);
    expect(by(play(boss({ cols: 4 }), team({ spillOver: true }), start), 'W').hp).toBe(215);
  });

  it('a heal is cut by a Wither boss, and a hurt creature cannot be healed past full', () => {
    const team = [spec({ name: 'W', col: 0 }), healer(1)];
    const start = hurt(['W', 100]);
    expect(play(boss({ cols: 2, mods: { healBp: 5_000 } }), team, start).healed).toBe(8);
    expect(play(boss({ cols: 2 }), team, hurt(['W', 399])).healed).toBe(1);
  });
});
