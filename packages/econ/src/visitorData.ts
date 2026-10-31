import { forgeShares, ledgerOf, pileBasis } from './analysis';
import { playersOf, type Results, type ScenarioResult } from './scenarios';
import type { PlayerRun } from './sim';
import { THRESHOLDS } from './targets';
import { FORGE_BUCKETS } from './types';
import { median, sum } from './util';

/**
 * The numbers for the weekly visitor (docs/design/valley/systems/visitor.md, `reviews/2026-10-30-visitor.md`): what he drains, how
 * many rerolls each kind of player makes, the piles with and without him, and the lines of the best worn piece. "Without" is the
 * mixed servers of 8 and 15 run again with no visitor (same random draws, so the difference is him).
 */

/** The kinds of player shown. */
export const VISITOR_PROFILES = [
  'daily',
  'active',
  'every-other-day',
  'weekend-off',
  'weekly',
] as const;

export interface LineRow {
  /** The best worn piece's pips (sum of its lines) and their share of what its level allows, by week; epics worn. */
  bestPips: number[];
  share: number[];
  epics: number[];
}

export interface PileRow {
  profile: string;
  resource: string;
  weeks: number[];
  /** The pile in weeks of the resource's spending (never under the floor share of its income), with and without the visitor. */
  on: number[];
  off: number[];
  deadOn: number | null;
  deadOff: number | null;
}

export interface FourOfFiveRow {
  id: string;
  label: string;
  /** The share of runs (servers) by week with a player wearing an epic with 4 or more top-pip lines. */
  on: number[];
  off: number[] | null;
}

export interface SchoolData {
  /** By week, medians over seeds and players of a kind (mixed server of 8): learnings finished, Acorns paid for learning and the teacher's lessons, lessons taken, broker hours. */
  learnings: Record<string, number[]>;
  acorns: Record<string, number[]>;
  lessons: Record<string, number[]>;
  brokerHours: Record<string, number[]>;
  /** The share of a kind's Acorn income that went to learning over the 24 weeks. */
  acornShare: Record<string, number>;
}

export interface MarketRow {
  id: string;
  label: string;
  players: number;
  runs: number;
  /** The share of runs where the Market project opened, and where it was finished by week 24. */
  openedShare: number;
  doneShare: number;
  /** The weeks (1-based, the week the hour falls in) it opened and was finished: medians over the runs that did. */
  openedWeek: number | null;
  doneWeek: number | null;
  /** The server's shard stall by week (share of anvil time waiting for a shard), with the Market built as a project. */
  stall: number[];
  /** The mean stall in the weeks up to the one it opened in, and in the weeks after it was finished (medians over the runs that built it). */
  stallBefore: number | null;
  stallAfter: number | null;
  /** The same server with the broker from day one (the main server's own runs). */
  stallAlways: number[];
}

export interface BrokerData {
  /** Anvil time waiting for a shard by week, per kind of player: with no broker (the exchange is a tap) and with the broker from day one. */
  noBroker: Record<string, number[]>;
  withBroker: Record<string, number[]>;
  /** How many elements the player's orders need (slots below the fire) and how many different ones their scouts bring, by week (no broker). */
  needElements: Record<string, number[]>;
  scoutElements: Record<string, number[]>;
  market: MarketRow[];
}

export interface VisitorData {
  /** By week, medians over seeds and players of a profile (the mixed server of 8). */
  rerolls: Record<string, number[]>;
  acorns: Record<string, number[]>;
  scrap: Record<string, number[]>;
  /** The weeks (of 24) a player met him on a visit, over weeks 1 to 24 (median). */
  met: Record<string, number>;
  linesOn: Record<string, LineRow>;
  linesOff: Record<string, LineRow>;
  piles: PileRow[];
  fourOfFive: FourOfFiveRow[];
  /** Rerolls a server's players make in weeks 1 to 10 (median over seeds), by server: the panel guessed about 30 for ten players. */
  rerollsByWeek10: { id: string; players: number; rerolls: number }[];
}

