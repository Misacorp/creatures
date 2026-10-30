import type { PlayerRun } from './sim';
import type { WeekRecord } from './types';
import { median, quantile, sum } from './util';

/** A median and a spread (10th to 90th percentile) over seeds and players. */
export interface Band {
  median: number;
  p10: number;
  p90: number;
}

export const band = (values: readonly number[]): Band => ({
  median: median(values),
  p10: quantile(values, 0.1),
  p90: quantile(values, 0.9),
});

/** Week-by-week bands of a measure over players: index 0 is each player's first week (weeks since joining). */
export function series(
  players: readonly PlayerRun[],
  weeks: number,
  pick: (w: WeekRecord) => number,
): Band[] {
  return Array.from({ length: weeks }, (_, i) =>
    band(players.flatMap((p) => (p.weeks[i] ? [pick(p.weeks[i])] : []))),
  );
}

/** The level of the `k`-th best creature (1-based) at the end of a week; the lowest owned level if the player has fewer. */
export const levelOf = (w: WeekRecord, k: number): number =>
  w.levels[k - 1] ?? w.levels[w.levels.length - 1] ?? 1;

/** Total of a per-week measure over weeks `from`..`to` (1-based, inclusive) of one player. */
export const total = (
  p: PlayerRun,
  from: number,
  to: number,
  pick: (w: WeekRecord) => number,
): number => sum(p.weeks.slice(from - 1, to).map(pick));

/** Median over players of a per-player number. */
export const medianOf = (players: readonly PlayerRun[], f: (p: PlayerRun) => number): number =>
  median(players.map(f));

/** The mean of a list, or 0. */
export const avg = (values: readonly number[]): number =>
  values.length ? sum(values) / values.length : 0;

export const round = (x: number, digits = 0): number => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};
