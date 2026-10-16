import {
  LIMITS,
  milestoneCatalogue,
  type DayRecord,
  type Limit,
  type PlayerJourney,
} from './journey';
import { runJourneyServer, type JourneySettings, type ServerRun } from './journey-run';
import { median, percentile, round } from './util';

/** First quartile, median and third quartile of a list of numbers (nearest-rank quartiles). */
export interface Spread {
  p25: number;
  median: number;
  p75: number;
}

export function spreadOf(values: readonly number[], digits = 1): Spread | null {
  const m = median(values);
  if (m === null) return null;
  return {
    p25: round(percentile(values, 25) as number, digits),
    median: round(m, digits),
    p75: round(percentile(values, 75) as number, digits),
  };
}

/** What a preset's players looked like at the end of one week. */
export interface WeekSummary {
  week: number;
  /** Players with a record for the week. */
  players: number;
  power: Spread | null;
  /** Median of each part of the raid team's power (`powerSplit`). */
  split: { base: number; levels: number; fusion: number; evolution: number; gear: number };
  topLevel: Spread | null;
  teamLevel: Spread | null;
  bait: Spread | null;
  essence: Spread | null;
  scrap: Spread | null;
  glimmer: Spread | null;
  shards: Spread | null;
  suppliesOwned: Spread | null;
  itemsWorn: Spread | null;
  /** Share of the players who signed up for the week's raid. */
  signedUpShare: number | null;
  /** Of the players who signed up, the share whose server won the finale. */
  finaleWonShare: number | null;
  /** Essence the raid paid the players who signed up, and their share of the group's contribution. */
  raidEssence: Spread | null;
  contributionShare: Spread | null;
}

export interface MilestoneSummary {
  /** Share of the players who reached it within the run. */
  reached: number;
  /** Days (since joining) at which those who reached it did. */
  days: (Spread & { p90: number; max: number }) | null;
}

export interface WaitSummary {
  /** Share of the players who waited on this at least once. */
  playersWaiting: number;
  /** Days spent waiting on it per player: median and mean over all the players (zeros included). */
  totalDaysMedian: number;
  totalDaysMean: number;
  /** The longest single wait: the longest of any player, and the median of the longest of those who waited. */
  longestMax: number;
  longestMedian: number;
  /** Waits per player (mean). */
  countMean: number;
  track: 'growth' | 'gear';
}

export interface PresetSummary {
  id: string;
  label: string;
  players: number;
  weeks: WeekSummary[];
  milestones: Record<string, MilestoneSummary>;
  waits: Record<string, WaitSummary>;
  /** Share of the player-days on which each limit applied (any of the limits that held the player back, not only the binding one). */
  blockedShare: Record<string, number>;
  /** Share of the player-days on which each limit was the binding one. */
  bindingShare: Record<string, number>;
  /** Supplies used and bought per player and week, medians over the run. */
  suppliesPerWeek: { used: number; bought: number };
}

export interface ServerWeekSummary {
  week: number;
  /** Servers that played the raid, the share whose finale was won, and the median boss rank and group size. */
  raids: number;
  finaleWonShare: number | null;
  rank: Spread | null;
  signedUp: Spread | null;
  phase1ClearedShare: number | null;
}

export interface JourneyReport {
  settings: {
    seed: string;
    weeks: number;
    servers: number;
    income: string;
    mix: string;
    mixCounts: Record<string, number>;
    noise: boolean;
    profiles: unknown[];
  };
  presets: Record<string, PresetSummary>;
  servers: ServerWeekSummary[];
  /** The first player of each preset on the first server, day by day. */
  examples: Record<string, PlayerJourney>;
}

/** The record at the end of a sim week (the last day of that week the player has a record for). */
function weekEnd(journey: PlayerJourney, week: number): DayRecord | undefined {
  let found: DayRecord | undefined;
  for (const d of journey.days) if (d.week === week) found = d;
  return found;
}

function present<T>(values: readonly (T | undefined)[]): T[] {
  return values.filter((v): v is T => v !== undefined);
}

