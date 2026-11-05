/** The lab's gear model: expected loadouts from the game's own data, the ladder, and a fight with gear off unchanged. */
import { describe, expect, it } from 'vitest';
import { RULES, VALLEY_RULES, createSeededRng, gearFx, itemOf } from '@creatures/game';
import { labBoss } from '../src/cards';
import { fight } from '../src/fight';
import {
  LINES_PER_RARITY,
  RARITY_FACTOR,
  bestPip,
  loadoutAt,
  pipChances,
  poolLevel,
  rarityMix,
  singleLineLoadout,
  withGear,
} from '../src/gear';
import { teamOf } from '../src/dungeonDays';
import { gateJourneyOptions } from '../src/gate';
import { HABITS } from '../src/habits';
import {
  JOURNEY_SERVERS,
  journeyJobId,
  journeyWeekend,
  planJourney,
  type JourneyServer,
} from '../src/journey';
import type { PathRun } from '../src/path';
import { rosterGearLevel } from '../src/roster';
import { CLASSIC_LINE, GAUNTLET, toPlacements } from '../src/search';
import { VALLEY_ROSTER } from '../src/valley';

describe('the ladder reads the game and the valley', () => {
  it('best pip follows the valley thresholds, pip chances the game tier weights', () => {
    const from = VALLEY_RULES.gear.pipFrom;
    expect(bestPip(1)).toBe(0);
    expect(bestPip(from[0] as number)).toBe(1);
    expect(bestPip(from[3] as number)).toBe(4);
    expect(bestPip(100)).toBe(4);
    const chances = pipChances(100);
    expect(chances.map((c) => c.pip)).toEqual([4, 3, 2, 1]);
    expect(chances.reduce((s, c) => s + c.chance, 0)).toBeCloseTo(1);
    expect(chances[0]?.chance).toBeCloseTo(
      (RULES.gear.tierWeights[0] as number) / RULES.gear.tierWeights.reduce((a, b) => a + b, 0),
    );
    // Fewer pips than weights: renormalised.
    expect(pipChances(1)).toEqual([{ pip: 0, chance: 1 }]);
  });

  it('lines per rarity are the valley, the pool level is the item level over five', () => {
    expect(Object.values(LINES_PER_RARITY)).toEqual([...VALLEY_RULES.gear.lines]);
    expect(poolLevel(1)).toBe(1);
    expect(poolLevel(54)).toBe(11);
    expect(poolLevel(1000)).toBe(RULES.gear.maxItemLevel);
    expect(rarityMix(10)).toEqual(['common', 'common', 'rare']);
    expect(RARITY_FACTOR.epic).toBeLessThan(RARITY_FACTOR.common);
  });
});

describe('loadoutAt', () => {
  it('keeps a table line (Hunter, Ward, Beside the mark-maker) as a table of numbers, not a flag', () => {
    const fx = loadoutAt(54, 'guard', 'tide').fx;
    for (const field of ['vsElementBp', 'fromElementCutBp', 'besideRoleBp'] as const) {
      const table = fx[field];
      expect(typeof table, field).toBe('object');
      for (const n of Object.values(table ?? {})) expect(n).toBeGreaterThan(0);
    }
  });

  it('is deterministic and grows with the item level', () => {
    const a = loadoutAt(54, 'payoff', 'tide');
    expect(loadoutAt(54, 'payoff', 'tide')).toEqual(a);
    const low = loadoutAt(10, 'payoff', 'tide');
    expect(a.stats.atk).toBeGreaterThan(low.stats.atk);
    expect(a.stats.hp).toBeGreaterThan(low.stats.hp);
    expect(a.fx.reactionBonusBp ?? 0).toBeGreaterThan(low.fx.reactionBonusBp ?? 0);
  });

  it('role lines reach only their role', () => {
    expect(loadoutAt(54, 'guard', 'tide').fx.coverBonusBp ?? 0).toBeGreaterThan(0);
    expect(loadoutAt(54, 'payoff', 'tide').fx.coverBonusBp).toBeUndefined();
    expect(loadoutAt(54, 'support', 'tide').fx.boostBonusBp ?? 0).toBeGreaterThan(0);
  });

  it("puts the game's numbers on a single line: Reaction for its own element only", () => {
    const line = 'tide-reaction';
    const top = RULES.gear.tierFromItemLevel.length - 1;
    const item = itemOf('kelp-cap', 'epic', RULES.gear.tierFromItemLevel[top] as number, [
      { id: line, tier: top },
    ]);
    const game = gearFx({ role: 'payoff', element: 'tide' }, [item]).reactionBonusBp as number;
    // The lab's line is the game's value at the pips' mean share times the rarity factor: never above the game's top.
    const lab = singleLineLoadout(line, 100, 'epic', 'payoff', 'tide').fx.reactionBonusBp as number;
    expect(game).toBeGreaterThan(0);
    expect(lab).toBeLessThanOrEqual(Math.round(game * RARITY_FACTOR.epic));
    expect(lab).toBeGreaterThan(0);
    expect(singleLineLoadout(line, 100, 'epic', 'payoff', 'ember').fx).toEqual({});
  });

  it('gives each trigger and aura line of slice 4 an effect for a wearer it fits (the power table measures them)', () => {
    const lines: [string, string, string][] = [
      ['payback', 'guard', 'paybackBp'],
      ['ember-tail', 'payoff', 'emberTailBp'],
      ['overflow', 'payoff', 'overflowBp'],
      ['slipstream', 'setter', 'slipstreamBp'],
      ['echo', 'payoff', 'echoChanceBp'],
      ['second-wind', 'setter', 'windChanceBp'],
      ['kindling', 'support', 'kindlingBp'],
      ['shared-warmth', 'guard', 'sharedWarmthBp'],
      ['spark-share', 'support', 'sparkShareBp'],
      ['lantern-bearer', 'setter', 'lanternBp'],
    ];
    for (const [line, role, field] of lines) {
      const fx = singleLineLoadout(line, 100, 'epic', role as never, 'tide').fx;
      expect((fx as unknown as Record<string, number>)[field], line).toBeGreaterThan(0);
    }
  });
});

