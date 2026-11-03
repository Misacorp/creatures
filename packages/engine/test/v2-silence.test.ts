/**
 * Combat v2: silence (R12, amended in panel 6; "silence stops the role", Misa 2026-10-26). A silenced creature loses its Knack, its
 * effect lines and its role's verb, and keeps the stat lines of its talents (Attack, Max HP, Armour, Speed, crit chance and crit
 * damage) and its species' own stats. Creatures and boss are built by hand: `fx` is what a Knack gives (blanked), `stat` what a talent's
 * plain stat lines give (kept). The dice are scripted. These were the lab's `fightRules`, `fight`, `luck` and `talents` silence tests.
 */
import { describe, expect, it } from 'vitest';
import {
  NO,
  aimedAt,
  boss,
  by,
  count,
  hush,
  marks,
  play,
  playScripted,
  spec,
  striker,
  texts,
} from './v2-helpers';

/** Every draw is 7%: above the base crit chance of 5%, so a crit means a stacked chance. */
const seven = Array.from({ length: 12 }, () => 700);

describe('silence keeps the stat lines of talents and the species stats (R12, amended in panel 6)', () => {
  const quietly = boss({ rounds: 3, moves: [hush()] });
  const free = boss({ rounds: 3 });

  it('Attack from a talent survives: the same damage silenced as free; from a Knack it does not', () => {
    const talent = [spec({ stat: { atkBp: 1_000 } })];
    const silenced = play(quietly, talent);
    expect(count(silenced, 'silence')).toBeGreaterThan(0);
    expect(silenced.damage).toBe(play(free, talent).damage);
    expect(silenced.damage).toBe(330);
    // A Knack's Attack bonus is blanked: round 1's hit is made before the silence, the later ones are plain.
    expect(play(quietly, [spec({ fx: { atkBp: 1_000 } })]).damage).toBe(110 + 100 + 100);
  });

  it('crit chance and crit damage from talents survive: it still crits, and for the stacked damage', () => {
    // Chance 5% + 12 points = 17%: a roll of 7% crits every time; a crit deals 100 x (2 + 1) with +100% crit damage.
    const talent = [spec({ stat: { critChanceBp: 1_200, critDamageBp: 10_000 } })];
    const r = playScripted(quietly, talent, seven).res;
    expect(count(r, 'silence')).toBeGreaterThan(0);
    expect(count(r, 'crit')).toBe(3);
    expect(r.damage).toBe(3 * 300);
  });

  it("the species' own crit chance survives silence", () => {
    const r = playScripted(quietly, [spec({ critChanceBp: 1_500 })], seven).res;
    expect(count(r, 'crit')).toBe(3);
    // Without it, a 7% roll is no crit.
    expect(count(playScripted(quietly, [spec()], seven).res, 'crit')).toBe(0);
  });

  it('the Knack is blanked, its stat bonuses included, and so are the effect lines of talents', () => {
    // A softer hit (80%) with +20 points of crit chance and +50 points of crit damage does nothing silenced: no stacked crit
    // and the plain full hit. Round 1's hit is made before the silence: 7% is a crit with the stacked chance, 80 x 2.5 = 200.
    const swing = [spec({ fx: { plainBp: 8_000, critChanceBp: 2_000, critDamageBp: 5_000 } })];
    const r = playScripted(quietly, swing, seven).res;
    expect(count(r, 'crit')).toBe(1);
    expect(r.damage).toBe(200 + 100 + 100);
    // Steady Rhythm's rhythm is an effect line: it does not count while silenced.
    const rhythm = play(quietly, [spec({ fx: { steadyRhythm: true } })]);
    expect(by(rhythm, 'A').hitsMade).toBe(1);
  });

  it("a silenced creature loses its Knack's armour too, and keeps a talent's", () => {
    const hit = (
      extra: object,
      b = boss({
        rounds: 2,
        atk: 40,
        plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000, hits: 1 },
      }),
    ) => by(play(b, [spec(extra)]), 'A').hp;
    const hushed = boss({
      rounds: 2,
      atk: 40,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000, hits: 1 },
      moves: [hush('all', 3)],
    });
    // 10 armour from a Knack: 30 a hit when free, 40 a hit silenced; from a talent it stays.
    expect(hit({ fx: { armourBonus: 10 } })).toBe(400 - 60);
    expect(hit({ fx: { armourBonus: 10 } }, hushed)).toBe(400 - 80);
    expect(hit({ stat: { armourBonus: 10 } }, hushed)).toBe(400 - 60);
  });

  it('Speed (a stat) keeps its dodge when silenced; a Knack dodge line does not', () => {
    const aimed = (b: ReturnType<typeof boss>) => b;
    const sniper = (m = [hush('all', 9)]) => aimed(striker({ moves: m }));
    // Round 1: hush, then the plain attack: the creature rolls its dodge (a draw after its own crit roll).
    const dodges = (s: ReturnType<typeof spec>) =>
      count(playScripted(sniper(), [s], [NO, 999]).res, 'dodge');
    expect(dodges(spec({ spd: 100 }))).toBe(1);
    expect(dodges(spec({ stat: { dodgeBonusBp: 1_000 } }))).toBe(1);
    expect(dodges(spec({ fx: { dodgeBonusBp: 1_000 } }))).toBe(0);
  });
});