function weekSummary(
  week: number,
  players: readonly { journey: PlayerJourney; run: ServerRun }[],
): WeekSummary {
  const rows = players.flatMap(({ journey, run }) => {
    const d = weekEnd(journey, week);
    return d === undefined ? [] : [{ d, journey, run }];
  });
  const col = (f: (d: DayRecord) => number, digits = 1): Spread | null =>
    spreadOf(
      rows.map((r) => f(r.d)),
      digits,
    );
  const med = (f: (d: DayRecord) => number): number =>
    round(median(rows.map((r) => f(r.d))) ?? 0, 1);
  const signed = rows.filter(({ journey, run }) => {
    const h = run.economy.players.find((p) => p.id === journey.playerId);
    return h?.weeks.find((w) => w.week === week)?.signedUp === true;
  });
  const raidOf = (run: ServerRun): ServerRun['economy']['raids'][number] | undefined =>
    run.economy.raids.find((r) => r.week === week);
  const won = signed.filter(({ run }) => raidOf(run)?.summary.finaleWon === true).length;
  const essence: number[] = [];
  const shares: number[] = [];
  for (const { journey, run } of signed) {
    const summary = raidOf(run)?.summary;
    const mine = summary?.players[journey.playerId];
    if (summary === undefined || mine === undefined) continue;
    essence.push(mine.essence);
    const total = Object.values(summary.players).reduce((n, p) => n + p.contribution, 0);
    shares.push(total === 0 ? 0 : (100 * mine.contribution) / total);
  }
  return {
    week,
    players: rows.length,
    power: col((d) => d.power),
    split: {
      base: med((d) => d.base),
      levels: med((d) => d.levels),
      fusion: med((d) => d.fusion),
      evolution: med((d) => d.evolution),
      gear: med((d) => d.gear),
    },
    topLevel: col((d) => d.topLevel),
    teamLevel: col((d) => d.teamLevel),
    bait: col((d) => d.bait, 0),
    essence: col((d) => d.essence, 0),
    scrap: col((d) => d.scrap, 0),
    glimmer: col((d) => d.glimmer),
    shards: col((d) => d.shards, 0),
    suppliesOwned: col((d) => d.suppliesOwned),
    itemsWorn: col((d) => d.itemsWorn),
    signedUpShare: rows.length === 0 ? null : round(signed.length / rows.length, 3),
    finaleWonShare: signed.length === 0 ? null : round(won / signed.length, 3),
    raidEssence: spreadOf(essence, 1),
    contributionShare: spreadOf(shares, 1),
  };
}

function milestoneSummary(id: string, journeys: readonly PlayerJourney[]): MilestoneSummary {
  const days = present(journeys.map((j) => j.milestones[id]));
  const m = spreadOf(days, 1);
  return {
    reached: journeys.length === 0 ? 0 : round(days.length / journeys.length, 3),
    days: m === null ? null : { ...m, p90: percentile(days, 90) as number, max: Math.max(...days) },
  };
}

function waitSummaries(journeys: readonly PlayerJourney[]): Record<string, WaitSummary> {
  const out: Record<string, WaitSummary> = {};
  for (const cause of LIMITS) {
    const per = journeys.map((j) => {
      const waits = j.waits.filter((w) => w.cause === cause);
      return {
        total: waits.reduce((n, w) => n + w.length, 0),
        longest: Math.max(0, ...waits.map((w) => w.length)),
        count: waits.length,
        track: waits[0]?.track,
      };
    });
    const waited = per.filter((p) => p.total > 0);
    if (waited.length === 0) continue;
    out[cause] = {
      playersWaiting: round(waited.length / per.length, 3),
      totalDaysMedian: round(median(per.map((p) => p.total)) ?? 0, 1),
      totalDaysMean: round(per.reduce((n, p) => n + p.total, 0) / per.length, 1),
      longestMax: Math.max(...waited.map((p) => p.longest)),
      longestMedian: round(median(waited.map((p) => p.longest)) ?? 0, 1),
      countMean: round(per.reduce((n, p) => n + p.count, 0) / per.length, 2),
      track: waited[0]?.track ?? 'growth',
    };
  }
  return out;
}

