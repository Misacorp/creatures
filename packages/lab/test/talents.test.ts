/**
 * The talent library, first batch (docs/design/combat/modifiers.md): one test per engine hook, each
 * on the smallest board that proves it. Offence is measured as the same creature's damage with and
 * without the talent on the same seed (the crit rolls then match, so a ratio is the talent's bonus);
 * defence is read off the fight log ("X takes N").
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  ADDITIVE_FIELDS,
  KEYWORDS,
  KNACKS,
  LAB_RULES,
  LINE_POOLS,
  TALENTS,
  fight,
  formStats,
  keywordsIn,
  labBoss,
  lineRoles,
  mergeFx,
  talentIdleUnder,
  talentPool,
  weekend,
  type BossDef,
  type FightOptions,
  type Placement,
} from '../src';
import { content } from '@creatures/game';

const rng = (s: string) => createSeededRng(s);
/** Armour is per form now (R13); the defence tests read the numbers they subtract from the data. */
const TEMPEST_ARMOUR = formStats('tempestray', 25).armour;
const THORN_ARMOUR = formStats('thornbuck', 25).armour;
const KILN_ARMOUR = formStats('kilnmole', 25).armour;
const at = (
  formId: string,
  row: number,
  col: number,
  knack?: string,
  talents?: readonly string[],
): Placement => ({
  owner: 'p1',
  formId,
  level: 25,
  row,
  col,
  ...(knack ? { knack } : {}),
  ...(talents ? { talents } : {}),
});
/** A boss that never dodges and never attacks, so only the creatures' own effects move. */
const calm = (o: Parameters<typeof labBoss>[0]): BossDef => {
  const b = labBoss(o);
  return { ...b, spd: 0, plain: { ...b.plain, powerBp: 0 } };
};
const withTalents = (team: Placement[], on: Record<number, string[]>): Placement[] =>
  team.map((p, i) => (on[i] ? { ...p, talents: on[i] } : p));

/** One fighter's raw damage in each round (damage plus the boss's armour), from successive fights on one seed. */
function swing(
  boss: BossDef,
  team: Placement[],
  i: number,
  rounds: number,
  extra: Partial<FightOptions> = {},
): number[] {
  const out: number[] = [];
  let before = 0;
  for (let r = 1; r <= rounds; r++) {
    const res = fight({ ...boss, rounds: r }, team, { rng: rng('swing'), ...extra });
    const total = res.fighters[i]?.damageDealt ?? 0;
    out.push(total - before + (total > before ? boss.armour : 0));
    before = total;
  }
  return out;
}
/** The bonus a talent gives the creature at index `i`, per round: damage with it over damage without. */
function gain(
  boss: BossDef,
  team: Placement[],
  talentOn: number,
  talent: string,
  measure = talentOn,
  rounds = 1,
  extra: Partial<FightOptions> = {},
): number[] {
  const a = swing(boss, withTalents(team, { [talentOn]: [talent] }), measure, rounds, extra);
  const b = swing(boss, team, measure, rounds, extra);
  return a.map((v, r) => v / (b[r] ?? 1));
}
/** The first "X takes N" line for a creature in the log: what one hit really did to it. */
function firstHit(res: ReturnType<typeof fight>, name: string): number | undefined {
  const e = res.events.find((x) => x.kind === 'hit' && x.text.startsWith(`${name} takes `));
  return e ? Number(e.text.split(' ')[2]) : undefined;
}
const run = (boss: BossDef, team: Placement[], seed = 't', extra: Partial<FightOptions> = {}) =>
  fight(boss, team, { rng: rng(seed), log: true, ...extra });
const marks = (res: ReturnType<typeof fight>) =>
  res.events.filter((e) => e.kind === 'mark').map((e) => e.text);
const mired = (res: ReturnType<typeof fight>) =>
  res.events.filter((e) => e.kind === 'mired').map((e) => e.text);
const aimed = (anchor: 'strongest' | 'front', shape: 'single' | 'row' | 'all', atk: number) => {
  const b = labBoss({ rows: 1, cols: 5, atk });
  return { ...b, spd: 0, plain: { pattern: { anchor, shape }, powerBp: 10_000 } } as BossDef;
};
const close = (v: number | undefined, want: number, tol = 0.03) =>
  expect(Math.abs((v ?? 0) - want)).toBeLessThan(tol);
/** A talent's number (basis points) as the library has it: a retune of a talent changes the library, not these tests. */
const bp = (id: string, key: string): number =>
  (TALENTS[id]?.fx as Record<string, number | undefined> | undefined)?.[key] ?? 0;
/** The multiplier a talent's number gives on a hit. */
const mult = (id: string, key: string): number => 1 + bp(id, key) / 10_000;
/** What is left of a hit (in bp) after cuts multiply, the total cut capped (R13). */
const cutLeft = (...cuts: number[]): number => {
  let left = 10_000;
  for (const c of cuts) left = Math.floor((left * (10_000 - Math.min(10_000, c))) / 10_000);
  return Math.max(left, 10_000 - LAB_RULES.cutMaxBp);
};
/** A hit of `dmg` after cuts, before armour. */
const afterCuts = (dmg: number, ...cuts: number[]): number =>
  Math.floor((dmg * cutLeft(...cuts)) / 10_000);

