import { describe, expect, it } from 'vitest';
import { RULES, content, createSeededRng, nextRank, seasonOf } from '@creatures/game';
import { DEFAULT_MIX } from '../src/archetypes';
import { runEconomy, type EconomyResult, type LadderWeek } from '../src/economy';
import { LONG_RUN_WEEKS, analyseLongRun, longestLossStreak, rankUpGaps } from '../src/ladder';
import { openRaidWeek, playStage, summarizeRaid } from '../src/raid';
import { applyOverrides } from '../src/tune';
import { clonePlayer } from '../src/state';

const WEEKS = 12;
const econ = (seed: string, firstWeekIndex: number): EconomyResult =>
  runEconomy({ seed, weeks: WEEKS, mix: DEFAULT_MIX, snapshotWeeks: [4], firstWeekIndex });

describe('the ladder in the economy sim', () => {
  const result = econ('ladder', 2);

  it('places the server once, then follows nextRank week by week', () => {
    expect(result.raids.length).toBeGreaterThan(8);
    let expected: number | null = null;
    for (const r of result.raids) {
      if (expected !== null) expect(r.ladder.rank).toBe(expected);
      const weekIndex = result.firstWeekIndex + r.week - 1;
      expected = nextRank(r.ladder.rank, weekIndex, r.ladder.won);
      expect(r.ladder.nextRank).toBe(expected);
      expect(r.ladder.rank).toBeGreaterThanOrEqual(1);
    }
    // A fresh server starts low: the roster of week 1 is at the first levels.
    expect(result.raids[0]?.ladder.rank).toBeLessThanOrEqual(5);
  });

  it('puts the Festival on every 5th week of the global calendar, with an eased boss', () => {
    for (const r of result.raids) {
      const weekIndex = result.firstWeekIndex + r.week - 1;
      expect(r.ladder.festival).toBe(seasonOf(weekIndex).festival);
      expect(r.summary.festival).toBe(r.ladder.festival);
      expect(r.ladder.effectiveRank).toBe(
        r.ladder.festival
          ? Math.max(1, r.ladder.rank - RULES.progression.festivalEaseRanks)
          : r.ladder.rank,
      );
      expect(r.summary.rank).toBe(r.ladder.effectiveRank);
    }
    expect(result.raids.filter((r) => r.ladder.festival).length).toBe(2);
  });

  it('is deterministic for a seed and start week, and the start week changes where Festivals fall', () => {
    expect(econ('ladder', 2).raids).toEqual(result.raids);
    const other = econ('ladder', 0);
    expect(other.raids.map((r) => r.ladder.festival)).not.toEqual(
      result.raids.map((r) => r.ladder.festival),
    );
  });

  it('draws the start week from the seed when none is given', () => {
    const a = runEconomy({ seed: 'cal-a', weeks: 2, mix: DEFAULT_MIX, snapshotWeeks: [] });
    const b = runEconomy({ seed: 'cal-a', weeks: 2, mix: DEFAULT_MIX, snapshotWeeks: [] });
    expect(a.firstWeekIndex).toBe(b.firstWeekIndex);
    expect(a.firstWeekIndex).toBeGreaterThanOrEqual(0);
    expect(a.firstWeekIndex).toBeLessThan(RULES.progression.seasonWeeks);
  });

  it('grants the Festival creature to the participants of a won Festival, through the duplicate rules', () => {
    // Weeks 5 and 10 of a sim that starts at week index 0 are Festivals.
    const sim = runEconomy({
      seed: 'festival-grant',
      weeks: 7,
      mix: DEFAULT_MIX,
      snapshotWeeks: [6],
      firstWeekIndex: 0,
    });
    const festival = sim.raids.find((r) => r.ladder.festival);
    expect(festival?.week).toBe(5);
    const afterFestival = sim.snapshots[0]?.players ?? [];
    const species = content.creatures.find((c) => c.festival === true);
    expect(species?.id).toBe('lanternfin');
    const owners = afterFestival.filter((p) => p.creatures.some((c) => c.line === 'lanternfin'));
    if (festival?.ladder.won === true) {
      expect(owners.length).toBeGreaterThan(0);
      for (const p of owners) {
        const c = p.creatures.find((x) => x.line === 'lanternfin');
        expect(c?.speciesId).toBe('lanternfin');
        expect(c?.level).toBeGreaterThanOrEqual(1);
      }
    } else {
      expect(owners.length).toBe(0);
    }
  });
});

describe('raid week ranks and payouts', () => {
  const sim = econ('rank-week', 1);
  const players = (sim.snapshots[0]?.players ?? []).map(clonePlayer);
  const boss = content.bosses[0];
  if (boss === undefined) throw new Error('no boss');

  it('scales the boss with the rank only, and a higher rank is a bigger boss', () => {
    const low = openRaidWeek(boss, players, { rank: 2 });
    const high = openRaidWeek(boss, players, { rank: 5 });
    expect(high.pool.max).toBeGreaterThan(low.pool.max);
    expect(high.bossAtk).toBeGreaterThanOrEqual(low.bossAtk);
    expect(summarizeRaid(high).rank).toBe(5);
  });

  it('places by the old per-level rule when no rank is given', () => {
    const w = openRaidWeek(boss, players);
    expect(w.rank).toBeGreaterThanOrEqual(1);
    expect(w.reward).toEqual({ rank: w.rank, festival: false });
  });

  it('pays more Essence at a higher rank and in a Festival week, for the same fight', () => {
    const paid = (reward: { rank: number; festival: boolean }): number => {
      const w = openRaidWeek(boss, players.map(clonePlayer), { rank: 1, reward });
      // A boss with 1 HP falls at once, so the finale is the same win each time.
      w.pool = { max: 1, current: 1 };
      playStage(w, 'finale', createSeededRng('essence'), createSeededRng('loot'));
      return Object.values(w.essence).reduce((a, b) => a + b, 0);
    };
    const base = paid({ rank: 1, festival: false });
    expect(base).toBeGreaterThan(0);
    expect(paid({ rank: 6, festival: false })).toBeGreaterThan(base);
    expect(paid({ rank: 1, festival: true })).toBeGreaterThan(base);
    expect(paid({ rank: 6, festival: true })).toBeGreaterThan(paid({ rank: 6, festival: false }));
  });
});

