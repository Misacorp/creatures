import { ELEMENTS, content, type Element, type GearRarity, type Rarity } from '@creatures/game';
import { gearPowerOf } from './gear';
import { pickTeam } from './data';
import { ARCHETYPES, type ArchetypeId } from './archetypes';
import type { EconomyResult, PlayerHistory, WeekRecord } from './economy';
import { analyseLongRun, type LongRunInput, type LongRunStats } from './ladder';
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
  /** Long-run sims (the ladder and Festivals) per server size. */
  longRun: readonly LongRunInput[];
  /** The same default-server sims (same seeds) played without gear: "today" for the Essence targets. */
  baselineSims?: readonly EconomyResult[];
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
  /** A Festival-only species: compared with the catchable median but left out of the balance targets. */
  festival: boolean;
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
  /** Power the worn gear adds to the top 3, and its share of the top-3 power. */
  gearPower: number;
  gearShare: number;
  /** Upgrade levels on the team's items, crafts claimed so far, Essence spent on upgrades that week. */
  gearLevels: number;
  crafted: number;
  essenceSpentGear: number;
  /** Highest Crafting level, and scrap held. */
  skillLevel: number;
  scrap: number;
}

/** Daily players' Essence held and weekly changes, with gear and without (today). */
export interface GearComparisonRow {
  week: number;
  essenceWithGear: number;
  essenceToday: number;
  top3PowerWithGear: number;
  top3PowerToday: number;
}

/** The items on the team at a snapshot week: what the daily players, say, actually wear. */
export interface WornRow {
  archetype: ArchetypeId;
  week: number;
  players: number;
  /** Share of the team's items by rarity (0 to 1). */
  rarity: Record<GearRarity, number>;
  /** Average upgrade level, enchant share and power added per worn item. */
  level: number;
  enchanted: number;
  power: number;
  /** Average items in the bag, blueprints known, parts (scrap, shards, glimmer) held. */
  bag: number;
  blueprints: number;
  scrap: number;
  shards: number;
  glimmer: number;
}

/** What abilities add to the finale damage of one group of raid weeks (informational, no target). */
export interface AbilityShareRow {
  /** The roster snapshot week the groups were built from. */
  snapshotWeek: number;
  group: string;
  runs: number;
  /** Average creature abilities brought per raid (level 10 or above). */
  creatureAbilities: number;
  /** Share of finale damage added by the creature abilities (all abilities vs basic only). */
  creatureShare: number | null;
  /** Share of finale damage added by the basic abilities (basic only vs none). */
  basicShare: number | null;
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
  abilityShares: AbilityShareRow[];
  gearComparison: GearComparisonRow[];
  worn: WornRow[];
  longRun: LongRunStats[];
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
        gearPower: avg((w) => w.gearPower),
        gearShare: avg((w) => (w.top3Power === 0 ? 0 : w.gearPower / w.top3Power)),
        gearLevels: avg((w) => w.gearLevels),
        crafted: avg((w) => w.crafted),
        essenceSpentGear: avg((w) => w.essenceSpentGear),
        skillLevel: avg((w) => w.skillLevel),
        scrap: avg((w) => w.scrap),
      });
    }
    out[a] = rows;
  }
  return out;
}

/**
 * The gear and crafting measures of the default server's daily players (and the newcomer), with the
 * same sims played without gear as "today" for the Essence measures. Used by the analysis and by the
 * gear tuning CLI.
 */
