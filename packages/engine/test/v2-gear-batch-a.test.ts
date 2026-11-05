/**
 * Gear lines, slice 3 (batch A, cuts and conditions): each new effect field applies where it should and nowhere else, and silence blanks
 * it (gear goes to `fxAll` only). Creatures and boss are built by hand with the field named directly; the dice are scripted (no chance
 * below 100% happens, a 99.99% roll always passes), so every number is exact.
 */
import type { KnackFx } from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import {
  boss,
  by,
  count,
  hush,
  play,
  playScripted,
  spec,
  striker,
  takes,
  texts,
  type SpecOver,
} from './v2-helpers';

const SINGLE = { anchor: 'front', shape: 'single' } as const;
const ALL = { anchor: 'front', shape: 'all' } as const;
/** A creature `A` with `fx`, and a lot of HP. */
const a = (fx: KnackFx, over: SpecOver = {}) => spec({ name: 'A', maxHp: 1_000, fx, ...over });
/** What `A` takes from this boss (the hits, in order). */
const hits = (b: ReturnType<typeof boss>, team: ReturnType<typeof spec>[]) =>
  takes(play(b, team), 'A');

describe('cuts (taking.ts)', () => {
  const aimed = striker({ rounds: 1, atk: 100 });
  const area = striker({ rounds: 1, atk: 100 }, ALL);

  it('All Damage Taken cuts every hit, aimed or area', () => {
    expect(hits(aimed, [a({})])).toEqual([100]);
    expect(hits(aimed, [a({ takenCutBp: 2_000 })])).toEqual([80]);
    expect(hits(area, [a({ takenCutBp: 2_000 })])).toEqual([80]);
  });

  it('Aimed Ward cuts aimed hits only', () => {
    expect(hits(aimed, [a({ aimedCutBp: 3_000 })])).toEqual([70]);
    expect(hits(area, [a({ aimedCutBp: 3_000 })])).toEqual([100]);
  });

  it('Backdraft Ward cuts the reflected hit, not an aimed one', () => {
    const hide = boss({ cols: 2, rounds: 2, mods: { reflectFirst: true } });
    const team = (fx: KnackFx) => [
      spec({ name: 'S', maxHp: 100_000 }),
      spec({ name: 'P', role: 'payoff', element: 'spark', col: 1, maxHp: 100_000, fx }),
    ];
    const plain = takes(play(hide, team({})), 'P');
    const warded = takes(play(hide, team({ reflectedCutBp: 5_000 })), 'P');
    expect(plain.length).toBeGreaterThan(0);
    expect(warded).toEqual(plain.map((x) => Math.floor(x / 2)));
    expect(hits(aimed, [a({ reflectedCutBp: 5_000 })])).toEqual([100]);
  });

  it('Last Stand cuts once the wearer is at a quarter of its max HP or less', () => {
    const four = striker({ rounds: 4, atk: 100 });
    expect(takes(play(four, [a({ lastStandCutBp: 5_000 }, { maxHp: 400 })]), 'A')).toEqual([
      100, 100, 100, 50,
    ]);
    expect(takes(play(four, [a({}, { maxHp: 400 })]), 'A')).toEqual([100, 100, 100, 100]);
  });

  it('Ward cuts only the hits of a boss of a listed element', () => {
    const ember = striker({ rounds: 1, atk: 100, element: 'ember' });
    expect(hits(ember, [a({ fromElementCutBp: { ember: 2_000 } })])).toEqual([80]);
    expect(hits(ember, [a({ fromElementCutBp: { grove: 2_000 } })])).toEqual([100]);
  });

  it('Sheltered makes the Guard’s cover on the wearer stronger', () => {
    const wide = striker({ cols: 3, rounds: 1, atk: 100 }, ALL);
    const guard = spec({ name: 'G', role: 'guard', col: 1, maxHp: 1_000 });
    expect(hits(wide, [a({}), guard])).toEqual([60]);
    expect(hits(wide, [a({ shelterBp: 1_000 }), guard])).toEqual([50]);
  });

  it('every cut goes through the one 75% cap', () => {
    expect(hits(aimed, [a({ takenCutBp: 6_000, aimedCutBp: 6_000 })])).toEqual([25]);
  });
});

