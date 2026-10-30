import { RULES, RESOURCES, type Rules } from './rules';
import { playersOf, type Results } from './scenarios';
import type { PlayerRun } from './sim';
import { PROFILES } from './profiles';
import { band, levelOf, medianOf, round, series, total, type Band } from './stats';
import { FORGE_BUCKETS, HOURS_PER_WEEK, R, type WeekRecord } from './types';
import { NEVER_DAYS, TARGETS, THRESHOLDS, judge, type Measures } from './targets';
import { median, quantile, sum } from './util';

/**
 * Turns the runs into the numbers behind the report (`ReportData`): everything the markdown prints and the JSON charts read.
 * All numbers are medians over seeds and players, with a spread (10th to 90th percentile) where it helps.
 */

const SAMPLE_WEEKS = [1, 2, 4, 8, 12, 24];
const LEDGER_PROFILES = [
  'daily',
  'active',
  'every-other-day',
  'weekend-off',
  'weekly',
  'new',
  'returner',
  'hoarder',
];

/** The players of a profile: the hoarder from the hoarder server, everyone else from the mixed server of 8. */
export const profilePlayers = (results: Results, id: string): PlayerRun[] =>
  id === 'hoarder' ? playersOf(results.hoarder, id) : playersOf(results.mixed8, id);

const weeksOf = (players: readonly PlayerRun[]): number =>
  Math.max(0, ...players.map((p) => p.weeks.length));

// ---------- the ledger ----------

export interface ResourceLedger {
  resource: string;
  inn: number[];
  out: number[];
  stock: Band[];
  waste: number[];
  nextDays: number;
  noNextShare: number;
  zeroShare: number;
  choices: number;
  dead: number | null;
  starved: boolean;
  /** The stock at the end of the run in weeks of that resource's spending (never under the floor share of its income). */
  pileWeeks: number;
}

/** What a resource's pile is measured against: its spending over the window ending at week index `end`, never under a floor share of its income. */
export function pileBasis(
  spend: readonly number[],
  income: readonly number[],
  end: number,
  windowWeeks: number,
  floorShare: number,
): number {
  const from = Math.max(0, end - windowWeeks + 1);
  const mean = (xs: readonly number[]): number => {
    const part = xs.slice(from, end + 1);
    return part.length ? part.reduce((a, b) => a + b, 0) / part.length : 0;
  };
  return Math.max(mean(spend), floorShare * mean(income), 1e-9);
}

/**
 * The first week from which the stock rises for `deadWeeks` weeks running and ends at a pile of at least `pileWeeks` weeks of what the
 * resource is spent on (its spending over those weeks, never under `floorShare` of its income, so a resource nothing takes counts as
 * dead once the pile is meaningful). Measured against spending, a bigger income does not make a pile look smaller.
 */
export function deadFrom(
  stock: readonly number[],
  spend: readonly number[],
  income: readonly number[],
  deadWeeks: number,
  pileWeeks: number,
  floorShare: number,
): number | null {
  for (let i = 0; i + deadWeeks < stock.length; i++) {
    let rising = true;
    for (let k = 0; k < deadWeeks; k++)
      if (!((stock[i + k + 1] ?? 0) > (stock[i + k] ?? 0))) rising = false;
    const end = i + deadWeeks;
    if (
      rising &&
      (stock[end] ?? 0) >= pileWeeks * pileBasis(spend, income, end, deadWeeks, floorShare)
    )
      return i + 1;
  }
  return null;
}

export function ledgerOf(players: readonly PlayerRun[]): ResourceLedger[] {
  const weeks = weeksOf(players);
  return RESOURCES.map((resource, r) => {
    const med = (pick: (w: WeekRecord) => number): number[] =>
      series(players, weeks, pick).map((b) => b.median);
    const stock = series(players, weeks, (w) => w.stock[r] ?? 0);
    const means: number[] = [];
    let zero = 0;
    let days = 0;
    let none = 0;
    let cells = 0;
    let choices = 0;
    let visits = 0;
    for (const p of players)
      p.weeks.forEach((w, i) => {
        if (i === 0) return;
        zero += w.zeroDays[r] ?? 0;
        days += w.daysSampled;
        choices += w.choices[r] ?? 0;
        visits += w.choiceVisits;
        cells += 1;
        const n = w.nextDaysCount[r] ?? 0;
        if (n < w.daysSampled / 2) none += 1;
        else if (i < 12) means.push((w.nextDaysSum[r] ?? 0) / n);
      });
    const medianStock = stock.map((b) => b.median);
    return {
      resource,
      inn: med((w) => w.inn[r] ?? 0),
      out: med((w) => w.out[r] ?? 0),
      stock,
      waste: med((w) => w.waste[r] ?? 0),
      nextDays: median(means),
      noNextShare: cells ? none / cells : 0,
      zeroShare: days ? zero / days : 0,
      choices: visits ? choices / visits : 0,
      dead: deadFrom(
        medianStock,
        med((w) => w.out[r] ?? 0),
        med((w) => w.inn[r] ?? 0),
        THRESHOLDS.deadWeeks,
        THRESHOLDS.deadPileWeeks,
        THRESHOLDS.deadSpendFloor,
      ),
      starved: days > 0 && zero / days > THRESHOLDS.starvedZeroShare,
      pileWeeks:
        (medianStock[medianStock.length - 1] ?? 0) /
        pileBasis(
          med((w) => w.out[r] ?? 0),
          med((w) => w.inn[r] ?? 0),
          medianStock.length - 1,
          THRESHOLDS.deadWeeks,
          THRESHOLDS.deadSpendFloor,
        ),
    };
  });
}

