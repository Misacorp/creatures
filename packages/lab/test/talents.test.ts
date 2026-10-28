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
  talentPool,
  type BossDef,
  type FightOptions,
  type Placement,
} from '../src';
import { content } from '@creatures/game';

const rng = (s: string) => createSeededRng(s);
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

  it('Odd One Out: +30% while neighbours stand beside it and none shares its element', () => {
    const mixed = [at('wickat', 0, 0), at('tidewing', 0, 1), at('wickat', 0, 2)];
    const kin = [at('tidewing', 0, 0), at('tidewing', 0, 1), at('wickat', 0, 2)];
    close(gain(quiet, mixed, 1, 'odd-one-out')[0], 1.3);
    expect(gain(quiet, kin, 1, 'odd-one-out')[0]).toBe(1);
    // Alone it has no neighbour at all: that is Lone Wolf's job.
    expect(gain(calm({ rows: 1, cols: 1 }), [at('tidewing', 0, 0)], 0, 'odd-one-out')[0]).toBe(1);
  });

  it('Lone Wolf: +40% while no living creature stands beside it', () => {
    close(gain(calm({ rows: 1, cols: 1 }), [at('tidewing', 0, 0)], 0, 'lone-wolf')[0], 1.4);
    const crowded = [at('tidewing', 0, 0), at('wickat', 0, 1)];
    expect(gain(calm({ rows: 1, cols: 2 }), crowded, 0, 'lone-wolf')[0]).toBe(1);
    // Two places away is not beside.
    const apart = [at('tidewing', 0, 0), at('wickat', 0, 2)];
    close(gain(quiet, apart, 0, 'lone-wolf')[0], 1.4);
  });

  it('Edge-walker: +30% at either end of its row, nothing in the middle', () => {
    const row = [at('tidewing', 0, 0), at('wickat', 0, 1), at('tidewing', 0, 2)];
    close(gain(quiet, row, 0, 'edge-walker')[0], 1.3);
    close(gain(quiet, row, 2, 'edge-walker')[0], 1.3);
    expect(gain(quiet, row, 1, 'edge-walker')[0]).toBe(1);
  });

  it('Front-liner: 20% less from every hit in the front row, none from further back', () => {
    const hit = (cols: number, row: number, talents?: string[]) => {
      const b = labBoss({ rows: 2, cols, atk: 110 });
      const r = run({ ...b, spd: 0 }, [at('kilnmole', row, 0, undefined, talents)]);
      return firstHit(r, 'Kilnmole');
    };
    // Plain hit 110, armour 30: 80; with the cut, floor(110 x 0.8) - 30 = 58.
    expect(hit(1, 0)).toBe(80);
    expect(hit(1, 0, ['front-liner'])).toBe(58);
    expect(hit(1, 1, ['front-liner'])).toBe(80);
  });
});

