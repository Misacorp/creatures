/** The dungeon-depth XP variants (`dungeonXp.ts`): the curves, the switch (off by default) and a whole run. */
import { describe, expect, it } from 'vitest';
import { DEPTH_XP_CURVE, V1_XP_CURVE, dungeonRunXp, interpolate } from '../src/dungeonXp';
import { profileWeek } from '../src/dungeonXpStudy';
import { RULES } from '../src/rules';
import { playersOf, runScenario } from '../src/scenarios';
import { ALL_SERVERS } from '../src/servers';
import { runServer } from '../src/sim';

describe('the curves', () => {
  it('give the given values at the given weeks, interpolate between them and hold at the ends', () => {
    for (const [week, xp] of DEPTH_XP_CURVE) expect(dungeonRunXp('depth', week)).toBe(xp);
    for (const [week, xp] of V1_XP_CURVE) expect(dungeonRunXp('v1', week)).toBe(xp);
    expect(dungeonRunXp('depth', 2)).toBeCloseTo(157 + (373 - 157) / 3, 9);
    expect(dungeonRunXp('v1', 6)).toBeCloseTo((313 + 309) / 2, 9);
    expect(dungeonRunXp('depth', 0)).toBe(157);
    expect(dungeonRunXp('depth', 60)).toBe(594);
    expect(interpolate([[1, 10]], 5)).toBe(10);
  });

  it('with the lever study at no bonus is the v1 column, and at the default lever is near the depth curve', () => {
    for (const week of [1, 4, 8, 12, 24]) {
      expect(dungeonRunXp({ perDepthBp: 0, maxBp: 0 }, week)).toBeCloseTo(
        dungeonRunXp('v1', week),
        9,
      );
      const full = dungeonRunXp({ perDepthBp: 100, maxBp: 10000 }, week);
      expect(Math.abs(full - dungeonRunXp('depth', week))).toBeLessThan(8);
    }
    // The cap binds: the same rate with a lower cap pays less late.
    expect(dungeonRunXp({ perDepthBp: 100, maxBp: 1000 }, 24)).toBeLessThan(
      dungeonRunXp({ perDepthBp: 100, maxBp: 10000 }, 24),
    );
  });
});

describe('the switch', () => {
  const base = ALL_SERVERS.find((s) => s.id === 'mixed8')!;

  it('is off by default: no server of the report has it', () => {
    expect(ALL_SERVERS.some((s) => s.dungeonXp !== undefined)).toBe(false);
    expect(RULES.fights.dungeon.xp).toBe(120);
  });

  it('gives the same run twice, and the default run is unchanged by an absent switch', () => {
    const json = (c: typeof base): string =>
      JSON.stringify(runServer(c, 3).players.map((p) => p.sources));
    expect(json({ ...base, dungeonXp: 'depth' })).toBe(json({ ...base, dungeonXp: 'depth' }));
    expect(json(base)).toBe(json({ ...base }));
  });

  it('pays more dungeon XP with the curves than the flat rule from week 2 on, the depth curve more than v1, and scales by habit', () => {
    const xp = (mode?: 'depth' | 'v1'): Record<string, number> => {
      const result = runScenario(mode ? { ...base, dungeonXp: mode } : base, 2);
      const out: Record<string, number> = {};
      for (const profile of ['daily', 'weekly']) {
        const players = playersOf(result, profile);
        out[profile] =
          players.reduce((n, p) => n + (p.weeks[11]?.xpDungeon ?? 0), 0) / players.length;
      }
      return out;
    };
    const flat = xp();
    const depth = xp('depth');
    const v1 = xp('v1');
    expect(depth['daily']!).toBeGreaterThan(v1['daily']!);
    expect(v1['daily']!).toBeGreaterThan(flat['daily']!);
    // A weekly player makes fewer runs (one a week, then stored passes), so gets a fraction of a daily player's XP.
    expect(depth['weekly']!).toBeLessThan(depth['daily']! * 0.6);
    expect(depth['weekly']!).toBeGreaterThan(flat['weekly']!);
  });

  it('puts a daily player higher in the levels than the flat rule does', () => {
    const top = (dungeonXp?: 'depth'): number | null =>
      profileWeek(playersOf(runScenario(dungeonXp ? { ...base, dungeonXp } : base, 2), 'daily'), 8)
        ?.top ?? null;
    expect(top('depth')!).toBeGreaterThan(top()!);
  });
});
