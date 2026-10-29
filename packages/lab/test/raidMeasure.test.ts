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
  RAID_ATK_EXPONENT,
  CASUAL_ORDER,
  TIER_LOSS,
  toolCost,
  RAID_HP_EXPONENT,
  RAID_SPECS,
  MIXED_ORDERS,
  PLAYER_KINDS,
  mixedSpread,
  raidHpFactor,
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

  it('a wider raid has a bigger boss: one HP exponent and one Attack exponent, each a smooth curve for every boss', () => {
    // Panel 5: no boss has an exponent of its own, and there is no kink (no straight line past ten players).
    for (const spec of RAID_SPECS) expect(spec, spec.id).not.toHaveProperty('hpExponent');
    expect(RAID_HP_EXPONENT).toBeGreaterThan(0.5);
    expect(RAID_HP_EXPONENT).toBeLessThanOrEqual(1);
    // The Attack grows more slowly than the HP (the tool-gap fix): enough that a wide line of the same creatures still needs its tool.
    expect(RAID_ATK_EXPONENT).toBeGreaterThan(0);
    expect(RAID_ATK_EXPONENT).toBeLessThan(RAID_HP_EXPONENT);
    for (const id of RAID_SPECS.map((x) => x.id)) {
      const b = raidBossOf(id);
      for (const w of [5, 10, 15]) {
        const wide = wideBoss(b, w);
        expect(wide.cols).toBe(w);
        expect(wide.atk).toBe(Math.round(b.atk * (w / b.cols) ** RAID_ATK_EXPONENT));
        expect(wide.atk).toBeGreaterThan(b.atk);
        expect(wide.hp).toBe(Math.round(b.hp * (w / b.cols) ** RAID_HP_EXPONENT));
      }
      expect(wideBoss(b, b.cols).hp).toBe(b.hp);
      expect(wideBoss(b, b.cols).atk).toBe(b.atk);
    }
    // The local exponent between neighbouring widths is the same everywhere: no kink at 10 players.
    const b = raidBossOf('thornmother');
    const widths = [4, 5, 6, 8, 9, 10, 11, 12, 15];
    for (let i = 1; i < widths.length; i++) {
      const [lo, hi] = [widths[i - 1] as number, widths[i] as number];
      const local = Math.log(raidHpFactor(b, hi) / raidHpFactor(b, lo)) / Math.log(hi / lo);
      expect(local, `${lo} to ${hi}`).toBeCloseTo(RAID_HP_EXPONENT, 8);
    }
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

  it('the mixed server keeps its shares at 5, 10 and 15 players', () => {
    for (const [n, order] of Object.entries(MIXED_ORDERS)) {
      expect(order).toHaveLength(Number(n));
      const share = (k: 'm' | 'b' | 'c') => order.filter((x) => x === k).length / order.length;
      expect(share('m'), n).toBeGreaterThanOrEqual(0.15);
      expect(share('m'), n).toBeLessThanOrEqual(0.25);
      expect(share('b'), n).toBeGreaterThanOrEqual(0.25);
      expect(share('b'), n).toBeLessThanOrEqual(0.4);
      expect(share('c'), n).toBeGreaterThanOrEqual(0.4);
    }
    expect(MIXED_ORDERS[10]).toBe(MIXED_ORDER);
    expect(PLAYER_KINDS).toEqual(['m', 'b', 'c']);
  });

  it('the casual players with no Knack bring their top creatures by level, a legal talent each', () => {
    const a = casualColumn(createSeededRng('top3'), 3, 'top3');
    expect(a).toEqual(casualColumn(createSeededRng('top3'), 3, 'top3'));
    expect(a).toHaveLength(3);
    expect(a.every((p) => p.knack === 'none')).toBe(true);
    expect(illegalTalents(a)).toEqual([]);
    // The same roster as the random column's (same seed), whose creatures are never higher than the top three.
    const levels = a.map((p) => p.level ?? 0);
    expect([...levels].sort((x, y) => y - x)).toEqual(levels);
    // Four rows bring four creatures.
    expect(casualColumn(createSeededRng('top3'), 4, 'top3')).toHaveLength(4);
  });

  it('the mixed server reports knockouts per kind of player, and the casual variant is a different server', () => {
    const best = answerLine(BOSS_ANSWERS['storm-sovereign']?.[0]?.line ?? '');
    const run = (casual: 'random' | 'top3', players = 10) =>
      mixedServer(colossus, best, [best], 2, 4, 'kinds', [], [], { casual, players });
    const r = run('random');
    expect(r.drawWins).toHaveLength(2);
    expect(Object.keys(r.knockoutsPerPlayer).sort()).toEqual(['b', 'c', 'm']);
    // Per-player means times the players of each kind add up to the weekend's knockouts.
    const order = MIXED_ORDERS[10] ?? [];
    const total = PLAYER_KINDS.reduce(
      (n, k) => n + r.knockoutsPerPlayer[k] * order.filter((x) => x === k).length,
      0,
    );
    expect(total).toBeCloseTo(r.knockouts);
    expect(run('top3')).not.toEqual(r);
    for (const players of [5, 15]) expect(run('random', players).players).toBe(players);
  });

  it('the spread over seeds splits the draws, and gives each seed’s win rate and the draws’ spread', () => {
    const best = answerLine(BOSS_ANSWERS['storm-sovereign']?.[0]?.line ?? '');
    const r = mixedSpread(colossus, best, [best], 7, 3, 1, 'spread');
    expect(r.seedWins).toHaveLength(3);
    expect(r.drawWins).toHaveLength(7);
    expect(r.weekend.runs).toBe(7);
    expect(r.drawSd).toBeGreaterThanOrEqual(0);
    expect(mixedSpread(colossus, best, [best], 7, 3, 1, 'spread')).toEqual(r);
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
      tiers: { t1: 1, t2: hp, kill: hp },
      knockouts: [1, 1, 0],
      knockoutsTotal: 2,
      replacements: 0,
      damageShare: hp,
      damageShareSd: 0.1,
      steps: 0,
      played: [1, played2, 0],
      hpLeft: [hp, hp2, 0],
      standing: [hp, hp2, 0],
      hpLeftEnd: hp,
      standingEnd: hp,
      knockoutsByOwner: { p1: hp * 10, p2: 1 },
    });
    const c = combineWeekends([part(10, 0.2, 1, 0.4), part(30, 0.6, 0.5, 0.8)]);
    expect(c.runs).toBe(40);
    expect(c.winRate).toBeCloseTo((10 * 0.2 + 30 * 0.6) / 40);
    expect(c.hpLeftEnd).toBeCloseTo(0.5);
    // The share is the primary measure: its mean is weighted by the runs, its spread is pooled (the spread inside each part
    // plus the spread of the parts' means: the law of total variance).
    expect(c.damageShare).toBeCloseTo((10 * 0.2 + 30 * 0.6) / 40);
    const mean = (10 * 0.2 + 30 * 0.6) / 40;
    const variance = (10 * (0.01 + (0.2 - mean) ** 2) + 30 * (0.01 + (0.6 - mean) ** 2)) / 40;
    expect(c.damageShareSd).toBeCloseTo(Math.sqrt(variance));
    expect(c.tiers.kill).toBeCloseTo(c.winRate);
    expect(c.played[1]).toBeCloseTo((10 * 1 + 30 * 0.5) / 40);
    // Stage 2: 10 weekends with HP 0.4, 15 weekends with HP 0.8.
    expect(c.hpLeft[1]).toBeCloseTo((10 * 0.4 + 15 * 0.8) / 25);
    expect(c.played[2]).toBe(0);
    // Knockouts by owner combine the same way.
    expect(c.knockoutsByOwner['p1']).toBeCloseTo((10 * 2 + 30 * 6) / 40);
    expect(c.knockoutsByOwner['p2']).toBeCloseTo(1);
  });

  it('every knockout of a weekend is counted against its owner', () => {
    const boss = raidBossOf('cinder-wyrm');
    const w = weekendStats(boss, classicFor(raidMode(boss)), 6, 'by-owner');
    const total = Object.values(w.knockoutsByOwner).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(w.knockoutsTotal);
    expect(Object.keys(w.knockoutsByOwner).every((o) => /^p[1-4]$/.test(o))).toBe(true);
  });
});