describe('hit bonuses (creature.ts)', () => {
  const free = boss({ rounds: 1, cols: 3 });
  const dealt = (team: ReturnType<typeof spec>[], b = free, name = 'A') =>
    by(play(b, team), name).damageDealt;

  it('Hunter adds to the hits against a boss of a listed element only', () => {
    expect(dealt([a({})])).toBe(100);
    expect(dealt([a({ vsElementBp: { neutral: 1_000 } })])).toBe(110);
    expect(dealt([a({ vsElementBp: { ember: 1_000 } })])).toBe(100);
  });

  it('Beside the mark-maker adds while a living creature of that role stands beside', () => {
    const fx = { besideRoleBp: { setter: 1_000 } };
    const next = spec({ name: 'S', role: 'setter', col: 1 });
    expect(dealt([a(fx, { role: 'guard' }), next])).toBe(110);
    expect(dealt([a(fx, { role: 'guard' }), { ...next, col: 2 }])).toBe(100);
    expect(dealt([a(fx, { role: 'guard' }), { ...next, role: 'payoff' }])).toBe(100);
  });

  it('Marking Hit adds to the hit that leaves a mark, not to a hit that does not', () => {
    expect(dealt([a({ markingHitBp: 1_000 })])).toBe(110);
    expect(dealt([a({ markingHitBp: 1_000 }, { role: 'guard' })])).toBe(100);
  });

  it('Marked Foe adds to a hit on a marked boss that sets off no reaction', () => {
    const team = (fx: KnackFx, over: SpecOver = {}) => [
      spec({ name: 'S', role: 'setter', element: 'tide' }),
      a(fx, { role: 'guard', col: 1, ...over }),
    ];
    expect(dealt(team({}))).toBe(100);
    expect(dealt(team({ markedFoeBp: 1_000 }))).toBe(110);
    // A Payoff whose hit cashes the mark gets nothing from it.
    const cashing = team({ markedFoeBp: 1_000 }, { role: 'payoff', element: 'spark' });
    const same = team({}, { role: 'payoff', element: 'spark' });
    expect(dealt(cashing)).toBe(dealt(same));
    // A marked boss only: without a Setter there is no mark.
    expect(dealt([a({ markedFoeBp: 1_000 }, { role: 'guard' })])).toBe(100);
  });

  it('Four Winds raises the reaction bonus only while its row holds four elements', () => {
    const row = (fourth: string) => [
      spec({ name: 'S', role: 'setter', element: 'tide' }),
      spec({ name: 'A', role: 'payoff', element: 'spark', col: 1, fx: { fourWindsBp: 5_000 } }),
      spec({ name: 'G', role: 'guard', element: 'grove', col: 2 }),
      spec({ name: 'H', role: 'support', element: fourth, col: 3 }),
    ];
    const wide = boss({ rounds: 1, cols: 4 });
    expect(dealt(row('ember'), wide)).toBe(250);
    expect(dealt(row('tide'), wide)).toBe(200);
  });

  it('Adaptation Pierce lets more of the hit through Element Resistance and Reaction Resistance', () => {
    const resisted = (fx: KnackFx) => by(play(free, [a(fx)], { resistElement: 'tide' }), 'A');
    expect(resisted({}).damageDealt).toBe(75);
    expect(resisted({ adaptPierceBp: 5_000 }).damageDealt).toBe(87);
    expect(resisted({ adaptPierceBp: 10_000 }).damageDealt).toBe(100);
    const react = (fx: KnackFx) =>
      by(
        play(
          free,
          [
            spec({ name: 'S', role: 'setter', element: 'tide' }),
            a(fx, { role: 'payoff', element: 'spark', col: 1 }),
          ],
          { resistReaction: 'tide' },
        ),
        'A',
      ).damageDealt;
    expect(react({})).toBe(150);
    expect(react({ adaptPierceBp: 10_000 })).toBe(200);
  });
});

