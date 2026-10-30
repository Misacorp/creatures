import { RULES, RESOURCES, type Rules } from './rules';
import { playersOf, type Results } from './scenarios';
import type { PlayerRun } from './sim';
import { PROFILES } from './profiles';
import { band, levelOf, medianOf, round, series, total, type Band } from './stats';
import { FORGE_BUCKETS, HOURS_PER_WEEK, R, type WeekRecord } from './types';
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
  /** The stock at the end of the run in weeks of that week's income. */
  pileWeeks: number;
}

const BIG_PRICE: Record<string, number> = {
  acorns: 560,
  scrap: 120,
  shards: 5,
  glimmer: 1,
  essence: 70,
};

/** The first week from which the stock rises for `deadWeeks` weeks running to a pile worth two of the dearest things (a dead resource). */
export function deadFrom(
  stock: readonly number[],
  deadWeeks: number,
  bigPrice: number,
): number | null {
  for (let i = 0; i + deadWeeks < stock.length; i++) {
    let rising = true;
    for (let k = 0; k < deadWeeks; k++)
      if (!((stock[i + k + 1] ?? 0) > (stock[i + k] ?? 0))) rising = false;
    if (rising && (stock[i + deadWeeks] ?? 0) >= 2 * bigPrice) return i + 1;
  }
  return null;
}

export function ledgerOf(players: readonly PlayerRun[], rules: Rules): ResourceLedger[] {
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
      dead: deadFrom(medianStock, rules.flags.deadWeeks, BIG_PRICE[resource] ?? 100),
      starved: days > 0 && zero / days > rules.flags.starvedZeroShare,
      pileWeeks:
        (medianStock[medianStock.length - 1] ?? 0) /
        Math.max(1e-9, med((w) => w.inn[r] ?? 0).slice(-1)[0] ?? 0),
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
  rules.xp.ribbons.forEach((rb, i) => {
    rows.push(row('scrap', `ribbon ${i + 1} (level ${rb.level}) scrap`, rb.scrap));
    rows.push(row('shards', `ribbon ${i + 1} shards`, rb.shards));
    if (rb.glimmer > 0) rows.push(row('glimmer', `ribbon ${i + 1} glimmer`, rb.glimmer));
  });
  rows.push(row('shards', 'one Forge piece', rules.forge.shard));
  rows.push(row('glimmer', 'Reach for Epic', rules.forge.reach.epic.glimmer));
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
  /** XP by source over weeks 1 to 12 (medians per player). */
  xp: { idle: number; catchUp: number; dungeon: number; raid: number; lost: number };
  /** Days since joining until the 1st, 3rd and 10th creature stood at level 30: the median of those that did, and how many did. */
  day30: { median: number | null; reached: number; of: number }[];
  catchUpDays: number | null;
  /** Creatures held at a ribbon gate or at their evolution level at the end of week 4, 12 and 24 (median). */
  waiting: { week: number; ribbon: number; evolve: number }[];
  /** The week the player owns 20, 30 and 34 kinds (median; null: not within the run), and duplicates arriving per visit. */
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
      ribbon: median(
        players.flatMap((p) => (p.weeks[week - 1] ? [p.weeks[week - 1]!.waitingRibbon] : [])),
      ),
      evolve: median(
        players.flatMap((p) => (p.weeks[week - 1] ? [p.weeks[week - 1]!.waitingEvolve] : [])),
      ),
    })),
    speciesWeeks: [20, 30, 34].map((n) => {
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
  /** The week each fire threshold opened (median over seeds; null: not within the horizon). */
  thresholds: (number | null)[];
  firstLevelDay: number | null;
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
    thresholds,
    firstLevelDay: first.length ? median(first) : null,
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
}

const VARIANT_IDS = [
  'mixed8',
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
      },
    ];
  });
}

// ---------- targets ----------