export interface PriceRow {
  resource: string;
  what: string;
  price: number;
  hours: number;
}

/** Prices in hours of a daily player's idle income of the same resource (resources.md: "relative value"). */
export function priceTable(daily: readonly PlayerRun[], rules: Rules): PriceRow[] {
  const perHour = RESOURCES.map((_, r) => {
    const per = daily.map((p) => total(p, 4, 12, (w) => w.inn[r] ?? 0) / (9 * HOURS_PER_WEEK));
    return median(per);
  });
  const row = (resource: (typeof RESOURCES)[number], what: string, price: number): PriceRow => ({
    resource,
    what,
    price,
    hours: price / Math.max(perHour[RESOURCES.indexOf(resource)] ?? 1e-9, 1e-9),
  });
  const rows: PriceRow[] = [];
  rules.seats.scoutPrices.forEach((p, i) => {
    if (p > 0) rows.push(row('acorns', `scout seat ${i + 1} (place level 1)`, p));
  });
  rules.seats.anvilPrices.forEach((p, i) => {
    if (p > 0) rows.push(row('acorns', `anvil ${i + 1} (place level 1)`, p));
  });
  rows.push(row('acorns', 'one kit item', rules.kit.price));
  rows.push(
    row(
      'acorns',
      'a level 2 project at 8 players (first level)',
      rules.commons.baseSize * rules.commons.levelFactor[0]!,
    ),
  );
  rules.seats.anvilScrap.forEach((s, i) => {
    if (s > 0) rows.push(row('scrap', `anvil ${i + 1}'s scrap`, s));
  });
  rows.push(row('scrap', 'one Forge piece', rules.forge.scrap));
  rows.push(row('shards', 'one Forge piece', rules.forge.shard));
  rows.push(row('essence', 'one evolution', rules.xp.evolveEssence));
  rows.push(row('essence', 'Reach for Rare', rules.forge.reach.rare.essence));
  rows.push(row('essence', 'Reach for Epic', rules.forge.reach.epic.essence));
  return rows;
}

// ---------- growth ----------

export interface GrowthRow {
  profile: string;
  /** Levels of the 1st, 3rd, 10th and 20th creature by week (a band each), and the roster size. */
  first: Band[];
  third: Band[];
  tenth: Band[];
  twentieth: Band[];
  size: Band[];
  species: Band[];
  forms: Band[];
  availableForms: Band[];
  /** Species available that week (the pool grows with content drops) and the share of them the player owns. */
  available: Band[];
  speciesShare: Band[];
  /** XP by source over weeks 1 to 12 (medians per player). */
  xp: { idle: number; catchUp: number; dungeon: number; raid: number; lost: number };
  /** Days since joining until the 1st, 3rd and 10th creature stood at level 30: the median of those that did, and how many did. */
  day30: { median: number | null; reached: number; of: number }[];
  catchUpDays: number | null;
  /** Creatures held at their evolution level (waiting for Essence) at the end of week 4, 12 and 24 (median). */
  waiting: { week: number; evolve: number }[];
  /** Kinds owned by rarity (common, rare, epic) by week, and the kinds available of each rarity (Q38). */
  byRarity: { owned: Band[][]; available: Band[][] };
  /** The share of the roster holding at least Bronze, Silver and Gold by week (honours never gate anything). */
  honours: Band[][];
  /** The week the player owns 10, 14 and 30 lines (median; null: not within the run), and duplicates arriving per visit. */
  speciesWeeks: (number | null)[];
  duplicatesPerVisit: number;
}

export function growthOf(players: readonly PlayerRun[], profile: string): GrowthRow {
  const weeks = weeksOf(players);
  const xp = (pick: (w: WeekRecord) => number): number =>
    medianOf(players, (p) => total(p, 1, 12, pick));
  const day30 = [0, 1, 2].map((k) => {
    const days = players.flatMap((p) =>
      p.day30[k] === null || p.day30[k] === undefined ? [] : [p.day30[k]],
    );
    return { median: days.length ? median(days) : null, reached: days.length, of: players.length };
  });
  const back = players.flatMap((p) => (p.catchUpDays === null ? [] : [p.catchUpDays]));
  return {
    profile,
    first: series(players, weeks, (w) => levelOf(w, 1)),
    third: series(players, weeks, (w) => levelOf(w, 3)),
    tenth: series(players, weeks, (w) => levelOf(w, 10)),
    twentieth: series(players, weeks, (w) => levelOf(w, 20)),
    size: series(players, weeks, (w) => w.size),
    species: series(players, weeks, (w) => w.species),
    available: series(players, weeks, (w) => w.available),
    speciesShare: series(players, weeks, (w) => (w.available > 0 ? w.species / w.available : 0)),
    forms: series(players, weeks, (w) => w.forms),
    availableForms: series(players, weeks, (w) => w.availableForms),
    xp: {
      idle: xp((w) => w.xpIdle),
      catchUp: xp((w) => w.xpCatch),
      dungeon: xp((w) => w.xpDungeon),
      raid: xp((w) => w.xpRaid),
      lost: xp((w) => w.xpLost),
    },
    day30,
    catchUpDays: back.length ? median(back) : null,
    waiting: [4, 12, 24].map((week) => ({
      week,
      evolve: median(
        players.flatMap((p) => (p.weeks[week - 1] ? [p.weeks[week - 1]!.waitingEvolve] : [])),
      ),
    })),
    byRarity: {
      owned: [0, 1, 2].map((r) => series(players, weeks, (w) => w.kindsByRarity[r] ?? 0)),
      available: [0, 1, 2].map((r) => series(players, weeks, (w) => w.availableByRarity[r] ?? 0)),
    },
    honours: [0, 1, 2].map((h) =>
      series(players, weeks, (w) => (w.size > 0 ? (w.honours[h] ?? 0) / w.size : 0)),
    ),
    speciesWeeks: [10, 14, 30].map((n) => {
      const week = series(players, weeks, (w) => w.species).findIndex((b) => b.median >= n);
      return week >= 0 ? week + 1 : null;
    }),
    duplicatesPerVisit:
      sum(players.map((p) => total(p, 1, 24, (w) => w.duplicates))) /
      Math.max(1, sum(players.map((p) => total(p, 1, 24, (w) => w.visits)))),
  };
}

