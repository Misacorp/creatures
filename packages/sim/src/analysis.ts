import { ELEMENTS, content, type Element, type Rarity } from '@creatures/game';
import { ARCHETYPES, type ArchetypeId } from './archetypes';
import type { EconomyResult, PlayerHistory, WeekRecord } from './economy';
import type { RunRecord, SweepResult } from './sweep';
import { mean, median, percentile, sum } from './util';

/** Fewest raid appearances before a creature's average contribution is compared. */
export const MIN_CREATURE_APPEARANCES = 20;
/** An element picked in fewer than this share of raid slots is "dead". */
export const DEAD_ELEMENT_PICK_RATE = 0.1;

export interface AnalysisInput {
  weeks: number;
  /** Economy sims of the default-size server (progression tables and economy targets). */
  defaultSims: readonly EconomyResult[];
  /** Longer sims used for the jackpot and pity targets. */
  pitySims: readonly EconomyResult[];
  sweep: SweepResult;
}

export interface CellStats {
  count: number;
  boss: string;
  runs: number;
  avgSignedUp: number;
  phase1ClearRate: number;
  phase2ClearRate: number;
  finaleWinRate: number;
  /** Average share of the boss pool lost after each stage. */
  avgLoss: { phase1: number; phase2: number; finale: number };
  reactionsPerRound: number;
  topShareMedian: number | null;
}

export interface TypicalBossStats {
  boss: string;
  runs: number;
  phase1ClearRate: number;
  phase2ClearRate: number;
  finaleWinRate: number;
  avgLoss: { phase1: number; phase2: number; finale: number };
}

export interface CreatureStats {
  line: string;
  name: string;
  rarity: Rarity;
  element: Element;
  role: string;
  appearances: number;
  pickRate: number;
  avgLevel: number;
  avgContribution: number;
  /** Average contribution relative to the median creature of the same rarity; null if too few picks. */
  ratio: number | null;
}

export interface ProgressionRow {
  week: number;
  players: number;
  baitEarned: number;
  baitConverted: number;
  baitSpentExpeditions: number;
  baitSpentTraining: number;
  speciesOwned: number;
  top3Power: number;
  maxLevel: number;
  evolved: number;
  essenceEarned: number;
  essence: number;
  jackpots: number;
  pity: number;
}

export interface Outliers {
  dominantCreatures: string[];
  weakCreatures: string[];
  deadElements: string[];
  unbeatableBosses: string[];
  trivialBosses: string[];
  /** Boss and player count combinations where the finale is never or always won. */
  extremeCells: string[];
}

export interface Analysis {
  metrics: Record<string, number | null>;
  cells: CellStats[];
  typicalByBoss: TypicalBossStats[];
  progression: Record<ArchetypeId, ProgressionRow[]>;
  elements: { element: Element; picks: number; pickRate: number }[];
  creatures: CreatureStats[];
  archetypeShares: { archetype: ArchetypeId; avgShare: number | null; avgEssence: number | null }[];
  essence: {
    count: number;
    samples: number;
    mean: number;
    p10: number;
    p50: number;
    p90: number;
    max: number;
  }[];
  jackpots: {
    source: string;
    rolls: number;
    hits: number;
    rate: number | null;
    guaranteed: number;
  }[];
  outliers: Outliers;
}

const rate = (records: readonly RunRecord[], f: (r: RunRecord) => boolean): number | null =>
  records.length === 0 ? null : records.filter(f).length / records.length;

export function isTypical(r: RunRecord): boolean {
  return r.signedUp >= 5 && r.signedUp <= 10;
}

function avgLoss(records: readonly RunRecord[]): {
  phase1: number;
  phase2: number;
  finale: number;
} {
  return {
    phase1: mean(records.map((r) => r.loss1)) ?? 0,
    phase2: mean(records.map((r) => r.loss2)) ?? 0,
    finale: mean(records.map((r) => r.lossFinale)) ?? 0,
  };
}

function weekRecord(h: PlayerHistory, week: number): WeekRecord | undefined {
  return h.weeks.find((w) => w.week === week);
}

function playersOf(sims: readonly EconomyResult[], archetype: ArchetypeId): PlayerHistory[] {
  return sims.flatMap((s) => s.players.filter((p) => p.archetype === archetype));
}

