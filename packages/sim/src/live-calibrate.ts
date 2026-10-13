/**
 * Fits the balance simulator to a live report (`pnpm sim:live`). Aggregates only: the report never
 * carries per-player data, so everything here is read off totals.
 *
 * **What is fitted.** The sim has a few behaviour knobs (`EconomyOptions.behaviour`) and an archetype
 * mix. This module sets them so the sim's rates match the live rates per active player-day:
 *
 * 1. `casualShare` (the share of players who are casuals) starts from a heuristic on **sessions per
 *    daily active player** (see `inferCasualShare`) and may move by at most `CASUAL_SHARE_SLACK`.
 * 2. `tripPercent` (the share of check-ins that send trips) is fitted to expedition sends per
 *    active player-day.
 * 3. `dungeonPercent` (the share of check-ins that run the dungeon) is fitted to dungeon runs per
 *    active player-day.
 *
 * The search is a bounded coordinate search: for each knob in turn, a few candidate values are tried
 * on the same seeds and the best one is kept; the whole sweep repeats `rounds` times. The fit error is
 * the mean relative gap between the sim's and the live rates. The server size is the average daily
 * active players per server divided by the share of the players that is active on a day.
 *
 * **What is not fitted** (the shipped knobs cannot move it): the destination, length and supply mix.
 * The sim's lengths and supplies per trip are reported next to the live ones as a check only. The
 * split of the heavy players into "daily" and "top" is fixed (`TOP_SHARE_OF_HEAVY`): they differ by one
 * leet day a week, which aggregates cannot tell apart. New players are not modelled (everyone joins
 * in week 1).
 */
import {
  ARCHETYPE_CONFIG,
  DEFAULT_MIX,
  DEFAULT_SERVER_SIZE,
  type ArchetypeMix,
} from './archetypes';
import { runEconomy, type Behaviour, type EconomyResult } from './economy';
import { RowSet, type Report } from './live-report';
import { mean } from './util';

// --- Knob bounds and constants ---

/** Calibrated server size bounds (players). */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 30;
/** The fitting sims use at most this many players (rates are per player-day, so size matters little). */
export const FIT_PLAYERS = 12;
/** The casual share may move this far from the heuristic during the fit. */
export const CASUAL_SHARE_SLACK = 0.2;
export const CASUAL_SHARE_BOUNDS = { min: 0.05, max: 0.9 } as const;
/** Participation percents stay inside these bounds. */
export const PERCENT_BOUNDS = { min: 5, max: 100 } as const;
/** The share of the heavy (twice-daily) players that is "top" rather than "daily". Not identifiable. */
export const TOP_SHARE_OF_HEAVY = 1 / 3;
/** Fewer active player-days than this and the calibration is only a rough guess. */
export const MIN_CAL_PLAYER_DAYS = 30;
/** Weeks of the report period the sim window spans, at most. */
const MAX_WINDOW_WEEKS = 8;

// --- Observation ---

export interface Observation {
  playerDays: number;
  days: number;
  servers: number;
  /** Average daily active players per answering server. */
  dauPerServer: number;
  sessionsPerDau: number | null;
  /** Expedition sends per active player-day; null without sends data. */
  sendsPerDau: number | null;
  dungeonRunsPerDau: number | null;
  /** Supplies carried per trip sent. */
  suppliesPerTrip: number | null;
  /** Share of trips by length id. */
  lengthMix: Record<string, number>;
  /** Share of active player-days that touched each feature (shown only; not fitted). */
  expeditionUserShare: number | null;
  dungeonUserShare: number | null;
}

export function observe(report: Report): Observation {
  const rows = new RowSet(report.totals);
  const playerDays = rows.total('dau');
  const days = Math.max(1, report.days);
  const sends = rows.total('expedition.send');
  const per = (n: number): number | null => (playerDays === 0 ? null : n / playerDays);
  const lengths = rows.by('expedition.send', 'length');
  return {
    playerDays,
    days,
    servers: Math.max(1, report.guilds.reporting),
    dauPerServer: playerDays / days / Math.max(1, report.guilds.reporting),
    sessionsPerDau: per(rows.total('sessions')),
    sendsPerDau: per(sends),
    dungeonRunsPerDau: per(rows.total('dungeon.run')),
    suppliesPerTrip: sends === 0 ? null : rows.total('expedition.supply_used') / sends,
    lengthMix: Object.fromEntries(lengths.map(([id, n]) => [id, sends === 0 ? 0 : n / sends])),
    expeditionUserShare: per(rows.total('users', { feature: 'expeditions' })),
    dungeonUserShare: per(rows.total('users', { feature: 'dungeon' })),
  };
}