// ---------- the Forge ----------

export interface ForgeRow {
  profile: string;
  /** The share of anvil-hours (weeks 2 to 12) by what they did, median over players, and the worst week's median share. */
  share: Record<string, number>;
  worst: Record<string, number>;
  piecesPerWeek: number;
  worn: number;
  dismantled: number;
  bagFillsWeek: number | null;
  bag12: number;
  bag24: number;
  /** Medians by week: pieces made, worn and dismantled. */
  weekly: { made: number[]; worn: number[]; dismantled: number[] };
}

export const forgeShares = (w: WeekRecord): number[] => {
  const all = sum(w.forge);
  return w.forge.map((x) => (all > 0 ? x / all : 0));
};

export function forgeOf(players: readonly PlayerRun[], profile: string, rules: Rules): ForgeRow {
  const weeks = Math.min(12, weeksOf(players));
  const share: Record<string, number> = {};
  const worst: Record<string, number> = {};
  FORGE_BUCKETS.forEach((bucket, c) => {
    const perWeek = series(players, weeks, (w) => forgeShares(w)[c] ?? 0).slice(1);
    share[bucket] = median(perWeek.map((b) => b.median));
    worst[bucket] = Math.max(0, ...perWeek.map((b) => b.median));
  });
  const never = series(players, weeksOf(players), (w) => w.bagNever).map((b) => b.median);
  const fills = never.findIndex((n) => n >= rules.forge.bag);
  return {
    profile,
    share,
    worst,
    piecesPerWeek: medianOf(players, (p) => total(p, 2, 12, (w) => w.piecesMade) / 11),
    worn: medianOf(players, (p) => total(p, 1, 24, (w) => w.piecesWorn)),
    dismantled: medianOf(players, (p) => total(p, 1, 24, (w) => w.piecesDismantled)),
    bagFillsWeek: fills >= 0 ? fills + 1 : null,
    bag12: median(players.map((p) => p.weeks[11]?.bag ?? 0)),
    bag24: median(players.map((p) => p.weeks[23]?.bag ?? 0)),
    weekly: {
      made: series(players, weeksOf(players), (w) => w.piecesMade).map((b) => b.median),
      worn: series(players, weeksOf(players), (w) => w.piecesWorn).map((b) => b.median),
      dismantled: series(players, weeksOf(players), (w) => w.piecesDismantled).map((b) => b.median),
    },
  };
}

// ---------- the server ----------

export interface ServerRow {
  id: string;
  label: string;
  players: number;
  /** Median place levels (bonfire, forge, signpost, paddock, school) at the end of each week. */
  levels: number[][];
  /** Median fire by week. */
  fire: number[];
  keystones: number[];
  collections: number[];
  /** Server coverage by week: the share of each rarity's available LINES that at least one player owns (common, rare, epic), and the same counted in forms. */
  coverage: number[][];
  /** The same for the launch lines only (no content drops in the pool). */
  launchCoverage: number[][];
  formCoverage: number[][];
  /** The week each fire threshold opened (median over seeds; null: not within the horizon). */
  thresholds: (number | null)[];
  firstLevelDay: number | null;
  /** The week the first collection was completed (median over seeds; null: fewer than half of the seeds did). */
  firstCollectionWeek: number | null;
  /** Days each project took from opening to done: the first three, median over seeds. */
  projectDays: number[];
  givingShare: number;
  topGiverShare: number;
  communalShare: number;
  levelUpsByWeek12: number;
  /** The fire's warmth by source at the end of the run (median over seeds). */
  warmth: Record<string, number>;
}