describe('talent hooks: neighbours and position', () => {
  const quiet = calm({ rows: 1, cols: 3 });

  it('Shoulder to Shoulder: a bonus for each neighbour of its element, at most 2', () => {
    const two = [at('tidewing', 0, 0), at('tidewing', 0, 1), at('tidewing', 0, 2)];
    const one = [at('wickat', 0, 0), at('tidewing', 0, 1), at('tidewing', 0, 2)];
    const none = [at('wickat', 0, 0), at('tidewing', 0, 1), at('wickat', 0, 2)];
    const per = bp('shoulder-to-shoulder', 'perKindredBesideBp') / 10_000;
    close(gain(quiet, two, 1, 'shoulder-to-shoulder')[0], 1 + 2 * per);
    close(gain(quiet, one, 1, 'shoulder-to-shoulder')[0], 1 + per);
    expect(gain(quiet, none, 1, 'shoulder-to-shoulder')[0]).toBe(1);
  });

  it('Odd One Out: a bonus while no creature beside it shares its element, also with nobody beside it', () => {
    const mixed = [at('wickat', 0, 0), at('tidewing', 0, 1), at('wickat', 0, 2)];
    const kin = [at('tidewing', 0, 0), at('tidewing', 0, 1), at('wickat', 0, 2)];
    const odd = mult('odd-one-out', 'oddOneOutBp');
    close(gain(quiet, mixed, 1, 'odd-one-out')[0], odd);
    expect(gain(quiet, kin, 1, 'odd-one-out')[0]).toBe(1);
    // The shipped line holds with nobody beside it too.
    close(gain(calm({ rows: 1, cols: 1 }), [at('tidewing', 0, 0)], 0, 'odd-one-out')[0], odd);
  });

  it('Edge-walker: a bonus in the arena end slots (column 0 and the last column), nothing in the middle', () => {
    const edge = mult('edge-walker', 'rowEndBp');
    const row = [at('tidewing', 0, 0), at('wickat', 0, 1), at('tidewing', 0, 2)];
    close(gain(quiet, row, 0, 'edge-walker')[0], edge);
    close(gain(quiet, row, 2, 'edge-walker')[0], edge);
    expect(gain(quiet, row, 1, 'edge-walker')[0]).toBe(1);
    // The slot decides, not the end creature: alone in column 1 it is not at a row end, alone in column 0 it is.
    const lone = (col: number) => [at('tidewing', 0, col)];
    expect(gain(quiet, lone(1), 0, 'edge-walker')[0]).toBe(1);
    close(gain(quiet, lone(0), 0, 'edge-walker')[0], edge);
    // Nobody to its left does not make column 1 an end.
    expect(gain(quiet, [at('tidewing', 0, 1), at('wickat', 0, 2)], 0, 'edge-walker')[0]).toBe(1);
  });

  it('Front-liner: less from every hit in the front row, none from further back', () => {
    const hit = (cols: number, row: number, talents?: string[]) => {
      const b = labBoss({ rows: 2, cols, atk: 110 });
      const r = run({ ...b, spd: 0 }, [at('kilnmole', row, 0, undefined, talents)]);
      return firstHit(r, 'Kilnmole');
    };
    // Plain hit 110, minus Kilnmole's armour; with the cut, the cut hit minus armour.
    expect(hit(1, 0)).toBe(110 - KILN_ARMOUR);
    expect(hit(1, 0, ['front-liner'])).toBe(
      afterCuts(110, bp('front-liner', 'frontCutBp')) - KILN_ARMOUR,
    );
    expect(hit(1, 1, ['front-liner'])).toBe(110 - KILN_ARMOUR);
  });
});

describe('talent hooks: fight state', () => {
  it('Slow Burn: a bonus per round from round 2, up to its cap', () => {
    const g = gain(calm({ rows: 1, cols: 1 }), [at('tidewing', 0, 0)], 0, 'slow-burn', 0, 9);
    const per = bp('slow-burn', 'slowBurnBp') / 10_000;
    const cap = bp('slow-burn', 'slowBurnCapBp') / 10_000;
    const want = (round: number) => 1 + Math.min(round * per, cap);
    close(g[0], 1);
    close(g[1], want(1));
    close(g[3], want(3));
    // Past the cap it stops growing (the cap is reached before round 9).
    expect(cap / per).toBeLessThan(8);
    close(g[8], 1 + cap);
  });

  it('Finisher: a bonus while the boss is below a third of its HP', () => {
    const boss = calm({ rows: 1, cols: 1, hp: 900_000 });
    const team = [at('tidewing', 0, 0)];
    close(
      gain(boss, team, 0, 'finisher', 0, 1, { bossHp: 299_000 })[0],
      mult('finisher', 'finisherBp'),
    );
    expect(gain(boss, team, 0, 'finisher', 0, 1, { bossHp: 301_000 })[0]).toBe(1);
  });

  it('Steady Rhythm: every third hit it makes is a crit', () => {
    const boss = calm({ rows: 1, cols: 1, rounds: 9 });
    const team = [at('tidewing', 0, 0)];
    const two = run({ ...boss, rounds: 2 }, withTalents(team, { 0: ['steady-rhythm'] }));
    expect(two.fighters[0]?.fires['steadyRhythm']).toBeUndefined();
    const a = run(boss, withTalents(team, { 0: ['steady-rhythm'] }));
    const b = run(boss, team);
    expect(a.fighters[0]?.fires['steadyRhythm']).toBe(3);
    expect(a.damage).toBeGreaterThan(b.damage);
  });

  it('Momentum: after it dodges, its next hit deals a bonus', () => {
    // Many tiny hits on a creature with plenty of dodge: it dodges in round 1, so round 2 is boosted.
    const b = labBoss({ rows: 1, cols: 1 });
    const boss: BossDef = {
      ...b,
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 100, hits: 25 },
    };
    const team = [at('voltaro', 0, 0, 'zigzag')];
    const g = gain(boss, team, 0, 'momentum', 0, 3);
    expect(g[0]).toBe(1);
    close(g[1], mult('momentum', 'momentumBp'));
  });

  it('Momentum: a hit aimed at it that a Guard takes counts like a dodge', () => {
    // The boss aims at the front creature every round; the Guard beside it takes the hit (no dodge for either).
    const b = labBoss({ rows: 1, cols: 2 });
    const boss: BossDef = {
      ...b,
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 100 },
    };
    const team = [at('tidewing', 0, 0), at('thornbuck', 0, 1)];
    const on = run(boss, withTalents(team, { 0: ['momentum'] }));
    expect(on.intercepts).toBeGreaterThan(0);
    expect(on.fighters[0]?.fires['momentumBp']).toBeGreaterThan(0);
    // Alone, with nobody to take the hit, nothing is armed (it does not dodge either: Speed 0 boss, but its own dodge may).
    const alone = run(
      { ...boss, cols: 1 },
      withTalents([at('tidewing', 0, 0)], { 0: ['momentum'] }),
    );
    expect(alone.intercepts).toBe(0);
  });

  it('Rally Cry: a bonus for the rest of the fight, only after a creature beside it is knocked out', () => {
    const b = labBoss({ rows: 1, cols: 3, atk: 5_000 });
    const boss: BossDef = {
      ...b,
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    };
    // Column 0 falls at the end of round 1: column 1 stands beside it, column 2 does not.
    const team = [at('tidewing', 0, 0), at('tidewing', 0, 1), at('tidewing', 0, 2)];
    const beside = gain(boss, team, 1, 'rally-cry', 1, 2);
    expect(beside[0]).toBe(1);
    close(beside[1], mult('rally-cry', 'vengefulBp'));
    const apart = gain(boss, team, 2, 'rally-cry', 2, 2);
    expect(apart).toEqual([1, 1]);
  });
});

