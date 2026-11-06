/**
 * Gear lines, slice 4 (batch B: triggers, auras and three-piece set effects): each new effect field applies where it should, an effect
 * that fires off its wearer's turn fires once a turn, and silence blanks it (gear goes to `fxAll` only). Creatures and boss are built by
 * hand with the field named directly; the dice are scripted (`NO` fails every chance below 100%, `YES` passes every chance above 0), so
 * every number is exact.
 */
import type { KnackFx } from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import {
  NO,
  YES,
  boardEvents,
  boss,
  by,
  hush,
  play,
  playScripted,
  spec,
  striker,
  takes,
  texts,
  type SpecOver,
} from './v2-helpers';

const dealt = (res: ReturnType<typeof play>, name: string): number => by(res, name).damageDealt;
const boosts = (res: ReturnType<typeof play>) =>
  boardEvents(res).flatMap((e) => (e.type === 'boost' ? [{ who: e.who, by: e.by, bp: e.bp }] : []));
/** A tide Setter `S` (marks tide) and a spark Payoff `P` beside it: spark cashes tide. */
const setter = (over: SpecOver = {}) =>
  spec({ name: 'S', role: 'setter', element: 'tide', ...over });
const payoff = (fx: KnackFx, over: SpecOver = {}) =>
  spec({ name: 'P', role: 'payoff', element: 'spark', col: 1, fx, ...over });

describe('Payback (boss.ts)', () => {
  // A at column 0 is the target; the Guard G beside it takes the hit.
  const team = (fx: KnackFx) => [
    spec({ name: 'A', maxHp: 1_000 }),
    spec({ name: 'G', role: 'guard', col: 1, maxHp: 1_000, fx }),
  ];

  it('boosts the Guard’s next hit after it takes a hit for a neighbour', () => {
    const b = striker({ cols: 2, rounds: 2, atk: 100 });
    expect(dealt(play(b, team({})), 'G')).toBe(200);
    // Round 1 hit 100, round 2 hit 130.
    expect(dealt(play(b, team({ paybackBp: 3_000 })), 'G')).toBe(230);
    expect(boosts(play(b, team({ paybackBp: 3_000 }))).filter((e) => e.who === 'G')[0]).toEqual({
      who: 'G',
      by: 'G',
      bp: 3_000,
    });
  });

  it('fires once a boss turn, however many hits it takes', () => {
    const b = striker({ cols: 2, rounds: 2, atk: 100 }, { anchor: 'front', shape: 'single' }, 2);
    expect(dealt(play(b, team({ paybackBp: 3_000 })), 'G')).toBe(230);
  });

  it('does not fire for a hit the Guard takes on its own slot', () => {
    const own = [spec({ name: 'G', role: 'guard', maxHp: 1_000, fx: { paybackBp: 3_000 } })];
    expect(dealt(play(striker({ rounds: 2, atk: 100 }), own), 'G')).toBe(200);
  });
});

describe('Ember Tail (creature.ts)', () => {
  const crit = (fx: KnackFx) => spec({ name: 'A', critChanceBp: 10_000, fx });
  const b = boss({ rounds: 3 });

  it('boosts the hit after a crit that lands, and never adds up', () => {
    expect(dealt(play(b, [crit({})]), 'A')).toBe(600);
    // Round 1: a crit of 200. Rounds 2 and 3: 100 with +20% is 120, doubled by the crit.
    expect(dealt(play(b, [crit({ emberTailBp: 2_000 })]), 'A')).toBe(200 + 240 + 240);
  });

  it('is not stored by a hit that is not a crit', () => {
    const plain = spec({ name: 'A', fx: { emberTailBp: 2_000 } });
    expect(dealt(playScripted(b, [plain], []).res, 'A')).toBe(300);
  });
});

