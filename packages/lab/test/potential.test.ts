/**
 * Damage potential as a measure (Misa, 2026-10-30): the weekend played as if the boss could not die, as total damage over the boss's
 * HP, over seeded weekends of the prepared lines. What the `potential` option does inside a fight (the boss held at 1 HP, its shadow HP,
 * Finisher and Cull reading the real HP) and Determination are rules, proved in the engine tests (`v2-weekend`).
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  combinePotential,
  raidBossOf,
  raidMode,
  weekend,
  weekendPotential,
  weekendPotentialOf,
  weekendStats,
  weekendStatsOf,
} from '../src';
import { toPlacements } from '../src/search';
import { raidBench } from '../src/bosses';
import { preparedOf } from '../src/tuner';

const rng = (s: string) => createSeededRng(s);

describe('the potential of a weekend', () => {
  const boss = raidBossOf('tidal-colossus');
  const { line } = preparedOf(boss.id);

  it('is the total damage over the boss’s HP, with its spread, over seeded weekends', () => {
    const p = weekendPotential(boss, line, 6, 'pw');
    expect(p.runs).toBe(6);
    expect(p.mean).toBeGreaterThan(0);
    expect(p.sd).toBeGreaterThanOrEqual(0);
    // By hand for one weekend: the stages' damage over the HP.
    const placements = toPlacements(line, raidMode(boss));
    const w = weekend(boss, placements, raidBench(boss.cols, boss.rosterLevel), {
      rng: rng('weekend:pw:0'),
      potential: true,
    });
    const one = weekendPotentialOf(
      boss,
      placements,
      raidBench(boss.cols, boss.rosterLevel),
      1,
      'pw',
    );
    expect(one.mean).toBeCloseTo(w.stages.reduce((n, st) => n + st.damage, 0) / boss.hp, 12);
    expect(one.sd).toBe(0);
    // Reproducible.
    expect(weekendPotential(boss, line, 6, 'pw')).toEqual(p);
  });

  it('is never below the share of the HP removed, and above it once the boss would have died', () => {
    const stats = weekendStats(boss, line, 8, 'pw2');
    const p = weekendPotential(boss, line, 8, 'pw2');
    expect(p.mean).toBeGreaterThanOrEqual(stats.damageShare - 1e-9);
    // A boss that falls in every weekend: its potential counts the damage past the kill too.
    const soon = raidBossOf('tidal-colossus', { hp: 3_000 });
    const killed = weekendStats(soon, line, 6, 'pw3');
    expect(killed.winRate).toBe(1);
    expect(weekendPotential(soon, line, 6, 'pw3').mean).toBeGreaterThan(1.5);
  });

  it('rises with a softer boss and falls with a tougher one', () => {
    const at = (hp: number) => weekendPotential(raidBossOf(boss.id, { hp }), line, 4, 'pw4').mean;
    expect(at(boss.hp * 2)).toBeLessThan(at(boss.hp));
    expect(at(Math.round(boss.hp / 2))).toBeGreaterThan(at(boss.hp));
  });

  it('pools parts by their runs, with the spread between them', () => {
    const a = { runs: 2, mean: 1, sd: 0 };
    const b = { runs: 2, mean: 2, sd: 0 };
    const both = combinePotential([a, b]);
    expect(both.runs).toBe(4);
    expect(both.mean).toBeCloseTo(1.5, 12);
    expect(both.sd).toBeCloseTo(0.5, 12);
    expect(combinePotential([{ runs: 3, mean: 1.2, sd: 0.1 }]).sd).toBeCloseTo(0.1, 12);
  });
});

describe('the potential of a mixed weekend uses the same seeds as the kill measure', () => {
  it('fights the weekend the stats fight, until the boss would die', () => {
    const boss = raidBossOf('cinder-wyrm', { hp: 10_000_000 });
    const { line } = preparedOf(boss.id);
    const placements = toPlacements(line, raidMode(boss));
    const bench = raidBench(boss.cols, boss.rosterLevel);
    // A boss that cannot die in the real fight either: both measures are the same weekend.
    const stats = weekendStatsOf(boss, placements, bench, 3, 'same');
    const p = weekendPotentialOf(boss, placements, bench, 3, 'same');
    expect(p.mean).toBeCloseTo(stats.damageShare, 9);
  });
});