describe('talent hooks: marks', () => {
  const trio = calm({ rows: 1, cols: 2, rounds: 3 });
  const doubleMarker = at('tidewing', 0, 0, 'double-mark');

  it('Opportunist: a bigger reaction when it cashes a mark at x2 or more', () => {
    // Double Mark leaves x2 a round and the Payoff cashes one: every round it cashes a mark of x2 or x3.
    const team = [doubleMarker, at('tempestray', 0, 1)];
    const on = run(trio, withTalents(team, { 1: ['opportunist'] }));
    const off = run(trio, team);
    expect(on.fighters[1]?.fires['cashHighBp']).toBe(3);
    expect(on.fighters[1]?.damageDealt).toBeGreaterThan(off.fighters[1]?.damageDealt ?? 0);
    // With single marks (x1 when cashed) it never holds, and nothing changes.
    const single = [at('tidewing', 0, 0), at('tempestray', 0, 1)];
    const none = run(trio, withTalents(single, { 1: ['opportunist'] }));
    expect(none.fighters[1]?.fires['cashHighBp']).toBeUndefined();
    expect(none.damage).toBe(run(trio, single).damage);
  });

  it('reaction raises multiply, then the factor is capped at x3 (R7)', () => {
    // Double Mark makes x2 a round: in round 3 the Payoff cashes a mark at x3, set this boss turn.
    const team = [doubleMarker, at('tempestray', 0, 1)];
    const bonusOf = (talents: string[]) =>
      Number(
        run(trio, withTalents(team, { 1: talents }))
          .events.filter((e) => e.kind === 'reaction')
          .at(-1)
          ?.text.split('+')[1],
      );
    const none = bonusOf([]);
    // The two raises multiply (not add), while the factor stays under the cap.
    const both = bonusOf(['opportunist', 'quick-draw']);
    const product = mult('opportunist', 'cashHighBp') * mult('quick-draw', 'freshMarkBp');
    expect(product * 10_000).toBeLessThan(LAB_RULES.maxBonusFactorBp);
    expect(both / none).toBeGreaterThan(product - 0.03);
    expect(both / none).toBeLessThan(product + 0.03);
    expect(LAB_RULES.maxBonusFactorBp).toBe(30_000);
  });

  it('Quick Draw: a bigger reaction on a mark set this boss turn, not one from an earlier row', () => {
    const sameRow = [at('tidewing', 0, 0), at('tempestray', 0, 1)];
    const a = run(trio, withTalents(sameRow, { 1: ['quick-draw'] }));
    expect(a.fighters[1]?.fires['freshMarkBp']).toBe(3);
    expect(a.damage).toBeGreaterThan(run(trio, sameRow).damage);
    // The boss takes a turn between the rows, so the mark is no longer fresh.
    const rows = calm({ rows: 2, cols: 1, rounds: 3 });
    const split = [at('tidewing', 0, 0), at('tempestray', 1, 0)];
    const b = run(rows, withTalents(split, { 1: ['quick-draw'] }));
    expect(b.fighters[1]?.fires['freshMarkBp']).toBeUndefined();
    expect(b.damage).toBe(run(rows, split).damage);
  });

  it("Owner's Mark: reactions on a mark it left are bigger, whoever cashes them", () => {
    const team = [at('tidewing', 0, 0), at('tempestray', 0, 1)];
    const owner = run(trio, withTalents(team, { 0: ['owners-mark'] }));
    expect(owner.fighters[0]?.fires['ownMarkBp']).toBe(3);
    expect(owner.fighters[1]?.damageDealt).toBeGreaterThan(
      run(trio, team).fighters[1]?.damageDealt ?? 0,
    );
    // On a creature that left none of the marks it does nothing.
    const other = run(trio, withTalents(team, { 1: ['owners-mark'] }));
    expect(other.damage).toBe(run(trio, team).damage);
  });

  it('Deep Ink: its first mark each fight starts bigger by its count (a mark holds three at most)', () => {
    const boss = calm({ rows: 1, cols: 1, rounds: 2 });
    const first = Math.min(3, 1 + bp('deep-ink', 'firstMarkExtra'));
    expect(marks(run(boss, [at('tidewing', 0, 0, undefined, ['deep-ink'])]))).toEqual([
      `tide x${first}`,
      `tide x${Math.min(3, first + 1)}`,
    ]);
    expect(marks(run(boss, [at('tidewing', 0, 0)]))).toEqual(['tide x1', 'tide x2']);
  });
});