function valuesAt(
  sims: readonly EconomyResult[],
  archetype: ArchetypeId,
  week: number,
  f: (w: WeekRecord) => number,
): number[] {
  const out: number[] = [];
  for (const p of playersOf(sims, archetype)) {
    const w = weekRecord(p, week);
    if (w !== undefined) out.push(f(w));
  }
  return out;
}

function progression(
  sims: readonly EconomyResult[],
  weeks: number,
): Record<ArchetypeId, ProgressionRow[]> {
  const out = {} as Record<ArchetypeId, ProgressionRow[]>;
  for (const a of ARCHETYPES) {
    const rows: ProgressionRow[] = [];
    for (let week = 1; week <= weeks; week++) {
      const ws = playersOf(sims, a)
        .map((p) => weekRecord(p, week))
        .filter((w): w is WeekRecord => w !== undefined);
      if (ws.length === 0) continue;
      const avg = (f: (w: WeekRecord) => number): number => mean(ws.map(f)) ?? 0;
      rows.push({
        week,
        players: ws.length,
        baitEarned: avg((w) => w.baitEarned),
        baitConverted: avg((w) => w.baitConverted),
        baitSpentExpeditions: avg((w) => w.baitSpentExpeditions),
        baitSpentTraining: avg((w) => w.baitSpentTraining),
        speciesOwned: avg((w) => w.speciesOwned),
        top3Power: avg((w) => w.top3Power),
        maxLevel: avg((w) => w.maxLevel),
        evolved: avg((w) => w.evolved),
        essenceEarned: avg((w) => w.essenceEarned),
        essence: avg((w) => w.essence),
        jackpots: avg((w) => w.jackpots),
        pity: avg((w) => w.pity),
      });
    }
    out[a] = rows;
  }
  return out;
}