describe('silence stops the role (Misa, 2026-10-26)', () => {
  it('a silenced Setter does not mark, and a Guard does not intercept', () => {
    const team = [spec({ name: 'S' }), spec({ name: 'G', role: 'guard', col: 1 })];
    const r = play(striker({ rounds: 3, cols: 2, moves: [hush()] }), team);
    // Round 1: the Setter marks before the first boss turn silences everyone; after that, nothing.
    expect(marks(r)).toEqual(['tide x1']);
    expect(r.intercepts).toBe(0);
    // Not silenced, the same Guard takes the hit.
    expect(play(striker({ rounds: 3, cols: 2 }), team).intercepts).toBe(3);
  });

  it('a silenced Payoff does not cash a mark, and a silenced Support does not heal', () => {
    const arena = (silence: boolean) =>
      boss({ rounds: 2, cols: 3, moves: silence ? [hush('all', 9)] : [] });
    const team = [
      spec({ name: 'S' }),
      spec({ name: 'H', role: 'support', col: 1 }),
      spec({ name: 'P', role: 'payoff', element: 'spark', col: 2 }),
    ];
    const hurt = { carryHp: new Map([['S', 100]]) };
    const free = play(arena(false), team, hurt);
    expect(free.reactions).toBe(2);
    const quiet = play(arena(true), team, hurt);
    // Round 1's turn is before the silence: one reaction and one heal of 16 (4% of 400), round 2's would have come after it.
    expect(quiet.reactions).toBe(1);
    expect([quiet.healed, free.healed]).toEqual([16, 32]);
  });

  it('a silenced taunter no longer draws the plain attack', () => {
    const team = [
      spec({ name: 'G', role: 'guard' }),
      spec({ name: 'T', role: 'guard', col: 1, fx: { taunt: true } }),
    ];
    const hits = (b: ReturnType<typeof boss>) => aimedAt(play(b, team), 'plain');
    expect(hits(striker({ rounds: 2, cols: 2 }))).toEqual(['T', 'T']);
    expect(hits(striker({ rounds: 2, cols: 2, moves: [hush('all', 3)] }))).toEqual(['G', 'G']);
  });

  it('Lantern Glow: creatures beside it cannot be silenced; it can', () => {
    const team = [
      spec({ name: 'A' }),
      spec({ name: 'L', col: 1, fx: { besideNoSilence: true } }),
      spec({ name: 'B', col: 2 }),
    ];
    const r = play(boss({ cols: 3, rounds: 2, moves: [hush()] }), team);
    const said = texts(r, 'silence');
    expect(said).toContain('L is silenced');
    expect(said).toContain('A shrugs off the silence');
    expect(said).toContain('B shrugs off the silence');
  });

  it('Unbothered (a creature that cannot be silenced) wards its own creature', () => {
    const r = play(boss({ rounds: 1, moves: [hush()] }), [spec({ fx: { ignoreSilence: true } })]);
    expect(texts(r, 'silence')).toEqual(['A shrugs off the silence']);
  });
});