describe('talent hooks: Guard shapes and defence', () => {
  /** The boss aims at the strongest creature, Tempestray, wherever it stands. */
  const aim = (atk = 110) => ({ ...aimed('strongest', 'single', atk), rounds: 6 });

  it('Flank Guard: reach to its longer side only, with twice the slots; the exact middle covers both', () => {
    const hit = (guardCol: number, creatureCol: number, talents: string[] = ['flank-guard']) =>
      run(aim(), [
        at('tempestray', 0, creatureCol),
        at('thornbuck', 0, guardCol, undefined, talents),
      ]).intercepts;
    // Two slots away is out of a plain Guard's reach and inside a flank's.
    expect(hit(2, 0, [])).toBe(0);
    // Five slots wide, a Guard in the middle has two slots each way: a tie covers both sides (reworked 2026-10-28:
    // "ties go left" made a middle Guard worse than a plain one in the three-wide gauntlet).
    expect(hit(2, 0)).toBeGreaterThan(0);
    expect(hit(2, 4)).toBeGreaterThan(0);
    // Off the middle, the longer side only: a Guard at column 1 of 5 covers to the right (three slots), not to the left.
    expect(hit(1, 3)).toBeGreaterThan(0);
    expect(hit(1, 0)).toBe(0);
    // At the right end the longer side is the left; at the left end it is the right.
    expect(hit(4, 2)).toBeGreaterThan(0);
    expect(hit(0, 2)).toBeGreaterThan(0);
    // The shorter side gets nothing, not even beside it (a plain Guard would cover it).
    expect(hit(3, 4)).toBe(0);
    expect(hit(3, 4, [])).toBeGreaterThan(0);
  });

  it("Flank Guard: its cover is bigger by the talent's number, on top of the base cover", () => {
    const sweep = aimed('front', 'row', 110);
    const covered = (talents: string[]) =>
      firstHit(
        run(sweep, [
          at('tempestray', 0, 1),
          // Middle of five slots: the tie goes left, so Tempestray one slot to its left is covered.
          at('thornbuck', 0, 2, undefined, talents),
        ]),
        'Tempestray',
      );
    expect(covered([])).toBe(afterCuts(110, LAB_RULES.coverBp) - TEMPEST_ARMOUR);
    expect(covered(['flank-guard'])).toBe(
      afterCuts(110, LAB_RULES.coverBp + bp('flank-guard', 'coverBonusBp')) - TEMPEST_ARMOUR,
    );
    expect(bp('flank-guard', 'coverBonusBp')).toBeGreaterThan(0);
  });

  it('Long Shadow: cover grows with distance, and so does the cut on a hit it intercepts', () => {
    const per = bp('long-shadow', 'distanceCoverBp');
    const sweep = aimed('front', 'row', 110);
    const covered = (guardCol: number, knack: string | undefined, talents: string[]) =>
      firstHit(
        run(sweep, [at('tempestray', 0, 0), at('thornbuck', 0, guardCol, knack, talents)]),
        'Tempestray',
      );
    // Area hit 110, minus Tempestray's armour. Cover 40%: 66 - armour.
    expect(covered(1, undefined, [])).toBe(66 - TEMPEST_ARMOUR);
    // Two slots away with Wide Reach: 40% plus the talent's number twice (inside the 75% cap).
    expect(covered(2, 'wide-reach', ['long-shadow'])).toBe(
      afterCuts(110, LAB_RULES.coverBp + 2 * per) - TEMPEST_ARMOUR,
    );
    // An aimed hit the Guard takes for a creature two slots away is cut by the number twice (not 110 - armour).
    const hit = (talents: string[]) =>
      firstHit(
        run(aim(), [at('tempestray', 0, 0), at('thornbuck', 0, 2, undefined, talents)]),
        'Thornbuck',
      );
    expect(hit(['flank-guard'])).toBe(110 - THORN_ARMOUR);
    expect(hit(['flank-guard', 'long-shadow'])).toBe(afterCuts(110, 2 * per) - THORN_ARMOUR);
  });

  it('every cut on one hit multiplies, then the total cut is capped at 75%, before armour', () => {
    expect(LAB_RULES.cutMaxBp).toBe(7_500);
    const sweep = aimed('front', 'row', 110);
    // Wide Reach and a flank: four slots, so Long Shadow would give 40% + 40% = 80% at the far end.
    const team = [
      at('tempestray', 0, 0),
      at('thornbuck', 0, 4, 'wide-reach', ['flank-guard', 'long-shadow']),
    ];
    // 75%: floor(110 x 0.25) = 27, minus Tempestray's armour.
    expect(firstHit(run(sweep, team), 'Tempestray')).toBe(27 - TEMPEST_ARMOUR);
    // Two cuts multiply: cover 40% and Front-liner leave 60% x (100% - its cut), not 100% - 40% - its cut.
    const both = [at('tempestray', 0, 0, undefined, ['front-liner']), at('thornbuck', 0, 1)];
    const front = bp('front-liner', 'frontCutBp');
    const left = Math.floor((6_000 * (10_000 - front)) / 10_000);
    expect(left).toBeGreaterThan(10_000 - LAB_RULES.coverBp - front);
    expect(firstHit(run(sweep, both), 'Tempestray')).toBe(
      Math.floor((110 * left) / 10_000) - TEMPEST_ARMOUR,
    );
  });

  it('a Guard stacking Flank Guard, Wide Reach, Long Shadow and Front-liner in a 15-wide row never lets a hit through for less than 25%', () => {
    const b = labBoss({ rows: 1, cols: 15, atk: 110 });
    const sweep: BossDef = {
      ...b,
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'row' }, powerBp: 10_000 },
    };
    const team = [
      // Front-liner on the covered creature too: cover 80% at four slots, then 20% more.
      at('tempestray', 0, 10, undefined, ['front-liner']),
      at('thornbuck', 0, 14, 'wide-reach', ['flank-guard', 'long-shadow', 'front-liner']),
    ];
    const r = run(sweep, team);
    // 110 x 25% = 27 before armour: the covered creature takes 27 - its armour, the Guard (no cover, Front-liner) its cut hit - its own.
    const front = bp('front-liner', 'frontCutBp');
    expect(firstHit(r, 'Tempestray')).toBe(27 - TEMPEST_ARMOUR);
    expect(firstHit(r, 'Thornbuck')).toBe(afterCuts(110, front) - THORN_ARMOUR);
    // The Guard in the front row also shrugs a hit it takes for the creature four slots away: both cuts multiply, inside the cap.
    const aimedAt = { ...aimed('strongest', 'single', 110), cols: 15, rounds: 6 };
    const intercepted = firstHit(
      run(aimedAt, [
        at('tempestray', 0, 10),
        at('thornbuck', 0, 14, 'wide-reach', ['flank-guard', 'long-shadow', 'front-liner']),
      ]),
      'Thornbuck',
    );
    // At or below armour the hit is Blocked and there is no hit line.
    const left = afterCuts(110, front, 4 * bp('long-shadow', 'distanceCoverBp')) - THORN_ARMOUR;
    expect(intercepted).toBe(left > 0 ? left : undefined);
  });

  it('cover comes from the Guard with the largest cover whose reach includes the creature', () => {
    const sweep = aimed('front', 'row', 110);
    const covered = (strong: string[]) =>
      firstHit(
        run(sweep, [
          at('tempestray', 0, 0),
          // Beside it: cover 40%.
          at('thornbuck', 0, 1),
          // Two slots away (Wide Reach): with Long Shadow its cover is bigger, so it wins.
          at('thornbuck', 0, 2, 'wide-reach', strong),
        ]),
        'Tempestray',
      );
    expect(covered([])).toBe(66 - TEMPEST_ARMOUR);
    expect(covered(['long-shadow'])).toBe(
      afterCuts(110, LAB_RULES.coverBp + 2 * bp('long-shadow', 'distanceCoverBp')) - TEMPEST_ARMOUR,
    );
  });

  it('Shoulder Charge: when it intercepts, it strikes back for a share of its Attack, ignoring armour', () => {
    const team = (talents: string[]) => [
      at('tempestray', 0, 0),
      at('thornbuck', 0, 1, undefined, talents),
    ];
    const a = run(aim(), team(['shoulder-charge']));
    const b = run(aim(), team([]));
    const atk = a.fighters[1]?.atk ?? 0;
    expect(a.intercepts).toBeGreaterThan(0);
    expect((a.fighters[1]?.damageDealt ?? 0) - (b.fighters[1]?.damageDealt ?? 0)).toBe(
      a.intercepts * Math.floor((atk * bp('shoulder-charge', 'interceptHitBackBp')) / 10_000),
    );
  });

  it("Brace: less from a Charged landing on its slot and from the boss's other moves, and half as much from its plain attack", () => {
    const brace = bp('brace', 'braceBp');
    const quietPlain = (card: string, rounds: number): BossDef => {
      const b = labBoss({ rows: 1, cols: 1, cards: [card], rounds });
      return { ...b, spd: 0, plain: { ...b.plain, powerBp: 0 } };
    };
    // A seed on which the boss's first hit is not dodged (the same seed with and without Brace).
    const hit = (boss: BossDef, talents: string[]) => {
      for (let i = 0; i < 30; i++) {
        const seed = `brace${i}`;
        const base = firstHit(run(boss, [at('tempestray', 0, 0)], seed), 'Tempestray');
        if (base !== undefined)
          return firstHit(
            run(boss, [at('tempestray', 0, 0, undefined, talents)], seed),
            'Tempestray',
          );
      }
      return undefined;
    };
    // Great Wave lands 110 x 1.8 = 198: minus Tempestray's armour; braced, the cut hit minus armour.
    const wave = quietPlain('great-wave', 3);
    expect(hit(wave, [])).toBe(198 - TEMPEST_ARMOUR);
    expect(hit(wave, ['brace'])).toBe(afterCuts(198, brace) - TEMPEST_ARMOUR);
    // Another move (Crusher: 110 x 4 on the strongest in round 3) is braced too.
    const crush = quietPlain('crusher', 3);
    expect(hit(crush, [])).toBe(440 - TEMPEST_ARMOUR);
    expect(hit(crush, ['brace'])).toBe(afterCuts(440, brace) - TEMPEST_ARMOUR);
    // The plain attack is not a move: it is cut by half the number (reworked 2026-10-28: Brace was idle on most weeks).
    const plain = { ...labBoss({ rows: 1, cols: 1, rounds: 1 }), spd: 0 };
    expect(hit(plain, [])).toBe(110 - TEMPEST_ARMOUR);
    expect(hit(plain, ['brace'])).toBe(afterCuts(110, Math.floor(brace / 2)) - TEMPEST_ARMOUR);
  });

  it('Stubborn leaves it at two fifths of its max HP once per fight', () => {
    const b = labBoss({ rows: 1, cols: 1, rounds: 3, atk: 2_000 });
    const boss: BossDef = { ...b, spd: 0 };
    const r = run(boss, [at('tidewing', 0, 0, undefined, ['stubborn'])]);
    expect(r.events.filter((e) => e.kind === 'hold-on')).toHaveLength(1);
    expect(r.knockouts).toBe(1);
  });
});