describe('Overflow (creature.ts)', () => {
  const team = (fx: KnackFx, stacks = 1) => [
    setter({ fx: { markStacks: stacks } }),
    payoff(fx),
    spec({ name: 'X', role: 'guard', col: 2 }),
  ];
  const wide = boss({ cols: 3, rounds: 1 });

  it('boosts the next creature to act after a reaction', () => {
    expect(dealt(play(wide, team({})), 'X')).toBe(100);
    expect(dealt(play(wide, team({ overflowBp: 2_000 })), 'X')).toBe(120);
    expect(boosts(play(wide, team({ overflowBp: 2_000 })))).toEqual([
      { who: 'X', by: 'P', bp: 2_000 },
    ]);
  });

  it('fires once a turn: two reactions in one turn boost once', () => {
    const twin = team({ overflowBp: 2_000, twinStrikeBp: 10_000 }, 2);
    expect(dealt(play(wide, twin), 'X')).toBe(120);
  });

  it('gives nothing when nobody acts after it', () => {
    const last = [setter(), payoff({ overflowBp: 2_000 })];
    expect(boosts(play(boss({ cols: 2, rounds: 1 }), last))).toEqual([]);
  });
});

describe('Slipstream (boss.ts)', () => {
  // A (column 0) dodges the boss's hits; B and C stand beside it or further.
  const team = (fx: KnackFx, otherAtk = 100) => [
    spec({ name: 'A', maxHp: 1_000, fx: { dodgeBonusBp: 5_000, ...fx } }),
    spec({ name: 'B', col: 1, atk: otherAtk }),
  ];
  const b = (hits = 1) => striker({ cols: 2, rounds: 2, atk: 100 }, undefined, hits);

  it('boosts the strongest creature beside the dodger', () => {
    // Round 1: the creatures draw a crit roll each, then A's dodge draws YES.
    const { res } = playScripted(b(), team({ slipstreamBp: 1_800 }), [NO, NO, YES]);
    // B hits 100, then 118 with the boost.
    expect(dealt(res, 'B')).toBe(218);
    expect(boosts(res)).toEqual([{ who: 'B', by: 'A', bp: 1_800 }]);
  });

  it('fires once a boss turn, however many hits it dodges', () => {
    const { res } = playScripted(b(2), team({ slipstreamBp: 1_800 }), [NO, NO, YES, YES]);
    expect(boosts(res)).toEqual([{ who: 'B', by: 'A', bp: 1_800 }]);
  });

  it('does nothing when nothing is dodged', () => {
    expect(boosts(playScripted(b(), team({ slipstreamBp: 1_800 }), []).res)).toEqual([]);
  });
});

describe('Echo (creature.ts)', () => {
  const a = (fx: KnackFx) => spec({ name: 'A', fx });

  it('hits again for 30% of the plain hit after armour, with the chance rolled once', () => {
    const b = boss({ rounds: 1, armour: 10 });
    expect(dealt(playScripted(b, [a({})], [NO]).res, 'A')).toBe(90);
    // The crit roll fails (NO), the echo roll passes (YES): 90 and 30% of 90.
    expect(dealt(playScripted(b, [a({ echoChanceBp: 5_000 })], [NO, YES]).res, 'A')).toBe(90 + 27);
    expect(dealt(playScripted(b, [a({ echoChanceBp: 5_000 })], [NO, NO]).res, 'A')).toBe(90);
  });

  it('shows the echo as a second hit, and sets off no reaction and leaves no mark', () => {
    const wide = boss({ cols: 2, rounds: 1 });
    const res = playScripted(wide, [setter(), payoff({ echoChanceBp: 5_000 })], [NO, NO, YES]).res;
    const hits = boardEvents(res).filter((e) => e.type === 'hit' && e.from === 'P');
    expect(hits.map((e) => (e.type === 'hit' ? e.damage : -1))).toEqual([200, 30]);
    expect(texts(res, 'reaction').length).toBe(1);
  });

  it('does not echo a Blocked hit', () => {
    const b = boss({ rounds: 1, armour: 100 });
    expect(dealt(play(b, [a({ echoChanceBp: 10_000 })]), 'A')).toBe(0);
  });
});

