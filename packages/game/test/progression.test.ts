import { describe, expect, it } from 'vitest';
import {
  RULES,
  content,
  essenceForStage,
  essenceMultiplierBp,
  festivalCreatureFor,
  festivalGrantOutcome,
  forecastMarginBp,
  jackpotEssenceFor,
  nextRank,
  placementRank,
  bossAttacksAtRank,
  rankAtkFactorBp,
  rankFactorBp,
  raidWeekPlan,
  readinessBand,
  scaleEssence,
  seasonOf,
  type ContentPack,
} from '../src/index';

const P = RULES.progression;

describe('rankFactorBp', () => {
  it('starts at 10000, compounds the step with a floor at every step, and never goes down', () => {
    expect(rankFactorBp(1)).toBe(10_000);
    let expected = 10_000;
    for (let r = 2; r <= RULES.raid.scaling.maxRank; r++) {
      expected = Math.floor((expected * (10_000 + RULES.raid.scaling.rankStepBp)) / 10_000);
      expect(rankFactorBp(r)).toBe(expected);
    }
    for (let r = 2; r <= RULES.raid.scaling.maxRank; r++)
      expect(rankFactorBp(r)).toBeGreaterThan(rankFactorBp(r - 1));
  });

  it('clamps and floors the rank, and stays a safe integer at the top rank', () => {
    expect(rankFactorBp(0)).toBe(10_000);
    expect(rankFactorBp(-4)).toBe(10_000);
    expect(rankFactorBp(Number.NaN)).toBe(10_000);
    expect(rankFactorBp(2.9)).toBe(rankFactorBp(2));
    expect(rankFactorBp(1000)).toBe(rankFactorBp(RULES.raid.scaling.maxRank));
    // The factor stays small enough for exact integer products with any boss HP.
    expect(rankFactorBp(1000)).toBeLessThan(1e9);
  });

  it('pins the shipped step: the first ranks (change the row when the step changes)', () => {
    const pinned: Record<number, number> = {
      1: 10_000,
      2: 14_000,
      3: 19_600,
      4: 27_440,
      5: 38_416,
      6: 53_782,
      7: 75_294,
      8: 105_411,
    };
    const step: number = RULES.raid.scaling.rankStepBp;
    if (step !== 4_000) throw new Error('pin the new step here');
    for (const [rank, bp] of Object.entries(pinned)) expect(rankFactorBp(Number(rank))).toBe(bp);
  });

  it('gives Attack the share of the excess that the rules say', () => {
    expect(rankAtkFactorBp(1)).toBe(10_000);
    const share = RULES.raid.scaling.atkRankShareBp;
    for (const r of [2, 5, 12]) {
      expect(rankAtkFactorBp(r)).toBe(
        10_000 + Math.floor(((rankFactorBp(r) - 10_000) * share) / 10_000),
      );
      expect(rankAtkFactorBp(r)).toBeLessThan(rankFactorBp(r));
    }
  });
});

describe('bossAttacksAtRank', () => {
  it('reads the table by rank, the last entry holding above its end, always from 1 to 3', () => {
    const table = RULES.raid.scaling.bossAttacksByRank;
    expect(table.length).toBeGreaterThanOrEqual(1);
    for (const n of table) expect([1, 2, 3]).toContain(n);
    for (let r = 1; r <= RULES.raid.scaling.maxRank + 5; r++) {
      expect(bossAttacksAtRank(r)).toBe(table[Math.min(r, table.length) - 1]);
    }
    // Odd ranks are read as 1 or the top rank.
    expect(bossAttacksAtRank(0)).toBe(table[0]);
    expect(bossAttacksAtRank(Number.NaN)).toBe(table[0]);
    expect(bossAttacksAtRank(2.9)).toBe(bossAttacksAtRank(2));
  });
});