export function gearMetrics(
  defaultSims: readonly EconomyResult[],
  baselineSims: readonly EconomyResult[],
  weeks: number,
): { metrics: Record<string, number | null>; comparison: GearComparisonRow[] } {
  const metrics: Record<string, number | null> = {};
  const dailies = playersOf(defaultSims, 'daily');
  const shareAt = (h: PlayerHistory, week: number): number | null => {
    const w = weekRecord(h, week);
    return w === undefined || w.top3Power === 0 ? null : w.gearPower / w.top3Power;
  };
  metrics['gear.dailyShareWeek8'] = median(
    dailies.map((h) => shareAt(h, 8)).filter((x): x is number => x !== null),
  );
  // A player who never crafted counts as 99 days.
  const firstCraft = dailies.map((h) => h.firstCraftAfterDays ?? 99);
  metrics['gear.dailyFirstCraftDaysP90'] = percentile(firstCraft, 90);
  metrics['gear.dailyBestSkillDay30'] = median(
    dailies.map((h) => h.bestSkillDay30).filter((x): x is number => x !== null),
  );
  const newcomerGear = median(valuesAt(defaultSims, 'newcomer', 8, (w) => w.gearPower));
  const dailyGear = median(valuesAt(defaultSims, 'daily', 8, (w) => w.gearPower));
  metrics['gear.newcomerCatchUpWeek8'] =
    newcomerGear === null || dailyGear === null || dailyGear === 0
      ? null
      : newcomerGear / dailyGear;
  const gearComparison: GearComparisonRow[] = [];
  if (baselineSims.length > 0) {
    for (let week = 1; week <= weeks; week++) {
      const on = valuesAt(defaultSims, 'daily', week, (w) => w.essence);
      const off = valuesAt(baselineSims, 'daily', week, (w) => w.essence);
      const powerOn = valuesAt(defaultSims, 'daily', week, (w) => w.top3Power);
      const powerOff = valuesAt(baselineSims, 'daily', week, (w) => w.top3Power);
      if (on.length === 0 || off.length === 0) continue;
      gearComparison.push({
        week,
        essenceWithGear: mean(on) ?? 0,
        essenceToday: mean(off) ?? 0,
        top3PowerWithGear: mean(powerOn) ?? 0,
        top3PowerToday: mean(powerOff) ?? 0,
      });
    }
  }
  const cmp = (week: number): GearComparisonRow | undefined =>
    gearComparison.find((r) => r.week === week);
  const c12 = cmp(12);
  const c8 = cmp(8);
  // Bounded: the week-12 stockpile is no bigger than today's, and between weeks 8 and 12 it grows
  // no faster than today's does (Essence per week; negative means it falls).
  metrics['gear.dailyEssenceWeek12'] = c12?.essenceWithGear ?? null;
  metrics['gear.dailyEssenceWeek12VsToday'] =
    c12 === undefined ? null : c12.essenceWithGear - c12.essenceToday;
  metrics['gear.dailyEssenceGrowthVsToday'] =
    c12 === undefined || c8 === undefined
      ? null
      : (c12.essenceWithGear - c8.essenceWithGear - (c12.essenceToday - c8.essenceToday)) / 4;
  return { metrics, comparison: gearComparison };
}

/** The team's worn items at the last snapshot week of the default sims, per archetype. */
export function wornItems(sims: readonly EconomyResult[]): WornRow[] {
  const rows: WornRow[] = [];
  const week = Math.max(0, ...sims.flatMap((s) => s.snapshots.map((x) => x.week)));
  for (const archetype of ARCHETYPES) {
    const players = sims
      .flatMap((s) => s.snapshots.filter((x) => x.week === week).flatMap((x) => x.players))
      .filter((p) => p.archetype === archetype);
    if (players.length === 0) continue;
    const worn = players.flatMap((p) => pickTeam(p.creatures).filter((c) => c.item));
    const items = worn.flatMap((c) => (c.item === undefined || c.item === null ? [] : [c.item]));
    const share = (r: GearRarity): number =>
      items.length === 0 ? 0 : items.filter((i) => i.rarity === r).length / items.length;
    const avg = (f: (p: (typeof players)[number]) => number): number => mean(players.map(f)) ?? 0;
    rows.push({
      archetype,
      week,
      players: players.length,
      rarity: {
        common: share('common'),
        rare: share('rare'),
        epic: share('epic'),
        festival: share('festival'),
      },
      level: mean(items.map((i) => i.level)) ?? 0,
      enchanted:
        items.length === 0 ? 0 : items.filter((i) => i.enchantId !== null).length / items.length,
      power: mean(worn.map(gearPowerOf)) ?? 0,
      bag: avg((p) => p.gear.bag.length),
      blueprints: avg((p) => p.gear.blueprints.length),
      scrap: avg((p) => p.gear.parts.scrap),
      shards: avg(
        (p) =>
          p.gear.parts['tide-shard'] +
          p.gear.parts['ember-shard'] +
          p.gear.parts['grove-shard'] +
          p.gear.parts['spark-shard'],
      ),
      glimmer: avg((p) => p.gear.parts.glimmer),
    });
  }
  return rows;
}

