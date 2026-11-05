/**
 * The dungeon over days: the run's rules (a wipe ends it, a knocked-out creature stays out until the camp swaps it, the descent heals
 * only the standing) and the habits (runs a week). Short and seeded: the measurement is the report's (`--dungeon-days`).
 */
import { campRest, createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  ALL_ROUND_TEAM,
  FOE_IDS,
  GAUNTLET,
  descentBreathOf,
  fight,
  foeAt,
  runMap,
  toPlacements,
} from '../src';
import { dungeonDaysOf, runDays } from '../src/dungeonDays';
import { HABITS } from '../src/habits';
import { VALLEY_ROSTER } from '../src/valley';

const weekly = { id: 'one', players: [{ role: 'casual', roster: 'weekly' }] } as const;

describe('a run', () => {
  it('ends on a wipe: the floor boss is not beaten, no Undercroft, and the depth stays', () => {
    const r = runMap(
      ALL_ROUND_TEAM.map((p) => ({ ...p, level: 1 })),
      30,
      createSeededRng('dd-wipe'),
      { policy: 'smart', levels: 3, standingOnlyDescent: true },
    );
    expect(r.cleared).toBe(false);
    expect(r.entered).toBe(0);
    expect(r.played).toBeGreaterThanOrEqual(1);
    const days = dungeonDaysOf(weekly, 'expected', 0, VALLEY_ROSTER, HABITS, 1);
    expect(days[0]?.runs.every((x) => !x.cleared)).toBe(true);
    expect(days[0]?.depthEnd).toEqual([1]);
  });

  it('keeps a knocked-out creature out: it stays at 0 in the next fight and the camp does not raise it', () => {
    const placements = toPlacements(ALL_ROUND_TEAM, GAUNTLET);
    const uid = (i: number) => `p1:${placements[i]?.formId}:${i}`;
    const res = fight(foeAt(FOE_IDS[0] as string, 1), placements, {
      rng: createSeededRng('dd-ko'),
      carryHp: new Map([[uid(0), 0]]),
    });
    expect(res.hpLeft.get(uid(0)) ?? 0).toBe(0);
    expect(campRest({ a: 0, b: 10 }, { a: 100, b: 100 })).toMatchObject({ a: 0 });
  });

  it('heals only the standing on the way down (the game catchBreath would also get the fallen up)', () => {
    const before = { down: 0, hurt: 40 };
    const max = { down: 100, hurt: 100 };
    const worker = descentBreathOf(before, max, true);
    expect(worker.down).toBe(0);
    expect(worker.hurt).toBeGreaterThan(40);
    expect(descentBreathOf(before, max, false).down).toBeGreaterThan(0);
  });
});

describe('the habits', () => {
  it('a daily player runs every day, a weekly player 2 or 3 days (both happen), on distinct sorted days, repeatably', () => {
    expect(runDays(HABITS, 'daily', 's', 3)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const counts = new Set<number>();
    for (let week = 1; week <= 24; week++) {
      const days = runDays(HABITS, 'weekly', 's', week);
      counts.add(days.length);
      expect(new Set(days).size).toBe(days.length);
      expect([...days].sort((a, b) => a - b)).toEqual(days);
      expect(runDays(HABITS, 'weekly', 's', week)).toEqual(days);
    }
    expect([...counts].sort()).toEqual([2, 3]);
  });

  it('a player’s runs per week follow the habit, and the same seed repeats', () => {
    const a = dungeonDaysOf(weekly, 'expected', 0, VALLEY_ROSTER, HABITS, 3);
    const b = dungeonDaysOf(weekly, 'expected', 0, VALLEY_ROSTER, HABITS, 3);
    const key = (xs: typeof a) =>
      xs.map((p) => p.runs.map((r) => [r.week, r.depth, r.cleared, r.played]));
    expect(key(a)).toEqual(key(b));
    for (const week of [2, 3]) {
      const n = a[0]?.runs.filter((r) => r.week === week).length ?? 0;
      expect(n === 2 || n === 3).toBe(true);
    }
  });
});
