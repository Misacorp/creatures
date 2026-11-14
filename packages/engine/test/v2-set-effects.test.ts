/**
 * The five three-piece set effects of combat v2 (gear plan OPEN 5): Warden's Watch (`reachBonus`), Hollow Weave (`healOnCashBp`),
 * Ridge Copper (`trailSet`), Hearth Helpers (`boostReachSet`) and First Footprints' Deep Tracks (`deepTracks`). Each is a plain effect
 * field the engine reads; the "with the Knack" parts tell the set's field from the Knack's own. Creatures are built by hand, the dice
 * are scripted. Gear goes into `fxAll`, so silence blanks every one of them.
 */
import { describe, expect, it } from 'vitest';
import {
  boardEvents,
  boss,
  hush,
  marks,
  play,
  spec,
  striker,
  takes,
  texts,
  type SpecOver,
} from './v2-helpers';

const setter = (col: number, element = 'tide', over: SpecOver = {}) =>
  spec({ name: `S${col}`, role: 'setter', element, col, ...over });
const payoff = (col: number, element = 'spark', over: SpecOver = {}) =>
  spec({ name: `P${col}`, role: 'payoff', element, col, ...over });
const boosts = (res: ReturnType<typeof play>) =>
  boardEvents(res).flatMap((e) => (e.type === 'boost' ? [e.who] : []));

describe("Warden's Watch (reachBonus)", () => {
  const armoured = (over: SpecOver) => spec({ baseArmour: 5, ...over });
  // An area hit of 110 on a creature at slot 0; a Guard at slot 3 covers it (cut 40%, 66) only with reach 3.
  const covered = (reachBonus: number) =>
    takes(
      play(striker({ cols: 6, atk: 110 }, { anchor: 'front', shape: 'all' }), [
        armoured({ name: 'T' }),
        armoured({ name: 'G', role: 'guard', col: 3, fx: { reachBonus } }),
      ]),
      'T',
    )[0];

  it('adds to Wide Reach: the set and the Knack together reach two more slots on each side', () => {
    expect(covered(0)).toBe(110 - 5);
    // Wide Reach alone (+1), or the set alone (+1): two slots away, not three.
    expect(covered(1)).toBe(110 - 5);
    // Both: the number adds to 2, so a creature three slots away is covered.
    expect(covered(1 + 1)).toBe(66 - 5);
  });
});

describe('Hollow Weave (healOnCashBp)', () => {
  const heals = (res: ReturnType<typeof play>) =>
    boardEvents(res).flatMap((e) => (e.type === 'heal' ? [{ who: e.who, amount: e.amount }] : []));
  // Round 1 marks and cashes; the boss hits the Payoff; round 2 cashes again and heals what the hit took.
  const run = (fx: object, others: SpecOver[] = []) =>
    play(striker({ cols: 3, rounds: 2, atk: 300 }, { anchor: 'payoff', shape: 'single' }), [
      setter(0),
      payoff(1, 'spark', { maxHp: 1_000, fx }),
      ...others.map((o, i) => spec({ name: `X${String(i)}`, col: 2, ...o })),
    ]);

  it('heals the wearer by its share of max HP whenever it cashes', () => {
    expect(heals(run({}))).toEqual([]);
    expect(heals(run({ healOnCashBp: 300 }))).toEqual([{ who: 'P1', amount: 30 }]);
  });

  it('adds to a heal-on-reaction Knack beside it, not the larger of the two', () => {
    const both = heals(
      run({ healOnCashBp: 300 }, [{ element: 'tide', fx: { healOnReactionBp: 1_400 } }]),
    );
    expect(both.map((h) => h.amount).sort((a, b) => a - b)).toEqual([30, 140]);
  });

  it('is blanked by silence', () => {
    const hushed = play(
      boss({
        cols: 3,
        rounds: 3,
        atk: 100,
        plain: { pattern: { anchor: 'payoff', shape: 'single' }, powerBp: 10_000, hits: 1 },
        moves: [hush('all', 9)],
      }),
      [setter(0), payoff(1, 'spark', { maxHp: 1_000, fx: { healOnCashBp: 300 } })],
    );
    expect(heals(hushed)).toEqual([]);
  });
});

