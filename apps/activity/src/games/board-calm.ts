/**
 * The live leaderboard's calm ordering (Valley Games polish, "leaderboard flicker"). The true order
 * changes on almost every score change, so rows used to swap back and forth. Here two neighbours only
 * swap once the swap has held, without a break, for `BOARD_HOLD_MS` of show time.
 *
 * Pure and driven by the show clock (`ms`), not by timers: the same frames give the same order. It
 * keeps a little state between frames; a seek (time going back or jumping far) or a new event starts
 * over from the true order, and the end of an event is shown exactly (see `calmRows`).
 */
import type { BoardRow } from './show-timeline';

/**
 * How long a new place must hold before a row moves (show ms). A tick is 250 to 1000 ms, so a
 * place won or lost for a single tick never shows, while a real overtake still lands within about
 * one commentary beat and the board does not feel late. Chosen as the middle of 600 to 800.
 */
export const BOARD_HOLD_MS = 700;

/** A gap between frames longer than this is a seek or a stall: start over from the true order. */
export const BOARD_JUMP_MS = 1_000;

export interface CalmState {
  /** Which event the state belongs to (a new one starts over). */
  scope: string;
  /** The order shown, team ids, best first. */
  order: readonly string[];
  /** When each pair (`above|below`) first stood in the opposite order from the one shown. */
  since: ReadonlyMap<string, number>;
  /** The show time of the last step. */
  at: number;
}

/**
 * One step: `target` is the true order now, `ms` the show time. Returns the order to show. `prev` is
 * never changed. Swaps happen between neighbours only, so the result is always a permutation.
 */
export function calmStep(
  prev: CalmState | null,
  scope: string,
  target: readonly string[],
  ms: number,
  hold = BOARD_HOLD_MS,
): CalmState {
  const same =
    prev !== null &&
    prev.scope === scope &&
    ms >= prev.at &&
    ms - prev.at <= BOARD_JUMP_MS &&
    prev.order.length === target.length &&
    prev.order.every((id) => target.includes(id));
  if (!same) return { scope, order: [...target], since: new Map(), at: ms };
  const rank = new Map(target.map((id, i) => [id, i]));
  const order = [...prev.order];
  // Bubble until nothing more is due: a swap that has held long enough, one neighbour pair at a time.
  for (let pass = 0; pass < order.length; pass++) {
    let moved = false;
    for (let i = 0; i + 1 < order.length; i++) {
      const upper = order[i] as string;
      const lower = order[i + 1] as string;
      if ((rank.get(lower) as number) >= (rank.get(upper) as number)) continue;
      const started = prev.since.get(`${upper}|${lower}`) ?? ms;
      if (ms - started >= hold) {
        order[i] = lower;
        order[i + 1] = upper;
        moved = true;
      }
    }
    if (!moved) break;
  }
  // Pairs still the wrong way round keep their clock; the rest start again if they flip later.
  const since = new Map<string, number>();
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const upper = order[i] as string;
      const lower = order[j] as string;
      if ((rank.get(lower) as number) < (rank.get(upper) as number)) {
        const key = `${upper}|${lower}`;
        since.set(key, prev.since.get(key) ?? ms);
      }
    }
  }
  return { scope, order, since, at: ms };
}

/**
 * The rows in the calm order, places renumbered by position. With `exact` (the event is over) the
 * true rows come back as they are and the state starts over, so the final standings never lag.
 */
export function calmRows(
  prev: CalmState | null,
  scope: string,
  rows: readonly BoardRow[],
  ms: number,
  exact: boolean,
): { rows: BoardRow[]; state: CalmState } {
  const target = rows.map((r) => r.teamId);
  if (exact) return { rows: [...rows], state: { scope, order: target, since: new Map(), at: ms } };
  const state = calmStep(prev, scope, target, ms);
  const byId = new Map(rows.map((r) => [r.teamId, r]));
  const shown = state.order.map((id, i) => ({ ...(byId.get(id) as BoardRow), place: i + 1 }));
  return { rows: shown, state };
}