describe('talent hooks: Support', () => {
  const quiet = calm({ rows: 1, cols: 2 });

  it('Bright Boost: every second boost it gives is doubled', () => {
    const team = [at('aurorix', 0, 0), at('tempestray', 0, 1)];
    // Spark boost 15%: round 2 gives 30%, so 1.30 / 1.15 on the neighbour's hit.
    const g = gain(quiet, team, 0, 'bright-boost', 1, 3);
    expect(g[0]).toBe(1);
    close(g[1], 1.3 / 1.15, 0.02);
    expect(g[2]).toBe(1);
  });

  it('Kindred Boost: a bigger boost on creatures of its own element only', () => {
    const team = [at('aurorix', 0, 0), at('tempestray', 0, 1)];
    close(
      gain(quiet, team, 0, 'kindred-boost', 1)[0],
      (1.15 + bp('kindred-boost', 'kindredBoostBp') / 10_000) / 1.15,
      0.02,
    );
    const other = [at('aurorix', 0, 0), at('tidewing', 0, 1)];
    expect(gain(quiet, other, 0, 'kindred-boost', 1)[0]).toBe(1);
  });

  it('Triage: the heal goes to the most hurt creature beside it, bigger', () => {
    const b = labBoss({ rows: 1, cols: 3, rounds: 5, atk: 90 });
    const boss: BossDef = { ...b, spd: 0 };
    const team = (talents: string[]) => [
      at('kilnmole', 0, 0),
      at('lanternfin', 0, 1, undefined, talents),
      at('tempestray', 0, 2),
    ];
    // Only Kilnmole is ever hurt: one heal on it, bigger by the talent's number, not a second wasted on Tempestray at full HP.
    expect(run(boss, team(['triage'])).healed).toBeGreaterThan(run(boss, team([])).healed * 1.4);
  });

  it('Triage is idle under a Support shape Knack: its own base verb is replaced, so nothing is aimed', () => {
    const b = labBoss({ rows: 1, cols: 3, rounds: 5, atk: 90 });
    const boss: BossDef = { ...b, spd: 0 };
    const team = (knack: string | undefined, talents: string[]) => [
      at('kilnmole', 0, 0),
      at('lanternfin', 0, 1, knack, talents),
      at('tempestray', 0, 2),
    ];
    // Curl Up still heals beside it like a normal Support; with Triage it would double and aim.
    expect(run(boss, team('curl-up', ['triage'])).healed).toBe(
      run(boss, team('curl-up', [])).healed,
    );
    expect(talentIdleUnder('triage', 'curl-up')).toBe(true);
    expect(talentIdleUnder('triage', 'drizzle')).toBe(true);
    expect(talentIdleUnder('triage', 'gather-calm')).toBe(false);
    expect(talentIdleUnder('triage', undefined)).toBe(false);
    expect(talentIdleUnder('hardy', 'curl-up')).toBe(false);
  });

  it('Overheal Spill: healing past full HP passes to the most hurt creature in the row of the one that was healed', () => {
    const boss = calm({ rows: 1, cols: 3, rounds: 1 });
    // Tempestray stands beside Kilnmole (the one healed), not beside Lanternfin (the healer).
    const team = (talents: string[]) => [
      at('tempestray', 0, 0),
      at('kilnmole', 0, 1),
      at('lanternfin', 0, 2, undefined, talents),
    ];
    // Kilnmole is one HP short, so its heal mostly overflows; Tempestray is at half.
    const carryHp = new Map([
      ['p1:kilnmole:1', formStats('kilnmole', 25).hp - 1],
      ['p1:tempestray:0', Math.floor(formStats('tempestray', 25).hp / 2)],
    ]);
    const hp = (talents: string[]) =>
      run(boss, team(talents), 't', { carryHp }).fighters[0]?.hp ?? 0;
    expect(hp(['overheal-spill'])).toBeGreaterThan(hp([]));
  });

  it('Overheal Spill reaches a hurt creature anywhere in the row, not only beside the one healed', () => {
    const boss = calm({ rows: 1, cols: 4, rounds: 1 });
    // Tempestray is two slots from Kilnmole (the one healed) and one from nothing else that heals: out of the old reach.
    const team = (talents: string[]) => [
      at('tempestray', 0, 0),
      at('magmole', 0, 1),
      at('kilnmole', 0, 2),
      at('lanternfin', 0, 3, undefined, talents),
    ];
    const carryHp = new Map([
      ['p1:kilnmole:2', formStats('kilnmole', 25).hp - 1],
      ['p1:tempestray:0', Math.floor(formStats('tempestray', 25).hp / 2)],
    ]);
    const hp = (talents: string[]) =>
      run(boss, team(talents), 't', { carryHp }).fighters[0]?.hp ?? 0;
    expect(hp(['overheal-spill'])).toBeGreaterThan(hp([]));
  });
});