// --- Heuristic mix ---

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/**
 * The share of players that are casuals, from sessions per active player-day `s`.
 *
 * In the sim a casual checks in once on each of their leet days and everyone else twice a day, every
 * day, so a casual's active day has 1 session and a heavy player's has 2. If a share `h` of the
 * active player-days are heavy, `s = (1 - h) * 1 + h * 2`, so `h = s - 1` (clamped to 0..1). A casual
 * is active on `leetDays / 7` of the days and a heavy player on all of them, so the players are in
 * the proportion `(1 - h) * 7 / leetDays : h`. With no session data the default mix's share is used.
 */
export function inferCasualShare(sessionsPerDau: number | null): number {
  if (sessionsPerDau === null) return DEFAULT_MIX.casual / DEFAULT_SERVER_SIZE;
  const h = clamp(sessionsPerDau - 1, 0, 1);
  const casual = ((1 - h) * 7) / ARCHETYPE_CONFIG.casual.leetDaysPerWeek;
  return clamp(casual / (casual + h || 1), CASUAL_SHARE_BOUNDS.min, CASUAL_SHARE_BOUNDS.max);
}

/** Fraction of the players that is active on an average day. */
export function activeFraction(casualShare: number): number {
  return casualShare * (ARCHETYPE_CONFIG.casual.leetDaysPerWeek / 7) + (1 - casualShare);
}

/** Players per server from the average daily active players per server. */
export function inferPlayers(dauPerServer: number, casualShare: number): number {
  return clamp(Math.round(dauPerServer / activeFraction(casualShare)), MIN_PLAYERS, MAX_PLAYERS);
}

/**
 * The mix of `players` for a casual share: largest-remainder apportionment of casual, daily and top
 * (no newcomers). The counts always sum to `players`.
 */