describe('long-run analysis', () => {
  const lw = (
    week: number,
    rank: number,
    won: boolean,
    festival = false,
  ): { week: number; ladder: LadderWeek } => ({
    week,
    ladder: {
      rank,
      effectiveRank: rank,
      festival,
      won,
      nextRank: nextRank(rank, festival ? 4 : 0, won),
    },
  });

  it('finds the longest loss streak', () => {
    expect(longestLossStreak([])).toBe(0);
    expect(longestLossStreak([true, true])).toBe(0);
    expect(longestLossStreak([false, false, true, false])).toBe(2);
    expect(longestLossStreak([true, false, false, false, false, false])).toBe(5);
  });

  it('measures weeks between rank-ups from the weeks that raised the rank', () => {
    const raids = [
      lw(1, 1, true),
      lw(2, 2, false),
      lw(3, 2, false),
      lw(4, 2, true),
      lw(5, 3, true, true), // a Festival win does not raise the rank
      lw(6, 2, true),
    ];
    expect(rankUpGaps(raids)).toEqual([3, 2]);
  });

  it('summarises groups into the long-run metrics', () => {
    const sims = [econ('lr-a', 0), econ('lr-b', 3)];
    const { stats, metrics } = analyseLongRun([{ id: 'typical', sims }]);
    expect(stats).toHaveLength(1);
    const g = stats[0];
    expect(g?.servers).toBe(2);
    expect(g?.raidWeeks).toBeGreaterThan(10);
    expect(g?.medianRankByWeek).toHaveLength(LONG_RUN_WEEKS);
    expect(g?.winRate).toBeGreaterThan(0);
    expect(metrics['longrun.typical.finaleWinRate']).toBe(g?.winRate);
    expect(metrics['longrun.small.finaleWinRate']).toBeNull();
    expect(metrics['longrun.lossStreakShareMax']).toBe(g?.lossStreakShare);
  });
});

describe('tuning overrides', () => {
  it('changes a rule and a boss for the length of a run and restores them', () => {
    const before = RULES.progression.festivalEaseRanks;
    const boss = content.bosses[0];
    const hp = boss?.baseHp ?? 0;
    const restore = applyOverrides(
      `progression.festivalEaseRanks=${before + 1},boss.${boss?.id ?? ''}.baseHp=${hp + 1}`,
    );
    expect(RULES.progression.festivalEaseRanks).toBe(before + 1);
    expect(boss?.baseHp).toBe(hp + 1);
    restore();
    expect(RULES.progression.festivalEaseRanks).toBe(before);
    expect(boss?.baseHp).toBe(hp);
  });

  it('changes a number inside one creature and restores it', () => {
    const sproutle = content.creatures.find((c) => c.id === 'sproutle');
    const atk = sproutle?.baseStats.atk ?? 0;
    const restore = applyOverrides(`creature.sproutle.baseStats.atk=${atk + 3}`);
    expect(sproutle?.baseStats.atk).toBe(atk + 3);
    restore();
    expect(sproutle?.baseStats.atk).toBe(atk);
    expect(() => applyOverrides('creature.nobody.baseStats.atk=1')).toThrow(/no such setting/);
    expect(() => applyOverrides('creature.sproutle.baseStats.nope=1')).toThrow(/not a number/);
  });

  it('rejects unknown settings, non-numbers and bad syntax', () => {
    expect(() => applyOverrides('progression.nope=1')).toThrow(/not a number/);
    expect(() => applyOverrides('nothing.here=1')).toThrow(/no such setting/);
    expect(() => applyOverrides('progression=1')).toThrow(/not a number/);
    expect(() => applyOverrides('progression.seasonWeeks=abc')).toThrow(/cannot read/);
  });
});

describe('tuning CLI', () => {
  it('rejects bad arguments and overrides, and restores the rules after a run', async () => {
    const { main } = await import('../src/tune-cli');
    const errors: string[] = [];
    const io = { out: () => undefined, err: (t: string) => errors.push(t) };
    const before = RULES.raid.scaling.rankStepBp;
    expect(main(['--long', '0'], io)).toBe(2);
    expect(main(['--set', 'raid.scaling.rankStepBp=abc'], io)).toBe(2);
    expect(main(['--set', 'raid.scaling.nothing=5'], io)).toBe(2);
    expect(main(['--calibrate', '0'], io)).toBe(2);
    expect(errors).toHaveLength(4);
    expect(RULES.raid.scaling.rankStepBp).toBe(before);
  });
});