describe('success tiers and the share of the boss’s HP removed (Misa, 2026-10-29)', () => {
  it('the tiers are the shipped raid’s retreats: 30% and 85% of the HP removed, then the kill; each weekend reaches them in order', () => {
    expect(TIER_LOSS).toEqual([0.3, 0.85]);
    for (const id of ['thornmother', 'old-bogback']) {
      const boss = raidBossOf(id);
      for (const line of [
        classicFor(raidMode(boss)),
        answerLine(BOSS_ANSWERS[id]?.[0]?.line ?? ''),
      ]) {
        const w = weekendStats(boss, line, 10, `tiers:${id}`);
        expect(w.tiers.t1, id).toBeGreaterThanOrEqual(w.tiers.t2);
        expect(w.tiers.t2, id).toBeGreaterThanOrEqual(w.tiers.kill);
        expect(w.tiers.kill, id).toBe(w.winRate);
        // A mean share under 30% cannot have every weekend past the first retreat, and over 85% cannot have all of them short of the second.
        if (w.damageShare < 0.3) expect(w.tiers.t1).toBeLessThan(1);
        if (w.damageShare >= 0.85) expect(w.tiers.t2).toBeGreaterThan(0);
        expect(w.damageShareSd).toBeGreaterThanOrEqual(0);
        expect(w.damageShareSd).toBeLessThan(0.5);
      }
    }
  });

  it('a killed boss is 100% removed in every weekend, so its share is 1 with no spread', () => {
    const weak: BossDef = { ...raidBossOf('storm-sovereign', { hp: 500, atk: 1 }), armour: 0 };
    const w = weekendStats(weak, classicFor(raidMode(weak)), 6, 'tiers-kill');
    expect(w.winRate).toBe(1);
    expect(w.damageShare).toBe(1);
    expect(w.damageShareSd).toBe(0);
    expect(w.tiers).toEqual({ t1: 1, t2: 1, kill: 1 });
  });

  it('a server of casual players only is a mixed server with no min-maxers and no builders', () => {
    const boss = raidBossOf('thornmother', { rank: 'low' });
    const line = answerLine(BOSS_ANSWERS['thornmother']?.[0]?.line ?? '');
    const r = mixedSpread(boss, line, [line], 4, 1, 1, 'casual-only', [], [], {
      players: 10,
      casual: 'top3',
      order: CASUAL_ORDER,
    });
    expect(r.players).toBe(10);
    expect(CASUAL_ORDER.every((k) => k === 'c')).toBe(true);
    expect(r.knockoutsPerPlayer.m).toBe(0);
    expect(r.knockoutsPerPlayer.b).toBe(0);
    expect(r.weekend.damageShare).toBeGreaterThan(0);
  });

  it('the tool’s cost is also a difference in the HP removed', () => {
    const boss = raidBossOf('thornmother');
    const first = BOSS_ANSWERS['thornmother']?.[0] as NonNullable<
      (typeof BOSS_ANSWERS)['thornmother']
    >[number];
    const t = toolCost(boss, first, answerLine(first.line), 8, 'tool-share');
    expect(t.shareDrop).toBeCloseTo(100 * (t.shareWith - t.shareWithout), 8);
    expect(t.withStats.damageShare).toBe(t.shareWith);
    expect(t.withoutStats.damageShare).toBe(t.shareWithout);
  });
});