export function analyse(input: AnalysisInput): Analysis {
  const { sweep, defaultSims, pitySims, weeks } = input;
  const records = sweep.records;
  const metrics: Record<string, number | null> = {
    'choice.elementPickRateMin': null,
    'choice.elementPickRateMax': null,
    'choice.deadElements': null,
  };

  // ---- raid outcomes ----
  const typical = records.filter(isTypical);
  metrics['raid.typical.phase1ClearRate'] = rate(typical, (r) => r.phase1);
  metrics['raid.typical.phase2ClearRate'] = rate(typical, (r) => r.phase2);
  metrics['raid.typical.finaleWinRate'] = rate(typical, (r) => r.win);
  metrics['raid.solo.phase1ClearRate'] = rate(
    records.filter((r) => r.count === 1),
    (r) => r.phase1,
  );
  metrics['raid.fifteen.finaleWinRate'] = rate(
    records.filter((r) => r.count === 15),
    (r) => r.win,
  );

  const typicalByBoss: TypicalBossStats[] = [];
  for (const boss of content.bosses) {
    const rs = typical.filter((r) => r.boss === boss.id);
    if (rs.length === 0) continue;
    typicalByBoss.push({
      boss: boss.id,
      runs: rs.length,
      phase1ClearRate: rate(rs, (r) => r.phase1) ?? 0,
      phase2ClearRate: rate(rs, (r) => r.phase2) ?? 0,
      finaleWinRate: rate(rs, (r) => r.win) ?? 0,
      avgLoss: avgLoss(rs),
    });
  }
  const wins = typicalByBoss.map((b) => b.finaleWinRate);
  metrics['raid.typical.bossSpread'] =
    wins.length < 2 ? null : Math.max(...wins) - Math.min(...wins);
  metrics['raid.typical.extremeBosses'] =
    wins.length === 0
      ? null
      : typicalByBoss.filter((b) => b.finaleWinRate === 0 || b.finaleWinRate === 1).length;

  // ---- fairness ----
  const big = records.filter((r) => r.signedUp >= 5);
  metrics['fair.topShareMedian'] = median(
    big.map((r) => r.topShare).filter((x): x is number => x !== null),
  );
  const bigContribution = sum(big.map((r) => r.contribution));
  metrics['fair.setupShare'] =
    bigContribution === 0 ? null : sum(big.map((r) => r.setup)) / bigContribution;
  const bigRounds = sum(big.map((r) => r.rounds));
  metrics['fair.reactionsPerRound'] =
    bigRounds === 0 ? null : sum(big.map((r) => r.reactions)) / bigRounds;

  // ---- cells ----
  const cells: CellStats[] = [];
  const counts = [...new Set(records.map((r) => r.count))].sort((a, b) => a - b);
  for (const boss of content.bosses) {
    for (const count of counts) {
      const rs = records.filter((r) => r.boss === boss.id && r.count === count);
      if (rs.length === 0) continue;
      const rounds = sum(rs.map((r) => r.rounds));
      cells.push({
        count,
        boss: boss.id,
        runs: rs.length,
        avgSignedUp: mean(rs.map((r) => r.signedUp)) ?? 0,
        phase1ClearRate: rate(rs, (r) => r.phase1) ?? 0,
        phase2ClearRate: rate(rs, (r) => r.phase2) ?? 0,
        finaleWinRate: rate(rs, (r) => r.win) ?? 0,
        avgLoss: avgLoss(rs),
        reactionsPerRound: rounds === 0 ? 0 : sum(rs.map((r) => r.reactions)) / rounds,
        topShareMedian: median(rs.map((r) => r.topShare).filter((x): x is number => x !== null)),
      });
    }
  }

  // ---- elements ----
  const totalPicks = sum(ELEMENTS.map((e) => sweep.elementPicks[e]));
  const elements = ELEMENTS.map((element) => ({
    element,
    picks: sweep.elementPicks[element],
    pickRate: totalPicks === 0 ? 0 : sweep.elementPicks[element] / totalPicks,
  }));
  if (totalPicks > 0) {
    const rates = elements.map((e) => e.pickRate);
    metrics['choice.elementPickRateMin'] = Math.min(...rates);
    metrics['choice.elementPickRateMax'] = Math.max(...rates);
    metrics['choice.deadElements'] = rates.filter((r) => r < DEAD_ELEMENT_PICK_RATE).length;
  }

  // ---- creatures ----
  const creatures: CreatureStats[] = [];
  for (const [line, agg] of Object.entries(sweep.creatures)) {
    const stage1 = content.creatures.find((c) => c.line === line && c.stage === 1);
    if (stage1 === undefined) continue;
    creatures.push({
      line,
      name: stage1.name,
      rarity: stage1.rarity,
      element: stage1.element,
      role: stage1.role,
      appearances: agg.appearances,
      pickRate: totalPicks === 0 ? 0 : agg.appearances / totalPicks,
      avgLevel: agg.levelSum / agg.appearances,
      avgContribution: agg.contribution / agg.appearances,
      ratio: null,
    });
  }
  creatures.sort((a, b) => (a.line < b.line ? -1 : 1));
  for (const rarity of ['common', 'rare', 'epic'] as const) {
    const group = creatures.filter(
      (c) => c.rarity === rarity && c.appearances >= MIN_CREATURE_APPEARANCES,
    );
    const med = median(group.map((c) => c.avgContribution));
    if (med === null || med === 0) continue;
    for (const c of group) c.ratio = c.avgContribution / med;
  }
  const ratios = creatures.map((c) => c.ratio).filter((x): x is number => x !== null);
  metrics['choice.creatureRatioMax'] = ratios.length === 0 ? null : Math.max(...ratios);
  metrics['choice.creatureRatioMin'] = ratios.length === 0 ? null : Math.min(...ratios);

  // ---- economy ----
  const casualWeek4 = valuesAt(defaultSims, 'casual', 4, (w) => w.maxLevel);
  metrics['econ.casualTopLevelWeek4'] = median(casualWeek4);
  metrics['econ.dailySpeciesWeek6'] = median(
    valuesAt(defaultSims, 'daily', 6, (w) => w.speciesOwned),
  );
  const topPower = mean(valuesAt(defaultSims, 'top', 8, (w) => w.top3Power));
  const casualPower = mean(valuesAt(defaultSims, 'casual', 8, (w) => w.top3Power));
  metrics['econ.powerRatioTopVsCasualWeek8'] =
    topPower === null || casualPower === null || casualPower === 0 ? null : topPower / casualPower;
  const newcomerEssence = mean(valuesAt(defaultSims, 'newcomer', 6, (w) => w.essenceEarned));
  const topEssence = mean(valuesAt(defaultSims, 'top', 6, (w) => w.essenceEarned));
  metrics['econ.newcomerEssenceRatioWeek6'] =
    newcomerEssence === null || topEssence === null || topEssence === 0
      ? null
      : newcomerEssence / topEssence;

  const pityRaids = pitySims.flatMap((s) => s.raids.map((r) => r.summary));
  const pityRolls = sum(pityRaids.map((r) => r.jackpot.rolls));
  metrics['econ.jackpotRatePerWin'] =
    pityRolls === 0 ? null : sum(pityRaids.map((r) => r.jackpot.hits)) / pityRolls;
  const longRunPlayers = pitySims.flatMap((s) => s.players.filter((p) => p.joinWeek === 1));
  metrics['econ.hardPityShare20Weeks'] =
    longRunPlayers.length === 0
      ? null
      : longRunPlayers.filter((p) => p.maxPity >= 9).length / longRunPlayers.length;

  // ---- archetype contribution ----
  const archetypeShares = ARCHETYPES.map((archetype) => {
    const a = sweep.archetypes[archetype];
    return {
      archetype,
      avgShare: a.playerWeeks === 0 ? null : a.shareSum / a.playerWeeks,
      avgEssence: a.playerWeeks === 0 ? null : a.essenceSum / a.playerWeeks,
    };
  });

  // ---- essence and jackpots ----
  const essence = Object.entries(sweep.essenceByCount)
    .map(([count, values]) => ({
      count: Number(count),
      samples: values.length,
      mean: mean(values) ?? 0,
      p10: percentile(values, 10) ?? 0,
      p50: percentile(values, 50) ?? 0,
      p90: percentile(values, 90) ?? 0,
      max: Math.max(0, ...values),
    }))
    .sort((a, b) => a.count - b.count);
  const jackpots: Analysis['jackpots'] = [];
  for (const count of counts) {
    const rs = records.filter((r) => r.count === count);
    const rolls = sum(rs.map((r) => r.jackpotRolls));
    jackpots.push({
      source: `sweep, ${count} players`,
      rolls,
      hits: sum(rs.map((r) => r.jackpotHits)),
      rate: rolls === 0 ? null : sum(rs.map((r) => r.jackpotHits)) / rolls,
      guaranteed: sum(rs.map((r) => r.jackpotGuaranteed)),
    });
  }
  jackpots.push({
    source: `economy sims, ${Math.max(0, ...pitySims.map((s) => s.raids.length))} raid weeks each`,
    rolls: pityRolls,
    hits: sum(pityRaids.map((r) => r.jackpot.hits)),
    rate: metrics['econ.jackpotRatePerWin'] ?? null,
    guaranteed: sum(pityRaids.map((r) => r.jackpot.guaranteed)),
  });

  // ---- outliers ----
  const outliers: Outliers = {
    dominantCreatures: creatures
      .filter((c) => c.ratio !== null && c.ratio > 1.6)
      .map((c) => c.name),
    weakCreatures: creatures.filter((c) => c.ratio !== null && c.ratio < 0.6).map((c) => c.name),
    deadElements: elements.filter((e) => e.pickRate < DEAD_ELEMENT_PICK_RATE).map((e) => e.element),
    unbeatableBosses: typicalByBoss.filter((b) => b.finaleWinRate === 0).map((b) => b.boss),
    trivialBosses: typicalByBoss.filter((b) => b.finaleWinRate === 1).map((b) => b.boss),
    extremeCells: cells
      .filter((c) => c.finaleWinRate === 0 || c.finaleWinRate === 1)
      .map(
        (c) =>
          `${c.boss} with ${c.count} player${c.count === 1 ? '' : 's'}: ${c.finaleWinRate === 0 ? 'never won' : 'always won'}`,
      ),
  };

  return {
    metrics,
    cells,
    typicalByBoss,
    progression: progression(defaultSims, weeks),
    elements,
    creatures,
    archetypeShares,
    essence,
    jackpots,
    outliers,
  };
}