describe('Ridge Copper (trailSet)', () => {
  const arena = boss({ cols: 2 });
  const run = (fx: object) => marks(play(arena, [setter(0), payoff(1, 'spark', { fx })]));

  it('leaves a mark of its own element after its reaction, like Leave a Trail', () => {
    expect(run({})).toEqual(['tide x1']);
    expect(run({ trailSet: true })).toEqual(['tide x1', 'spark x1']);
    expect(run({ trail: true })).toEqual(['tide x1', 'spark x1']);
  });

  it('with Leave a Trail the mark it leaves has two stacks', () => {
    expect(run({ trail: true, trailSet: true })).toEqual(['tide x1', 'spark x2']);
  });

  it('is blanked by silence', () => {
    const r = marks(
      play(boss({ cols: 2, moves: [hush('all', 9)] }), [
        setter(0),
        payoff(1, 'spark', { fx: { trailSet: true } }),
      ]),
    );
    // The first round's reaction comes before the Hush, so it leaves its trail; the silenced rounds leave none.
    expect(r.filter((m) => m.startsWith('spark')).length).toBeLessThanOrEqual(1);
  });
});

describe('Hearth Helpers (boostReachSet)', () => {
  const support = (col: number, fx: object) =>
    spec({ name: 'H', role: 'support', element: 'tide', col, fx });
  const friends = (cols: number[]) => cols.map((c) => spec({ name: `F${String(c)}`, col: c }));
  const boosted = (col: number, fx: object, around: number[]) =>
    boosts(play(boss({ cols: 7 }), [support(col, fx), ...friends(around)])).sort();

  it('lands the boost two slots away as well', () => {
    expect(boosted(0, {}, [1, 2, 3])).toEqual(['F1']);
    expect(boosted(0, { boostReachSet: true }, [1, 2, 3])).toEqual(['F1', 'F2']);
  });

  it('with Wide Embrace it reaches three slots out, and nobody is boosted twice', () => {
    expect(boosted(0, { support: 'wideWarmth' }, [1, 2, 3, 4])).toEqual(['F1', 'F2']);
    expect(boosted(0, { support: 'wideWarmth', boostReachSet: true }, [1, 2, 3, 4])).toEqual([
      'F1',
      'F2',
      'F3',
    ]);
    expect(boosted(3, { support: 'wideWarmth', boostReachSet: true }, [0, 1, 2, 4, 5, 6])).toEqual([
      'F0',
      'F1',
      'F2',
      'F4',
      'F5',
      'F6',
    ]);
  });

  it('is blanked by silence', () => {
    const r = play(boss({ cols: 3, rounds: 2, moves: [hush('all', 9)] }), [
      support(0, { boostReachSet: true }),
      ...friends([1, 2]),
    ]);
    // Round 1 boosts before the Hush; round 2's boost is not made at all (the Support's verb is silenced too).
    expect(boosts(r).sort()).toEqual(['F1', 'F2']);
  });
});