describe('silence blanks talents: nothing arms, counts or is spent (panel 3)', () => {
  it('Rally Cry does not arm while the creature is silenced', () => {
    const arena = (silence: boolean) =>
      striker({ cols: 2, atk: 5_000, moves: silence ? [hush()] : [] });
    const team = [spec({ name: 'A' }), spec({ name: 'B', col: 1, fx: { vengefulBp: 1_000 } })];
    // The first creature falls in round 1: beside it, B is armed, unless it was silenced just before.
    expect(by(play(arena(false), team), 'B').avenged).toBe(true);
    expect(by(play(arena(true), team), 'B').avenged).toBe(false);
  });

  it('Steady Rhythm does not count the hits it makes while silenced', () => {
    const team = [spec({ fx: { steadyRhythm: true } })];
    expect(by(play(boss({ rounds: 6 }), team), 'A').hitsMade).toBe(6);
    // Round 1's hit is made before the first silence; every later hit is silenced and not counted.
    const hushed = play(boss({ rounds: 6, moves: [hush()] }), team);
    expect(by(hushed, 'A').hitsMade).toBe(1);
    expect(by(hushed, 'A').fires['steadyRhythm']).toBeUndefined();
  });

  it('First Pounce stays unspent when its first hits are made while silenced', () => {
    // Two rows: the boss turn after the empty row 0 silences the creature before it acts in row 1.
    const team = [spec({ row: 1, fx: { firstHitBp: 5_000 } })];
    const open = play(boss({ rows: 2, rounds: 4 }), team);
    expect(by(open, 'A').hitsLanded).toBeGreaterThan(0);
    expect(by(open, 'A').fires['firstHitBp']).toBe(1);
    const hushed = play(boss({ rows: 2, rounds: 4, moves: [hush('all', 1)] }), team);
    expect(by(hushed, 'A').damageDealt).toBeGreaterThan(0);
    expect(by(hushed, 'A').hitsLanded).toBe(0);
    expect(by(hushed, 'A').fires['firstHitBp']).toBeUndefined();
    // Silenced for good, its hits are plain: 400 over four rounds.
    expect(hushed.damage).toBe(400);
  });

  it('Momentum keeps what it stored before the silence', () => {
    // Round 1: the creature dodges the boss turn after row 0 (a scripted roll) and stores Momentum. The next boss turn silences it
    // first, so round 2's hit does not use it up. Draws: its crit roll, then the dodge roll of each boss attack.
    const fighter = spec({ spd: 100, fx: { momentumBp: 1_500 } });
    const arena = (turn: number) => striker({ rows: 2, rounds: 2, moves: [hush('all', 9, turn)] });
    const kept = playScripted(arena(1), [fighter], [NO, 0, NO, NO, NO, NO]).res;
    expect(by(kept, 'A').momentum).toBe(true);
    // Silenced before it ever dodged: nothing is stored.
    const fresh = playScripted(arena(0), [fighter], [NO, 0, NO, NO, NO, NO]).res;
    expect(by(fresh, 'A').momentum).toBe(false);
  });

  it('Boiling Point: a silenced creature builds no Heat', () => {
    const team = [spec({ role: 'guard', fx: { bakedShell: true } })];
    // Round 1's start builds one, before the first silence; after that, nothing.
    expect(by(play(boss({ rounds: 4, moves: [hush()] }), team), 'A').store).toBe(1);
    expect(by(play(boss({ rounds: 4 }), team), 'A').store).toBe(3);
  });
});

describe('silence and Sure Crits (R12.2)', () => {
  it('charges stored before it stay, and a silenced creature neither stores nor spends one', () => {
    // A Guard of 1000 HP stores a Sure Crit for each 250 damage it takes for others. Row 0's boss turn lets it take a heavy hit
    // (one and a half shares: one charge, half a share towards the next); row 1's boss turn then silences everyone for good.
    const arena = boss({
      rows: 2,
      cols: 3,
      rounds: 6,
      atk: 375,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000, hits: 1 },
      moves: [hush('all', 9, 1)],
    });
    const team = [
      spec({ name: 'A', maxHp: 100_000 }),
      spec({ name: 'G', role: 'guard', col: 1, maxHp: 1_000, fx: { guardCritBp: 10_000 } }),
    ];
    const r = play(arena, team);
    // Round 1 (before the silence in its second boss turn) stored one; afterwards the Guard no longer intercepts, stores or spends.
    expect(count(r, 'sure-crit', 'G stores')).toBe(1);
    expect(count(r, 'sure-crit', 'G spends')).toBe(0);
    expect(by(r, 'G').sureCrits).toBe(1);
  });
});