describe('Second Wind, the gear line (marks.ts)', () => {
  const hurt = striker({ rounds: 2, atk: 100 });
  const a = (fx: KnackFx) => spec({ name: 'A', maxHp: 1_000, fx });
  const healed = (res: ReturnType<typeof play>) =>
    boardEvents(res).flatMap((e) => (e.type === 'heal' ? [e.amount] : []));

  it('has a chance each round start to heal 5% of max HP while hurt', () => {
    // Round 1: A's crit roll NO; round 2 start: the wind roll YES.
    expect(healed(playScripted(hurt, [a({ windChanceBp: 5_000 })], [NO, YES]).res)).toEqual([50]);
    expect(healed(playScripted(hurt, [a({ windChanceBp: 5_000 })], [NO, NO]).res)).toEqual([]);
  });

  it('draws no dice at full HP, and is not Catch Breath', () => {
    const free = boss({ rounds: 2 });
    expect(playScripted(free, [a({ windChanceBp: 5_000 })], []).draws).toBe(
      playScripted(free, [a({})], []).draws,
    );
    expect(healed(play(hurt, [a({ secondWindBp: 1_000 })]))).toEqual([]);
  });

  it('is blanked by silence', () => {
    const quiet = striker({ rounds: 2, atk: 100 });
    const silenced = { ...quiet, moves: [hush('single', 9)] };
    expect(healed(playScripted(silenced, [a({ windChanceBp: 5_000 })], [NO, YES]).res)).toEqual([]);
  });
});

describe('Kindling (marks.ts)', () => {
  const team = (fx: KnackFx) => [
    spec({ name: 'A' }),
    setter({ name: 'K', col: 1, fx }),
    spec({ name: 'B', col: 2 }),
    spec({ name: 'F', col: 3 }),
  ];
  const wide = boss({ cols: 4, rounds: 2 });

  it('boosts the first hit of each creature beside it, in round 1 only', () => {
    const res = play(wide, team({ kindlingBp: 3_000 }));
    expect(dealt(res, 'A')).toBe(130 + 100);
    expect(dealt(res, 'B')).toBe(130 + 100);
    expect(dealt(res, 'F')).toBe(200);
    expect(
      boosts(res)
        .map((e) => e.who)
        .sort(),
    ).toEqual(['A', 'B']);
  });
});

describe('Shared Warmth (marks.ts)', () => {
  // The Support heals G (hurt from the start) and boosts A each round start.
  const team = (fx: KnackFx, extra: SpecOver = {}) => [
    spec({ name: 'A' }),
    spec({ name: 'H', role: 'support', element: 'tide', col: 1 }),
    spec({ name: 'G', role: 'guard', col: 2, maxHp: 1_000, fx, ...extra }),
  ];
  const wide = boss({ cols: 3, rounds: 2 });
  const hurt = { carryHp: new Map([['G', 500]]) };

  it('makes the Support’s next boost bigger after it heals the wearer', () => {
    // Round 1: boost 15%; the heal feeds round 2: 15% and 10%.
    expect(dealt(play(wide, team({}), hurt), 'A')).toBe(115 + 115);
    expect(dealt(play(wide, team({ sharedWarmthBp: 1_000 }), hurt), 'A')).toBe(115 + 125);
  });

  it('does not add up: two wearers healed in one round feed one bonus', () => {
    const both = team({ sharedWarmthBp: 1_000 });
    both[0] = spec({ name: 'A', maxHp: 400, fx: { sharedWarmthBp: 1_000 } });
    const res = play(wide, both, {
      carryHp: new Map([
        ['G', 500],
        ['A', 100],
      ]),
    });
    expect(dealt(res, 'A')).toBe(115 + 125);
  });

  it('feeds nothing when the heal restores nothing', () => {
    expect(dealt(play(wide, team({ sharedWarmthBp: 1_000 })), 'A')).toBe(115 + 115);
  });
});

describe('Spark-share (creature.ts)', () => {
  // S, P and a Guard H on P's other side carrying the aura.
  const team = (fx: KnackFx) => [
    setter(),
    payoff({}),
    spec({ name: 'H', role: 'guard', col: 2, fx }),
  ];
  const wide = boss({ cols: 4, rounds: 1 });

  it('raises the reaction bonus of the creatures beside it', () => {
    expect(dealt(play(wide, team({})), 'P')).toBe(200);
    expect(dealt(play(wide, team({ sparkShareBp: 5_000 })), 'P')).toBe(250);
  });

  it('is an aura: the largest beside applies, and it stays inside the cap', () => {
    const both = team({ sparkShareBp: 5_000 });
    both[0] = setter({ fx: { sparkShareBp: 3_000 } });
    expect(dealt(play(wide, both), 'P')).toBe(250);
    expect(dealt(play(wide, team({ sparkShareBp: 90_000 })), 'P')).toBe(400);
  });

  it('works only from a creature beside it, and is blanked while its wearer is silenced', () => {
    expect(dealt(play(wide, [setter(), payoff({}), spec({ name: 'H', col: 3 })]), 'P')).toBe(200);
    // H (column 0) is silenced after round 1; P (column 1) is not, and cashes in round 2.
    const row = (fx: KnackFx) => [
      spec({ name: 'H', role: 'guard', col: 0, fx }),
      payoff({}),
      setter({ col: 2 }),
    ];
    const two = { ...wide, rounds: 2 };
    const quiet = { ...two, moves: [hush('single', 9)] };
    expect(dealt(play(two, row({ sparkShareBp: 5_000 })), 'P')).toBe(100 + 250);
    expect(dealt(play(quiet, row({ sparkShareBp: 5_000 })), 'P')).toBe(100 + 200);
  });
});