export function serverOf(results: Results, id: string): ServerRow | null {
  const result = results[id];
  if (!result) return null;
  const weeks = result.config.weeks;
  const runs = result.runs;
  const at = (pick: (l: (typeof runs)[number]['log'][number]) => number): number[] =>
    Array.from({ length: weeks }, (_, i) =>
      median(runs.map((r) => (r.log[i] ? pick(r.log[i]) : 0))),
    );
  const places = runs[0]?.log[0]?.levels.length ?? 5;
  const levels = Array.from({ length: weeks }, (_, i) =>
    Array.from({ length: places }, (_, k) => median(runs.map((r) => r.log[i]?.levels[k] ?? 1))),
  );
  const thresholds = (RULES.fire.thresholds as readonly number[]).map((_, t) => {
    const values = runs.flatMap((r) =>
      r.thresholds[t] === null || r.thresholds[t] === undefined ? [] : [r.thresholds[t]],
    );
    return values.length * 2 > runs.length ? median(values) : null;
  });
  const first = runs.flatMap((r) => (r.levelUps[0] ? [r.levelUps[0].hour / 24] : []));
  const projectDays = [0, 1, 2].map((k) =>
    median(
      runs.flatMap((r) =>
        r.projectDurations[k] === undefined ? [] : [r.projectDurations[k] / 24],
      ),
    ),
  );
  const income = (p: PlayerRun): number =>
    sum(
      p.weeks.map(
        (w) => (w.inn[R.acorns] ?? 0) + (w.inn[R.scrap] ?? 0) + 2 * (w.inn[R.shards] ?? 0),
      ),
    );
  const given = (p: PlayerRun): number => sum(p.weeks.map((w) => w.gifts));
  const giving = runs.map(
    (r) => sum(r.players.map(given)) / Math.max(1, sum(r.players.map(income))),
  );
  const top = runs.map(
    (r) =>
      Math.max(0, ...r.gifts.map((g) => g ?? 0)) / Math.max(1, sum(r.gifts.map((g) => g ?? 0))),
  );
  const communal = runs.map(
    (r) => r.communal / Math.max(1, r.communal + sum(r.gifts.map((g) => g ?? 0))),
  );
  return {
    id,
    label: result.config.label,
    players: result.config.players.length,
    levels,
    fire: at((l) => l.fire),
    keystones: at((l) => l.keystones),
    collections: at((l) => l.collections),
    formCoverage: Array.from({ length: weeks }, (_, i) =>
      [0, 1, 2].map((r) => median(runs.map((run) => run.log[i]?.formCoverage[r] ?? 0))),
    ),
    launchCoverage: Array.from({ length: weeks }, (_, i) =>
      [0, 1, 2].map((r) => median(runs.map((run) => run.log[i]?.launchCoverage[r] ?? 0))),
    ),
    coverage: Array.from({ length: weeks }, (_, i) =>
      [0, 1, 2].map((r) => median(runs.map((run) => run.log[i]?.coverage[r] ?? 0))),
    ),
    thresholds,
    firstLevelDay: first.length ? median(first) : null,
    firstCollectionWeek: (() => {
      const hours = runs.flatMap((r) =>
        r.firstCollectionHour === null ? [] : [r.firstCollectionHour],
      );
      return hours.length * 2 > runs.length ? Math.floor(median(hours) / HOURS_PER_WEEK) + 1 : null;
    })(),
    projectDays,
    givingShare: median(giving),
    topGiverShare: median(top),
    communalShare: median(communal),
    levelUpsByWeek12: median(
      runs.map((r) => r.levelUps.filter((u) => u.hour < 12 * HOURS_PER_WEEK).length),
    ),
    warmth: Object.fromEntries(
      ['places', 'forge', 'collections', 'bosses', 'masters', 'cosmetic'].map((k) => [
        k,
        median(runs.map((r) => r.warmth[k] ?? 0)),
      ]),
    ),
  };
}

// ---------- the shard exchange by policy ----------

export interface ExchangeRow {
  policy: string;
  exchange: boolean;
  /** The share of anvil-hours spent waiting for a shard, mean over weeks 2 to 12 and its worst week. */
  shardStallMean: number;
  shardStallWorst: number;
  /** The share spent making pieces. */
  making: number;
  /** XP lost to evolution waits over weeks 1 to 12, and creatures waiting at their evolution level at week 12. */
  xpLost: number;
  waitingEvolve12: number;
  /** Exchanges a week (weeks 2 to 12) and the share that were crits. */
  exchangesPerWeek: number;
}

export function exchangeRowsOf(results: Results): ExchangeRow[] {
  const cases: [string, boolean, string][] = [
    ['set-and-forget', false, 'mixed8-sf-noexchange'],
    ['set-and-forget', true, 'mixed8-sf'],
    ['optimiser', false, 'mixed8-opt-noexchange'],
    ['optimiser', true, 'mixed8-opt'],
  ];
  const shardIdx = FORGE_BUCKETS.indexOf('shard');
  const workIdx = FORGE_BUCKETS.indexOf('work');
  return cases.flatMap(([policy, exchange, id]) => {
    const players = playersOf(results[id], 'daily');
    if (players.length === 0) return [];
    const stall = series(players, 12, (w) => forgeShares(w)[shardIdx] ?? 0)
      .slice(1)
      .map((b) => b.median);
    const making = series(players, 12, (w) => forgeShares(w)[workIdx] ?? 0)
      .slice(1)
      .map((b) => b.median);
    return [
      {
        policy,
        exchange,
        shardStallMean: sum(stall) / Math.max(1, stall.length),
        shardStallWorst: Math.max(0, ...stall),
        making: sum(making) / Math.max(1, making.length),
        xpLost: medianOf(players, (p) => total(p, 1, 12, (w) => w.xpLost)),
        waitingEvolve12: median(players.map((p) => p.weeks[11]?.waitingEvolve ?? 0)),
        exchangesPerWeek: medianOf(players, (p) => total(p, 2, 12, (w) => w.exchanges) / 11),
      },
    ];
  });
}

// ---------- variants ----------

export interface VariantRow {
  id: string;
  label: string;
  firstLevelDay: number | null;
  levelUpsByWeek12: number;
  fireWeek12: number;
  dailyBestWeek12: number;
  /** The share of a daily player's idle gains (effective hours, weeks 1 to 12). */
  weekendShare: number;
  weeklyShare: number;
  collectionsWeek12: number;
  /** Median place levels at the end of week 12 (hearth, forge, signpost, paddock, school). */
  levelsWeek12: number[];
  /** T-1: the 3rd best minus the 10th best at week 4. */
  spreadWeek4: number;
}

const VARIANT_IDS = [
  'mixed8',
  'mixed8-everything',
  'mixed8-essence',
  'mixed8-creatures2',
  'mixed8-catchfights',
  'mixed8-curveA',
  'mixed8-nocommunal',
  'mixed8-sf',
  'mixed8-opt',
  'mixed8-give10',
  'mixed8-give60',
];

