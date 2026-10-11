import { DEFAULT_SERVER_SIZE } from './archetypes';
import type { EconomyResult, LadderWeek } from './economy';
import { mean, median, percentile } from './util';

/** Weeks a long-running server is simulated for (six seasons of five weeks). */
export const LONG_RUN_WEEKS = 30;

/** A raid week with no finale loss streak longer than this many weeks counts as healthy. */
export const LOSS_STREAK_LIMIT = 4;

/** The server sizes of the long-run model: a small server, the default server, and the 15-player cap. */
export const LONG_RUN_GROUPS = [
  { id: 'small', label: 'Small server (5 players)', count: 5 },
  {
    id: 'typical',
    label: `Typical server (${DEFAULT_SERVER_SIZE} players)`,
    count: DEFAULT_SERVER_SIZE,
  },
  { id: 'fifteen', label: '15-player server', count: 15 },
] as const;
export type LongRunGroupId = (typeof LONG_RUN_GROUPS)[number]['id'];

export interface LongRunInput {
  id: LongRunGroupId;
  sims: readonly EconomyResult[];
}

export interface LongRunStats {
  id: LongRunGroupId;
  label: string;
  count: number;
  servers: number;
  raidWeeks: number;
  /** Mean over servers of their finale win rate, Festivals included. */
  winRate: number;
  /** The 10th and 90th percentile of the per-server win rate. */
  winRateP10: number;
  winRateP90: number;
  normalWinRate: number | null;
  festivalWinRate: number | null;
  /** Median weeks between one rank-up and the next, over all servers' gaps. */
  medianRankUpGap: number | null;
  rankUpGapP10: number | null;
  rankUpGapP90: number | null;
  /** Share of servers with a run of more than `LOSS_STREAK_LIMIT` lost finales in a row. */
  lossStreakShare: number;
  /** Median of the longest loss streak of each server. */
  longestLossStreak: number;
  placementRank: number | null;
  /** Median rank at the start of week 1..LONG_RUN_WEEKS (null where no server raided). */
  medianRankByWeek: (number | null)[];
  finalRankMedian: number | null;
  finalRankP10: number | null;
  finalRankP90: number | null;
  /** Win rate of weeks 1 to 10 and of weeks 11 on, to show the early run of wins. */
  winRateEarly: number | null;
  winRateLate: number | null;
}

function winRateOf(weeks: readonly LadderWeek[]): number | null {
  return weeks.length === 0 ? null : weeks.filter((w) => w.won).length / weeks.length;
}

/** The longest run of lost finales in a row. */
export function longestLossStreak(results: readonly boolean[]): number {
  let best = 0;
  let run = 0;
  for (const won of results) {
    run = won ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return best;
}

/** Weeks between consecutive rank-ups of one server (a rank-up is a week that raised the rank). */
export function rankUpGaps(raids: readonly { week: number; ladder: LadderWeek }[]): number[] {
  const gaps: number[] = [];
  let last: number | null = null;
  for (const r of raids) {
    if (r.ladder.nextRank <= r.ladder.rank) continue;
    if (last !== null) gaps.push(r.week - last);
    last = r.week;
  }
  return gaps;
}

export function analyseLongRun(groups: readonly LongRunInput[]): {
  stats: LongRunStats[];
  metrics: Record<string, number | null>;
} {
  const stats: LongRunStats[] = [];
  for (const g of groups) {
    const def = LONG_RUN_GROUPS.find((x) => x.id === g.id);
    if (def === undefined) throw new Error(`unknown long-run group ${g.id}`);
    const servers = g.sims.filter((s) => s.raids.length > 0);
    const perServerRate = servers.map((s) => winRateOf(s.raids.map((r) => r.ladder)) ?? 0);
    const all = servers.flatMap((s) => s.raids);
    const gaps = servers.flatMap((s) => rankUpGaps(s.raids));
    const streaks = servers.map((s) => longestLossStreak(s.raids.map((r) => r.ladder.won)));
    const weekly: (number | null)[] = [];
    for (let w = 1; w <= LONG_RUN_WEEKS; w++) {
      const ranks = servers.flatMap((s) =>
        s.raids.filter((r) => r.week === w).map((r) => r.ladder.rank),
      );
      weekly.push(median(ranks));
    }
    const finals = servers.flatMap((s) => {
      const last = s.raids[s.raids.length - 1];
      return last === undefined ? [] : [last.ladder.nextRank];
    });
    const firsts = servers.flatMap((s) =>
      s.raids[0] === undefined ? [] : [s.raids[0].ladder.rank],
    );
    stats.push({
      id: g.id,
      label: def.label,
      count: def.count,
      servers: servers.length,
      raidWeeks: all.length,
      winRate: mean(perServerRate) ?? 0,
      winRateP10: percentile(perServerRate, 10) ?? 0,
      winRateP90: percentile(perServerRate, 90) ?? 0,
      normalWinRate: winRateOf(all.filter((r) => !r.ladder.festival).map((r) => r.ladder)),
      festivalWinRate: winRateOf(all.filter((r) => r.ladder.festival).map((r) => r.ladder)),
      medianRankUpGap: median(gaps),
      rankUpGapP10: percentile(gaps, 10),
      rankUpGapP90: percentile(gaps, 90),
      lossStreakShare:
        servers.length === 0
          ? 0
          : streaks.filter((n) => n > LOSS_STREAK_LIMIT).length / servers.length,
      longestLossStreak: median(streaks) ?? 0,
      placementRank: median(firsts),
      medianRankByWeek: weekly,
      finalRankMedian: median(finals),
      finalRankP10: percentile(finals, 10),
      finalRankP90: percentile(finals, 90),
      winRateEarly: winRateOf(all.filter((r) => r.week <= 10).map((r) => r.ladder)),
      winRateLate: winRateOf(all.filter((r) => r.week > 10).map((r) => r.ladder)),
    });
  }

  const by = (id: LongRunGroupId): LongRunStats | undefined => stats.find((s) => s.id === id);
  const metrics: Record<string, number | null> = {
    'longrun.small.finaleWinRate': by('small')?.winRate ?? null,
    'longrun.typical.finaleWinRate': by('typical')?.winRate ?? null,
    'longrun.fifteen.finaleWinRate': by('fifteen')?.winRate ?? null,
  };
  const festival = stats.map((s) => s.festivalWinRate).filter((x): x is number => x !== null);
  metrics['longrun.festivalWinRateMin'] = festival.length === 0 ? null : Math.min(...festival);
  const allGaps = groups.flatMap((g) => g.sims.flatMap((s) => rankUpGaps(s.raids)));
  metrics['longrun.rankUpGapMedian'] = median(allGaps);
  metrics['longrun.lossStreakShareMax'] =
    stats.length === 0 ? null : Math.max(...stats.map((s) => s.lossStreakShare));
  // Informational: where the typical and the 15-player server stand at the end.
  const typical = by('typical')?.finalRankMedian ?? null;
  const fifteen = by('fifteen')?.finalRankMedian ?? null;
  metrics['longrun.typicalFinalRank'] = typical;
  metrics['longrun.fifteenFinalRank'] = fifteen;
  metrics['longrun.rankSpreadTypicalVsFifteen'] =
    typical === null || fifteen === null ? null : typical - fifteen;
  return { stats, metrics };
}
