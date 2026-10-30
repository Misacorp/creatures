/**
 * Fight rules of design panel 6: the crit step comes after the dodge and the reaction's choice (R6.3b), Sure Crits and Steady
 * Rhythm count only hits that land, counters never crit or spend a Sure Crit, heals crit at the base chance only, and a
 * silenced creature keeps its talents' plain stat lines (R12). One test per rule, on the smallest board, with a scripted RNG
 * (`YES` passes any chance above 0, `NO` fails any chance below 100%) so that no seed decides.
 */
import { describe, expect, it } from 'vitest';
import {
  LAB_RULES,
  KNACKS,
  TALENTS,
  fight,
  formStats,
  labBoss,
  type BossDef,
  type BossMove,
  type FightResult,
  type Placement,
} from '../src';

const YES = 0;
const NO = 9_999;
/** An RNG that hands out `values` in order (then `NO`), counting the draws: `int(rng, 10000)` is the value itself. */
function scripted(values: readonly number[]) {
  let n = 0;
  return { rng: { nextU32: () => values[n++] ?? NO }, draws: () => n };
}
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
interface Quiet {
  rows?: number;
  cols?: number;
  rounds?: number;
  atk?: number;
  armour?: number;
  spd?: number;
  dodgeBp?: number;
  /** The plain attack's hits on the front creature (default none). */
  hits?: number;
  moves?: BossMove[];
}
/** A boss that does only what `o` says: no dodge, no armour and no attack unless asked. */
const quiet = (o: Quiet = {}): BossDef => ({
  ...labBoss({ rows: o.rows ?? 1, cols: o.cols ?? 1, rounds: o.rounds ?? 1, atk: o.atk ?? 1 }),
  spd: o.spd ?? 0,
  armour: o.armour ?? 0,
  ...(o.dodgeBp ? { dodgeBp: o.dodgeBp } : {}),
  plain: {
    pattern: { anchor: 'front', shape: 'single' },
    powerBp: (o.hits ?? 0) > 0 ? 10_000 : 0,
    hits: o.hits ?? 0,
  },
  ...(o.moves ? { moves: o.moves } : {}),
});
const play = (boss: BossDef, team: Placement[], values: readonly number[] = []) => {
  const s = scripted(values);
  const res = fight(boss, team, { rng: s.rng, log: true });
  return { res, draws: s.draws() };
};
const count = (res: FightResult, kind: string, from?: string) =>
  res.events.filter((e) => e.kind === kind && (from === undefined || e.text.startsWith(from)))
    .length;
const atk = (id: string) => formStats(id, 25).atk;

describe('R6.3b: the crit is rolled after the dodge and the choice of the reaction', () => {
  it('a dodged hit draws no crit roll, and a hit that lands draws it after the dodge', () => {
    // Boss Speed 10 is 1% dodge: the first draw is the dodge, the second (if any) the crit.
    const boss = quiet({ spd: 10 });
    const dodged = play(boss, [at('tidewing', 0, 0)], [YES]);
    expect(count(dodged.res, 'boss-dodge')).toBe(1);
    expect(dodged.draws).toBe(1);
    expect(count(dodged.res, 'crit')).toBe(0);
    const crit = play(boss, [at('tidewing', 0, 0)], [NO, YES]);
    expect(crit.draws).toBe(2);
    expect(count(crit.res, 'crit')).toBe(1);
    expect(crit.res.damage).toBe(2 * atk('tidewing'));
  });

  it('the reaction works on the crit hit: its bonus doubles with the crit, and the crit is logged before the reaction', () => {
    const team = [at('tidewing', 0, 0), at('tempestray', 0, 1)];
    const bonus = (r: FightResult) =>
      Number(r.events.find((e) => e.kind === 'reaction')?.text.split('+')[1]);
    // Draw 1 is the Setter's crit roll, draw 2 the Payoff's.
    const plain = play(quiet({ cols: 2 }), team, [NO, NO]);
    const crit = play(quiet({ cols: 2 }), team, [NO, YES]);
    expect(plain.res.reactions).toBe(1);
    expect(bonus(crit.res)).toBe(2 * bonus(plain.res));
    const kinds = crit.res.events.map((e) => e.kind);
    expect(kinds.indexOf('crit')).toBeGreaterThan(-1);
    expect(kinds.indexOf('crit')).toBeLessThan(kinds.indexOf('reaction'));
  });
});