export function mixFromShares(players: number, casualShare: number): ArchetypeMix {
  const weights = {
    casual: casualShare,
    daily: (1 - casualShare) * (1 - TOP_SHARE_OF_HEAVY),
    top: (1 - casualShare) * TOP_SHARE_OF_HEAVY,
  };
  const order = ['casual', 'daily', 'top'] as const;
  const parts = order.map((id, i) => {
    const exact = weights[id] * players;
    return { id, i, base: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = players - parts.reduce((n, p) => n + p.base, 0);
  const counts: Record<(typeof order)[number], number> = { casual: 0, daily: 0, top: 0 };
  for (const p of parts) counts[p.id] = p.base;
  for (const p of [...parts].sort((a, b) => b.rem - a.rem || a.i - b.i)) {
    if (left <= 0) break;
    counts[p.id] += 1;
    left -= 1;
  }
  return { ...counts, newcomer: 0 };
}

// --- Parameters ---

export interface Params {
  players: number;
  casualShare: number;
  tripPercent: number;
  dungeonPercent: number;
}

export interface Fidelity {
  mode: 'full' | 'quick';
  /** Sims per fitting evaluation. */
  fitSims: number;
  /** Coordinate sweeps. */
  rounds: number;
  /** Multipliers tried around a participation percent. */
  factors: readonly number[];
  /** Sims averaged for the projection. */
  projectionSims: number;
  /** Players in the projection (null: the calibrated server size). */
  projectionPlayers: number | null;
}

export const FULL: Fidelity = {
  mode: 'full',
  fitSims: 2,
  rounds: 2,
  factors: [0.6, 0.8, 1.25, 1.5],
  projectionSims: 6,
  projectionPlayers: null,
};
export const QUICK: Fidelity = {
  mode: 'quick',
  fitSims: 1,
  rounds: 1,
  factors: [0.7, 1.4],
  projectionSims: 2,
  projectionPlayers: 8,
};

export interface SimRates {
  sendsPerDau: number;
  dungeonRunsPerDau: number;
  suppliesPerTrip: number | null;
  lengthMix: Record<string, number>;
}

export interface Calibration {
  version: 1;
  /** The report's range. */
  from: string;
  to: string;
  seed: string;
  mode: Fidelity['mode'];
  /** Weeks the live server is assumed to have run when the report was made. */
  ageWeeks: number;
  /** True when there were too few active player-days for more than a rough guess. */
  lowData: boolean;
  params: Params;
  /** The heuristic's casual share before the fit. */
  heuristicCasualShare: number;
  observed: {
    sendsPerDau: number | null;
    dungeonRunsPerDau: number | null;
    suppliesPerTrip: number | null;
    sessionsPerDau: number | null;
  };
  simulated: { sendsPerDau: number; dungeonRunsPerDau: number; suppliesPerTrip: number | null };
  /** Mean relative gap over the fitted rates, as a fraction (0.08 is 8%). */
  fitError: number;
  evaluations: number;
}

const round = (n: number, digits = 4): number => Math.round(n * 10 ** digits) / 10 ** digits;

function behaviourOf(p: Params): Behaviour {
  return { tripPercent: p.tripPercent, dungeonPercent: p.dungeonPercent };
}

/** One sim run of the calibrated server. */
export function simulate(
  p: Params,
  weeks: number,
  seed: string,
  tag: string,
  k: number,
  players: number = p.players,
): EconomyResult {
  return runEconomy({
    seed: `${seed}:${tag}:${String(k)}`,
    weeks,
    mix: mixFromShares(players, p.casualShare),
    snapshotWeeks: [],
    behaviour: behaviourOf(p),
  });
}

/** The sim's rates per active player-day over weeks `first` to `last` (1-based), averaged over `sims`. */
export function measure(
  p: Params,
  window: { first: number; last: number },
  seed: string,
  sims: number,
): SimRates {
  const players = Math.min(p.players, FIT_PLAYERS);
  const sends: number[] = [];
  const runs: number[] = [];
  const days: number[] = [];
  const supplies: number[] = [];
  const trips: number[] = [];
  const lengths = new Map<string, number>();
  for (let k = 0; k < sims; k++) {
    const result = simulate(p, window.last, seed, 'fit', k, players);
    let s = 0;
    let r = 0;
    let d = 0;
    for (const h of result.players) {
      const perWeek = h.archetype === 'casual' ? ARCHETYPE_CONFIG.casual.leetDaysPerWeek : 7;
      const at = (week: number): number => h.weeks.find((w) => w.week === week)?.trips ?? 0;
      s += at(window.last) - (window.first > 1 ? at(window.first - 1) : 0);
      for (const w of h.weeks) {
        if (w.week >= window.first && w.week <= window.last) r += w.dungeonRuns;
      }
      d += perWeek * (window.last - window.first + 1);
      supplies.push(h.tripStats['supplies_used'] ?? 0);
      trips.push(h.tripStats['trips_finished'] ?? 0);
      for (const [length, n] of Object.entries(h.tripsByLength)) {
        lengths.set(length, (lengths.get(length) ?? 0) + n);
      }
    }
    sends.push(s);
    runs.push(r);
    days.push(d);
  }
  const playerDays = days.reduce((a, b) => a + b, 0);
  const tripTotal = trips.reduce((a, b) => a + b, 0);
  const lengthTotal = [...lengths.values()].reduce((a, b) => a + b, 0);
  return {
    sendsPerDau: playerDays === 0 ? 0 : sends.reduce((a, b) => a + b, 0) / playerDays,
    dungeonRunsPerDau: playerDays === 0 ? 0 : runs.reduce((a, b) => a + b, 0) / playerDays,
    suppliesPerTrip: tripTotal === 0 ? null : supplies.reduce((a, b) => a + b, 0) / tripTotal,
    lengthMix: Object.fromEntries(
      [...lengths].sort((a, b) => a[0].localeCompare(b[0])).map(([id, n]) => [id, n / lengthTotal]),
    ),
  };
}

/** Mean relative gap of the fitted rates (those the report has). */
export function fitError(obs: Observation, sim: SimRates): number {
  const gaps: number[] = [];
  for (const [o, s] of [
    [obs.sendsPerDau, sim.sendsPerDau],
    [obs.dungeonRunsPerDau, sim.dungeonRunsPerDau],
  ] as const) {
    if (o !== null) gaps.push(Math.abs(s - o) / Math.max(o, 0.05));
  }
  return mean(gaps) ?? 0;
}

export interface CalibrateOptions {
  seed: string;
  ageWeeks: number;
  fidelity: Fidelity;
}

/** The weeks of the sim that stand for the report period. */
export function fitWindow(days: number, ageWeeks: number): { first: number; last: number } {
  const span = clamp(Math.ceil(days / 7), 1, MAX_WINDOW_WEEKS);
  return { first: ageWeeks + 1, last: ageWeeks + span };
}

/** Calibrates the sim to a report. Deterministic for a seed. */
export function calibrate(report: Report, options: CalibrateOptions): Calibration {
  const obs = observe(report);
  if (obs.playerDays === 0)
    throw new Error('the report has no active players: nothing to calibrate');
  const { seed, ageWeeks, fidelity } = options;
  const heuristic = inferCasualShare(obs.sessionsPerDau);
  const window = fitWindow(report.days, ageWeeks);
  const lo = Math.max(CASUAL_SHARE_BOUNDS.min, heuristic - CASUAL_SHARE_SLACK);
  const hi = Math.min(CASUAL_SHARE_BOUNDS.max, heuristic + CASUAL_SHARE_SLACK);

  let current: Params = {
    players: inferPlayers(obs.dauPerServer, heuristic),
    casualShare: round(heuristic, 2),
    tripPercent: PERCENT_BOUNDS.max,
    dungeonPercent: PERCENT_BOUNDS.max,
  };
  const cache = new Map<string, { rates: SimRates; error: number }>();
  let evaluations = 0;
  const evaluate = (p: Params): { rates: SimRates; error: number } => {
    const key = `${String(p.casualShare)}|${String(p.tripPercent)}|${String(p.dungeonPercent)}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    evaluations += 1;
    const rates = measure(p, window, seed, fidelity.fitSims);
    const entry = { rates, error: fitError(obs, rates) };
    cache.set(key, entry);
    return entry;
  };
  let best = evaluate(current);

  const percentCandidates = (value: number, wanted: number | null, have: number): number[] => {
    const out = new Set<number>(
      fidelity.factors.map((f) =>
        clamp(Math.round(value * f), PERCENT_BOUNDS.min, PERCENT_BOUNDS.max),
      ),
    );
    // The first-order guess: the rate is about proportional to the percent.
    if (wanted !== null && have > 0) {
      out.add(clamp(Math.round((value * wanted) / have), PERCENT_BOUNDS.min, PERCENT_BOUNDS.max));
    }
    out.delete(value);
    return [...out].sort((a, b) => a - b);
  };

  for (let sweep = 0; sweep < fidelity.rounds; sweep++) {
    const tries: { make(): Params[] }[] = [
      {
        make: () =>
          percentCandidates(current.tripPercent, obs.sendsPerDau, best.rates.sendsPerDau).map(
            (tripPercent) => ({ ...current, tripPercent }),
          ),
      },
      {
        make: () =>
          percentCandidates(
            current.dungeonPercent,
            obs.dungeonRunsPerDau,
            best.rates.dungeonRunsPerDau,
          ).map((dungeonPercent) => ({ ...current, dungeonPercent })),
      },
      {
        make: () =>
          [round(current.casualShare - 0.1, 2), round(current.casualShare + 0.1, 2)]
            .filter((c) => c >= lo - 1e-9 && c <= hi + 1e-9)
            .map((casualShare) => ({
              ...current,
              casualShare,
              players: inferPlayers(obs.dauPerServer, casualShare),
            })),
      },
    ];
    for (const step of tries) {
      for (const candidate of step.make()) {
        const result = evaluate(candidate);
        if (result.error < best.error - 1e-9) {
          best = result;
          current = candidate;
        }
      }
    }
  }

  return {
    version: 1,
    from: report.from,
    to: report.to,
    seed,
    mode: fidelity.mode,
    ageWeeks,
    lowData: obs.playerDays < MIN_CAL_PLAYER_DAYS,
    params: current,
    heuristicCasualShare: round(heuristic),
    observed: {
      sendsPerDau: obs.sendsPerDau === null ? null : round(obs.sendsPerDau),
      dungeonRunsPerDau: obs.dungeonRunsPerDau === null ? null : round(obs.dungeonRunsPerDau),
      suppliesPerTrip: obs.suppliesPerTrip === null ? null : round(obs.suppliesPerTrip),
      sessionsPerDau: obs.sessionsPerDau === null ? null : round(obs.sessionsPerDau),
    },
    simulated: {
      sendsPerDau: round(best.rates.sendsPerDau),
      dungeonRunsPerDau: round(best.rates.dungeonRunsPerDau),
      suppliesPerTrip:
        best.rates.suppliesPerTrip === null ? null : round(best.rates.suppliesPerTrip),
    },
    fitError: round(best.error),
    evaluations,
  };
}

/** The sims of the projection (one per seed), for the calibrated server and `weeks` weeks. */
export function projectionSims(c: Calibration, weeks: number, fidelity: Fidelity): EconomyResult[] {
  const players =
    fidelity.projectionPlayers === null
      ? c.params.players
      : Math.min(c.params.players, fidelity.projectionPlayers);
  return Array.from({ length: fidelity.projectionSims }, (_, k) =>
    simulate(c.params, weeks, c.seed, 'proj', k, players),
  );
}
