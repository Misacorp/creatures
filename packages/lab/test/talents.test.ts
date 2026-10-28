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

describe('talent hooks: neighbours and position', () => {
  const quiet = calm({ rows: 1, cols: 3 });

  it('Shoulder to Shoulder: +20% per neighbour of its element, at most 2', () => {
    const two = [at('tidewing', 0, 0), at('tidewing', 0, 1), at('tidewing', 0, 2)];
    const one = [at('wickat', 0, 0), at('tidewing', 0, 1), at('tidewing', 0, 2)];
    const none = [at('wickat', 0, 0), at('tidewing', 0, 1), at('wickat', 0, 2)];
    close(gain(quiet, two, 1, 'shoulder-to-shoulder')[0], 1.4);
    close(gain(quiet, one, 1, 'shoulder-to-shoulder')[0], 1.2);
    expect(gain(quiet, none, 1, 'shoulder-to-shoulder')[0]).toBe(1);
  });

  it('Odd One Out: +12% while no creature beside it shares its element, also with nobody beside it', () => {
    const mixed = [at('wickat', 0, 0), at('tidewing', 0, 1), at('wickat', 0, 2)];
    const kin = [at('tidewing', 0, 0), at('tidewing', 0, 1), at('wickat', 0, 2)];
    close(gain(quiet, mixed, 1, 'odd-one-out')[0], 1.12);
    expect(gain(quiet, kin, 1, 'odd-one-out')[0]).toBe(1);
    // The shipped line holds with nobody beside it too.
    close(gain(calm({ rows: 1, cols: 1 }), [at('tidewing', 0, 0)], 0, 'odd-one-out')[0], 1.12);
  });

  it('Edge-walker: +15% in the arena end slots (column 0 and the last column), nothing in the middle', () => {
    const row = [at('tidewing', 0, 0), at('wickat', 0, 1), at('tidewing', 0, 2)];
    close(gain(quiet, row, 0, 'edge-walker')[0], 1.15);
    close(gain(quiet, row, 2, 'edge-walker')[0], 1.15);
    expect(gain(quiet, row, 1, 'edge-walker')[0]).toBe(1);
    // The slot decides, not the end creature: alone in column 1 it is not at a row end, alone in column 0 it is.
    const lone = (col: number) => [at('tidewing', 0, col)];
    expect(gain(quiet, lone(1), 0, 'edge-walker')[0]).toBe(1);
    close(gain(quiet, lone(0), 0, 'edge-walker')[0], 1.15);
    // Nobody to its left does not make column 1 an end.
    expect(gain(quiet, [at('tidewing', 0, 1), at('wickat', 0, 2)], 0, 'edge-walker')[0]).toBe(1);
  });

  it('Front-liner: 20% less from every hit in the front row, none from further back', () => {
    const hit = (cols: number, row: number, talents?: string[]) => {
      const b = labBoss({ rows: 2, cols, atk: 110 });
      const r = run({ ...b, spd: 0 }, [at('kilnmole', row, 0, undefined, talents)]);
      return firstHit(r, 'Kilnmole');
    };
    // Plain hit 110, minus Kilnmole's armour; with the cut, floor(110 x 0.8) - armour.
    expect(hit(1, 0)).toBe(110 - KILN_ARMOUR);
    expect(hit(1, 0, ['front-liner'])).toBe(88 - KILN_ARMOUR);
    expect(hit(1, 1, ['front-liner'])).toBe(110 - KILN_ARMOUR);
  });
});