export function variantsOf(results: Results): VariantRow[] {
  return VARIANT_IDS.flatMap((id) => {
    const server = serverOf(results, id);
    const result = results[id];
    if (!server || !result) return [];
    const eff = (profile: string): number =>
      median(playersOf(result, profile).map((p) => total(p, 1, 12, (w) => w.effHours)));
    const daily = eff('daily');
    return [
      {
        id,
        label: server.label,
        firstLevelDay: server.firstLevelDay,
        levelUpsByWeek12: server.levelUpsByWeek12,
        fireWeek12: server.fire[11] ?? 0,
        dailyBestWeek12: median(playersOf(result, 'daily').map((p) => levelOf(p.weeks[11]!, 1))),
        weekendShare: eff('weekend-off') / Math.max(1e-9, daily),
        weeklyShare: eff('weekly') / Math.max(1e-9, daily),
        collectionsWeek12: server.collections[11] ?? 0,
        levelsWeek12: server.levels[11] ?? [],
        spreadWeek4: median(
          playersOf(result, 'daily').map((p) => levelOf(p.weeks[3]!, 3) - levelOf(p.weeks[3]!, 10)),
        ),
      },
    ];
  });
}

// ---------- targets ----------

export interface TargetLine {
  id: string;
  pass: boolean;
  /** An informational line is shown without a PASS or FAIL (the target is judged elsewhere). */
  info?: boolean;
  /** What was measured, in plain words, and the target. */
  measured: string;
  target: string;
}

const pct = (x: number): string => `${round(x * 100)}%`;

/** What posts and the allowance brought over the 24 weeks (fights excluded), in Acorns' worth: allowance, scouts' scrap, shards x2. */
function idleOutput(p: PlayerRun): number {
  const s = (key: string): number => p.sources[key] ?? 0;
  return s(`in:${R.acorns}:allowance`) + s(`in:${R.scrap}:scouts`) + 2 * s(`in:${R.shards}:scouts`);
}

/** The median of the defined numbers (a measure that needs a week the run does not have is missing, not zero). */
function medianDefined(values: readonly (number | undefined)[]): number | undefined {
  const defined = values.filter((v): v is number => v !== undefined && Number.isFinite(v));
  return defined.length ? median(defined) : undefined;
}

/** The week record `i` (0-based) of a player, if the run is that long. */
const weekAt = (p: PlayerRun, i: number): WeekRecord | undefined => p.weeks[i];

const spreadAt = (p: PlayerRun, week: number, low: number): number | undefined => {
  const w = weekAt(p, week - 1);
  return w ? levelOf(w, 3) - levelOf(w, low) : undefined;
};

/** The worst week's share of anvil-hours spent on one thing, over the typical profiles and weeks 2 to 12 (T-4). */
function worstStall(
  results: Results,
  idx: number,
  weeks: number,
): { id: string; share: number; week: number; mean: number } {
  const typical = ['daily', 'active', 'every-other-day', 'weekend-off', 'weekly'];
  return typical
    .map((id) => {
      const s = series(profilePlayers(results, id), weeks, (w) => forgeShares(w)[idx] ?? 0)
        .slice(1)
        .map((b) => b.median);
      const top = Math.max(0, ...s);
      return { id, share: top, week: s.indexOf(top) + 2, mean: sum(s) / Math.max(1, s.length) };
    })
    .reduce((x, y) => (y.share > x.share ? y : x));
}

/**
 * The numbers the targets are bounds on (`targets.ts`), from the runs of the scenarios they need (`mixed8`, and `mixed8-opt` for
 * T-2a). A measure whose scenario was not run, or whose week the run does not reach, is missing. A returner that never gets
 * within 2 levels of the middle counts as `NEVER_DAYS`.
 */