describe('Sure Crits are spent only by a hit that lands and is not already a crit (R7.1)', () => {
  const heavy = (o: Quiet = {}) => quiet({ rounds: 3, atk: 1, hits: 1, ...o });
  const timing = [at('tidewing', 0, 0, undefined, ['perfect-timing'])];
  const a = atk('tidewing');

  it('a hit that is a crit by its roll keeps the charge; the next plain hit spends it for the double and its extra', () => {
    // Per round the draws are: the creature's crit roll, then its dodge of the boss's attack.
    const { res } = play(heavy(), timing, [NO, YES, YES, NO, NO, NO]);
    // Round 1 stores one (1x), round 2 is a crit by its roll (2x, charge kept), round 3 spends it (2x + 1x).
    expect(count(res, 'sure-crit', 'Tidewing stores')).toBe(1);
    expect(count(res, 'sure-crit', 'Tidewing spends')).toBe(1);
    expect(res.fighters[0]?.sureCrits).toBe(0);
    expect(res.damage).toBe(a * (1 + 2 + 3));
    const spend = res.events.findIndex((e) => e.text.includes('spends'));
    expect(res.events[spend]?.round).toBe(3);
  });

  it('a hit the boss dodges keeps the charge', () => {
    // Round 1: not dodged, no crit; it dodges the boss and stores. Round 2: the boss dodges its hit (no crit roll).
    // Round 3: the hit lands and spends the charge. Draws per round: its hit's dodge (and crit), then its own dodge.
    const { res } = play(heavy({ dodgeBp: 5_000 }), timing, [NO, NO, YES, YES, NO, NO, NO, NO]);
    expect(count(res, 'boss-dodge')).toBe(1);
    expect(count(res, 'sure-crit', 'Tidewing spends')).toBe(1);
    expect(res.events.find((e) => e.text.includes('spends'))?.round).toBe(3);
    expect(res.damage).toBe(a * (1 + 3));
  });

  it('a Blocked hit keeps the charge (it did not land)', () => {
    const { res } = play(heavy({ armour: 10_000 }), timing, [NO, YES]);
    expect(count(res, 'blocked', "Tidewing's hit")).toBe(3);
    expect(count(res, 'sure-crit', 'Tidewing stores')).toBe(1);
    expect(count(res, 'sure-crit', 'Tidewing spends')).toBe(0);
    expect(res.fighters[0]?.sureCrits).toBe(1);
  });
});

describe('Steady Rhythm counts only hits that land (R20.6)', () => {
  const rhythm = [at('tidewing', 0, 0, undefined, ['steady-rhythm'])];

  it('a dodged hit is not counted: the third hit that lands is the crit, whatever the dodges', () => {
    // Hits 1 and 3 are dodged; the landed ones (rounds 2, 4, 5) count, and the third of them (round 5) crits with no luck.
    const boss = quiet({ rounds: 5, dodgeBp: 5_000 });
    const { res } = play(boss, rhythm, [YES, NO, NO, YES, NO, NO, NO, NO]);
    expect(count(res, 'boss-dodge')).toBe(2);
    expect(res.fighters[0]?.hitsMade).toBe(3);
    expect(res.fighters[0]?.fires['steadyRhythm']).toBe(1);
    expect(count(res, 'crit')).toBe(1);
    expect(res.events.find((e) => e.kind === 'crit')?.round).toBe(5);
  });

  it('a Blocked hit is not counted either', () => {
    const { res } = play(quiet({ rounds: 6, armour: 10_000 }), rhythm);
    expect(count(res, 'blocked')).toBe(6);
    expect(res.fighters[0]?.hitsMade).toBe(0);
    expect(count(res, 'crit')).toBe(0);
  });
});