describe('talent hooks: fight state', () => {
  it('Slow Burn: +8% per round from round 2, up to +48%', () => {
    const g = gain(calm({ rows: 1, cols: 1 }), [at('tidewing', 0, 0)], 0, 'slow-burn', 0, 9);
    close(g[0], 1);
    close(g[1], 1.08);
    close(g[3], 1.24);
    close(g[6], 1.48);
    close(g[8], 1.48);
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

  it('Vengeful: +50% for the rest of the fight, only after a creature beside it is knocked out', () => {
    const b = labBoss({ rows: 1, cols: 3, atk: 5_000 });
    const boss: BossDef = {
      ...b,
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    };
    // Column 0 falls at the end of round 1: column 1 stands beside it, column 2 does not.
    const team = [at('tidewing', 0, 0), at('tidewing', 0, 1), at('tidewing', 0, 2)];
    const beside = gain(boss, team, 1, 'vengeful', 1, 2);
    expect(beside[0]).toBe(1);
    close(beside[1], 1.5);
    const apart = gain(boss, team, 2, 'vengeful', 2, 2);
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

  it('Flank Guard: reach to one side only, with twice the slots', () => {
    const left = (talents: string[]) => [
      at('tempestray', 0, 0),
      at('thornbuck', 0, 2, undefined, talents),
    ];
    // Two places to its left is out of a plain Guard's reach and inside a left flank's.
    expect(run(aim(), left([])).intercepts).toBe(0);
    expect(run(aim(), left(['flank-guard-left'])).intercepts).toBeGreaterThan(0);
    // A creature on the other side is not covered by a left flank.
    const right = [at('thornbuck', 0, 2, undefined, ['flank-guard-left']), at('tempestray', 0, 3)];
    expect(run(aim(), right).intercepts).toBe(0);
    // The mirror: a right flank covers two places to its right, and nobody on its left.
    const guard = at('thornbuck', 0, 1, undefined, ['flank-guard-right']);
    expect(run(aim(), [guard, at('tempestray', 0, 3)]).intercepts).toBeGreaterThan(0);
    expect(run(aim(), [at('tempestray', 0, 0), guard]).intercepts).toBe(0);
  });

  it('Long Shadow: cover grows with distance, and so does the cut on a hit it intercepts', () => {
    const sweep = aimed('front', 'row', 110);
    const covered = (guardCol: number, knack: string | undefined, talents: string[]) =>
      firstHit(
        run(sweep, [at('tempestray', 0, 0), at('thornbuck', 0, guardCol, knack, talents)]),
        'Tempestray',
      );
    // Area hit 110, Tempestray armour 8. Cover 40%: 66 - 8 = 58.
    expect(covered(1, undefined, [])).toBe(58);
    // Two places away with Wide Reach: 40% + 2 x 10 = 60%: 44 - 8 = 36.
    expect(covered(2, 'wide-reach', ['long-shadow'])).toBe(36);
    // An aimed hit the Guard takes for a creature two places away is cut 20%: 88 - 30 = 58 (not 80).
    const hit = (talents: string[]) =>
      firstHit(
        run(aim(), [at('tempestray', 0, 0), at('thornbuck', 0, 2, undefined, talents)]),
        'Thornbuck',
      );
    expect(hit(['flank-guard-left'])).toBe(80);
    expect(hit(['flank-guard-left', 'long-shadow'])).toBe(58);
  });

  it('cover is capped at 75% with every bonus (an intercepted hit has no cap)', () => {
    const sweep = aimed('front', 'row', 110);
    // Wide Reach and a left flank: four places, so Long Shadow would give 40% + 40% = 80% at the far end.
    const team = [
      at('tempestray', 0, 0),
      at('thornbuck', 0, 4, 'wide-reach', ['flank-guard-left', 'long-shadow']),
    ];
    // 75%: floor(110 x 0.25) = 27, minus armour 8.
    expect(LAB_RULES.coverMaxBp).toBe(7_500);
    expect(firstHit(run(sweep, team), 'Tempestray')).toBe(27 - 8);
  });

  it('Shoulder Charge: when it intercepts, it hits back for 40% of its Attack, ignoring armour', () => {
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

  it('Share the Load: creatures beside it get half its armour', () => {
    const all = aimed('front', 'all', 110);
    const hit = (cols: number[], talents: string[]) =>
      firstHit(
        run(all, [
          at('thornbuck', 0, cols[0] ?? 0, undefined, talents),
          at('tempestray', 0, cols[1] ?? 1),
        ]),
        'Tempestray',
      );
    // Beside a Guard: cover 40% (66), armour 8 + half of 30: 66 - 23 = 43 (not 58).
    expect(hit([0, 1], [])).toBe(58);
    expect(hit([0, 1], ['share-the-load'])).toBe(43);
    // Two places away it gets nothing, and no cover either: 110 - 8.
    expect(hit([0, 2], ['share-the-load'])).toBe(102);
  });

  it('Thick Skull: a hit smaller than 10% of its max HP is Blocked', () => {
    const max = formStats('tempestray', 25).hp;
    const limit = Math.ceil(max / 10);
    const hit = (dmg: number, talents: string[]) => {
      const b = labBoss({ rows: 1, cols: 1, atk: dmg + 8 });
      return run({ ...b, spd: 0, rounds: 1 }, [at('tempestray', 0, 0, undefined, talents)]);
    };
    const small = hit(limit - 1, ['thick-skull']);
    expect(small.blocked).toBe(1);
    expect(firstHit(small, 'Tempestray')).toBeUndefined();
    expect(firstHit(hit(limit - 1, []), 'Tempestray')).toBe(limit - 1);
    expect(firstHit(hit(limit, ['thick-skull']), 'Tempestray')).toBe(limit);
  });

  it('Brace: 40% less from a Charged landing on its slot', () => {
    const b = labBoss({ rows: 1, cols: 1, cards: ['great-wave'], rounds: 3 });
    const boss: BossDef = { ...b, spd: 0, plain: { ...b.plain, powerBp: 0 } };
    const hit = (talents: string[]) =>
      firstHit(run(boss, [at('tempestray', 0, 0, undefined, talents)]), 'Tempestray');
    // Great Wave lands 110 x 1.8 = 198: minus armour 8 = 190; braced, floor(198 x 0.6) = 118 - 8 = 110.
    expect(hit([])).toBe(190);
    expect(hit(['brace'])).toBe(110);
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

  it('Kindred Boost: 10 points bigger on creatures of its own element only', () => {
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

  it('Overheal Spill: healing past full HP passes to the most hurt creature beside it', () => {
    const boss = calm({ rows: 1, cols: 3, rounds: 1 });
    const team = (talents: string[]) => [
      at('kilnmole', 0, 0),
      at('lanternfin', 0, 1, undefined, talents),
      at('tempestray', 0, 2),
    ];
    // Kilnmole is one HP short, so its heal mostly overflows; Tempestray is at half.
    const carryHp = new Map([
      ['p1:kilnmole:0', formStats('kilnmole', 25).hp - 1],
      ['p1:tempestray:2', Math.floor(formStats('tempestray', 25).hp / 2)],
    ]);
    const hp = (talents: string[]) =>
      run(boss, team(talents), 't', { carryHp }).fighters[2]?.hp ?? 0;
    expect(hp(['overheal-spill'])).toBeGreaterThan(hp([]));
  });
});

describe('talent hooks: debuffs and silence', () => {
  const song = (talents: string[], extra: Partial<BossDef> = {}, rounds = 3) =>
    run({ ...calm({ rows: 1, cols: 1, rounds }), ...extra }, [
      at('squelch', 0, 0, 'squelch-song', talents),
    ]);

  it('Mired fades: one stack at each round start, so a creature must keep applying it', () => {
    // Round 1: x1. Rounds 2 and 3: it fades to x0 first, then the song puts it back to x1.
    expect(mired(song([]))).toEqual(['Mired x1', 'Mired x0', 'Mired x1', 'Mired x0', 'Mired x1']);
  });

  it('Clinging: Mired fades only every second round while it stands', () => {
    // Round 2 fades and re-applies (x1); round 3 does not fade, so the song makes x2.
    expect(mired(song(['clinging']))).toEqual(['Mired x1', 'Mired x0', 'Mired x1', 'Mired x2']);
  });

  it('Heavy Hand: its Mired adds 2 stacks each time', () => {
    expect(mired(song(['heavy-hand'], {}, 1))).toEqual(['Mired x2']);
  });

  it('Shake It Off: announced at round start, the boss clears every debuff when that round ends', () => {
    const boss = { ...calm({ rows: 1, cols: 1, rounds: 4, cards: ['shake-it-off'] }) };
    const r = run(boss, [at('squelch', 0, 0, 'squelch-song', ['heavy-hand'])]);
    expect(r.events.filter((e) => e.kind === 'announce')).toHaveLength(1);
    expect(r.events.find((e) => e.kind === 'announce')?.round).toBe(3);
    expect(r.events.filter((e) => e.kind === 'shake')).toHaveLength(1);
    // x2, then fade and add (x1, x3), fade and add (x2, x4), shaken to x0, and round 4 starts from nothing.
    expect(mired(r)).toEqual([
      'Mired x2',
      'Mired x1',
      'Mired x3',
      'Mired x2',
      'Mired x4',
      'Mired x0',
      'Mired x2',
    ]);
  });

  it('Light Sleeper: the first silence on it each fight lasts one turn', () => {
    const b = calm({ rows: 1, cols: 1, rounds: 4 });
    const hush = {
      id: 's',
      name: 'Hush',
      pattern: { anchor: 'front' as const, shape: 'all' as const },
      powerBp: 0,
      every: 2,
      turn: 0,
      silenceTurns: 9,
    };
    const boss: BossDef = { ...b, moves: [hush] };
    // Silenced after round 2: without the talent for good; with it, only round 3 is lost.
    expect(marks(run(boss, [at('tidewing', 0, 0)]))).toHaveLength(2);
    expect(marks(run(boss, [at('tidewing', 0, 0, undefined, ['light-sleeper'])]))).toHaveLength(3);
  });
});

describe('Cull and the killing blow', () => {
  const boss = calm({ rows: 1, cols: 1, hp: 4_000, rounds: 1 });
  const solo = (talents?: string[]) => [at('tempestray', 0, 0, undefined, talents)];

  it('a hit that leaves the boss below its Cull share defeats it, and counts the HP that was left', () => {
    const hit = run(boss, solo(), 't', { bossHp: 4_000 }).damage;
    // 100 HP left is under 5% of 4000 (200): culled.
    const culled = run(boss, solo(['cull']), 't', { bossHp: hit + 100 });
    expect(culled.won).toBe(true);
    expect(culled.damage).toBe(hit + 100);
    expect(culled.killingBlow).toMatchObject({ name: 'Tempestray', culled: true, round: 1 });
    const plain = run(boss, solo(), 't', { bossHp: hit + 100 });
    expect(plain.won).toBe(false);
    expect(plain.bossHpLeft).toBe(100);
    expect(plain.killingBlow).toBeNull();
    // 300 left is not under 200: no cull.
    expect(run(boss, solo(['cull']), 't', { bossHp: hit + 300 }).won).toBe(false);
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

describe('the talent library as content', () => {
  const roles = (line: string) => lineRoles(line);

  it('every talent has the keys it says, fits a role, and is in a line pool', () => {
    const pooled = new Set(Object.values(LINE_POOLS).flat());
    for (const [id, t] of Object.entries(TALENTS)) {
      expect(t.id, id).toBe(id);
      expect(t.roles.length, id).toBeGreaterThan(0);
      expect(pooled.has(id), `${id} is in no pool`).toBe(true);
      for (const w of keywordsIn(t.text)) expect(KEYWORDS, `${id} {${w}}`).toHaveProperty(w);
    }
    expect(Object.keys(TALENTS).length).toBeGreaterThanOrEqual(32);
  });

  it('talent fields all add up: numbers and flags only, so mergeFx stays sound', () => {
    const all = mergeFx([
      ...Object.values(TALENTS).map((t) => t.fx),
      ...Object.values(KNACKS).map((k) => k.fx),
    ]);
    for (const [key, v] of Object.entries(all))
      if (ADDITIVE_FIELDS.has(key as never)) expect(['number', 'boolean'], key).toContain(typeof v);
    // Both flanks together cancel out: the reach is both sides again.
    const both = mergeFx([{ flankLeft: true }, { flankRight: true }]);
    expect(both).toEqual({ flankLeft: true, flankRight: true });
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