describe('talent hooks: debuffs', () => {
  const song = (talents: string[], extra: Partial<BossDef> = {}, rounds = 3, seed = 't') =>
    run(
      { ...calm({ rows: 1, cols: 1, rounds }), ...extra },
      [at('squelch', 0, 0, 'squelch-song', talents)],
      seed,
    );

  it('Mired fades by 1 at the end of every second round, so Squelch Song alone builds stacks', () => {
    // The song adds a stack at each round start; the fade comes at the end of rounds 2, 4 and 6.
    expect(mired(song([], {}, 6))).toEqual([
      'Mired x1',
      'Mired x2',
      'Mired x1',
      'Mired x2',
      'Mired x3',
      'Mired x2',
      'Mired x3',
      'Mired x4',
      'Mired x3',
    ]);
  });

  it('Clinging: Mired fades only every third round while it stands', () => {
    const r = song(['clinging'], {}, 6);
    // The song adds a stack at each round start; with Clinging the fade comes at the end of rounds 3 and 6 only.
    expect(mired(r)).toEqual([
      'Mired x1',
      'Mired x2',
      'Mired x3',
      'Mired x2',
      'Mired x3',
      'Mired x4',
      'Mired x5',
      'Mired x4',
    ]);
    // It held back the base fade at the end of rounds 2 and 4.
    expect(r.fighters[0]?.fires['clinging']).toBe(2);
  });

  it('Clinging: each Mired stack takes more off the boss’s damage while it stands', () => {
    // Round 1: the song has put x1 on the boss before it hits Tempestray (the one it aims at), which does not dodge on this seed.
    const boss = { ...aimed('strongest', 'single', 1_000), cols: 2, rounds: 1 };
    const hit = (talents: string[]) => {
      for (let i = 0; i < 30; i++) {
        const seed = `cl${i}`;
        const team = (t: string[]) => [
          at('squelch', 0, 0, 'squelch-song', t),
          at('tempestray', 0, 1),
        ];
        if (firstHit(run(boss, team([]), seed), 'Tempestray') !== undefined)
          return firstHit(run(boss, team(talents), seed), 'Tempestray');
      }
      return undefined;
    };
    const per = (key: 'miredPerStackBp' | 'miredClingingStackBp') => LAB_RULES[key];
    expect(per('miredClingingStackBp')).toBeGreaterThan(per('miredPerStackBp'));
    expect(hit([])).toBe(
      Math.floor((1_000 * (10_000 - per('miredPerStackBp'))) / 10_000) - TEMPEST_ARMOUR,
    );
    expect(hit(['clinging'])).toBe(
      Math.floor((1_000 * (10_000 - per('miredClingingStackBp'))) / 10_000) - TEMPEST_ARMOUR,
    );
  });

  it('Heavy Hand: its Mired has its number as the chance to add 1 extra stack', () => {
    let extra = 0;
    const n = 200;
    const p = bp('heavy-hand', 'miredExtraBp') / 10_000;
    for (let i = 0; i < n; i++) {
      const r = song(['heavy-hand'], {}, 1, `hh:${i}`);
      extra += mired(r)[0] === 'Mired x2' ? 1 : 0;
    }
    expect(extra).toBeGreaterThan(n * (p - 0.1));
    expect(extra).toBeLessThan(n * (p + 0.1));
    // Without it, never.
    expect(mired(song([], {}, 1))).toEqual(['Mired x1']);
  });

  it('Shake It Off: announced at round start, the boss clears every debuff when that round ends', () => {
    const boss = { ...calm({ rows: 1, cols: 1, rounds: 4, cards: ['shake-it-off'] }) };
    const r = run(boss, [at('squelch', 0, 0, 'squelch-song')]);
    expect(r.events.filter((e) => e.kind === 'announce')).toHaveLength(1);
    expect(r.events.find((e) => e.kind === 'announce')?.round).toBe(3);
    expect(r.events.filter((e) => e.kind === 'shake')).toHaveLength(1);
    // x1, x2 (faded to x1 at the end of round 2), x2 in round 3, shaken to x0, round 4 starts from nothing.
    expect(mired(r)).toEqual([
      'Mired x1',
      'Mired x2',
      'Mired x1',
      'Mired x2',
      'Mired x0',
      'Mired x1',
      'Mired x0',
    ]);
  });
});