const PILE_WEEKS = [4, 12, 24];

const weekSeries = (
  players: readonly PlayerRun[],
  pick: (w: PlayerRun['weeks'][number]) => number,
): number[] =>
  Array.from({ length: 24 }, (_, i) =>
    median(players.flatMap((p) => (p.weeks[i] ? [pick(p.weeks[i])] : []))),
  );

const linesOf = (players: readonly PlayerRun[]): LineRow => ({
  bestPips: weekSeries(players, (w) => w.bestPips),
  share: weekSeries(players, (w) => w.bestPipsShare),
  epics: weekSeries(players, (w) => w.epicsWorn),
});

const shareOfRuns = (result: ScenarioResult | undefined): number[] | null =>
  result
    ? Array.from(
        { length: 24 },
        (_, i) =>
          result.runs.filter((run) => (run.log[i]?.fourOfFive ?? 0) > 0).length /
          Math.max(1, result.runs.length),
      )
    : null;

const SHARD_PROFILES = ['daily', 'every-other-day', 'weekend-off', 'weekly'] as const;

export function brokerOf(results: Results): BrokerData {
  const shard = FORGE_BUCKETS.indexOf('shard');
  const share = (w: PlayerRun['weeks'][number]): number => forgeShares(w)[shard] ?? 0;
  const noBroker: Record<string, number[]> = {};
  const withBroker: Record<string, number[]> = {};
  const needElements: Record<string, number[]> = {};
  const scoutElements: Record<string, number[]> = {};
  for (const id of SHARD_PROFILES) {
    const none = playersOf(results['mixed8-nobroker'], id);
    const always = playersOf(results.mixed8, id);
    if (!none.length || !always.length) continue;
    noBroker[id] = weekSeries(none, share);
    withBroker[id] = weekSeries(always, share);
    needElements[id] = weekSeries(none, (w) => w.needElements);
    scoutElements[id] = weekSeries(none, (w) => w.scoutElements);
  }
  const market: MarketRow[] = [];
  for (const [base, marketId] of [
    ['mixed5', 'mixed5-market'],
    ['mixed8', 'mixed8-market'],
    ['mixed15', 'mixed15-market'],
    ['mixed8', 'mixed8-market-shards'],
  ] as const) {
    const result = results[marketId];
    if (!result) continue;
    const runs = result.runs;
    const week = (hour: number | null): number | null =>
      hour === null ? null : Math.floor(hour / 168) + 1;
    const opened = runs.flatMap((r) =>
      r.marketOpenedHour === null ? [] : [week(r.marketOpenedHour)!],
    );
    const done = runs.flatMap((r) => (r.marketDoneHour === null ? [] : [week(r.marketDoneHour)!]));
    const mean = (xs: number[]): number => (xs.length ? sum(xs) / xs.length : NaN);
    const before = runs.flatMap((r) => {
      const w = week(r.marketOpenedHour);
      return w === null ? [] : [mean(r.log.slice(0, w).map((l) => l.shardStall))];
    });
    const after = runs.flatMap((r) => {
      const w = week(r.marketDoneHour);
      return w === null || w >= r.log.length ? [] : [mean(r.log.slice(w).map((l) => l.shardStall))];
    });
    const stallOf = (res: ScenarioResult | undefined): number[] =>
      Array.from({ length: 24 }, (_, i) =>
        median((res?.runs ?? []).map((r) => r.log[i]?.shardStall ?? 0)),
      );
    market.push({
      id: result.config.id,
      label: result.config.label,
      players: result.config.players.length,
      runs: runs.length,
      openedShare: opened.length / Math.max(1, runs.length),
      doneShare: done.length / Math.max(1, runs.length),
      openedWeek: opened.length ? median(opened) : null,
      doneWeek: done.length ? median(done) : null,
      stall: stallOf(result),
      stallBefore: before.length ? median(before) : null,
      stallAfter: after.length ? median(after) : null,
      stallAlways: stallOf(results[base]),
    });
  }
  return { noBroker, withBroker, needElements, scoutElements, market };
}

