/**
 * The raid measures of panel 4: legal talents in the search, the mechanics that are measured (taking a mechanic out of a
 * line), the margin, the raid at other widths and the mixed server.
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  BUILDER_MAX_COPIES,
  MECHANICS,
  MIXED_ORDER,
  RAID,
  RAID_LINEAR_FROM,
  CLASSIC_LINE,
  ablate,
  attacksOf,
  BOSS_ANSWERS,
  answerLine,
  casualColumn,
  classicFor,
  combineWeekends,
  columnOf,
  illegalTalents,
  labBoss,
  limitCopies,
  lineKey,
  marginOf,
  mixedServer,
  poolOf,
  raidBossOf,
  raidMode,
  search,
  strip,
  teamHealth,
  tileLine,
  toolColumns,
  toolOf,
  weekendScore,
  weekendStats,
  widthOf,
  wideBoss,
  hpExponentOf,
  type BossDef,
  type Fighter,
  type Pick,
  type WeekendStats,
} from '../src';

const pick = (formId: string, knack = 'none', talents?: string[]): Pick => ({
  formId,
  knack,
  ...(talents ? { talents } : {}),
});

describe('the search with talents', () => {
  it('a line key tells lines that differ only in a talent apart', () => {
    expect(lineKey([pick('thornbuck', 'none', ['brace'])])).not.toBe(lineKey([pick('thornbuck')]));
  });

  it('picks talents, and only legal ones', () => {
    const boss: BossDef = { ...labBoss({ rows: 1, cols: 3, rounds: 4, hp: 4_000 }) };
    const ranked = search(
      boss,
      { id: 'gauntlet', rows: 1, cols: 3, maxCopies: 1 },
      {
        seed: 'tal',
        starts: 40,
        keep: 6,
        rounds: 2,
        seeds: 2,
        freshSeeds: 2,
        pool: poolOf(['thornbuck', 'tidewing', 'tempestray', 'kilnmole', 'sunfawn']),
        talents: true,
      },
    );
    const all = ranked.flatMap((r) => r.line);
    expect(all.some((p) => (p.talents?.length ?? 0) > 0)).toBe(true);
    expect(illegalTalents(all)).toEqual([]);
    expect(all.every((p) => (p.talents?.length ?? 0) <= 1)).toBe(true);
  });
});

describe('measured mechanics', () => {
  it('a family mechanic is the Knacks of that family; stripping makes them none and keeps the rest', () => {
    const family = MECHANICS.find((m) => m.id === 'family:Taunt');
    const tool = family && toolOf(family);
    expect(tool).toBeDefined();
    const line = [pick('hearthshell', 'draw-fire'), pick('tidewing', 'steady-mark')];
    expect(strip(line, tool ?? {})).toEqual([
      { formId: 'hearthshell', knack: 'none' },
      { formId: 'tidewing', knack: 'steady-mark' },
    ]);
  });

  it('a talent kind strips its talents, and keeps the other kinds', () => {
    const protection = MECHANICS.find((m) => m.id === 'talent:protection');
    const line = [pick('thornbuck', 'none', ['brace']), pick('tidewing', 'none', ['first-pounce'])];
    const out = strip(line, toolOf(protection as NonNullable<typeof protection>) ?? {});
    expect(out[0]?.talents).toBeUndefined();
    expect(out[1]?.talents).toEqual(['first-pounce']);
  });

  it('boss-side mechanics (an escalation feed, Adaptation) have no tool', () => {
    for (const id of ['feed:reactions', 'rule:adaptation', 'rule:escalation'])
      expect(
        toolOf(MECHANICS.find((m) => m.id === id) as NonNullable<(typeof MECHANICS)[0]>),
      ).toBeUndefined();
  });

  it('ablate reports the drop of the measure, 0 for a mechanic the line does not carry, and measures a line once', () => {
    const line = [pick('hearthshell', 'draw-fire'), pick('tidewing', 'steady-mark')];
    let calls = 0;
    // A fake measure: 10 points for every creature with a Knack.
    const measure = (l: readonly Pick[]) => {
      calls++;
      return 10 * l.filter((p) => p.knack !== 'none').length;
    };
    const out = ablate(line, measure);
    const taunt = out.find((m) => m.mechanic.id === 'family:Taunt');
    expect(taunt).toMatchObject({ hasTool: true, carried: true, drop: 10 });
    const store = out.find((m) => m.mechanic.id === 'family:Reach');
    expect(store).toMatchObject({ carried: false, drop: 0 });
    // Taunt and the Taunt keyword and rule strip the same Knack: measured once.
    expect(calls).toBeLessThan(out.filter((m) => m.carried).length + 1);
  });
});

describe('the margin, the widths and the mixed server', () => {
  const colossus = raidBossOf('storm-sovereign');

  it('tileLine repeats each row across the wider arena', () => {
    const line = [pick('a1'), pick('a2'), pick('b1'), pick('b2')].map((p) => ({
      ...p,
      formId: p.formId,
    }));
    const tiled = tileLine(line, 2, 5);
    expect(tiled.map((p) => p.formId)).toEqual([
      'a1',
      'a2',
      'a1',
      'a2',
      'a1',
      'b1',
      'b2',
      'b1',
      'b2',
      'b1',
    ]);
  });

  it('marginOf gives three win rates, and a harder boss is not easier to beat', () => {
    const line = Array.from(
      { length: colossus.rows * colossus.cols },
      (_, i) => CLASSIC_LINE[i % 3] as Pick,
    );
    const m = marginOf(colossus, line, 6, 'margin');
    for (const x of [m.base, m.atk10, m.hp10]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
    expect(m.atk10).toBeLessThanOrEqual(m.base + 0.34);
  });

  it('the raid runs at other widths: one player a column, a bench each', () => {
    const line = Array.from(
      { length: colossus.rows * colossus.cols },
      (_, i) => CLASSIC_LINE[i % 3] as Pick,
    );
    for (const w of [5, 10, 15]) {
      const r = widthOf(colossus, line, w, 3, 'width');
      expect(r.width).toBe(w);
      expect(r.classicWin).toBeGreaterThanOrEqual(0);
      expect(r.bestKnockouts).toBeGreaterThanOrEqual(0);
    }
  });

  it('a wider raid has a bigger boss: the weekend HP grows with the players by the boss’s own exponent, its Attack does not', () => {
    const b = raidBossOf('thornmother');
    const exponent = hpExponentOf(b);
    // The lab's exponents run from 0.2 (Thornmother: her bark asks for a tool, so a wide raid without it gets nowhere, and
    // a wide raid with it should not meet a much bigger boss) up to the shipped 1.1.
    expect(exponent).toBeGreaterThanOrEqual(0.1);
    expect(exponent).toBeLessThanOrEqual(1.1);
    for (const w of [5, 10, 15]) {
      const wide = wideBoss(b, w);
      expect(wide.cols).toBe(w);
      expect(wide.atk).toBe(b.atk);
      // Up to ten players the boss's exponent applies; past ten the HP grows in a straight line.
      const bend = Math.min(w, RAID_LINEAR_FROM);
      expect(wide.hp).toBe(Math.round(b.hp * (bend / b.cols) ** exponent * (w / bend)));
    }
    expect(wideBoss(b, b.cols).hp).toBe(b.hp);
  });

  it('players who read the boss bring the columns that hold its tool, the most of it first', () => {
    const line = [
      pick('a', 'x'),
      pick('b'),
      pick('c', 'x'),
      pick('d'),
      pick('e'),
      pick('f', 'none', ['t']),
      pick('g', 'x'),
      pick('h', 'x'),
    ];
    // Columns of four: [a,e] [b,f] [c,g] [d,h]; Knack x is on a, c, g, h; the talent t on f.
    expect(toolColumns(line, 4, ['x'])).toEqual([2, 0, 3, 1]);
    expect(toolColumns(line, 4, ['talent:t'])).toEqual([1, 0, 2, 3]);
    expect(toolColumns(line, 4, [])).toEqual([0, 1, 2, 3]);
  });

  it('a column of a line, and no more than two copies of a form in a builder column', () => {
    const line = [
      pick('a'),
      pick('b'),
      pick('c'),
      pick('d'),
      pick('a'),
      pick('e'),
      pick('f'),
      pick('g'),
    ];
    expect(columnOf(line, 4, 0).map((p) => p.formId)).toEqual(['a', 'a']);
    const crowded = [pick('a'), pick('a'), pick('a'), pick('b')];
    const limited = limitCopies(crowded, BUILDER_MAX_COPIES, [pick('c'), pick('d')]);
    expect(limited.map((p) => p.formId)).toEqual(['a', 'a', 'c', 'b']);
  });

  it('a casual column is random forms with Knacks they can equip and legal talents, the same for a seed', () => {
    const a = casualColumn(createSeededRng('cc'), 4);
    expect(a).toEqual(casualColumn(createSeededRng('cc'), 4));
    expect(a).toHaveLength(4);
    expect(new Set(a.map((p) => p.formId)).size).toBe(4);
    expect(illegalTalents(a)).toEqual([]);
    expect(a.every((p) => (p.level ?? 0) >= 8)).toBe(true);
    expect(RAID.cols).toBe(4);
  });

  it('the mixed server is ten players: 2 min-maxers, 3 builders, 5 casual players', () => {
    expect(MIXED_ORDER).toHaveLength(10);
    expect(MIXED_ORDER.filter((k) => k === 'm')).toHaveLength(2);
    expect(MIXED_ORDER.filter((k) => k === 'b')).toHaveLength(3);
    expect(MIXED_ORDER.filter((k) => k === 'c')).toHaveLength(5);
    const best = Array.from(
      { length: colossus.rows * colossus.cols },
      (_, i) => CLASSIC_LINE[i % 3] as Pick,
    );
    const r = mixedServer(colossus, best, [best], 2, 4, 'mixed');
    expect(r.players).toBe(10);
    expect(r.winRate).toBeGreaterThanOrEqual(0);
    expect(r.winRate).toBeLessThanOrEqual(1);
    // Deterministic for a salt.
    expect(mixedServer(colossus, best, [best], 2, 4, 'mixed')).toEqual(r);
  });

  it('a weekend score is a number the search can rank by', () => {
    const s = weekendScore(colossus)(
      Array.from({ length: colossus.rows * colossus.cols }, (_, i) => CLASSIC_LINE[i % 3] as Pick),
      2,
      'sc',
    );
    expect(Number.isFinite(s.score)).toBe(true);
  });
});

describe('structural mechanics checks', () => {
  const base = raidBossOf('storm-sovereign');
  const called = (b: BossDef, id: string) =>
    typeof MECHANICS.find((m) => m.id === id)?.calls(b) === 'string';

  it('a plain attack with no anchor does not call for Taunt', () => {
    const anchored = {
      ...base,
      plain: { pattern: { anchor: 'random' as const, shape: 'single' as const }, powerBp: 1 },
    };
    const scatter = {
      ...base,
      plain: {
        pattern: { anchor: 'random' as const, shape: 'scatter' as const, n: 2 },
        powerBp: 1,
      },
    };
    expect(called(anchored, 'rule:taunt')).toBe(true);
    expect(called(scatter, 'rule:taunt')).toBe(false);
    expect(called(scatter, 'keyword:Taunt')).toBe(false);
    expect(called(scatter, 'family:Taunt')).toBe(false);
    expect(attacksOf(scatter)[0]?.plain).toBe(true);
  });

  it('a boss is hard to hit only with a lot of Speed', () => {
    const quiet: BossDef = {
      ...labBoss({ rows: 1, cols: 3 }),
      spd: 50,
      armour: 1,
    };
    const dodge = (b: BossDef) =>
      typeof MECHANICS.find((m) => m.id === 'rule:dodge')?.calls(b) === 'string';
    expect(dodge(quiet)).toBe(false);
    expect(dodge({ ...quiet, spd: 300 })).toBe(true);
  });
});

describe('HP left after each stage (Misa, 2026-10-29)', () => {
  const fighter = (hp: number, maxHp: number) => ({ hp, maxHp }) as unknown as Fighter;

  it('the standing creatures’ HP over their max, and the share still standing', () => {
    const h = teamHealth([fighter(50, 100), fighter(0, 100), fighter(100, 100)]);
    // The knocked-out creature adds nothing to either side of the HP share; it does count in the share standing.
    expect(h.hpLeft).toBeCloseTo(150 / 200);
    expect(h.standing).toBeCloseTo(2 / 3);
    expect(teamHealth([fighter(0, 100)])).toEqual({ hpLeft: 0, standing: 0 });
    expect(teamHealth([])).toEqual({ hpLeft: 0, standing: 0 });
  });

  it('a weekend reports each stage it played and the end of the weekend, in shares between 0 and 1', () => {
    const boss = raidBossOf('storm-sovereign');
    const line = answerLine(BOSS_ANSWERS['storm-sovereign']?.[0]?.line ?? '');
    const w = weekendStats(boss, line, 6, 'health');
    expect(w.hpLeft).toHaveLength(3);
    expect(w.standing).toHaveLength(3);
    expect(w.played[0]).toBe(1);
    // A stage nobody played reads 0, and every stage that was played is a share.
    w.played.forEach((n, k) => {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
      if (n === 0) expect(w.hpLeft[k]).toBe(0);
      else {
        expect(w.hpLeft[k]).toBeGreaterThan(0);
        expect(w.hpLeft[k]).toBeLessThanOrEqual(1);
        expect(w.standing[k]).toBeGreaterThan(0);
        expect(w.standing[k]).toBeLessThanOrEqual(1);
      }
    });
    expect(w.hpLeftEnd).toBeGreaterThan(0);
    expect(w.hpLeftEnd).toBeLessThanOrEqual(1);
    // The same seeds give the same numbers.
    expect(weekendStats(boss, line, 6, 'health')).toEqual(w);
  });

  it('a party that is wiped has no HP left at the weekend’s end', () => {
    const boss = raidBossOf('cinder-wyrm');
    const w = weekendStats(boss, classicFor(raidMode(boss)), 4, 'health-classic');
    expect(w.winRate).toBe(0);
    expect(w.hpLeftEnd).toBeLessThan(0.2);
    expect(w.standingEnd).toBeLessThan(0.4);
  });

  it('several measures combine weighted by their runs, a stage counted over the weekends that played it', () => {
    const part = (runs: number, hp: number, played2: number, hp2: number): WeekendStats => ({
      runs,
      winRate: hp,
      knockouts: [1, 1, 0],
      knockoutsTotal: 2,
      replacements: 0,
      damageShare: 1,
      steps: 0,
      played: [1, played2, 0],
      hpLeft: [hp, hp2, 0],
      standing: [hp, hp2, 0],
      hpLeftEnd: hp,
      standingEnd: hp,
    });
    const c = combineWeekends([part(10, 0.2, 1, 0.4), part(30, 0.6, 0.5, 0.8)]);
    expect(c.runs).toBe(40);
    expect(c.winRate).toBeCloseTo((10 * 0.2 + 30 * 0.6) / 40);
    expect(c.hpLeftEnd).toBeCloseTo(0.5);
    expect(c.played[1]).toBeCloseTo((10 * 1 + 30 * 0.5) / 40);
    // Stage 2: 10 weekends with HP 0.4, 15 weekends with HP 0.8.
    expect(c.hpLeft[1]).toBeCloseTo((10 * 0.4 + 15 * 0.8) / 25);
    expect(c.played[2]).toBe(0);
  });
});