export interface TargetLine {
  id: string;
  pass: boolean;
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

export function targetsOf(results: Results, rules: Rules): TargetLine[] {
  const lines: TargetLine[] = [];
  // T-1: roster spread.
  const daily = playersOf(results.mixed8, 'daily');
  const spread4 = median(daily.map((p) => levelOf(p.weeks[3]!, 3) - levelOf(p.weeks[3]!, 10)));
  const spread8 = median(daily.map((p) => levelOf(p.weeks[7]!, 3) - levelOf(p.weeks[7]!, 6)));
  lines.push({
    id: 'T-1',
    pass: spread4 <= 5 && spread8 <= 5,
    measured: `a daily player's 10th creature is ${round(spread4, 1)} levels below the 3rd at week 4; the 6th (a second team's best) is ${round(spread8, 1)} below the 3rd at week 8`,
    target: 'within 5 levels at week 4, and two strong teams at week 8',
  });
  // T-2: idle floor and active ceiling.
  const sfDaily = playersOf(results['mixed8-opt'], 'daily');
  const optActive = playersOf(results['mixed8-opt'], 'active');
  const xpAll = (p: PlayerRun): number =>
    total(p, 1, 12, (w) => w.xpIdle + w.xpCatch + w.xpDungeon + w.xpRaid);
  const xpRatio = median(optActive.map(xpAll)) / Math.max(1, median(sfDaily.map(xpAll)));
  const outRatio =
    median(optActive.map((p) => idleOutput(p))) /
    Math.max(1, median(sfDaily.map((p) => idleOutput(p))));
  lines.push({
    id: 'T-2a',
    pass: xpRatio <= 1.1 && outRatio <= 1.1,
    measured: `an optimiser visiting three times a day gets ${pct(xpRatio)} of an optimiser visiting once in XP and ${pct(outRatio)} in posts' and the allowance's output over 24 weeks (the lab models only faster re-tilting, not better choices)`,
    target: 'under 110%',
  });
  // The share of a daily player's idle gains: effective hours (the away steps) over weeks 1 to 12, so the roster's size cancels out.
  const eff = (p: PlayerRun): number => total(p, 1, 12, (w) => w.effHours);
  const effDaily = median(playersOf(results.mixed8, 'daily').map(eff));
  const weekend = median(playersOf(results.mixed8, 'weekend-off').map(eff)) / effDaily;
  const weekly = median(playersOf(results.mixed8, 'weekly').map(eff)) / effDaily;
  const pickedUp = (id: string): number => {
    const ps = playersOf(results.mixed8, id);
    const got = sum(ps.map((p) => total(p, 1, 12, (w) => w.storeHours)));
    const lost = sum(ps.map((p) => total(p, 1, 12, (w) => w.storeLost)));
    return got / Math.max(1e-9, got + lost);
  };
  const bestAt12 = (id: string): number =>
    median(playersOf(results.mixed8, id).map((p) => levelOf(p.weeks[11]!, 1)));
  lines.push({
    id: 'T-2b',
    pass: weekend >= 0.95,
    measured: `a weekend-off player gets ${pct(weekend)} of a daily player's idle growth (effective hours, weeks 1 to 12)`,
    target: 'about 100% (a weekend off costs almost nothing)',
  });
  lines.push({
    id: 'T-2c',
    pass: weekly >= 0.7 && weekly <= 0.85,
    measured: `a weekly player gets ${pct(weekly)} of a daily player's idle XP per creature (with fights, their best creature is level ${round(bestAt12('weekly'), 1)} at week 12 against a daily player's ${round(bestAt12('daily'), 1)}); but with stores of three days their scouts bring home only ${pct(pickedUp('weekly'))} of the hours they work (a daily player's: ${pct(pickedUp('daily'))})`,
    target: 'about 75% to 80% of the idle growth',
  });
  const returner = playersOf(results.mixed8, 'returner');
  const kept = median(returner.map((p) => levelOf(p.weeks[8]!, 1) - levelOf(p.weeks[3]!, 1)));
  const back = median(returner.flatMap((p) => (p.catchUpDays === null ? [] : [p.catchUpDays])));
  lines.push({
    id: 'T-2d',
    pass: kept >= 0 && Number.isFinite(back),
    measured: `a player back after four weeks away keeps every level (best creature ${kept >= 0 ? '+' : ''}${round(kept, 1)} levels vs before) and is within ${rules.flags.agreeWithin} levels of the server's middle after ${round(back, 1)} days of visits`,
    target: 'recognises the roster; about two weeks to the middle',
  });
  // T-3: commons pacing.
  const mixed8 = serverOf(results, 'mixed8');
  const collections12 = mixed8?.collections[11] ?? 0;
  lines.push({
    id: 'T-3',
    pass: (mixed8?.firstLevelDay ?? Infinity) <= 14 && collections12 >= 1,
    measured: `a server of 8 lifts its first place a level on day ${round(mixed8?.firstLevelDay ?? 0, 1)}, and has ${collections12} collection${collections12 === 1 ? '' : 's'} done by week 12 (no project needs one)`,
    target:
      'first level within 14 days; the rare-find route matters (at least one collection by week 12) without being required',
  });
  // T-4: no dead chains. The share of anvil-hours spent tinkering because an input was short, in the worst week (2 to 12).
  const typical = ['daily', 'active', 'every-other-day', 'weekend-off', 'weekly'];
  const worstWeek = (id: string, pick: (shares: number[]) => number): number =>
    Math.max(
      0,
      ...series(profilePlayers(results, id), 12, (w) => pick(forgeShares(w)))
        .slice(1)
        .map((b) => b.median),
    );
  const scrapIdx = FORGE_BUCKETS.indexOf('scrap');
  const shardIdx = FORGE_BUCKETS.indexOf('shard');
  const floorIdx = FORGE_BUCKETS.indexOf('floor');
  const perProfile = typical.map((id) => ({
    id,
    scrap: worstWeek(id, (x) => x[scrapIdx] ?? 0),
    inputs: worstWeek(id, (x) => (x[scrapIdx] ?? 0) + (x[shardIdx] ?? 0)),
    floor: worstWeek(id, (x) => x[floorIdx] ?? 0),
  }));
  const worstScrap = perProfile.reduce((a, b) => (b.scrap > a.scrap ? b : a));
  const worstInputs = perProfile.reduce((a, b) => (b.inputs > a.inputs ? b : a));
  const worstFloor = perProfile.reduce((a, b) => (b.floor > a.floor ? b : a));
  lines.push({
    id: 'T-4',
    pass: worstInputs.inputs <= rules.flags.tinkerSmallShare,
    measured: `in the worst week (weeks 2 to 12) a typical player's anvils tinker for want of an input (scrap or a shard of the element the team needs) ${pct(worstInputs.inputs)} of the time (${worstInputs.id}); for want of scrap alone ${pct(worstScrap.scrap)} (${worstScrap.id}); with the Forge floor full ${pct(worstFloor.floor)} (${worstFloor.id})`,
    target: `at most ${pct(rules.flags.tinkerSmallShare)} for want of an input`,
  });
  // T-6: growth lasts the arc.
  const best12 = median(daily.map((p) => levelOf(p.weeks[11]!, 1)));
  const best10 = median(daily.map((p) => levelOf(p.weeks[9]!, 1)));
  const reach30 = daily.flatMap((p) =>
    p.day30[0] === null || p.day30[0] === undefined ? [] : [p.day30[0]],
  );
  const day30 = reach30.length * 2 > daily.length ? median(reach30) : null;
  lines.push({
    id: 'T-6',
    pass: best12 < 30 && best10 < 30,
    measured: `a daily player's best creature is level ${round(best10, 1)} at week 10 and ${round(best12, 1)} at week 12; it reaches level 30 on day ${day30 === null ? 'never (within 24 weeks)' : round(day30)}`,
    target: 'still growing in week 12 (example: level 29 of 30), not capped by week 10',
  });
  return lines;
}

/** Spread of a list as `median (p10 to p90)`. */
export const spreadText = (b: Band, digits = 0): string =>
  `${round(b.median, digits)} (${round(b.p10, digits)} to ${round(b.p90, digits)})`;

export const profileLabel = (id: string): string => PROFILES.find((p) => p.id === id)?.label ?? id;
export { band, quantile, LEDGER_PROFILES, SAMPLE_WEEKS };
