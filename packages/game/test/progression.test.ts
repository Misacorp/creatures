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
  rankRow,
  bossCritBonusAtRank,
  luckAtRank,
  raidWeekPlan,
  readinessBand,
  scaleEssence,
  seasonOf,
  type ContentPack,
} from '../src/index';

const P = RULES.progression;

describe('the raid curve (RULES.raid.curve)', () => {
  const { ranks, beyond } = RULES.raid.curve;

  it('has a table from rank 1, whole numbers only, rank 1 without a crit bonus or a second attack', () => {
    expect(ranks.length).toBeGreaterThanOrEqual(10);
    expect(ranks.length).toBeLessThanOrEqual(RULES.raid.scaling.maxRank);
    expect(ranks[0]).toMatchObject({ bossAttacks: 1, critBonusBp: 0 });
    for (const row of ranks) {
      for (const n of [row.hpBp, row.atkBp, row.bossAttacks, row.critBonusBp]) {
        expect(Number.isSafeInteger(n)).toBe(true);
      }
      expect([1, 2, 3]).toContain(row.bossAttacks);
      expect(row.critBonusBp).toBeGreaterThanOrEqual(0);
      expect(row.hpBp).toBeGreaterThan(0);
      expect(row.atkBp).toBeGreaterThan(0);
    }
  });

  it('never gets easier with rank: HP, Attack, boss attacks and crit bonus never go down', () => {
    for (let r = 2; r <= RULES.raid.scaling.maxRank; r++) {
      const a = rankRow(r - 1);
      const b = rankRow(r);
      expect(b.hpBp).toBeGreaterThanOrEqual(a.hpBp);
      expect(b.atkBp).toBeGreaterThanOrEqual(a.atkBp);
      expect(b.bossAttacks).toBeGreaterThanOrEqual(a.bossAttacks);
      expect(b.critBonusBp).toBeGreaterThanOrEqual(a.critBonusBp);
    }
  });

  it('reads the table by rank, and HP and Attack are independent numbers', () => {
    ranks.forEach((row, i) => {
      expect(rankFactorBp(i + 1)).toBe(row.hpBp);
      expect(rankAtkFactorBp(i + 1)).toBe(row.atkBp);
      expect(bossAttacksAtRank(i + 1)).toBe(row.bossAttacks);
      expect(bossCritBonusAtRank(i + 1)).toBe(row.critBonusBp);
    });
    expect(ranks.some((row) => row.atkBp !== row.hpBp)).toBe(true);
  });

  it('grows past the table by the documented steps, compounding with a floor at every step', () => {
    const last = ranks[ranks.length - 1];
    expect(last).toBeDefined();
    let hp = last?.hpBp ?? 0;
    let atk = last?.atkBp ?? 0;
    for (let r = ranks.length + 1; r <= RULES.raid.scaling.maxRank; r++) {
      hp = Math.floor((hp * (10_000 + beyond.hpStepBp)) / 10_000);
      atk = Math.floor((atk * (10_000 + beyond.atkStepBp)) / 10_000);
      expect(rankFactorBp(r)).toBe(hp);
      expect(rankAtkFactorBp(r)).toBe(atk);
      expect(bossAttacksAtRank(r)).toBe(last?.bossAttacks);
      expect(bossCritBonusAtRank(r)).toBe(last?.critBonusBp);
    }
    // Gentle: far past the table nothing runs away (a step is at most a tenth).
    expect(beyond.hpStepBp).toBeLessThanOrEqual(1_000);
    expect(beyond.atkStepBp).toBeLessThanOrEqual(1_000);
  });

  it('clamps and floors the rank, and stays a safe integer at the top rank', () => {
    const rank1 = ranks[0]?.hpBp;
    expect(rankFactorBp(0)).toBe(rank1);
    expect(rankFactorBp(-4)).toBe(rank1);
    expect(rankFactorBp(Number.NaN)).toBe(rank1);
    expect(rankFactorBp(2.9)).toBe(rankFactorBp(2));
    expect(rankAtkFactorBp(2.9)).toBe(rankAtkFactorBp(2));
    expect(bossAttacksAtRank(0)).toBe(1);
    expect(bossAttacksAtRank(2.9)).toBe(bossAttacksAtRank(2));
    expect(rankFactorBp(1000)).toBe(rankFactorBp(RULES.raid.scaling.maxRank));
    expect(rankAtkFactorBp(1000)).toBe(rankAtkFactorBp(RULES.raid.scaling.maxRank));
    // The factor stays small enough for exact integer products with any boss HP.
    expect(rankFactorBp(1000)).toBeLessThan(1e9);
  });

  it('a safe default for an emptied table, and returns copies that cannot change the rules', () => {
    const shipped = RULES.raid.curve.ranks.splice(0);
    try {
      expect(rankRow(5)).toEqual({ hpBp: 10_000, atkBp: 10_000, bossAttacks: 1, critBonusBp: 0 });
    } finally {
      RULES.raid.curve.ranks.push(...shipped);
    }
    const copy = rankRow(2);
    copy.hpBp = 1;
    expect(rankFactorBp(2)).not.toBe(1);
  });

  it('adds the crit bonus to the boss crit chance only, and returns the same luck when it is 0', () => {
    const luck = RULES.combat.luck;
    expect(luckAtRank(luck, 1)).toBe(luck);
    for (let r = 1; r <= 20; r++) {
      const at = luckAtRank(luck, r);
      expect(at.bossCritChanceBp).toBe((luck.bossCritChanceBp ?? 0) + bossCritBonusAtRank(r));
      expect({ ...at, bossCritChanceBp: 0 }).toEqual({ ...luck, bossCritChanceBp: 0 });
    }
  });
});

describe('placementRank', () => {
  it('puts every new server at the start rank, whatever its creatures', () => {
    expect(P.placement.startRank).toBe(1);
    expect(placementRank([])).toBe(1);
    expect(placementRank([1, 1, 1])).toBe(1);
    expect(placementRank([0, -3])).toBe(1);
    expect(placementRank([30, 30, 30])).toBe(1);
    expect(placementRank([5, 12, 20, 3])).toBe(P.placement.startRank);
  });

  it('keeps the start rank inside 1..maxRank', () => {
    const shipped = P.placement.startRank;
    const placement = P.placement as { startRank: number };
    try {
      placement.startRank = 0;
      expect(placementRank([9])).toBe(1);
      placement.startRank = 999;
      expect(placementRank([9])).toBe(RULES.raid.scaling.maxRank);
    } finally {
      placement.startRank = shipped;
    }
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
