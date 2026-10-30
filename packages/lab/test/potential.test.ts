/**
 * Damage potential (Misa, 2026-10-30): the weekend played as if the boss could not die, as total damage over the boss's HP. The
 * fight option keeps everything else as it is, and the normal fight does not change. Also Determination's two effects in a fight.
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  fight,
  labBoss,
  raidBossOf,
  raidMode,
  weekend,
  weekendPotential,
  weekendPotentialOf,
  combinePotential,
  weekendStats,
  weekendStatsOf,
  type Placement,
} from '../src';
import { toPlacements } from '../src/search';
import { raidBench } from '../src/bosses';
import { preparedOf } from '../src/tuner';

const at = (formId: string, row: number, col: number, knack?: string): Placement => ({
  owner: 'p1',
  formId,
  level: 25,
  row,
  col,
  ...(knack ? { knack } : {}),
});
const rng = (s: string) => createSeededRng(s);

/** A boss with little HP, so that four creatures bring it down at once. */
const soft = labBoss({ rows: 1, cols: 4, rounds: 8, hp: 400, atk: 60 });
const team: Placement[] = [
  at('zipmouse', 0, 0),
  at('thornbuck', 0, 1),
  at('zipmouse', 0, 2),
  at('thornbuck', 0, 3),
];

describe('the potential option of a fight', () => {
  it('lets the boss go below 0 HP without dying: the fight plays all its rounds and the damage is not cut at the HP', () => {
    const normal = fight(soft, team, { rng: rng('pot'), log: true });
    expect(normal.won).toBe(true);
    expect(normal.damage).toBe(soft.hp);
    const open = fight(soft, team, { rng: rng('pot'), log: true, potential: true });
    expect(open.won).toBe(false);
    expect(open.killingBlow).toBeNull();
    // Every round was fought: the normal fight ended with the boss.
    const rounds = (events: readonly { round: number }[]) =>
      Math.max(...events.map((e) => e.round));
    expect(rounds(open.events)).toBe(soft.rounds);
    expect(rounds(normal.events)).toBeLessThan(soft.rounds);
    // The damage dealt is more than the boss's HP (overkill counts), and the boss stays at 1 HP.
    expect(open.damage).toBeGreaterThan(soft.hp);
    expect(open.bossHpLeft).toBe(1);
    // The creatures keep fighting: it adds up to more than twice the HP in eight rounds.
    expect(open.damage).toBeGreaterThan(2 * soft.hp);
  });

  it('is the normal fight until the boss would have died', () => {
    const normal = fight(soft, team, { rng: rng('same'), log: true });
    const open = fight(soft, team, { rng: rng('same'), log: true, potential: true });
    // Up to the killing blow, which is the last event but one of the normal fight.
    const until = normal.events.findIndex((e) => e.kind === 'killing-blow');
    expect(until).toBeGreaterThan(0);
    expect(open.events.slice(0, until).map((e) => e.text)).toEqual(
      normal.events.slice(0, until).map((e) => e.text),
    );
    expect(open.events.some((e) => e.kind === 'killing-blow')).toBe(false);
  });

  it('leaves the normal fight as it was: no option, false and a zero Determination are all the same fight', () => {
    const base = fight(soft, team, { rng: rng('plain'), log: true });
    const off = fight(soft, team, {
      rng: rng('plain'),
      log: true,
      potential: false,
      determinationBp: 0,
    });
    expect(off).toEqual(base);
    const boss = raidBossOf('tidal-colossus');
    const line = toPlacements(preparedOf(boss.id).line, raidMode(boss));
    const a = weekend(boss, line, raidBench(), { rng: rng('wk') });
    const b = weekend(boss, line, raidBench(), { rng: rng('wk'), determinationBp: 0 });
    expect(b).toEqual(a);
  });

  it('lets the weekend play all its stages, with knockouts and attrition between them', () => {
    const hard = labBoss({ rows: 1, cols: 4, rounds: 8, hp: 400, atk: 4_000 });
    const normal = weekend(soft, team, [], { rng: rng('stages') });
    expect(normal.stages).toHaveLength(1);
    const open = weekend(soft, team, [], { rng: rng('stages'), potential: true });
    expect(open.stages).toHaveLength(3);
    expect(open.won).toBe(false);
    // Knockouts run as normal: a boss that hits hard knocks creatures out and they stay out in the later stages.
    const hit = weekend(hard, team, [], { rng: rng('ko'), potential: true });
    const out = hit.stages.reduce((n, st) => n + st.knockouts, 0);
    expect(out).toBeGreaterThan(0);
    expect(hit.stages.length).toBeLessThanOrEqual(3);
    const standing = (i: number) => hit.stages[i]?.fighters.filter((f) => f.hp > 0).length ?? 0;
    for (let i = 1; i < hit.stages.length; i++)
      expect(standing(i)).toBeLessThanOrEqual(standing(i - 1));
  });
});

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

describe('Determination in a fight', () => {
  it('adds its share to the damage dealt', () => {
    const base = fight(soft, team, { rng: rng('det'), potential: true });
    const plus = fight(soft, team, { rng: rng('det'), potential: true, determinationBp: 5_000 });
    expect(plus.damage).toBeGreaterThan(base.damage * 1.25);
    expect(plus.damage).toBeLessThan(base.damage * 1.75);
  });

  it('adds its share to the healing', () => {
    // A weekend of the prepared line has healers: more healing with the bonus (the same fight otherwise, nothing can die in it).
    const boss = raidBossOf('tidal-colossus', { hp: 10_000_000 });
    const line = toPlacements(preparedOf(boss.id).line, raidMode(boss));
    const heal = (bp: number) =>
      weekend(boss, line, [], {
        rng: rng('heal'),
        stages: 1,
        determinationBp: bp,
      }).stages.reduce((n, st) => n + st.healed, 0);
    expect(heal(0)).toBeGreaterThan(0);
    expect(heal(5_000)).toBeGreaterThan(heal(0));
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