describe('talent hooks: fight state', () => {
  it('Slow Burn: +4% per round from round 2, up to +24%', () => {
    const g = gain(calm({ rows: 1, cols: 1 }), [at('tidewing', 0, 0)], 0, 'slow-burn', 0, 9);
    close(g[0], 1);
    close(g[1], 1.04);
    close(g[3], 1.12);
    close(g[6], 1.24);
    close(g[8], 1.24);
  });

  it('Finisher: +50% while the boss is below a third of its HP', () => {
    const boss = calm({ rows: 1, cols: 1, hp: 900_000 });
    const team = [at('tidewing', 0, 0)];
    close(gain(boss, team, 0, 'finisher', 0, 1, { bossHp: 299_000 })[0], 1.5);
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

  it('Momentum: after it dodges, its next hit deals +40%', () => {
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
    close(g[1], 1.4);
  });

  it('Rally Cry: +50% for the rest of the fight, only after a creature beside it is knocked out', () => {
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
    close(beside[1], 1.5);
    const apart = gain(boss, team, 2, 'rally-cry', 2, 2);
    expect(apart).toEqual([1, 1]);
  });
});

describe('talent hooks: marks', () => {
  const trio = calm({ rows: 1, cols: 2, rounds: 3 });
  const doubleMarker = at('tidewing', 0, 0, 'double-mark');

  it('Opportunist: a bigger reaction when it cashes a mark at x3', () => {
    // Double Mark leaves x2 a round and the Payoff cashes one: round 2 is the first x3.
    const team = [doubleMarker, at('tempestray', 0, 1)];
    const on = run(trio, withTalents(team, { 1: ['opportunist'] }));
    const off = run(trio, team);
    expect(on.fighters[1]?.fires['cashFullBp']).toBe(2);
    expect(on.fighters[1]?.damageDealt).toBeGreaterThan(off.fighters[1]?.damageDealt ?? 0);
    // With single marks it never holds, and nothing changes.
    const single = [at('tidewing', 0, 0), at('tempestray', 0, 1)];
    const none = run(trio, withTalents(single, { 1: ['opportunist'] }));
    expect(none.fighters[1]?.fires['cashFullBp']).toBeUndefined();
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
    // 40% and 30% multiply: x1.82, not x1.70.
    const both = bonusOf(['opportunist', 'quick-draw']);
    expect(both / none).toBeGreaterThan(1.8);
    expect(both / none).toBeLessThan(1.84);
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

  it('Deep Ink: its first mark each fight starts at x2', () => {
    const boss = calm({ rows: 1, cols: 1, rounds: 2 });
    expect(marks(run(boss, [at('tidewing', 0, 0, undefined, ['deep-ink'])]))).toEqual([
      'tide x2',
      'tide x3',
    ]);
    expect(marks(run(boss, [at('tidewing', 0, 0)]))).toEqual(['tide x1', 'tide x2']);
  });
});

describe('talent hooks: Guard shapes and defence', () => {
  /** The boss aims at the strongest creature, Tempestray, wherever it stands. */
  const aim = (atk = 110) => ({ ...aimed('strongest', 'single', atk), rounds: 6 });

  it('Flank Guard: reach to its longer side only, with twice the slots; ties go left', () => {
    const hit = (guardCol: number, creatureCol: number, talents: string[] = ['flank-guard']) =>
      run(aim(), [
        at('tempestray', 0, creatureCol),
        at('thornbuck', 0, guardCol, undefined, talents),
      ]).intercepts;
    // Two slots away is out of a plain Guard's reach and inside a flank's.
    expect(hit(2, 0, [])).toBe(0);
    // Five slots wide, a Guard in the middle has two slots each way: a tie goes left.
    expect(hit(2, 0)).toBeGreaterThan(0);
    expect(hit(2, 4)).toBe(0);
    // At the right end the longer side is the left; at the left end it is the right.
    expect(hit(4, 2)).toBeGreaterThan(0);
    expect(hit(0, 2)).toBeGreaterThan(0);
    // The shorter side gets nothing, not even beside it (a plain Guard would cover it).
    expect(hit(3, 4)).toBe(0);
    expect(hit(3, 4, [])).toBeGreaterThan(0);
  });

  it('Long Shadow: cover grows with distance, and so does the cut on a hit it intercepts', () => {
    const sweep = aimed('front', 'row', 110);
    const covered = (guardCol: number, knack: string | undefined, talents: string[]) =>
      firstHit(
        run(sweep, [at('tempestray', 0, 0), at('thornbuck', 0, guardCol, knack, talents)]),
        'Tempestray',
      );
    // Area hit 110, minus Tempestray's armour. Cover 40%: 66 - armour.
    expect(covered(1, undefined, [])).toBe(66 - TEMPEST_ARMOUR);
    // Two slots away with Wide Reach: 40% + 2 x 10 = 60%: 44 - armour.
    expect(covered(2, 'wide-reach', ['long-shadow'])).toBe(44 - TEMPEST_ARMOUR);
    // An aimed hit the Guard takes for a creature two slots away is cut 20%: 88 - armour (not 110 - armour).
    const hit = (talents: string[]) =>
      firstHit(
        run(aim(), [at('tempestray', 0, 0), at('thornbuck', 0, 2, undefined, talents)]),
        'Thornbuck',
      );
    expect(hit(['flank-guard'])).toBe(110 - THORN_ARMOUR);
    expect(hit(['flank-guard', 'long-shadow'])).toBe(88 - THORN_ARMOUR);
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
    // Two cuts multiply: cover 40% and Front-liner 20% leave 60% x 80% = 48% (not 40%).
    const both = [at('tempestray', 0, 0, undefined, ['front-liner']), at('thornbuck', 0, 1)];
    expect(firstHit(run(sweep, both), 'Tempestray')).toBe(
      Math.floor((110 * 4_800) / 10_000) - TEMPEST_ARMOUR,
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
    // 110 x 25% = 27 before armour: the covered creature takes 27 - its armour, the Guard (no cover, Front-liner) 88 - its own.
    expect(firstHit(r, 'Tempestray')).toBe(27 - TEMPEST_ARMOUR);
    expect(firstHit(r, 'Thornbuck')).toBe(88 - THORN_ARMOUR);
    // The Guard in the front row also shrugs a hit it takes for the creature four slots away: 20% and 40% leave 48%.
    const aimedAt = { ...aimed('strongest', 'single', 110), cols: 15, rounds: 6 };
    const intercepted = firstHit(
      run(aimedAt, [
        at('tempestray', 0, 10),
        at('thornbuck', 0, 14, 'wide-reach', ['flank-guard', 'long-shadow', 'front-liner']),
      ]),
      'Thornbuck',
    );
    expect(intercepted).toBe(Math.floor((110 * 4_800) / 10_000) - THORN_ARMOUR);
  });

  it('cover comes from the Guard with the largest cover whose reach includes the creature', () => {
    const sweep = aimed('front', 'row', 110);
    const covered = (strong: string[]) =>
      firstHit(
        run(sweep, [
          at('tempestray', 0, 0),
          // Beside it: cover 40%.
          at('thornbuck', 0, 1),
          // Two slots away (Wide Reach): with Long Shadow its cover is 60%, so it wins.
          at('thornbuck', 0, 2, 'wide-reach', strong),
        ]),
        'Tempestray',
      );
    expect(covered([])).toBe(66 - TEMPEST_ARMOUR);
    expect(covered(['long-shadow'])).toBe(44 - TEMPEST_ARMOUR);
  });

  it('Shoulder Charge: when it intercepts, it strikes back for 40% of its Attack, ignoring armour', () => {
    const team = (talents: string[]) => [
      at('tempestray', 0, 0),
      at('thornbuck', 0, 1, undefined, talents),
    ];
    const a = run(aim(), team(['shoulder-charge']));
    const b = run(aim(), team([]));
    const atk = a.fighters[1]?.atk ?? 0;
    expect(a.intercepts).toBeGreaterThan(0);
    expect((a.fighters[1]?.damageDealt ?? 0) - (b.fighters[1]?.damageDealt ?? 0)).toBe(
      a.intercepts * Math.floor((atk * 4_000) / 10_000),
    );
  });

  it('Brace: 40% less from a Charged landing on its slot', () => {
    const b = labBoss({ rows: 1, cols: 1, cards: ['great-wave'], rounds: 3 });
    const boss: BossDef = { ...b, spd: 0, plain: { ...b.plain, powerBp: 0 } };
    const hit = (talents: string[]) =>
      firstHit(run(boss, [at('tempestray', 0, 0, undefined, talents)]), 'Tempestray');
    // Great Wave lands 110 x 1.8 = 198: minus Tempestray's armour; braced, floor(198 x 0.6) = 118 - armour.
    expect(hit([])).toBe(198 - TEMPEST_ARMOUR);
    expect(hit(['brace'])).toBe(118 - TEMPEST_ARMOUR);
  });

  it('Stubborn leaves it at 1 HP once per fight', () => {
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

  it('Kindred Boost: +10% on creatures of its own element only', () => {
    const team = [at('aurorix', 0, 0), at('tempestray', 0, 1)];
    close(gain(quiet, team, 0, 'kindred-boost', 1)[0], 1.25 / 1.15, 0.02);
    const other = [at('aurorix', 0, 0), at('tidewing', 0, 1)];
    expect(gain(quiet, other, 0, 'kindred-boost', 1)[0]).toBe(1);
  });

  it('Triage: the heal goes to the most hurt creature beside it, at double size', () => {
    const b = labBoss({ rows: 1, cols: 3, rounds: 5, atk: 90 });
    const boss: BossDef = { ...b, spd: 0 };
    const team = (talents: string[]) => [
      at('kilnmole', 0, 0),
      at('lanternfin', 0, 1, undefined, talents),
      at('tempestray', 0, 2),
    ];
    // Only Kilnmole is ever hurt: one heal on it, not a second wasted on Tempestray at full HP.
    expect(run(boss, team(['triage'])).healed).toBeGreaterThan(run(boss, team([])).healed * 1.5);
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

  it('Overheal Spill: healing past full HP passes to the most hurt creature beside the one that was healed', () => {
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

  it('Clinging: Mired fades only at the end of every third round while it stands', () => {
    const r = song(['clinging'], {}, 6);
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
    // It held the fade back at the end of rounds 2 and 4.
    expect(r.fighters[0]?.fires['clinging']).toBe(2);
  });

  it('Heavy Hand: its Mired has a 50% chance to add 1 extra stack', () => {
    let extra = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const r = song(['heavy-hand'], {}, 1, `hh:${i}`);
      extra += mired(r)[0] === 'Mired x2' ? 1 : 0;
    }
    expect(extra).toBeGreaterThan(n * 0.4);
    expect(extra).toBeLessThan(n * 0.6);
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
  const counterOf = () => Math.floor((formStats('thornbuck', 25).atk * 4_000) / 10_000);

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