describe('counters and heals (R21.7, R16)', () => {
  it('a counter never crits and never spends a Sure Crit, and on a dodge it fires before the charge is stored', () => {
    // Zoom hits back on a dodge; Perfect Timing stores a Sure Crit on it. The boss's armour Blocks the creature's own hits,
    // so the only damage it deals is its counters, and the charges it stores stay.
    const boss = quiet({ rounds: 4, armour: 10_000, hits: 1 });
    const team = [at('zipmouse', 0, 0, 'zoom', ['perfect-timing', 'crit-chance', 'crit-damage'])];
    const { res } = play(boss, team, [NO, YES, NO, YES, NO, YES, NO, YES]);
    const share = Math.floor((atk('zipmouse') * (KNACKS['zoom']?.fx.retaliateBp ?? 0)) / 10_000);
    expect(share).toBeGreaterThan(0);
    expect(count(res, 'counter')).toBe(4);
    expect(res.fighters[0]?.damageDealt).toBe(4 * share);
    expect(count(res, 'sure-crit', 'Zipmouse spends')).toBe(0);
    expect(res.fighters[0]?.sureCrits).toBe(LAB_RULES.sureCritMax);
    // Each dodge: the counter, then the charge (the fourth is past the limit and not stored).
    expect(
      res.events.filter((e) => e.kind === 'counter' || e.kind === 'sure-crit').map((e) => e.kind),
    ).toEqual(['counter', 'sure-crit', 'counter', 'sure-crit', 'counter', 'sure-crit', 'counter']);
  });

  it("a Guard's strike-back when it intercepts never crits, even with every crit talent", () => {
    const sure = Array.from({ length: 10 }, () => 'crit-chance');
    const boss = quiet({ rounds: 6, armour: 10_000, atk: 20, hits: 1, cols: 2 });
    const team = [
      at('tidewing', 0, 0),
      at('thornbuck', 0, 1, undefined, [...sure, 'crit-damage', 'shoulder-charge']),
    ];
    const { res } = play(boss, team, []);
    const hitBack = Math.floor(
      (atk('thornbuck') * (TALENTS['shoulder-charge']?.fx.interceptHitBackBp ?? 0)) / 10_000,
    );
    const intercepts = count(res, 'intercept');
    expect(intercepts).toBeGreaterThan(0);
    expect(count(res, 'counter')).toBe(intercepts);
    expect(res.fighters[1]?.damageDealt).toBe(intercepts * hitBack);
  });

  it('a heal crits at the base chance only, whatever crit chance its healer has, for one and a half times', () => {
    const healer = [
      at('lanternfin', 0, 0, undefined, ['crit-chance', 'crit-chance', 'crit-chance']),
      at('tidewing', 0, 1),
    ];
    const uid = 'p1:tidewing:1';
    const run = (draw: number) => {
      const s = scripted([draw]);
      return fight(quiet({ cols: 2 }), healer, {
        rng: s.rng,
        log: true,
        carryHp: new Map([[uid, 1]]),
      }).healed;
    };
    const hp = formStats('tidewing', 25).hp;
    const heal = Math.floor((hp * (LAB_RULES.supportHealBp['tide'] ?? 0)) / 10_000);
    expect(heal).toBeGreaterThan(0);
    // 6% is above the base 5% and below the healer's own stacked chance: no crit. 4% is a crit.
    expect(run(600)).toBe(heal);
    expect(run(400)).toBe(Math.floor((heal * LAB_RULES.healCritBp) / 10_000));
  });
});

describe('silence keeps the stat lines of talents (R12, amended in panel 6)', () => {
  const hush: BossMove = {
    id: 'hush',
    name: 'Hush',
    pattern: { anchor: 'front', shape: 'all' },
    powerBp: 0,
    every: 1,
    turn: 0,
    silenceTurns: 9,
  };
  const quietly = quiet({ rounds: 3, moves: [hush] });
  const free = quiet({ rounds: 3 });
  // Every draw is 7%: above the base 5%, so a crit means a stacked chance.
  const seven = Array.from({ length: 12 }, () => 700);

  it('Attack from a talent survives: the same damage silenced as free', () => {
    const team = [at('tidewing', 0, 0, undefined, ['sharp-claws'])];
    const silenced = play(quietly, team, seven).res;
    expect(count(silenced, 'silence')).toBeGreaterThan(0);
    const open = play(free, team, seven).res;
    const bare = play(quietly, [at('tidewing', 0, 0)], seven).res;
    expect(silenced.damage).toBe(open.damage);
    expect(silenced.damage).toBeGreaterThan(bare.damage);
  });

  it('crit chance and crit damage from talents survive: it still crits, and for the stacked damage', () => {
    const team = [at('tidewing', 0, 0, undefined, ['crit-chance', 'crit-damage'])];
    const { res } = play(quietly, team, seven);
    expect(count(res, 'crit')).toBe(3);
    const crit = Math.floor(
      (atk('tidewing') * (LAB_RULES.critBp + (TALENTS['crit-damage']?.fx.critDamageBp ?? 0))) /
        10_000,
    );
    expect(res.damage).toBe(3 * crit);
  });

  it('Max HP from a talent survives (set when the fight starts)', () => {
    const { res } = play(quietly, [at('tidewing', 0, 0, undefined, ['hardy'])]);
    expect(res.fighters[0]?.maxHp).toBeGreaterThan(formStats('tidewing', 25).hp);
  });

  it('the Knack is blanked, its stat bonuses included, and so are the effect lines of talents', () => {
    // Wild Swing (+20 crit chance points, a softer hit) does nothing silenced: no stacked crit, and the plain full hit.
    const swing = play(quietly, [at('tidewing', 0, 0, 'wild-swing')], seven).res;
    expect(count(swing, 'crit')).toBe(1);
    const fx = KNACKS['wild-swing']?.fx;
    const soft = Math.floor((atk('tidewing') * (fx?.plainBp ?? 0)) / 10_000);
    const firstHit = Math.floor((soft * (LAB_RULES.critBp + (fx?.critDamageBp ?? 0))) / 10_000);
    expect(swing.damage).toBe(firstHit + 2 * atk('tidewing'));
    // Steady Rhythm's rhythm is an effect line: it does not count while silenced.
    const rhythm = play(quietly, [at('tidewing', 0, 0, undefined, ['steady-rhythm'])]).res;
    expect(rhythm.fighters[0]?.hitsMade).toBe(1);
  });
});
