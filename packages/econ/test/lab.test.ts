/** The whole lab on few seeds: no negative balances, conservation, determinism, the report and the roster profile. */
import { describe, expect, it } from 'vitest';
import { buildReportData, renderReport, serverCoverage } from '../src/report';
import { RULES } from '../src/rules';
import rulesSource from '../src/rules.ts?raw';
import { rosterProfile, ROSTER_WEEKS } from '../src/roster';
import { playersOf, runAll } from '../src/scenarios';
import { ALL_SERVERS } from '../src/servers';
import { TARGETS } from '../src/targets';
import { N_RES } from '../src/types';
import { sum } from '../src/util';

const SEEDS = 1;
const results = runAll(SEEDS, RULES);

describe('every scenario', () => {
  it('runs every server', () => {
    expect(Object.keys(results).sort()).toEqual(ALL_SERVERS.map((s) => s.id).sort());
    for (const r of Object.values(results)) expect(r.runs).toHaveLength(SEEDS);
  });

  it('never has a negative balance (at any week end, and the spend itself throws)', () => {
    for (const result of Object.values(results))
      for (const run of result.runs)
        for (const p of run.players)
          for (const w of p.weeks) {
            for (let r = 0; r < N_RES; r++) {
              expect(w.stock[r]!).toBeGreaterThanOrEqual(-1e-9);
              expect(w.inn[r]!).toBeGreaterThanOrEqual(0);
              expect(w.out[r]!).toBeGreaterThanOrEqual(0);
              expect(w.waste[r]!).toBeGreaterThanOrEqual(0);
            }
          }
  });

  it('conserves each resource: in minus out is the stock, waste never enters it', () => {
    for (const result of Object.values(results))
      for (const run of result.runs)
        for (const p of run.players) {
          for (let r = 0; r < N_RES; r++) {
            const inn = p.weeks.reduce((n, w) => n + w.inn[r]!, 0);
            const out = p.weeks.reduce((n, w) => n + w.out[r]!, 0);
            expect(inn - out).toBeCloseTo(p.stockEnd[r]!, 6);
            // Week by week too: each week's stock is the running balance.
            let running = 0;
            for (const w of p.weeks) {
              running += w.inn[r]! - w.out[r]!;
              expect(w.stock[r]!).toBeCloseTo(running, 6);
            }
          }
        }
  });

  it('keeps the sources and sinks adding up to the same flows', () => {
    const run = results.mixed8!.runs[0]!;
    for (const p of run.players) {
      for (let r = 0; r < N_RES; r++) {
        let ins = 0;
        let outs = 0;
        for (const [key, value] of Object.entries(p.sources)) {
          const [dir, res] = key.split(':');
          if (Number(res) !== r) continue;
          if (dir === 'in') ins += value;
          else outs += value;
        }
        expect(ins - outs).toBeCloseTo(p.stockEnd[r]!, 6);
      }
    }
  });

  it('keeps creatures at or below the level cap and levels never fall', () => {
    for (const run of results.mixed8!.runs)
      for (const p of run.players) {
        let best = 0;
        for (const w of p.weeks) {
          expect(w.levels[0] ?? 1).toBeLessThanOrEqual(30);
          expect(w.levels[0] ?? 1).toBeGreaterThanOrEqual(best);
          best = w.levels[0] ?? 1;
        }
      }
  });

  it('never lets a project overfill or a place pass its top level', () => {
    for (const result of Object.values(results))
      for (const run of result.runs)
        for (const week of run.log) {
          for (const level of week.levels)
            expect(level).toBeLessThanOrEqual(RULES.commons.maxLevel);
          for (const progress of week.progress) expect(progress).toBeLessThanOrEqual(1);
        }
  });
});