describe('Deep Tracks (deepTracks)', () => {
  const deep = { deepTracks: true };
  const run = (team: ReturnType<typeof spec>[], rounds: number, over = {}) =>
    play(boss({ cols: team.length, rounds, ...over }), team);

  it('one wearer: its marks stack to x4', () => {
    expect(marks(run([setter(0, 'tide', { fx: deep })], 6))).toEqual([
      'tide x1',
      'tide x2',
      'tide x3',
      'tide x4',
      'tide x4',
      'tide x4',
    ]);
  });

  it('two wearers: x5', () => {
    expect(
      marks(run([setter(0, 'tide', { fx: deep }), setter(1, 'tide', { fx: deep })], 3)),
    ).toEqual(['tide x1', 'tide x2', 'tide x3', 'tide x4', 'tide x5', 'tide x5']);
  });

  it('without the effect the cap is x3', () => {
    expect(marks(run([setter(0)], 5))).toEqual([
      'tide x1',
      'tide x2',
      'tide x3',
      'tide x3',
      'tide x3',
    ]);
  });

  it('a non-wearer adding to an x4 mark leaves it x4: it does not grow it and does not cut it to x3', () => {
    // S0 (no effect) first, then the wearer: x1 x2, x3 x4, then x4 and x4.
    const r = run([setter(0), setter(1, 'tide', { fx: deep })], 3);
    expect(marks(r)).toEqual(['tide x1', 'tide x2', 'tide x3', 'tide x4', 'tide x4', 'tide x4']);
  });

  it('Feed the Marks keeps the usual cap but never shrinks a mark above it', () => {
    const feeder = spec({
      name: 'FM',
      role: 'setter',
      element: 'spark',
      col: 1,
      fx: { noDamage: true, markOthers: true },
    });
    const r = run([setter(0, 'tide', { fx: { ...deep, markStacks: 4 } }), feeder], 2);
    // The board hears of every change to the tide mark, the feeder's added stack included: it stays at x4.
    const tide = boardEvents(r).flatMap((e) =>
      e.type === 'mark' && e.element === 'tide' ? [e.stacks] : [],
    );
    expect(tide.length).toBeGreaterThan(2);
    expect(tide.every((n) => n === 4)).toBe(true);
  });

  it('a wearer that is silenced no longer counts', () => {
    // Two wearers; the Hush silences the first (slot 0), so the limit falls from x5 to x4 and that Setter marks no more.
    const r = marks(
      play(
        boss({
          cols: 2,
          rounds: 4,
          moves: [{ ...hush('single', 9), pattern: { anchor: 'front', shape: 'single' } }],
        }),
        [setter(0, 'tide', { fx: deep }), setter(1, 'tide', { fx: deep })],
      ),
    );
    expect(r).toEqual(['tide x1', 'tide x2', 'tide x3', 'tide x4', 'tide x4']);
  });

  describe('cashing past x3', () => {
    // A Setter that leaves x4 at once, then a Payoff that spends every stack (a bonus factor of 4 before the cap).
    const bonusOf = (wearer: object, payoffFx: object) =>
      texts(
        play(boss({ cols: 2 }), [
          setter(0, 'tide', { fx: { markStacks: 4, ...wearer } }),
          payoff(1, 'spark', { fx: payoffFx }),
        ]),
        'reaction',
      );
    const detonate = { spendAllBp: 10_000, bonusBp: 10_000 };
    const allIn = { minStacks: 3, spendAllBp: 10_000, bonusBp: 12_500 };

    it('a Detonate on x4 goes past the x3 cap: the cap rises by 10000 a stack past three', () => {
      expect(bonusOf(deep, detonate)).toEqual(['P1 cashes tide x4 for +400']);
      // Without the effect the mark is x3 and the factor sits at the cap.
      expect(bonusOf({}, detonate)).toEqual(['P1 cashes tide x3 for +300']);
    });

    it('an All In on x4 does too, up to the raised cap and no further', () => {
      // Factor 12500 x (1 + 3) = 50000, held to 30000 + 10000 = 40000.
      expect(bonusOf(deep, allIn)).toEqual(['P1 cashes tide x4 for +400']);
      expect(bonusOf({}, allIn)).toEqual(['P1 cashes tide x3 for +300']);
    });

    it('a one-stack cash is unchanged', () => {
      const one = texts(
        play(boss({ cols: 2 }), [
          setter(0, 'tide', { fx: deep }),
          payoff(1, 'spark', { fx: { bonusBp: 50_000 } }),
        ]),
        'reaction',
      );
      expect(one).toEqual(['P1 cashes tide x1 for +300']);
    });
  });

  it('gear-less teams are unchanged', () => {
    expect(marks(run([setter(0), setter(1)], 2))).toEqual([
      'tide x1',
      'tide x2',
      'tide x3',
      'tide x3',
    ]);
  });
});

describe('a Knack that gives up its hit (forgo)', () => {
  const feeder = (over: SpecOver = {}) =>
    spec({
      name: 'FM',
      role: 'setter',
      element: 'spark',
      col: 0,
      fx: { noDamage: true, markStacks: 2, marksAs: 'own' },
      ...over,
    });

  it('tells the board the creature took its turn, right before what its Knack does instead', () => {
    const board = boardEvents(play(boss({ cols: 2, rounds: 1 }), [feeder(), setter(1)]));
    const forgo = board.findIndex((e) => e.type === 'forgo');
    expect(forgo).toBeGreaterThanOrEqual(0);
    expect(board[forgo]).toEqual({ type: 'forgo', who: 'FM' });
    // The creature that hits does not forgo, and the forgone turn has no hit from it.
    expect(board.filter((e) => e.type === 'forgo')).toHaveLength(1);
    expect(board.some((e) => e.type === 'hit' && e.from === 'FM')).toBe(false);
    expect(board[forgo + 1]).toMatchObject({ type: 'mark', element: 'spark' });
  });

  it('is not said while the creature is silenced (its Knack does nothing, it hits)', () => {
    const board = boardEvents(
      play(
        boss({
          cols: 2,
          rounds: 2,
          moves: [{ ...hush('single', 9), pattern: { anchor: 'front', shape: 'single' } }],
        }),
        [feeder(), setter(1)],
      ),
    );
    // Round 1 it forgoes; the Hush lands at round 2's start, so the silenced creature hits instead.
    expect(board.filter((e) => e.type === 'forgo')).toHaveLength(1);
    expect(board.some((e) => e.type === 'hit' && e.from === 'FM')).toBe(true);
  });
});