describe('silence blanks talents: nothing arms, counts or is spent (panel 3)', () => {
  /** Silences everyone at the start of the boss turn after row `turn`, for a long time. */
  const hushAt = (turn: number, turns = 9) => ({
    id: 's',
    name: 'Hush',
    pattern: { anchor: 'front' as const, shape: 'all' as const },
    powerBp: 0,
    every: 1,
    turn,
    silenceTurns: turns,
  });

  it('Rally Cry does not arm while the creature is silenced', () => {
    const b = labBoss({ rows: 1, cols: 3, atk: 5_000, rounds: 1 });
    const boss: BossDef = {
      ...b,
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    };
    const team = [at('tidewing', 0, 0), at('tidewing', 0, 1, undefined, ['rally-cry'])];
    // Column 0 falls in round 1: beside it, column 1 is armed, unless it was silenced just before.
    expect(run(boss, team).fighters[1]?.avenged).toBe(true);
    expect(run({ ...boss, moves: [hushAt(0)] }, team).fighters[1]?.avenged).toBe(false);
  });

  it('Steady Rhythm does not count the hits it makes while silenced', () => {
    const boss = calm({ rows: 1, cols: 1, rounds: 6 });
    const team = [at('tidewing', 0, 0, undefined, ['steady-rhythm'])];
    expect(run(boss, team).fighters[0]?.hitsMade).toBe(6);
    // Round 1's hit is made before the first silence; every later hit is silenced and not counted.
    const hushed = run({ ...boss, moves: [hushAt(0)] }, team);
    expect(hushed.fighters[0]?.hitsMade).toBe(1);
    expect(hushed.fighters[0]?.fires['steadyRhythm']).toBeUndefined();
  });

  it('First Pounce stays unspent when its first hits are made while silenced', () => {
    // Two rows: the boss turn after the empty row 0 silences the creature before it acts in row 1.
    const boss = calm({ rows: 2, cols: 1, rounds: 4 });
    const team = [at('tidewing', 1, 0, undefined, ['first-pounce'])];
    const open = run(boss, team);
    expect(open.fighters[0]?.hitsLanded).toBeGreaterThan(0);
    expect(open.fighters[0]?.fires['firstHitBp']).toBe(1);
    const hushed = run({ ...boss, moves: [hushAt(0, 1)] }, team);
    expect(hushed.fighters[0]?.damageDealt).toBeGreaterThan(0);
    expect(hushed.fighters[0]?.hitsLanded).toBe(0);
    expect(hushed.fighters[0]?.fires['firstHitBp']).toBeUndefined();
  });

  it('Momentum keeps what it stored before the silence', () => {
    // Round 1: row 0 acts, then the boss turn after it hits 25 times at 1%: the creature dodges and
    // stores Momentum. The next boss turn silences it first, so round 2's hit does not use it up.
    const b = labBoss({ rows: 2, cols: 1, rounds: 2 });
    const boss: BossDef = {
      ...b,
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 100, hits: 25 },
      moves: [hushAt(1)],
    };
    const team = [at('voltaro', 0, 0, 'zigzag', ['momentum'])];
    expect(run(boss, team).fighters[0]?.momentum).toBe(true);
    // Silenced, it does not store more either: with no dodge before the silence nothing is stored.
    const fresh = run({ ...boss, moves: [hushAt(0)] }, team);
    expect(fresh.fighters[0]?.momentum).toBe(false);
  });
});

describe('Cull and the killing blow', () => {
  const boss = calm({ rows: 1, cols: 1, hp: 4_000, rounds: 1 });
  const solo = (talents?: string[]) => [at('tempestray', 0, 0, undefined, talents)];

  it('a hit that leaves the boss below its Cull share of its full HP defeats it; the HP left is the killing blow, not damage', () => {
    const hit = run(boss, solo(), 't', { bossHp: 4_000 }).damage;
    // 100 HP left is under 5% of 4000 (200): culled.
    const culled = run(boss, solo(['cull']), 't', { bossHp: hit + 100 });
    expect(culled.won).toBe(true);
    expect(culled.bossHpLeft).toBe(0);
    // The 100 HP Cull removed are not damage the creature dealt.
    expect(culled.damage).toBe(hit);
    expect(culled.fighters[0]?.damageDealt).toBe(hit);
    expect(culled.killingBlow).toMatchObject({ name: 'Tempestray', culled: true, round: 1 });
    const plain = run(boss, solo(), 't', { bossHp: hit + 100 });
    expect(plain.won).toBe(false);
    expect(plain.bossHpLeft).toBe(100);
    expect(plain.killingBlow).toBeNull();
    // 300 left is not under 200: no cull. The share is of the boss's full HP, not of what is left.
    expect(run(boss, solo(['cull']), 't', { bossHp: hit + 300 }).won).toBe(false);
    expect(run(boss, solo(['cull']), 't', { bossHp: hit + 150 }).won).toBe(true);
  });

  it('the killing blow is the creature whose damage took the last HP', () => {
    const team = [at('tidewing', 0, 0), at('tempestray', 0, 1)];
    const two = { ...boss, cols: 2 };
    const first = run(two, [team[0] as Placement], 't', { bossHp: 4_000 }).damage;
    // Tidewing's hit leaves 1 HP and Tempestray lands the killing blow.
    const r = run(two, team, 't', { bossHp: first + 1 });
    expect(r.won).toBe(true);
    expect(r.killingBlow).toMatchObject({ name: 'Tempestray', culled: false });
    expect(run(two, team, 't', { bossHp: 4_000 }).killingBlow).toBeNull();
  });
});