describe('crit chance on conditions', () => {
  const crits = (b: ReturnType<typeof boss>, team: ReturnType<typeof spec>[]) =>
    count(playScripted(b, team, []).res, 'crit');

  it('Keen Reaction adds to the crit chance of a hit that sets off a reaction only', () => {
    const fx = { keenReactionBp: 9_500 };
    const setter = spec({ name: 'S', role: 'setter', element: 'tide' });
    const free = boss({ rounds: 1, cols: 2 });
    const payoff = (extra: KnackFx) =>
      a(extra, { role: 'payoff', element: 'spark', col: 1, maxHp: 400 });
    expect(crits(free, [setter, payoff(fx)])).toBe(1);
    expect(crits(free, [setter, payoff({})])).toBe(0);
    // No mark to cash: the payoff's hit sets off nothing.
    expect(crits(free, [payoff(fx)])).toBe(0);
  });

  it('Back-row Patience adds to the crit chance in the back row of an arena with more than one row', () => {
    const fx = { backRowCritBp: 9_500 };
    const two = boss({ rounds: 1, rows: 2, cols: 1 });
    expect(crits(two, [a(fx, { row: 1 })])).toBe(1);
    expect(crits(two, [a(fx, { row: 0 })])).toBe(0);
    expect(crits(boss({ rounds: 1 }), [a(fx)])).toBe(0);
  });
});

describe('Heart of the Row (fight.ts)', () => {
  it('raises max HP only in the middle of the row', () => {
    const wide = boss({ rounds: 1, cols: 3 });
    const team = (col: number) => [spec({ name: 'A', maxHp: 400, col, fx: { heartHpBp: 5_000 } })];
    expect(by(play(wide, team(1)), 'A').maxHp).toBe(600);
    expect(by(play(wide, team(0)), 'A').maxHp).toBe(400);
    expect(by(play(wide, team(2)), 'A').maxHp).toBe(400);
  });
});

describe('one-sided reach (board.ts)', () => {
  const wide = striker({ cols: 3, rounds: 1, atk: 100 }, ALL);
  /** A at `wardCol`, a Guard at `guardCol` carrying `fx`; the Guard's reach is 1 a side. */
  const cover = (fx: KnackFx, guardCol = 2, wardCol = 0) =>
    takes(
      play(wide, [
        spec({ name: 'A', maxHp: 1_000, col: wardCol }),
        spec({ name: 'G', role: 'guard', col: guardCol, maxHp: 1_000, fx }),
      ]),
      'A',
    );

  it('a longer left reach covers a creature two slots to the left, a right one does not', () => {
    expect(cover({})).toEqual([100]);
    expect(cover({ reachLeftBonus: 1 })).toEqual([60]);
    expect(cover({ reachRightBonus: 1 })).toEqual([100]);
  });

  it('a shorter side covers nobody on it, and the other side is untouched', () => {
    expect(cover({}, 0, 1)).toEqual([60]);
    expect(cover({ reachRightBonus: -1 }, 0, 1)).toEqual([100]);
    expect(cover({ reachLeftBonus: 1, reachRightBonus: -1 }, 2, 1)).toEqual([60]);
  });
});

describe('silence blanks the gear’s effect lines', () => {
  it('a cut from gear does nothing once the wearer is silenced', () => {
    const quiet = boss({
      rounds: 3,
      atk: 100,
      plain: { pattern: SINGLE, powerBp: 10_000, hits: 1 },
      moves: [hush()],
    });
    const cut = takes(play(quiet, [a({ takenCutBp: 5_000 })]), 'A');
    const none = takes(play(quiet, [a({})]), 'A');
    expect(texts(play(quiet, [a({})]), 'silence').length).toBeGreaterThan(0);
    expect(cut.length).toBe(none.length);
    // Only a hit made before the silence landed is cut: not every hit.
    expect(cut.filter((x, i) => x !== none[i]).length).toBeLessThan(cut.length);
  });
});
