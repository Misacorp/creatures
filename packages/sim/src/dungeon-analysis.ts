import { ARCHETYPES, type ArchetypeId } from './archetypes';
import type { EconomyResult, PlayerHistory, WeekRecord } from './economy';
import { mean, median, sum } from './util';

/** The archetypes the win-rate table covers (the newcomer is a casual who joins in week 4). */
export const DUNGEON_TABLE_ARCHETYPES = ['casual', 'daily', 'top'] as const;
/** Deepest depth the win-rate table lists. */
export const WIN_RATE_MAX_DEPTH = 24;

export interface DepthWinRate {
  depth: number;
  runs: number;
  clears: number;
}

export interface DepthAfter {
  week: number;
  players: number;
  p25: number;
  median: number;
  p75: number;
}

/** What a player of the archetype gets from the dungeon in an average week (all joined players, all weeks). */
export interface DungeonFlow {
  runs: number;
  clears: number;
  bait: number;
  essence: number;
  scrap: number;
  items: number;
}

export interface DungeonStats {
  /** Clear rate per depth of the casual, daily and top players (all their runs). */
  winRates: Record<(typeof DUNGEON_TABLE_ARCHETYPES)[number], DepthWinRate[]>;
  /** The depth of each archetype after N weeks (the depth the next run fights at). */
  depthAfter: Record<ArchetypeId, DepthAfter[]>;
  /** The reward flow per player and week. */
  flow: Record<ArchetypeId, DungeonFlow>;
  /** Dungeon Essence over a daily player's whole Essence income (raids and dungeon). */
  dailyEssenceShare: number | null;
  /** Gear share of a daily player's raid-team power at week 8, with the dungeon and without. */
  gearShareWeek8: { with: number | null; without: number | null };
}

function playersOf(sims: readonly EconomyResult[], archetype: ArchetypeId): PlayerHistory[] {
  return sims.flatMap((s) => s.players.filter((p) => p.archetype === archetype));
}

const weekOf = (h: PlayerHistory, week: number): WeekRecord | undefined =>
  h.weeks.find((w) => w.week === week);

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index] as number;
}

function gearShareWeek8(sims: readonly EconomyResult[]): number | null {
  const shares: number[] = [];
  for (const h of playersOf(sims, 'daily')) {
    const w = weekOf(h, 8);
    if (w !== undefined && w.top3Power > 0) shares.push(w.gearPower / w.top3Power);
  }
  return median(shares);
}

/**
 * The daily dungeon measures of the default server: the targets' metrics and the tables of the report.
 * `withoutDungeon` is the same sims and seeds played with gear but no dungeon, for what the dungeon
 * adds to the gear share.
 *
 * Metrics:
 * - `dungeon.firstWeekDepth1ClearRate`: of all runs at depth 1 made in the first 7 days of a player's
 *   time, the share that cleared every room (all archetypes).
 * - `dungeon.dailyDepthGrowthPerWeek`: the median daily player's depth gain per week between the end
 *   of week 2 and the end of week 8 (the opening week, when everybody climbs a depth a day, is left out).
 * - `dungeon.dailyEssenceShare`: dungeon Essence over a daily player's Essence income (raid stages,
 *   jackpots and dungeon), all weeks.
 * - `dungeon.dailyGearShareWeek8`: gear's share of a daily player's raid-team power at week 8, with
 *   the dungeon's gear and parts in the game.
 */
export function dungeonAnalysis(
  sims: readonly EconomyResult[],
  withoutDungeon: readonly EconomyResult[],
  weeks: number,
): { metrics: Record<string, number | null>; stats: DungeonStats } {
  const metrics: Record<string, number | null> = {};

  // ---- clear rates ----
  const firstWeek = sims
    .flatMap((s) => s.players)
    .flatMap((p) => p.dungeon)
    .filter((e) => e.daysSinceJoin < 7 && e.depth === 1);
  metrics['dungeon.firstWeekDepth1ClearRate'] =
    firstWeek.length === 0 ? null : firstWeek.filter((e) => e.cleared).length / firstWeek.length;

  const winRates = {} as DungeonStats['winRates'];
  for (const archetype of DUNGEON_TABLE_ARCHETYPES) {
    const runs = playersOf(sims, archetype).flatMap((p) => p.dungeon);
    const rows: DepthWinRate[] = [];
    for (let depth = 1; depth <= WIN_RATE_MAX_DEPTH; depth++) {
      const here = runs.filter((e) => e.depth === depth);
      rows.push({ depth, runs: here.length, clears: here.filter((e) => e.cleared).length });
    }
    winRates[archetype] = rows;
  }

  // ---- depth after N weeks ----
  const depthAfter = {} as DungeonStats['depthAfter'];
  for (const archetype of ARCHETYPES) {
    const rows: DepthAfter[] = [];
    for (let week = 1; week <= weeks; week++) {
      const depths = playersOf(sims, archetype)
        .map((p) => weekOf(p, week)?.dungeonDepth)
        .filter((d): d is number => d !== undefined)
        .sort((a, b) => a - b);
      if (depths.length === 0) continue;
      rows.push({
        week,
        players: depths.length,
        p25: quantile(depths, 0.25),
        median: median(depths) ?? 0,
        p75: quantile(depths, 0.75),
      });
    }
    depthAfter[archetype] = rows;
  }
  const growth = playersOf(sims, 'daily')
    .map((p) => {
      const early = weekOf(p, 2);
      const late = weekOf(p, 8);
      return early === undefined || late === undefined
        ? null
        : (late.dungeonDepth - early.dungeonDepth) / 6;
    })
    .filter((g): g is number => g !== null);
  metrics['dungeon.dailyDepthGrowthPerWeek'] = median(growth);

  // ---- the reward flow ----
  const flow = {} as DungeonStats['flow'];
  for (const archetype of ARCHETYPES) {
    const records = playersOf(sims, archetype).flatMap((p) => p.weeks);
    const avg = (f: (w: WeekRecord) => number): number => mean(records.map(f)) ?? 0;
    flow[archetype] = {
      runs: avg((w) => w.dungeonRuns),
      clears: avg((w) => w.dungeonClears),
      bait: avg((w) => w.dungeonBait),
      essence: avg((w) => w.dungeonEssence),
      scrap: avg((w) => w.dungeonScrap),
      items: avg((w) => w.dungeonItems),
    };
  }
  const dailyRecords = playersOf(sims, 'daily').flatMap((p) => p.weeks);
  const dungeonEssence = sum(dailyRecords.map((w) => w.dungeonEssence));
  const raidEssence = sum(dailyRecords.map((w) => w.essenceEarned));
  const income = dungeonEssence + raidEssence;
  const dailyEssenceShare = income === 0 ? null : dungeonEssence / income;
  metrics['dungeon.dailyEssenceShare'] = dailyEssenceShare;

  // ---- gear ----
  const withGear = gearShareWeek8(sims);
  metrics['dungeon.dailyGearShareWeek8'] = withGear;

  return {
    metrics,
    stats: {
      winRates,
      depthAfter,
      flow,
      dailyEssenceShare,
      gearShareWeek8: { with: withGear, without: gearShareWeek8(withoutDungeon) },
    },
  };
}