describe('counters are not hits, and the fight ends the moment the boss is down (panel 3)', () => {
  const armoured = (cols: number, hits: number, hp = 1_000): BossDef => {
    const b = labBoss({ rows: 1, cols, atk: 110, hp, rounds: 1 });
    // Armour no hit gets past: only counters (which ignore armour) hurt the boss.
    return {
      ...b,
      spd: 0,
      armour: 10_000,
      plain: { pattern: { anchor: 'strongest', shape: 'single' }, powerBp: 10_000, hits },
    };
  };
  const pair = (talents: string[]) => [
    at('tempestray', 0, 0),
    at('thornbuck', 0, 1, undefined, talents),
  ];
  const counterOf = () =>
    Math.floor(
      (formStats('thornbuck', 25).atk * bp('shoulder-charge', 'interceptHitBackBp')) / 10_000,
    );

  it('Shoulder Charge strikes back for damage but never sets off Cull or a talent on its hits', () => {
    const talents = ['shoulder-charge', 'cull', 'first-pounce', 'sharp-claws'];
    // One intercept leaves the boss 20 HP, under 5% of 1000: a hit would cull it, a counter does not.
    const r = run(armoured(2, 1), pair(talents), 't', { bossHp: counterOf() + 20 });
    const guard = r.fighters[1];
    expect(r.intercepts).toBe(1);
    expect(guard?.damageDealt).toBe(counterOf());
    // Its own hit was Blocked, so its first hit has not landed; the counter did not use it up.
    expect(guard?.hitsLanded).toBe(0);
    expect(r.won).toBe(false);
    expect(r.bossHpLeft).toBe(20);
    expect(r.killingBlow).toBeNull();
  });

  it('a counter can land the killing blow, and nothing of the boss acts after it', () => {
    // Four plain hits at the strongest creature; the first intercept's strike-back takes the last HP.
    const r = run(armoured(2, 4), pair(['shoulder-charge']), 't', { bossHp: counterOf() });
    expect(r.won).toBe(true);
    expect(r.killingBlow).toMatchObject({ name: 'Thornbuck', culled: false });
    expect(r.intercepts).toBe(1);
    // The intercepted hit does not land either: the killing blow is the last thing that happens.
    expect(r.events.at(-1)?.kind).toBe('killing-blow');
    expect(r.events.filter((e) => e.kind === 'hit')).toHaveLength(0);
  });

  it('no creature hits after the boss is down, and no later row acts', () => {
    const b = labBoss({ rows: 2, cols: 3, rounds: 3, hp: 100_000 });
    const boss: BossDef = { ...b, spd: 0 };
    const team = [
      at('tempestray', 0, 0),
      at('tempestray', 0, 1),
      at('tempestray', 0, 2),
      at('kilnmole', 1, 0),
    ];
    const r = run(boss, team, 't', { bossHp: 1 });
    expect(r.won).toBe(true);
    expect(r.fighters.map((f) => f.damageDealt > 0)).toEqual([true, false, false, false]);
    // The boss never took its turn after row 0, or any later one.
    expect(
      r.events.filter((e) => ['hit', 'blocked', 'dodge', 'intercept', 'move'].includes(e.kind)),
    ).toHaveLength(0);
  });

  it('the round count restarts each raid stage', () => {
    const w = weekend(calm({ rows: 1, cols: 1, rounds: 3 }), [at('tidewing', 0, 0)], [], {
      rng: rng('wk'),
      log: true,
      stages: 3,
    });
    expect(w.stages).toHaveLength(3);
    for (const st of w.stages) {
      const rounds = [...new Set(st.events.map((e) => e.round))];
      expect(rounds).toEqual([1, 2, 3]);
    }
  });
});

describe('the talent library as content', () => {
  const roles = (line: string) => lineRoles(line);

  it('every talent has the keys it says, fits a role, and is in a line pool (Cull waits for a killing-blow talent)', () => {
    const pooled = new Set(Object.values(LINE_POOLS).flat());
    for (const [id, t] of Object.entries(TALENTS)) {
      expect(t.id, id).toBe(id);
      expect(t.roles.length, id).toBeGreaterThan(0);
      expect(pooled.has(id), `${id} pool membership`).toBe(id !== 'cull');
      for (const w of keywordsIn(t.text)) expect(KEYWORDS, `${id} {${w}}`).toHaveProperty(w);
    }
    expect(Object.keys(TALENTS).length).toBeGreaterThanOrEqual(28);
    // Retired in panel 3.
    for (const gone of ['lone-wolf', 'share-the-load', 'thick-skull', 'light-sleeper'])
      expect(TALENTS, gone).not.toHaveProperty(gone);
    expect(Object.keys(TALENTS).filter((id) => id.startsWith('flank-guard'))).toEqual([
      'flank-guard',
    ]);
  });

  it('talent fields all add up: numbers and flags only, so mergeFx stays sound', () => {
    const all = mergeFx([
      ...Object.values(TALENTS).map((t) => t.fx),
      ...Object.values(KNACKS).map((k) => k.fx),
    ]);
    for (const [key, v] of Object.entries(all))
      if (ADDITIVE_FIELDS.has(key as never)) expect(['number', 'boolean'], key).toContain(typeof v);
    // Flank Guard is a flag: two of them are still one.
    expect(mergeFx([{ flankGuard: true }, { flankGuard: true }])).toEqual({ flankGuard: true });
  });

  it('every pool is 7 talents, every role in a line has 3 that fit, and lines of one role differ', () => {
    const byRole = new Map<string, string[]>();
    for (const line of Object.keys(LINE_POOLS)) {
      const entries = talentPool(line);
      expect(entries).toHaveLength(7);
      for (const role of roles(line)) {
        expect(
          entries.filter((e) => e.roles.includes(role)).length,
          `${line} ${role}`,
        ).toBeGreaterThanOrEqual(3);
        byRole.set(role, [...(byRole.get(role) ?? []), line]);
      }
    }
    // No two lines share the same pool.
    const keys = Object.values(LINE_POOLS).map((p) => [...p].sort().join());
    expect(new Set(keys).size).toBe(keys.length);
    // Healing talents only where a Support has a heal; debuff talents only on Mire lines.
    for (const line of Object.keys(LINE_POOLS)) {
      const els = content.creatures.filter((c) => c.line === line).map((c) => c.element);
      const pool = LINE_POOLS[line] ?? [];
      if (pool.includes('triage') || pool.includes('overheal-spill'))
        expect(
          els.some((e) => e === 'tide' || e === 'grove'),
          line,
        ).toBe(true);
      if (pool.includes('heavy-hand') || pool.includes('clinging'))
        expect(
          els.every((e) => e === 'mire'),
          line,
        ).toBe(true);
    }
  });
});

describe('reworked weak talents (2026-10-28)', () => {
  it('Unbothered is the silence ward with a little Attack and HP, less than the plain stat talents', () => {
    expect(TALENTS['unbothered']?.fx.ignoreSilence).toBe(true);
    expect(bp('unbothered', 'atkBp')).toBeGreaterThan(0);
    expect(bp('unbothered', 'atkBp')).toBeLessThan(bp('sharp-claws', 'atkBp'));
    expect(bp('unbothered', 'hpBp')).toBeGreaterThan(0);
    expect(bp('unbothered', 'hpBp')).toBeLessThan(bp('hardy', 'hpBp'));
    const boss = calm({ rows: 1, cols: 1, rounds: 1 });
    const plain = run(boss, [at('tidewing', 0, 0)]);
    const calmed = run(boss, [at('tidewing', 0, 0, undefined, ['unbothered'])]);
    expect(calmed.fighters[0]?.maxHp).toBeGreaterThan(plain.fighters[0]?.maxHp ?? 0);
  });
});