describe('placementRank', () => {
  const legacy = (avg: number) => 10_000 + P.placement.legacyHpPerLevelBp * (avg - 1);

  it('is rank 1 for an empty roster and for level-1 creatures', () => {
    expect(placementRank([])).toBe(1);
    expect(placementRank([1, 1, 1])).toBe(1);
    expect(placementRank([0, -3])).toBe(1);
  });

  it('gives the rank whose boss is closest to what the old per-level rule gave', () => {
    for (let avg = 1; avg <= 40; avg++) {
      const rank = placementRank([avg, avg, avg]);
      const diff = (r: number) => Math.abs(rankFactorBp(r) - legacy(avg));
      expect(diff(rank)).toBeLessThanOrEqual(diff(Math.max(1, rank - 1)));
      expect(diff(rank)).toBeLessThanOrEqual(diff(rank + 1));
    }
  });

  it('is monotone in the average level and floors the average like the old rule', () => {
    let prev = 1;
    for (let avg = 1; avg <= 60; avg++) {
      const r = placementRank([avg]);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    expect(placementRank([10, 11, 11])).toBe(placementRank([10, 10, 10]));
  });

  it('depends only on the average: one veteran in a roster of newcomers moves it a little', () => {
    const newcomers = Array.from({ length: 14 }, () => 2);
    expect(placementRank([...newcomers, 30])).toBeLessThanOrEqual(placementRank([4, 4, 4]) + 1);
  });
});

describe('seasons', () => {
  it('is 4 normal weeks and then a Festival, from the week index alone', () => {
    expect(P.seasonWeeks).toBe(5);
    const flags = Array.from({ length: 12 }, (_, w) => seasonOf(w).festival);
    expect(flags).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(seasonOf(0)).toEqual({ seasonIndex: 0, weekInSeason: 0, festival: false });
    expect(seasonOf(9)).toEqual({ seasonIndex: 1, weekInSeason: 4, festival: true });
    expect(seasonOf(2_950)).toEqual({ seasonIndex: 590, weekInSeason: 0, festival: false });
  });

  it('has exactly one Festival in every 5 consecutive weeks, wherever a server starts', () => {
    for (let start = 0; start < 12; start++) {
      let n = 0;
      for (let w = start; w < start + 5; w++) if (seasonOf(w).festival) n += 1;
      expect(n).toBe(1);
    }
  });

  it('rejects a bad week index', () => {
    expect(() => seasonOf(-1)).toThrow(RangeError);
    expect(() => seasonOf(1.5)).toThrow(RangeError);
  });

  it('eases the Festival boss by festivalEaseRanks, never below rank 1', () => {
    expect(raidWeekPlan(0, 7)).toMatchObject({ festival: false, rank: 7, effectiveRank: 7 });
    expect(raidWeekPlan(4, 7)).toMatchObject({
      festival: true,
      rank: 7,
      effectiveRank: 7 - P.festivalEaseRanks,
    });
    expect(raidWeekPlan(4, 2).effectiveRank).toBe(1);
    expect(raidWeekPlan(4, 1).effectiveRank).toBe(1);
    expect(raidWeekPlan(4, 0).rank).toBe(1);
  });
});

describe('the ladder', () => {
  it('adds a rank on a normal win and changes nothing on a loss (no demotion)', () => {
    expect(nextRank(5, 0, true)).toBe(5 + P.winRankUp);
    expect(nextRank(5, 0, false)).toBe(5);
    expect(nextRank(1, 1, false)).toBe(1);
    expect(nextRank(1, 1, true)).toBe(2);
  });

  it('eases the rank after every Festival, win or loss, but never below 1', () => {
    expect(nextRank(8, 4, false)).toBe(8 - P.seasonResetRanks);
    expect(nextRank(8, 4, true)).toBe(8 + P.festivalWinRankUp - P.seasonResetRanks);
    expect(nextRank(1, 4, false)).toBe(1);
    expect(nextRank(1, 4, true)).toBe(Math.max(1, 1 + P.festivalWinRankUp - P.seasonResetRanks));
  });

  it('stays inside 1..maxRank and over a long run is at least 1 after any results', () => {
    const max = RULES.raid.scaling.maxRank;
    expect(nextRank(max, 0, true)).toBe(max);
    let rank = 1;
    for (let w = 0; w < 200; w++) {
      rank = nextRank(rank, w, w % 3 !== 0);
      expect(rank).toBeGreaterThanOrEqual(1);
      expect(rank).toBeLessThanOrEqual(max);
    }
  });
});

describe('rewards', () => {
  it('multiplies Essence by 1 + rankRewardBp x (rank - 1), capped, and by the Festival bonus on top', () => {
    expect(essenceMultiplierBp({ rank: 1, festival: false })).toBe(10_000);
    expect(essenceMultiplierBp({ rank: 6, festival: false })).toBe(10_000 + P.rankRewardBp * 5);
    expect(essenceMultiplierBp({ rank: 1000, festival: false })).toBe(P.rankRewardCapBp);
    expect(essenceMultiplierBp({ rank: 1, festival: true })).toBe(10_000 + P.festivalEssenceBp);
    expect(essenceMultiplierBp({ rank: 1000, festival: true })).toBe(
      Math.floor((P.rankRewardCapBp * (10_000 + P.festivalEssenceBp)) / 10_000),
    );
    for (let r = 2; r <= 40; r++) {
      expect(essenceMultiplierBp({ rank: r, festival: false })).toBeGreaterThanOrEqual(
        essenceMultiplierBp({ rank: r - 1, festival: false }),
      );
    }
  });

  it('scales stage Essence and keeps the 70/30 pool exact', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const weights = { a: 5, b: 4, c: 3, d: 2, e: 1 };
    const base = essenceForStage('finale', ids, weights);
    expect(essenceForStage('finale', ids, weights, { rank: 1, festival: false })).toEqual(base);
    for (const week of [
      { rank: 4, festival: false },
      { rank: 9, festival: true },
    ]) {
      const out = essenceForStage('finale', ids, weights, week);
      const flat = scaleEssence(RULES.raid.essence.flat.finale, week);
      const pool = Math.floor((flat * ids.length * RULES.raid.essence.poolBp) / 10_000);
      expect(Object.values(out).reduce((a, b) => a + b, 0)).toBe(flat * ids.length + pool);
      for (const id of ids) expect(out[id]).toBeGreaterThanOrEqual(flat);
      expect(out.a).toBeGreaterThan(base.a as number);
    }
  });

  it('scales the jackpot the same way', () => {
    expect(jackpotEssenceFor({ rank: 1, festival: false })).toBe(RULES.raid.jackpotEssence);
    expect(jackpotEssenceFor({ rank: 6, festival: false })).toBe(
      Math.floor((RULES.raid.jackpotEssence * (10_000 + P.rankRewardBp * 5)) / 10_000),
    );
    expect(jackpotEssenceFor({ rank: 6, festival: true })).toBeGreaterThan(
      jackpotEssenceFor({ rank: 6, festival: false }),
    );
  });
});