function shares(
  journeys: readonly PlayerJourney[],
  pick: (d: DayRecord) => readonly Limit[],
): Record<string, number> {
  const counts = new Map<Limit, number>();
  let days = 0;
  for (const j of journeys) {
    for (const d of j.days) {
      days += 1;
      for (const l of new Set(pick(d))) counts.set(l, (counts.get(l) ?? 0) + 1);
    }
  }
  return Object.fromEntries(
    LIMITS.flatMap((l) => (counts.has(l) ? [[l, round((counts.get(l) as number) / days, 3)]] : [])),
  );
}

/** Builds the report from the runs of all the servers. */
export function buildJourneyReport(
  settings: JourneySettings,
  runs: readonly ServerRun[],
): JourneyReport {
  const all = runs.flatMap((run) => run.journeys.map((journey) => ({ journey, run })));
  const presets: Record<string, PresetSummary> = {};
  for (const profile of settings.profiles) {
    const mine = all.filter((x) => x.journey.profile === profile.id);
    if (mine.length === 0) continue;
    const journeys = mine.map((x) => x.journey);
    const weeks = Array.from({ length: settings.weeks }, (_, k) => weekSummary(k + 1, mine));
    const perWeek = (f: (d: DayRecord) => number): number =>
      round(
        median(
          journeys.map((j) => {
            const last = j.days.at(-1);
            return last === undefined ? 0 : f(last) / Math.max(1, j.days.length / 7);
          }),
        ) ?? 0,
        2,
      );
    presets[profile.id] = {
      id: profile.id,
      label: profile.label,
      players: mine.length,
      weeks,
      milestones: Object.fromEntries(
        milestoneCatalogue().map((id) => [id, milestoneSummary(id, journeys)]),
      ),
      waits: waitSummaries(journeys),
      blockedShare: shares(journeys, (d) => d.blocked),
      bindingShare: shares(journeys, (d) => [d.limit]),
      suppliesPerWeek: {
        used: perWeek((d) => d.suppliesUsed),
        bought: perWeek((d) => d.suppliesBought),
      },
    };
  }
  const servers: ServerWeekSummary[] = Array.from({ length: settings.weeks }, (_, k) => {
    const week = k + 1;
    const raids = runs.flatMap((r) => r.economy.raids.filter((x) => x.week === week));
    return {
      week,
      raids: raids.length,
      finaleWonShare:
        raids.length === 0
          ? null
          : round(raids.filter((r) => r.summary.finaleWon).length / raids.length, 3),
      phase1ClearedShare:
        raids.length === 0
          ? null
          : round(raids.filter((r) => r.summary.phase1Cleared).length / raids.length, 3),
      rank: spreadOf(
        raids.map((r) => r.ladder.rank),
        1,
      ),
      signedUp: spreadOf(
        raids.map((r) => r.summary.signedUp),
        1,
      ),
    };
  });
  const examples: Record<string, PlayerJourney> = {};
  for (const x of runs[0]?.journeys ?? []) {
    if (examples[x.profile] === undefined) examples[x.profile] = x;
  }
  return {
    settings: {
      seed: settings.seed,
      weeks: settings.weeks,
      servers: settings.servers,
      income: settings.income,
      mix: settings.mixName,
      mixCounts: { ...settings.mix },
      noise: settings.noise,
      profiles: settings.profiles.map((p) => ({ ...p })),
    },
    presets,
    servers,
    examples,
  };
}

/** Plays every server of a run and builds its report. */
export function runJourneys(settings: JourneySettings): JourneyReport {
  const runs: ServerRun[] = [];
  for (let k = 0; k < settings.servers; k++) runs.push(runJourneyServer(settings, k));
  return buildJourneyReport(settings, runs);
}