export function measuresOf(results: Results): Measures {
  const m: Measures = {};
  const put = (name: keyof Measures, value: number | undefined): void => {
    if (value !== undefined && Number.isFinite(value)) m[name] = value;
  };
  const daily = playersOf(results.mixed8, 'daily');
  const long = (p: PlayerRun, n: number): boolean => p.weeks.length >= n;
  put('spread4', medianDefined(daily.map((p) => spreadAt(p, 4, 10))));
  put('spread8', medianDefined(daily.map((p) => spreadAt(p, 8, 6))));
  // T-1: the share of the creatures owned two weeks or more that stand within 5 levels of the 3rd best (the worst and the median gap are report-only).
  const benchShare = (p: PlayerRun, week: number): number | undefined => {
    const w = weekAt(p, week - 1);
    return w && w.benchCount > 0 ? w.benchWithin / w.benchCount : undefined;
  };
  put('bench4', medianDefined(daily.map((p) => benchShare(p, 4))));
  put('bench8', medianDefined(daily.map((p) => benchShare(p, 8))));
  // T-2a: an active optimiser against a daily optimiser (visits add no rate in the model, so the ratio is by construction).
  const optDaily = playersOf(results['mixed8-opt'], 'daily').filter((p) => long(p, 12));
  const optActive = playersOf(results['mixed8-opt'], 'active').filter((p) => long(p, 12));
  if (optDaily.length && optActive.length) {
    const xpAll = (p: PlayerRun): number =>
      total(p, 1, 12, (w) => w.xpIdle + w.xpCatch + w.xpDungeon + w.xpRaid);
    put('activeXpRatio', median(optActive.map(xpAll)) / Math.max(1, median(optDaily.map(xpAll))));
    put(
      'activeOutputRatio',
      median(optActive.map(idleOutput)) / Math.max(1, median(optDaily.map(idleOutput))),
    );
  }
  // T-2b, T-2c: weeks 1 to 12 of a weekend-off and a weekly player against a daily player.
  const full = (id: string): PlayerRun[] =>
    playersOf(results.mixed8, id).filter((p) => long(p, 12));
  const dailyFull = full('daily');
  if (dailyFull.length) {
    const eff = (p: PlayerRun): number => total(p, 1, 12, (w) => w.effHours);
    const perCreature = (p: PlayerRun): number =>
      total(p, 1, 12, (w) => w.xpIdle + w.xpCatch) /
      Math.max(
        1,
        total(p, 1, 12, (w) => w.creatureHours),
      );
    const weekend = full('weekend-off');
    const weekly = full('weekly');
    if (weekend.length) put('weekendShare', median(weekend.map(eff)) / median(dailyFull.map(eff)));
    if (weekly.length)
      put('weeklyXpShare', median(weekly.map(perCreature)) / median(dailyFull.map(perCreature)));
    put('best10', median(dailyFull.map((p) => levelOf(p.weeks[9]!, 1))));
    put('best12', median(dailyFull.map((p) => levelOf(p.weeks[11]!, 1))));
    const stall = worstStall(results, FORGE_BUCKETS.indexOf('scrap'), 12);
    put('scrapStall', stall.share);
  }
  // T-8 (Q38): lines (what scouts find; evolved forms are reported beside them) owned by a daily player: how many, how many of the starting pool's commons, how many rares and epics.
  const kindsAt = (week: number): number | undefined =>
    medianDefined(daily.map((p) => weekAt(p, week - 1)?.species));
  put('kinds4', kindsAt(4));
  put('kinds12', kindsAt(12));
  const startCommons = RULES.scouts.lines.first.filter((l) => l.rarity === 0).length;
  const commonsOwned = medianDefined(daily.map((p) => weekAt(p, 5)?.startCommons));
  put('commons6', commonsOwned === undefined ? undefined : commonsOwned / startCommons);
  const shareOf = (r: number): number | undefined => {
    const owned = medianDefined(daily.map((p) => weekAt(p, 23)?.kindsByRarity[r]));
    const avail = medianDefined(daily.map((p) => weekAt(p, 23)?.availableByRarity[r]));
    return owned !== undefined && avail ? owned / avail : undefined;
  };
  put('rares24', shareOf(1));
  put('waitingEvolve12', medianDefined(daily.map((p) => weekAt(p, 11)?.waitingEvolve)));
  put('epics24', shareOf(2));
  // T-2d: a returner (back in week 9) keeps their levels and gets within 2 levels of the middle (censored at NEVER_DAYS).
  const returner = playersOf(results.mixed8, 'returner').filter((p) => long(p, 9));
  if (returner.length) {
    put(
      'keptLevels',
      median(returner.map((p) => levelOf(p.weeks[8]!, 1) - levelOf(p.weeks[3]!, 1))),
    );
    put('returnDays', median(returner.map((p) => p.catchUpDays ?? NEVER_DAYS)));
  }
  // T-3: the commons.
  const server = serverOf(results, 'mixed8');
  if (server && server.levels.length >= 12) {
    put('firstLevelDay', server.firstLevelDay ?? NEVER_DAYS);
    put('collections12', server.collections[11] ?? 0);
    put('levelUps12', server.levelUpsByWeek12);
  }
  // The fire of a server that kills every boss: about 50 at week 12 (commons.md), under the gear ladder's top before week 24.
  const all = serverOf(results, 'mixed8-all');
  if (all && all.fire.length >= 12) put('fire12All', all.fire[11]);
  if (all && all.fire.length >= 24) put('fire23All', all.fire[22]);
  // T-7: resources of a daily player that are dead (a pile rising 4 weeks, at 4 weeks of spending) from before week 12.
  if (dailyFull.length && dailyFull.every((p) => p.weeks.length >= 16)) {
    put(
      'deadBefore12',
      ledgerOf(playersOf(results.mixed8, 'daily')).filter((l) => l.dead !== null && l.dead < 12)
        .length,
    );
  }
  return m;
}