export function schoolOf(results: Results): SchoolData {
  const out: SchoolData = {
    learnings: {},
    acorns: {},
    lessons: {},
    brokerHours: {},
    acornShare: {},
  };
  for (const id of VISITOR_PROFILES) {
    const players = playersOf(results.mixed8, id);
    if (!players.length) continue;
    out.learnings[id] = weekSeries(players, (w) => w.learnings);
    out.acorns[id] = weekSeries(players, (w) => w.learnAcorns);
    out.lessons[id] = weekSeries(players, (w) => w.teacherLessons);
    out.brokerHours[id] = weekSeries(players, (w) => w.brokerHours);
    out.acornShare[id] = median(
      players.map(
        (p) =>
          p.weeks.reduce((n, w) => n + w.learnAcorns, 0) /
          Math.max(
            1,
            p.weeks.reduce((n, w) => n + (w.inn[0] ?? 0), 0),
          ),
      ),
    );
  }
  return out;
}

export function visitorOf(results: Results): VisitorData {
  const on = results.mixed8;
  const off = results['mixed8-novisitor'];
  const rerolls: Record<string, number[]> = {};
  const acorns: Record<string, number[]> = {};
  const scrap: Record<string, number[]> = {};
  const met: Record<string, number> = {};
  const linesOn: Record<string, LineRow> = {};
  const linesOff: Record<string, LineRow> = {};
  const piles: PileRow[] = [];
  for (const id of VISITOR_PROFILES) {
    const players = playersOf(on, id);
    if (!players.length) continue;
    rerolls[id] = weekSeries(players, (w) => w.rerolls);
    acorns[id] = weekSeries(players, (w) => w.visitorAcorns);
    scrap[id] = weekSeries(players, (w) => w.visitorScrap);
    met[id] = median(players.map((p) => p.weeks.reduce((n, w) => n + w.visitorMet, 0)));
    linesOn[id] = linesOf(players);
    linesOff[id] = linesOf(playersOf(off, id));
  }
  for (const id of ['daily', 'weekly']) {
    const ledgerOn = ledgerOf(playersOf(on, id));
    const ledgerOff = ledgerOf(playersOf(off, id));
    ledgerOn.forEach((l, r) => {
      const other = ledgerOff[r];
      const pile = (led: typeof l | undefined, week: number): number => {
        if (!led) return 0;
        const stock = led.stock[week - 1]?.median ?? 0;
        return (
          stock /
          pileBasis(led.out, led.inn, week - 1, THRESHOLDS.deadWeeks, THRESHOLDS.deadSpendFloor)
        );
      };
      piles.push({
        profile: id,
        resource: l.resource,
        weeks: PILE_WEEKS,
        on: PILE_WEEKS.map((w) => pile(l, w)),
        off: PILE_WEEKS.map((w) => pile(other, w)),
        deadOn: l.dead,
        deadOff: other?.dead ?? null,
      });
    });
  }
  const fourOfFive: FourOfFiveRow[] = [];
  for (const [id, offId] of [
    ['mixed5', null],
    ['mixed8', 'mixed8-novisitor'],
    ['mixed15', 'mixed15-novisitor'],
  ] as const) {
    const result = results[id];
    const row = shareOfRuns(result);
    if (!result || !row) continue;
    fourOfFive.push({
      id,
      label: result.config.label,
      on: row,
      off: offId ? shareOfRuns(results[offId]) : null,
    });
  }
  const rerollsByWeek10 = ['mixed5', 'mixed8', 'mixed15'].flatMap((id) => {
    const result = results[id];
    if (!result) return [];
    return [
      {
        id,
        players: result.config.players.length,
        rerolls: median(
          result.runs.map((run) => run.log.slice(0, 10).reduce((n, w) => n + w.rerolls, 0)),
        ),
      },
    ];
  });
  return { rerolls, acorns, scrap, met, linesOn, linesOff, piles, fourOfFive, rerollsByWeek10 };
}