describe('Festival creature', () => {
  it('is none in a normal week and rotates with the season in a Festival week', () => {
    for (let w = 0; w < 4; w++) expect(festivalCreatureFor(w)).toBeNull();
    const ids = [4, 9, 14, 19, 24, 29].map((w) => festivalCreatureFor(w)?.id);
    expect(ids).toEqual([
      'lanternfin',
      'hearthshell',
      'lanternfin',
      'hearthshell',
      'lanternfin',
      'hearthshell',
    ]);
    // Every week of a season names the same creature (it is the season's).
    expect(festivalCreatureFor(4)).toBe(festivalCreatureFor(4));
  });

  it('is none when the content has no festival species', () => {
    const pack = {
      ...content,
      creatures: content.creatures.filter((c) => c.festival !== true),
    } as ContentPack;
    expect(festivalCreatureFor(4, pack)).toBeNull();
  });

  it('gives the usual duplicate handling: new, fusion, then Bait by rarity, never shiny', () => {
    const species = festivalCreatureFor(4);
    if (species === null) throw new Error('no festival creature');
    expect(festivalGrantOutcome(undefined, species)).toEqual({ kind: 'new' });
    expect(festivalGrantOutcome({ fusionCount: 0, shiny: false }, species)).toEqual({
      kind: 'fused',
      newFusionCount: 1,
      becameShiny: false,
    });
    expect(
      festivalGrantOutcome({ fusionCount: RULES.fusion.maxFusions, shiny: true }, species),
    ).toEqual({
      kind: 'converted',
      bait: RULES.fusion.convertBait[species.rarity],
      becameShiny: false,
    });
  });
});

describe('readiness band', () => {
  const r = P.readiness;
  const at = (marginBp: number) => readinessBand({ damage: marginBp, hpLeft: 10_000 });

  it('maps the margin to the four bands at the configured thresholds', () => {
    expect(at(0)).toBe('long_shot');
    expect(at(r.evenFromBp - 1)).toBe('long_shot');
    expect(at(r.evenFromBp)).toBe('even');
    expect(at(r.likelyFromBp - 1)).toBe('even');
    expect(at(r.likelyFromBp)).toBe('likely');
    expect(at(r.strongFromBp - 1)).toBe('likely');
    expect(at(r.strongFromBp)).toBe('strong');
    expect(at(10 * r.strongFromBp)).toBe('strong');
  });

  it('has increasing thresholds', () => {
    expect(r.evenFromBp).toBeLessThan(r.likelyFromBp);
    expect(r.likelyFromBp).toBeLessThan(r.strongFromBp);
  });

  it('treats nothing left as strong and negative damage as none', () => {
    expect(readinessBand({ damage: 0, hpLeft: 0 })).toBe('strong');
    expect(forecastMarginBp({ damage: -5, hpLeft: 100 })).toBe(0);
    expect(forecastMarginBp({ damage: 150, hpLeft: 100 })).toBe(15_000);
  });

  it('is monotone in the damage', () => {
    const order = ['long_shot', 'even', 'likely', 'strong'];
    let prev = 0;
    for (let d = 0; d <= 30_000; d += 250) {
      const i = order.indexOf(readinessBand({ damage: d, hpLeft: 10_000 }));
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });
});