describe('withGear', () => {
  const placement = {
    owner: 'p1',
    formId: 'tidewing',
    level: 25,
    knack: 'steady-mark',
    row: 0,
    col: 0,
  };

  it('is the same placement without an item level', () => {
    expect(withGear(placement, undefined)).toBe(placement);
    expect(withGear(placement, 0)).toBe(placement);
  });

  it('adds the effect sheet and the stat adds with one', () => {
    const g = withGear(placement, 54) as typeof placement & { gearStats?: { atk: number } };
    expect(g.gearStats?.atk).toBeGreaterThan(0);
    expect(g).toMatchObject(placement);
  });

  it('a fight with gear off is identical, with gear on it differs', () => {
    const boss = labBoss({ rows: 1, cols: 3 });
    const a = fight(boss, toPlacements(CLASSIC_LINE, GAUNTLET), {
      rng: createSeededRng('gear-test'),
    });
    const off = toPlacements(CLASSIC_LINE, GAUNTLET);
    expect(off.every((p) => !('gear' in p) && !('gearStats' in p))).toBe(true);
    expect(fight(boss, off, { rng: createSeededRng('gear-test') })).toEqual(a);
    const geared = toPlacements(
      CLASSIC_LINE.map((p) => ({ ...p, itemLevel: 54 })),
      GAUNTLET,
    );
    const c = fight(boss, geared, { rng: createSeededRng('gear-test') });
    expect(c.damage).not.toBe(a.damage);
  });
});

describe('the roster gives the item level', () => {
  it('reads the profile and follows the speed', () => {
    const at = (w: number): number => rosterGearLevel(VALLEY_ROSTER, 'daily', w, 'expected');
    expect(at(24)).toBeGreaterThan(at(4));
    expect(rosterGearLevel(VALLEY_ROSTER, 'daily', 12, 'slow')).toBeLessThan(at(12));
    expect(rosterGearLevel(VALLEY_ROSTER, 'daily', 12, 'fast')).toBeGreaterThan(at(12));
  });
});

describe('the journey and the dungeon days play gear only when asked', () => {
  const mixed = JOURNEY_SERVERS.find((s) => s.id === 'mixed') as JourneyServer;
  const seats = (run: PathRun) =>
    journeyWeekend(
      mixed,
      3,
      12,
      'expected',
      'gear-test',
      VALLEY_ROSTER,
      run,
      HABITS,
    ).players.flatMap((p) => p.team);

  it('the raid seats wear gear with the option, none without', () => {
    expect(seats({}).some((p) => 'gear' in p || 'gearStats' in p)).toBe(false);
    expect(seats({ gear: true }).every((p) => 'gearStats' in p)).toBe(true);
    // Gear off: the weekend is the one it always was.
    expect(seats({ gear: false })).toEqual(seats({}));
  });

  it('the dungeon team carries the item level only with the option', () => {
    const who = { role: 'casual', roster: 'daily' } as const;
    const team = (gear: boolean) =>
      teamOf(who, 0, 12, 'expected', 'gear-test', VALLEY_ROSTER, HABITS, gear ? { gear } : {}).team;
    const level = rosterGearLevel(VALLEY_ROSTER, 'daily', 12, 'expected');
    expect(team(false).some((p) => p.itemLevel !== undefined)).toBe(false);
    expect(team(true).every((p) => p.itemLevel === level)).toBe(true);
  });

  it('the gate and the journey plan carry the option, and only when asked', () => {
    expect('gear' in gateJourneyOptions(true)).toBe(false);
    expect(gateJourneyOptions(true, true)).toMatchObject({ gear: true });
    const ids = (gear: boolean) =>
      planJourney({ quick: true, servers: 1, gameOnly: true, ...(gear ? { gear } : {}) }).jobs.map(
        (j) => j.id,
      );
    expect(ids(true).every((id) => id.endsWith(':gear'))).toBe(true);
    expect(ids(false).some((id) => id.endsWith(':gear'))).toBe(false);
  });

  it('job ids are what they were with gear off', () => {
    const a = {
      rules: 'game',
      server: 'mixed',
      speed: 'expected',
      determination: 'on',
      index: 0,
    } as const;
    expect(journeyJobId(a)).toBe(journeyJobId({ ...a, gear: false }));
    expect(journeyJobId({ ...a, gear: true })).not.toBe(journeyJobId(a));
  });
});