export function analyse(input: AnalysisInput): Analysis {
  const { sweep, defaultSims, pitySims, weeks, longRun, baselineSims } = input;
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
      festival: stage1.festival === true,
      appearances: agg.appearances,
      pickRate: totalPicks === 0 ? 0 : agg.appearances / totalPicks,
      avgLevel: agg.levelSum / agg.appearances,
      avgContribution: agg.contribution / agg.appearances,
      ratio: null,
    });
  }
  creatures.sort((a, b) => (a.line < b.line ? -1 : 1));
  // The rarity median is taken over the catchable species. Festival species are compared with it
  // (the report shows their ratio) but are not in the balance targets: players get them late, at
  // level 1, so their averages say little about the species.
  for (const rarity of ['common', 'rare', 'epic'] as const) {
    const group = creatures.filter(
      (c) => c.rarity === rarity && c.appearances >= MIN_CREATURE_APPEARANCES,
    );
    const med = median(group.filter((c) => !c.festival).map((c) => c.avgContribution));
    if (med === null || med === 0) continue;
    for (const c of group) c.ratio = c.avgContribution / med;
  }
  const ratios = creatures
    .filter((c) => !c.festival)
    .map((c) => c.ratio)
    .filter((x): x is number => x !== null);
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

  // ---- gear and crafting ----
  const gear = gearMetrics(defaultSims, baselineSims ?? [], weeks);
  Object.assign(metrics, gear.metrics);
  const gearComparison = gear.comparison;

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

  // ---- ability damage share (informational) ----
  const abilityShares: AbilityShareRow[] = [];
  const snapshotWeeks = [...new Set(records.map((r) => r.snapshotWeek))].sort((a, b) => a - b);
  const groups: { name: string; test: (r: RunRecord) => boolean }[] = [
    { name: 'typical group (5-10 players)', test: isTypical },
    { name: '15 players', test: (r) => r.count === 15 },
    { name: '1 player with guests', test: (r) => r.count === 1 },
  ];
  for (const week of snapshotWeeks) {
    for (const g of groups) {
      const rs = records.filter(
        (r) => r.snapshotWeek === week && g.test(r) && r.abilities !== null,
      );
      if (rs.length === 0) continue;
      const imp = rs.map((r) => r.abilities as NonNullable<RunRecord['abilities']>);
      const all = sum(imp.map((i) => i.all));
      abilityShares.push({
        snapshotWeek: week,
        group: g.name,
        runs: rs.length,
        creatureAbilities: mean(imp.map((i) => i.creatureAbilities)) ?? 0,
        creatureShare: all === 0 ? null : sum(imp.map((i) => i.all - i.basicOnly)) / all,
        basicShare: all === 0 ? null : sum(imp.map((i) => i.basicOnly - i.none)) / all,
      });
    }
  }
  const latest = abilityShares.filter(
    (a) =>
      a.snapshotWeek === snapshotWeeks[snapshotWeeks.length - 1] && a.group.startsWith('typical'),
  )[0];
  metrics['abilities.creatureShareLatestRoster'] = latest?.creatureShare ?? null;
  metrics['abilities.basicShareLatestRoster'] = latest?.basicShare ?? null;

  // ---- long-running servers: the ladder, Festivals, seasons ----
  const longRunResult = analyseLongRun(longRun);
  Object.assign(metrics, longRunResult.metrics);

  // ---- outliers ----
  const outliers: Outliers = {
    dominantCreatures: creatures
      .filter((c) => !c.festival && c.ratio !== null && c.ratio > 1.6)
      .map((c) => c.name),
    weakCreatures: creatures
      .filter((c) => !c.festival && c.ratio !== null && c.ratio < 0.6)
      .map((c) => c.name),
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
    abilityShares,
    gearComparison,
    worn: wornItems(defaultSims),
    longRun: longRunResult.stats,
    jackpots,
    outliers,
  };
}