export function targetsOf(results: Results, rules: Rules): TargetLine[] {
  const lines: TargetLine[] = [];
  const m = measuresOf(results);
  const judged = judge(TARGETS, m);
  const metLine = (line: string): boolean =>
    judged.filter((j) => j.target.line === line).every((j) => j.met === true);
  const daily = playersOf(results.mixed8, 'daily');
  // T-1: a new catch becomes useful within days (the creatures owned two weeks or more stand within 5 levels of the 3rd best).
  const spread8 = m.spread8 ?? NaN;
  const benchOf = (
    players: readonly PlayerRun[],
    week: number,
  ): { share: number; worst: number; median: number; open: number } => {
    const at = (pick: (w: WeekRecord) => number): number =>
      medianDefined(
        players.map((p) => (weekAt(p, week - 1) ? pick(weekAt(p, week - 1)!) : undefined)),
      ) ?? NaN;
    return {
      share:
        medianDefined(
          players.map((p) => {
            const w = weekAt(p, week - 1);
            return w && w.benchCount > 0 ? w.benchWithin / w.benchCount : undefined;
          }),
        ) ?? NaN,
      worst: at((w) => w.benchWorst),
      median: at((w) => w.benchMedian),
      open: at((w) => w.benchOpenWorst),
    };
  };
  const bench4 = benchOf(daily, 4);
  const bench8 = benchOf(daily, 8);
  const optBench4 = benchOf(playersOf(results['mixed8-opt'], 'daily'), 4);
  const fastBench4 = benchOf(playersOf(results['mixed8-creatures2'], 'daily'), 4);
  const fastOptBench4 = benchOf(playersOf(results['mixed8-creatures2-opt'], 'daily'), 4);
  const shareMin = TARGETS.find((t) => t.id === 'T-1a')?.lo ?? 0.9;
  const verdict = (v: number): string => (v >= shareMin ? 'pass' : 'fail');
  const gaps = (b: { worst: number; median: number; open: number }): string =>
    `worst ${round(b.worst, 1)} levels below the 3rd best, median ${round(b.median, 1)}, worst without those held at the evolution level ${round(b.open, 1)}`;
  lines.push({
    id: 'T-1',
    pass: metLine('T-1'),
    measured: `of the creatures a daily player has owned for two weeks or more, ${pct(bench4.share)} are within 5 levels of their 3rd best at week 4 (${gaps(bench4)}) and ${pct(bench8.share)} at week 8 (${gaps(bench8)}); the 6th creature (a second team's best) is ${round(spread8, 1)} below the 3rd at week 8. An optimiser's share at week 4 is ${pct(optBench4.share)} (${verdict(optBench4.share)}). It also depends on how fast creatures arrive: at the docs' 2% an hour (the default here is ${round(rules.scouts.perHour.creatures * 100, 2)}%) a set-and-forget player's share at week 4 is ${pct(fastBench4.share)} (${verdict(fastBench4.share)}) and an optimiser's ${pct(fastOptBench4.share)} (${verdict(fastOptBench4.share)})`,
    target:
      'creatures owned two weeks or more within 5 levels of the 3rd best at weeks 4 and 8, and two strong teams at week 8',
  });
  // T-2: idle floor and active ceiling.
  lines.push({
    id: 'T-2a',
    pass: metLine('T-2a'),
    measured: `an optimiser visiting three times a day gets ${pct(m.activeXpRatio ?? NaN)} of an optimiser visiting once in XP and ${pct(m.activeOutputRatio ?? NaN)} in posts' and the allowance's output over 24 weeks. In the model extra visits add no rate (idle gains run at the same rate however often a player looks in), so this passes by construction: it shows only that nothing in the rules pays a frequent visitor more, not that choices are worth little`,
    target: 'under 110%',
  });
  // The share of a daily player's idle gains: effective hours (the away steps) over weeks 1 to 12, so the roster's size cancels out.
  const eff = (p: PlayerRun): number => total(p, 1, 12, (w) => w.effHours);
  const effDaily = median(playersOf(results.mixed8, 'daily').map(eff));
  const weekly = median(playersOf(results.mixed8, 'weekly').map(eff)) / effDaily;
  // XP per creature-hour with fights, and the finds a scout seat brings home.
  const perCreature = (p: PlayerRun, pick: (w: WeekRecord) => number): number =>
    total(p, 1, 12, pick) /
    Math.max(
      1,
      total(p, 1, 12, (w) => w.creatureHours),
    );
  const withFights =
    median(
      playersOf(results.mixed8, 'weekly').map((p) =>
        perCreature(p, (w) => w.xpIdle + w.xpCatch + w.xpDungeon + w.xpRaid),
      ),
    ) /
    median(daily.map((p) => perCreature(p, (w) => w.xpIdle + w.xpCatch + w.xpDungeon + w.xpRaid)));
  const finds = (id: string): number =>
    median(
      playersOf(results.mixed8, id).map(
        (p) =>
          total(p, 1, 12, (w) => w.storeHours) /
          Math.max(
            1,
            total(p, 1, 12, (w) => w.scoutSeats),
          ),
      ),
    );
  const findsShare = finds('weekly') / Math.max(1e-9, finds('daily'));
  const bestAt12 = (id: string): number =>
    median(playersOf(results.mixed8, id).map((p) => levelOf(p.weeks[11]!, 1)));
  lines.push({
    id: 'T-2b',
    pass: metLine('T-2b'),
    measured: `a weekend-off player gets ${pct(m.weekendShare ?? NaN)} of a daily player's idle growth (effective hours, weeks 1 to 12)`,
    target: 'about 100% (a weekend off costs almost nothing)',
  });
  lines.push({
    id: 'T-2c',
    pass: metLine('T-2c'),
    measured: `a weekly player's XP per creature, catch-up included, is ${pct(m.weeklyXpShare ?? NaN)} of a daily player's (idle gains alone: ${pct(weekly)}; with fights: ${pct(withFights)}; their best creature is level ${round(bestAt12('weekly'), 1)} at week 12 against a daily player's ${round(bestAt12('daily'), 1)}). Their scouts bring home ${pct(findsShare)} of a daily player's finds per seat (stores of three days: about 72 of 168 hours)`,
    target: "about 75% to 80% of a daily player's XP per creature (goals.md T-2)",
  });
  const backFights = median(
    playersOf(results['mixed8-catchfights'], 'returner').map((p) => p.catchUpDays ?? NEVER_DAYS),
  );
  const kept = m.keptLevels ?? NaN;
  const back = m.returnDays ?? NaN;
  const daysText = (d: number): string => (d >= NEVER_DAYS ? 'more than 100' : String(round(d, 1)));
  lines.push({
    id: 'T-2d',
    pass: metLine('T-2d'),
    measured: `a player back after four weeks away keeps every level (best creature ${kept >= 0 ? '+' : ''}${round(kept, 1)} levels vs before) and their 3rd-best creature is within ${THRESHOLDS.agreeWithin} levels of the server's middle after ${daysText(back)} days of visits (the target is about 14; if catch-up also boosted fight XP: ${daysText(backFights)} days)`,
    target:
      "recognises the roster; within about two weeks of daily visits of the server's middle (V-BON-2)",
  });
  // T-3: commons pacing.
  const mixed8 = serverOf(results, 'mixed8');
  const collections12 = m.collections12 ?? 0;
  const firstCollection = mixed8?.firstCollectionWeek ?? null;
  lines.push({
    id: 'T-3',
    pass: metLine('T-3'),
    measured: `a server of 8 lifts its first place a level on day ${round(m.firstLevelDay ?? 0, 1)}; its first collection is done ${firstCollection === null ? 'after week 24' : `in week ${firstCollection}`} (the docs expect weeks 3 to 4) and ${collections12} collection${collections12 === 1 ? ' is' : 's are'} done by week 12 (no project needs one)`,
    target:
      'first level within 14 days; the rare-find route matters (at least one collection by week 12) without being required',
  });
  const levelUps12 = m.levelUps12 ?? NaN;
  lines.push({
    id: 'T-3 (pace)',
    pass: metLine('T-3p'),
    measured: `by week 12 a server of 8 has ${round(levelUps12)} place level-ups across the valley and a fire of ${round(m.fire12All ?? NaN)} if it kills every boss (${round(m.fire23All ?? NaN)} at week 23)`,
    target:
      'about 5 to 6 level-ups by week 12; the fire about 50 at week 12 and under about 100 before week 24 (commons.md)',
  });
  // T-4: no dead chains: the share of anvil-hours spent tinkering for want of scrap in the worst week (goals.md). Shard stalls and a
  // full floor are reported next to it, not judged.
  const scrapWorst = worstStall(results, FORGE_BUCKETS.indexOf('scrap'), 12);
  const shardWorst = worstStall(results, FORGE_BUCKETS.indexOf('shard'), 12);
  const floorWorst = worstStall(results, FORGE_BUCKETS.indexOf('floor'), 12);
  const stallMax = TARGETS.find((t) => t.id === 'T-4')?.hi ?? THRESHOLDS.tinkerSmallShare;
  lines.push({
    id: 'T-4',
    pass: metLine('T-4'),
    measured: `in the worst week (weeks 2 to 12) a typical player's anvils tinker for want of scrap ${pct(scrapWorst.share)} of the time (${scrapWorst.id}, week ${scrapWorst.week})`,
    target: `at most ${pct(stallMax)} for want of scrap`,
  });
  lines.push({
    id: 'T-4 (shards)',
    pass: shardWorst.share <= stallMax,
    info: true,
    measured: `for want of a shard of the element the team needs, the worst week is ${pct(shardWorst.share)} (${shardWorst.id}, week ${shardWorst.week}); averaged over weeks 2 to 12 that profile loses ${pct(shardWorst.mean)}. With the Forge floor full the worst week is ${pct(floorWorst.share)} (${floorWorst.id}, week ${floorWorst.week}), mean ${pct(floorWorst.mean)}`,
    target: `goals.md T-4 names scrap only; shards are shown for the same ${pct(stallMax)}`,
  });
  // T-8 (Q38): collection pace.
  lines.push({
    id: 'T-8',
    pass: metLine('T-8'),
    measured: `a daily player owns ${round(m.kinds4 ?? NaN)} lines at week 4 and ${round(m.kinds12 ?? NaN)} at week 12 (with the forms they evolved into: ${round(medianDefined(daily.map((p) => weekAt(p, 3)?.forms)) ?? NaN)} and ${round(medianDefined(daily.map((p) => weekAt(p, 11)?.forms)) ?? NaN)}); ${pct(m.commons6 ?? NaN)} of the starting pool's commons are owned by week 6; at week 24 ${pct(m.rares24 ?? NaN)} of the rares and ${pct(m.epics24 ?? NaN)} of the epics released are owned`,
    target:
      'about 9 to 12 lines at week 4, 20 to 28 at week 12, most commons within 6 weeks, rares over months (15% to 60% by week 24), epics rarely (at most 35%)',
  });
  lines.push({
    id: 'T-9',
    pass: metLine('T-9'),
    measured: `${round(m.waitingEvolve12 ?? NaN, 1)} creatures of a daily player wait at their evolution level for Essence at week 12`,
    target: 'at most 3: Essence must not be starved to keep the pile down',
  });
  // T-7: no dead resource before week 12.
  lines.push({
    id: 'T-7',
    pass: metLine('T-7'),
    measured: `${round(m.deadBefore12 ?? NaN)} of a daily player's 4 resources (Acorns, scrap, shards, Essence) are dead (a pile rising 4 weeks running to 4 weeks of what the resource is spent on) before week 12`,
    target: 'none (resources.md: nothing that only piles up)',
  });
  // T-6: growth lasts the arc.
  const reach30 = daily.flatMap((p) =>
    p.day30[0] === null || p.day30[0] === undefined ? [] : [p.day30[0]],
  );
  const day30 = reach30.length * 2 > daily.length ? median(reach30) : null;
  lines.push({
    id: 'T-6',
    pass: metLine('T-6'),
    measured: `a daily player's best creature is level ${round(m.best10 ?? NaN, 1)} at week 10 and ${round(m.best12 ?? NaN, 1)} at week 12; it reaches level 30 on day ${day30 === null ? 'never (within 24 weeks)' : round(day30)}`,
    target: 'still growing in week 12 (example: level 29 of 30), not capped by week 10',
  });
  return lines;
}

/** Spread of a list as `median (p10 to p90)`. */
export const spreadText = (b: Band, digits = 0): string =>
  `${round(b.median, digits)} (${round(b.p10, digits)} to ${round(b.p90, digits)})`;

export const profileLabel = (id: string): string => PROFILES.find((p) => p.id === id)?.label ?? id;
export { band, quantile, LEDGER_PROFILES, SAMPLE_WEEKS };