describe('Lantern Bearer (fight.ts)', () => {
  const team = (fx: KnackFx, over: Record<string, SpecOver> = {}) =>
    ['A', 'L', 'B', 'F'].map((name, col) =>
      spec({ name, maxHp: 400, col, ...(name === 'L' ? { fx } : {}), ...over[name] }),
    );
  const wide = boss({ cols: 4, rounds: 1 });
  const maxes = (res: ReturnType<typeof play>) => ['A', 'L', 'B', 'F'].map((n) => by(res, n).maxHp);

  it('raises the max HP of the creatures beside it, not its own nor others’', () => {
    const res = play(wide, team({ lanternBp: 5_000 }));
    expect(maxes(res)).toEqual([600, 400, 600, 400]);
    expect(by(res, 'A').hp).toBe(600);
  });

  it('takes the largest of two bearers, and adds to Heart of the Row', () => {
    const res = play(
      wide,
      team({ lanternBp: 5_000 }, { B: { fx: { lanternBp: 2_000, heartHpBp: 1_000 } } }),
    );
    // A: beside L (50%). L: beside B (20%). B: middle of the row (10%) and beside L (50%). F: beside B (20%).
    expect(maxes(res)).toEqual([600, 480, 640, 480]);
  });
});

describe('Tidepool Finery, three pieces: the first reaction is not reflected (creature.ts)', () => {
  const hide = boss({ cols: 2, rounds: 3, mods: { reflectFirst: true } });
  const team = (fx: KnackFx) => [setter({ maxHp: 100_000 }), payoff(fx, { maxHp: 100_000 })];

  it('spares the first reaction the Hide would reflect, and the Hide reflects the next', () => {
    expect(takes(play(hide, team({})), 'P').length).toBe(2);
    const res = play(hide, team({ unreflectedFirst: true }));
    expect(takes(res, 'P').length).toBe(1);
    expect(boardEvents(res).filter((e) => e.type === 'cover').length).toBe(1);
  });
});

describe('Forge-Warm Kit, three pieces: crits after a reaction (creature.ts)', () => {
  const two = boss({ cols: 2, rounds: 2 });
  const team = (fx: KnackFx) => [setter(), payoff(fx, { critChanceBp: 10_000 })];

  it('adds crit damage for the round after a reaction and the next one', () => {
    // Every hit crits (x2). Round 1: plain 200 and a bonus of 200. Round 2: the crit is x2.5: 250 and 250.
    expect(dealt(play(two, team({})), 'P')).toBe(400 + 400);
    expect(dealt(play(two, team({ critWindowBp: 5_000 })), 'P')).toBe(400 + 500);
  });
});

describe('Pounce Set, three pieces: the first reaction crits (creature.ts)', () => {
  const two = boss({ cols: 2, rounds: 2 });
  const team = (fx: KnackFx) => [setter(), payoff(fx)];

  it('makes the first reaction a crit and no other', () => {
    // No crit chance below 100% passes: round 1 crits (x2): 200 + 200; round 2 does not: 100 + 100.
    expect(dealt(playScripted(two, team({}), []).res, 'P')).toBe(200 + 200);
    expect(dealt(playScripted(two, team({ firstReactionCrit: true }), []).res, 'P')).toBe(
      400 + 200,
    );
  });

  it('draws the same dice with it and without it', () => {
    expect(playScripted(two, team({ firstReactionCrit: true }), []).draws).toBe(
      playScripted(two, team({}), []).draws,
    );
  });
});