describe('the report', () => {
  const data = buildReportData(results, SEEDS, RULES);
  const markdown = renderReport(data, RULES, rulesSource);

  it('is the same for the same seeds (determinism)', () => {
    const again = buildReportData(runAll(SEEDS, RULES), SEEDS, RULES);
    expect(JSON.stringify(again)).toBe(JSON.stringify(data));
    expect(renderReport(again, RULES, rulesSource)).toBe(markdown);
  });

  it('has the sections in order, targets first', () => {
    const heads = [
      '## 1. The targets',
      '## 2. The resource ledger',
      '## 3. Growth',
      '## 4. The Forge',
      '## 5. The server',
      '## 6. The roster profile',
      '## 7. Journeys',
      '## 8. Cost estimate',
      '## Appendix',
    ];
    const at = heads.map((h) => markdown.indexOf(h));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('states T-1, T-2, T-3, T-4 and T-6 as PASS or FAIL lines with a number', () => {
    const ids = data.targets.map((t) => t.id.replace(/[a-d]$/, ''));
    for (const id of ['T-1', 'T-2', 'T-3', 'T-4', 'T-6']) expect(ids).toContain(id);
    for (const t of data.targets) expect(t.measured).toMatch(/\d/);
    expect(markdown).toMatch(/- \*\*(PASS|FAIL)\*\* T-1:/);
  });

  it('judges T-7 (dead resources) again now that the visitor is a sink, and keeps the dead flags in the ledger', () => {
    const t7 = data.targets.find((t) => t.id === 'T-7');
    expect(t7?.info).toBeUndefined();
    expect(markdown).toMatch(/- \*\*(PASS|FAIL)\*\* T-7:/);
    expect(TARGETS.some((t) => t.line === 'T-7')).toBe(true);
    expect(data.ledger.daily?.every((l) => l.dead === null || l.dead > 0)).toBe(true);
  });

  it('reports the weekly visitor: rerolls and what they drain by week, piles and lines with and without him', () => {
    const v = data.visitor;
    expect(Object.keys(v.rerolls)).toContain('daily');
    expect(v.rerolls.daily).toHaveLength(24);
    expect(v.acorns.daily!.some((x) => x > 0)).toBe(true);
    expect(v.scrap.daily!.some((x) => x > 0)).toBe(true);
    // He drains what the Forge and the projects do not: the visitor's sink shows in the ledger as its own line.
    const sink = (r: number): number =>
      sum(
        results
          .mixed8!.runs.flatMap((run) => run.players)
          .map((p) => p.sources[`out:${r}:visitor`] ?? 0),
      );
    expect(sink(0)).toBeGreaterThan(0);
    expect(sink(1)).toBeGreaterThan(0);
    // Shards stay with the Forge (V-VIS-3).
    expect(sink(2)).toBe(0);
    // Without him the same server has no rerolls and piles at least as high in Acorns.
    expect(
      sum(
        results['mixed8-novisitor']!.runs.flatMap((r) => r.players).flatMap((p) =>
          p.weeks.map((w) => w.rerolls),
        ),
      ),
    ).toBe(0);
    expect(v.piles.some((r) => r.profile === 'daily' && r.resource === 'acorns')).toBe(true);
    for (const id of ['mixed5', 'mixed8', 'mixed15'])
      expect(v.fourOfFive.find((r) => r.id === id)?.on).toHaveLength(24);
    expect(v.fourOfFive.find((r) => r.id === 'mixed8')?.off).toHaveLength(24);
    expect(markdown).toContain('### The weekly visitor');
  });

  it('ledgers every spendable resource for daily and weekly players', () => {
    for (const id of ['daily', 'weekly'])
      expect(data.ledger[id]?.map((l) => l.resource)).toEqual([
        'acorns',
        'scrap',
        'shards',
        'essence',
      ]);
  });

  it('has the fire for each boss dial and the place levels for each server', () => {
    for (const dial of ['all', 'half', 'none'] as const)
      expect(data.fireByDial[dial]?.fire).toHaveLength(24);
    expect(data.servers.map((s) => s.id)).toEqual([
      'mixed5',
      'mixed8',
      'mixed15',
      'lone',
      'hoarder',
    ]);
    // More bosses killed never cools the fire.
    expect(data.fireByDial.all!.fire[23]!).toBeGreaterThanOrEqual(data.fireByDial.none!.fire[23]!);
  });

  it('writes server coverage per line, with the forms beside it', () => {
    const coverage = serverCoverage(data);
    expect(Object.keys(coverage)).toEqual(['mixed5', 'mixed8', 'mixed15']);
    for (const rows of Object.values(coverage)) {
      expect(rows).toHaveLength(24);
      // The launch lines' share never dips (content drops do not enter it).
      rows.forEach((row, i) => {
        if (i === 0) return;
        for (const r of ['common', 'rare', 'epic'] as const)
          expect(row.launch[r]).toBeGreaterThanOrEqual(rows[i - 1]!.launch[r]);
      });
      for (const row of rows) {
        expect(row.unit).toBe('line');
        for (const v of [
          row.common,
          row.rare,
          row.epic,
          row.forms.common,
          row.forms.rare,
          row.forms.epic,
          row.launch.common,
          row.launch.rare,
          row.launch.epic,
        ]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('lists every assumption in the appendix', () => {
    const markers = (rulesSource.match(/\/\/ ASSUMPTION(?: \(Q[0-9]+\))?:/g) ?? []).length;
    const appendix = markdown.slice(
      markdown.indexOf('### Assumptions'),
      markdown.indexOf('### Simplifications'),
    );
    expect(appendix.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(markers);
  });
});

describe('the dials', () => {
  const levelUps = (id: string): number =>
    results[id]!.runs.reduce((n, r) => n + r.levelUps.filter((u) => u.hour < 12 * 168).length, 0);

  it('a more generous server builds its places faster', () => {
    expect(levelUps('mixed8-give10')).toBeLessThan(levelUps('mixed8'));
    expect(levelUps('mixed8')).toBeLessThanOrEqual(levelUps('mixed8-give60'));
  });

  it('a hoarder gives nothing for four weeks, then gives', () => {
    for (const run of results.hoarder!.runs)
      for (const p of run.players.filter((x) => x.profile === 'hoarder')) {
        expect(p.weeks.slice(0, 4).every((w) => w.gifts === 0)).toBe(true);
        expect(p.weeks[4]!.gifts).toBeGreaterThan(0);
      }
  });

  it('a project raises one level per place at most before its build days pass', () => {
    for (const run of results.hoarder!.runs) {
      const byPlace = new Map<string, number[]>();
      for (const u of run.levelUps) byPlace.set(u.place, [...(byPlace.get(u.place) ?? []), u.hour]);
      for (const hours of byPlace.values())
        hours.slice(1).forEach((h, i) => expect(h - hours[i]!).toBeGreaterThanOrEqual(72));
    }
  });

  it('counts, for T-1, only creatures owned two weeks or more, and the open ones are never worse than all', () => {
    for (const run of results.mixed8!.runs)
      for (const p of run.players)
        p.weeks.forEach((w, i) => {
          expect(w.benchWorst).toBeGreaterThanOrEqual(w.benchMedian);
          expect(w.benchOpenWorst).toBeLessThanOrEqual(w.benchWorst);
          expect(w.benchWithin).toBeLessThanOrEqual(w.benchCount);
          // Nobody joined this week (or the one before) owns anything that is a week old.
          if (i === 0) expect(w.benchCount).toBeLessThanOrEqual(w.size);
        });
    const week8 = playersOf(results.mixed8, 'daily').map((p) => p.weeks[7]);
    expect(week8.some((w) => (w?.benchCount ?? 0) > 0)).toBe(true);
  });

  it('a creature held at a gate banks XP only up to the next level and loses the rest', () => {
    const lost = results
      .mixed8!.runs.flatMap((r) => r.players)
      .reduce((n, p) => n + p.weeks.reduce((m, w) => m + w.xpLost, 0), 0);
    expect(lost).toBeGreaterThan(0);
  });
});

describe('the roster profile for combat v2', () => {
  const roster = rosterProfile(results);

  it('has 24 weeks for each kind, within the level cap and never shrinking', () => {
    for (const kind of [roster.daily, roster.weekly, roster.newPlayer]) {
      expect(kind).toHaveLength(ROSTER_WEEKS);
      kind.forEach((w, i) => {
        expect(w.week).toBe(i + 1);
        expect(w.first).toBeLessThanOrEqual(30);
        expect(w.first).toBeGreaterThanOrEqual(w.third);
        expect(w.third).toBeGreaterThanOrEqual(w.tenth);
        expect(w.tenth).toBeGreaterThanOrEqual(w.twentieth);
        expect(w.size).toBeGreaterThanOrEqual(3);
        expect(w.talentSlots).toBeGreaterThanOrEqual(1);
        expect(w.talentSlots).toBeLessThanOrEqual(3);
        if (i > 0) {
          expect(w.first).toBeGreaterThanOrEqual(kind[i - 1]!.first);
          expect(w.size).toBeGreaterThanOrEqual(kind[i - 1]!.size);
        }
      });
    }
  });

  it('has no level for a rank the median player has not reached (never a lower creature standing in)', () => {
    for (const kind of [roster.daily, roster.weekly, roster.newPlayer])
      for (const w of kind) {
        if (w.size < 20) expect(w.twentieth).toBe(0);
        if (w.size < 10) expect(w.tenth).toBe(0);
        if (w.size >= 20) expect(w.twentieth).toBeGreaterThan(0);
      }
  });

  it('has a weekly player behind a daily player', () => {
    expect(roster.weekly[11]!.first).toBeLessThanOrEqual(roster.daily[11]!.first);
    expect(roster.weekly[7]!.size).toBeLessThan(roster.daily[7]!.size);
  });
});
