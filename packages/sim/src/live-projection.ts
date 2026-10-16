/**
 * The projection half of `pnpm sim:live`: runs the calibrated sim forward, reads weekly averages off
 * it, finds where they cross a target band, and renders `live-YYYY-MM-DD.projection.md`. Also reads
 * back an earlier calibration file so the parameter changes can be shown.
 *
 * Week numbers are weeks of the simulated server. The sim starts from an empty server, so with
 * `--age-weeks N` ("the live server is N weeks old") the table starts at week N+1 and "week 9" means
 * week 9 of the server's life. Holdings are not in reports, so the live server's real stockpiles are
 * not an input: the projection is where a server that behaves like the live one would be.
 */
import * as v from 'valibot';
import type { EconomyResult } from './economy';
import { projectionSims, type Calibration, type Fidelity } from './live-calibrate';
import { TARGETS, checkTarget, describeRequirement } from './targets';
import { mean, median } from './util';

// --- Bands the projection checks ---

/** A stockpile "runs away" when it holds more than this many weeks of its own weekly income... */
export const STOCKPILE_WEEKS = 4;
/** ...and at least this much per player (so an empty early week does not count). */
export const STOCKPILE_MIN = 50;
/** Weeks of dungeon depth growth that are averaged. */
const GROWTH_SPAN = 4;

// --- Series ---

type Rec = EconomyResult['players'][number]['weeks'][number];

export interface Series {
  /** Index 0 is week 1. */
  essenceStock: number[];
  essenceIncome: number[];
  baitStock: number[];
  baitIncome: number[];
  scrapStock: number[];
  species: number[];
  maxLevel: number[];
  dungeonDepth: number[];
  /** Median top level of casuals, species of dailies, and top-over-casual power: null without that archetype. */
  casualLevel: (number | null)[];
  dailySpecies: (number | null)[];
  powerRatio: (number | null)[];
  /** Daily players' dungeon depth. */
  dailyDepth: (number | null)[];
}

function valuesAt(
  sims: readonly EconomyResult[],
  week: number,
  pick: (r: Rec) => number,
  archetype?: string,
): number[] {
  const out: number[] = [];
  for (const sim of sims) {
    for (const h of sim.players) {
      if (archetype !== undefined && h.archetype !== archetype) continue;
      const r = h.weeks.find((w) => w.week === week);
      if (r !== undefined) out.push(pick(r));
    }
  }
  return out;
}

/** Weekly averages (over sims and players) for weeks 1 to `weeks`. */
export function buildSeries(sims: readonly EconomyResult[], weeks: number): Series {
  const avg =
    (pick: (r: Rec) => number) =>
    (w: number): number =>
      mean(valuesAt(sims, w, pick)) ?? 0;
  const med =
    (pick: (r: Rec) => number, archetype: string) =>
    (w: number): number | null =>
      median(valuesAt(sims, w, pick, archetype));
  const each = <T>(f: (w: number) => T): T[] => Array.from({ length: weeks }, (_, i) => f(i + 1));
  const top = (w: number): number | null => mean(valuesAt(sims, w, (r) => r.top3Power, 'top'));
  const casual = (w: number): number | null =>
    mean(valuesAt(sims, w, (r) => r.top3Power, 'casual'));
  return {
    essenceStock: each(avg((r) => r.essence)),
    essenceIncome: each(avg((r) => r.essenceEarned)),
    baitStock: each(avg((r) => r.bait)),
    baitIncome: each(avg((r) => r.baitEarned)),
    scrapStock: each(avg((r) => r.scrap)),
    species: each(avg((r) => r.speciesOwned)),
    maxLevel: each(avg((r) => r.maxLevel)),
    dungeonDepth: each(avg((r) => r.dungeonDepth)),
    casualLevel: each(med((r) => r.maxLevel, 'casual')),
    dailySpecies: each(med((r) => r.speciesOwned, 'daily')),
    powerRatio: each((w) => {
      const t = top(w);
      const c = casual(w);
      return t === null || c === null || c === 0 ? null : t / c;
    }),
    dailyDepth: each(med((r) => r.dungeonDepth, 'daily')),
  };
}

// --- Crossings ---

export interface Crossing {
  /** What was checked, in words. */
  what: string;
  /** The band it is checked against. */
  band: string;
  /** The first week the projection crosses it; null when it does not within the projected weeks. */
  week: number | null;
  /** True when it already crosses at the first projected week. */
  alreadyAtStart: boolean;
}

function firstWeek(
  from: number,
  to: number,
  test: (week: number) => boolean,
): { week: number | null; alreadyAtStart: boolean } {
  for (let w = from; w <= to; w++) {
    if (test(w)) return { week: w, alreadyAtStart: w === from };
  }
  return { week: null, alreadyAtStart: false };
}

function targetOf(id: string) {
  const t = TARGETS.find((x) => x.id === id);
  if (t === undefined) throw new Error(`missing sim target "${id}"`);
  return t;
}

/** Where the projection crosses a band, from week `from` to `to` (1-based, inclusive). */
export function findCrossings(series: Series, from: number, to: number): Crossing[] {
  const out: Crossing[] = [];
  const at = (xs: readonly number[], w: number): number => xs[w - 1] ?? 0;
  const atN = (xs: readonly (number | null)[], w: number): number | null => xs[w - 1] ?? null;

  for (const [name, stock, income] of [
    ['Essence', series.essenceStock, series.essenceIncome],
    ['Bait', series.baitStock, series.baitIncome],
  ] as const) {
    const r = firstWeek(
      from,
      to,
      (w) => at(stock, w) >= STOCKPILE_MIN && at(stock, w) > STOCKPILE_WEEKS * at(income, w),
    );
    out.push({
      what: `${name} stockpile per player passes ${String(STOCKPILE_WEEKS)} weeks of its own income (and ${String(STOCKPILE_MIN)})`,
      band: `<= ${String(STOCKPILE_WEEKS)} weeks of income`,
      ...r,
    });
  }

  const growth = targetOf('dungeon-depth-growth');
  if (typeof growth.value !== 'number') {
    const low = growth.value[0];
    const r = firstWeek(Math.max(from, GROWTH_SPAN + 1), to, (w) => {
      const now = atN(series.dailyDepth, w);
      const before = atN(series.dailyDepth, w - GROWTH_SPAN);
      return now !== null && before !== null && (now - before) / GROWTH_SPAN < low;
    });
    out.push({
      what: `Daily players' dungeon depth growth falls under the band (average over ${String(GROWTH_SPAN)} weeks)`,
      band: describeRequirement(growth),
      ...r,
    });
  }
  return out;
}

// --- Targets that are about one week of the server's life ---

export interface BandCheck {
  targetId: string;
  what: string;
  /** The week of the server's life the target is about. */
  atWeek: number;
  band: string;
  /** The projected value; null when that week was not simulated or the archetype is not in the mix. */
  value: number | null;
  ok: boolean | null;
}

/** Sim targets that are read at one week of the server's life, with the series that carries them. */
const WEEK_TARGETS = [
  { id: 'econ-casual-level-15', week: 4, series: 'casualLevel' },
  { id: 'econ-daily-species', week: 6, series: 'dailySpecies' },
  { id: 'econ-power-ratio', week: 8, series: 'powerRatio' },
] as const;

/** The week-bound targets as the calibrated server meets them. */
export function bandChecks(series: Series): BandCheck[] {
  return WEEK_TARGETS.map(({ id, week, series: key }) => {
    const target = targetOf(id);
    const value = series[key][week - 1] ?? null;
    return {
      targetId: id,
      what: target.description,
      atWeek: week,
      band: describeRequirement(target),
      value,
      ok: value === null ? null : checkTarget(target, value),
    };
  });
}

// --- The projection ---

export interface Projection {
  /** Weeks asked for, counted from the report date. */
  weeks: number[];
  ageWeeks: number;
  /** The weeks of the simulated server that the table starts and ends at. */
  firstWeek: number;
  lastWeek: number;
  series: Series;
  crossings: Crossing[];
  checks: BandCheck[];
}

/** Runs the projection for the calibration. `weeks` are counted forward from the report date. */
export function project(c: Calibration, weeks: readonly number[], fidelity: Fidelity): Projection {
  const longest = Math.max(...weeks);
  const last = c.ageWeeks + longest;
  const sims = projectionSims(c, last, fidelity);
  const series = buildSeries(sims, last);
  return {
    weeks: [...weeks],
    ageWeeks: c.ageWeeks,
    firstWeek: c.ageWeeks + 1,
    lastWeek: last,
    series,
    crossings: findCrossings(series, c.ageWeeks + 1, last),
    checks: bandChecks(series),
  };
}

// --- Previous calibration ---

const NullableNumber = v.nullable(v.number());

export const CalibrationSchema = v.strictObject({
  version: v.literal(1),
  from: v.string(),
  to: v.string(),
  seed: v.string(),
  mode: v.picklist(['full', 'quick']),
  ageWeeks: v.number(),
  lowData: v.boolean(),
  params: v.strictObject({
    players: v.number(),
    casualShare: v.number(),
    tripPercent: v.number(),
    dungeonPercent: v.number(),
  }),
  heuristicCasualShare: v.number(),
  observed: v.strictObject({
    sendsPerDau: NullableNumber,
    dungeonRunsPerDau: NullableNumber,
    suppliesPerTrip: NullableNumber,
    sessionsPerDau: NullableNumber,
  }),
  simulated: v.strictObject({
    sendsPerDau: v.number(),
    dungeonRunsPerDau: v.number(),
    suppliesPerTrip: NullableNumber,
  }),
  fitError: v.number(),
  evaluations: v.number(),
});

/** An earlier calibration file's text as a calibration, or null when it is not one. */
export function parseCalibration(text: string): Calibration | null {
  try {
    const parsed = v.safeParse(CalibrationSchema, JSON.parse(text));
    return parsed.success ? parsed.output : null;
  } catch {
    return null;
  }
}

// --- Rendering ---

const one = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);
const two = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);
const pct = (n: number): string => `${one(n * 100)}%`;
const orNa = (n: number | null, f: (x: number) => string = two): string =>
  n === null ? 'n/a' : f(n);

function table(header: readonly string[], body: readonly (readonly string[])[]): string[] {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
    '',
  ];
}

function delta(now: number, before: number | undefined, f: (x: number) => string = two): string {
  if (before === undefined) return '';
  const d = now - before;
  if (Math.abs(d) < 1e-9) return 'no change';
  return `${d > 0 ? '+' : '-'}${f(Math.abs(d))}`;
}

/** The projection and calibration as Markdown. */
export function renderProjection(
  c: Calibration,
  p: Projection,
  previous: Calibration | null,
): string {
  const lines = [
    `# Live projection: ${c.to}`,
    '',
    `Calibrated from the report for ${c.from} to ${c.to}, seed \`${c.seed}\`, ${c.mode} mode. The sim is fitted to the report's aggregates and run forward ${p.weeks.map(String).join(', ')} weeks${
      c.ageWeeks > 0
        ? ` from a server that is ${String(c.ageWeeks)} weeks old (the table starts at week ${String(p.firstWeek)} of its life)`
        : " from an empty server (week numbers are weeks of the server's life)"
    }. Reports carry no holdings, so the live stockpiles are not an input: read this as where a server that behaves like the live one would be.`,
    '',
  ];
  if (c.lowData) {
    lines.push(
      '**Caution: the report has very few active player-days, so this calibration is a rough guess.**',
      '',
    );
  }
  lines.push('## Calibration', '');
  lines.push(
    `Fit error ${pct(c.fitError)} (mean gap between the sim's and the live rates per active player-day; ${c.fitError <= 0.1 ? 'a close fit' : c.fitError <= 0.25 ? 'a rough fit' : 'a poor fit, do not lean on the projection'}), ${String(c.evaluations)} sim evaluations.`,
    '',
  );
  const pr = previous?.params;
  lines.push(
    ...table(
      [
        'Parameter',
        'Value',
        previous === null ? 'Previous' : `Previous (${previous.to})`,
        'Change',
      ],
      [
        [
          'Players per server',
          String(c.params.players),
          pr === undefined ? '' : String(pr.players),
          pr === undefined ? '' : delta(c.params.players, pr.players, (x) => String(Math.round(x))),
        ],
        [
          'Casual share of players',
          pct(c.params.casualShare),
          pr === undefined ? '' : pct(pr.casualShare),
          pr === undefined ? '' : delta(c.params.casualShare, pr.casualShare, pct),
        ],
        [
          'Check-ins that send trips',
          `${String(c.params.tripPercent)}%`,
          pr === undefined ? '' : `${String(pr.tripPercent)}%`,
          pr === undefined
            ? ''
            : delta(c.params.tripPercent, pr.tripPercent, (x) => `${String(Math.round(x))} pts`),
        ],
        [
          'Check-ins that run the dungeon',
          `${String(c.params.dungeonPercent)}%`,
          pr === undefined ? '' : `${String(pr.dungeonPercent)}%`,
          pr === undefined
            ? ''
            : delta(
                c.params.dungeonPercent,
                pr.dungeonPercent,
                (x) => `${String(Math.round(x))} pts`,
              ),
        ],
        [
          'Fit error',
          pct(c.fitError),
          previous === null ? '' : pct(previous.fitError),
          previous === null ? '' : delta(c.fitError, previous.fitError, pct),
        ],
      ],
    ),
  );
  lines.push(
    `How the mix was set: sessions per active player-day was ${orNa(c.observed.sessionsPerDau)}; that gives a casual share of ${pct(c.heuristicCasualShare)} (a casual has 1 session on an active day, everyone else 2). The fit may move it by up to 20 points. Daily against top players is fixed at 2 to 1 because aggregates cannot tell them apart.`,
    '',
    ...table(
      ['Rate per active player-day', 'Live', 'Sim (fitted)'],
      [
        ['Trips sent', orNa(c.observed.sendsPerDau), two(c.simulated.sendsPerDau)],
        ['Dungeon runs', orNa(c.observed.dungeonRunsPerDau), two(c.simulated.dungeonRunsPerDau)],
        [
          'Supplies per trip (not fitted)',
          orNa(c.observed.suppliesPerTrip),
          orNa(c.simulated.suppliesPerTrip),
        ],
      ],
    ),
  );

  lines.push('## Projection', '', 'Averages per player across the simulated servers.', '');
  const at = (xs: readonly (number | null)[], w: number): number | null => xs[w - 1] ?? null;
  const weekCols = p.weeks.map((w) => p.ageWeeks + w);
  const row = (label: string, xs: readonly (number | null)[], f: (x: number) => string = one) => [
    label,
    ...weekCols.map((w) => orNa(at(xs, w), f)),
  ];
  const s = p.series;
  lines.push(
    ...table(
      ['Per player', ...weekCols.map((w) => `week ${String(w)}`)],
      [
        row('Essence stockpile', s.essenceStock),
        row('Essence income per week', s.essenceIncome),
        row('Bait stockpile', s.baitStock),
        row('Bait income per week', s.baitIncome),
        row('Scrap stockpile', s.scrapStock),
        row('Species owned', s.species),
        row('Highest creature level', s.maxLevel),
        row('Dungeon depth', s.dungeonDepth),
      ],
    ),
  );

  lines.push('## Where the projection crosses a band', '');
  for (const x of p.crossings) {
    const when =
      x.week === null
        ? `does not cross within week ${String(p.lastWeek)}`
        : x.alreadyAtStart
          ? `already crosses at week ${String(x.week)} (the first projected week)`
          : `crosses at week ${String(x.week)}`;
    lines.push(`- ${x.what} (band ${x.band}): ${when}.`);
  }
  lines.push('', '## Week-bound targets', '');
  lines.push(
    "The sim targets that are about one week of a server's life, as this calibrated server meets them (the sim's own check uses the default mix).",
    '',
    ...table(
      ['Target', 'Week', 'Band', 'Projected', 'Status'],
      p.checks.map((x) => [
        `\`${x.targetId}\` ${x.what}`,
        String(x.atWeek),
        x.band,
        orNa(x.value),
        x.ok === null ? 'not simulated' : x.ok ? 'in band' : '**outside**',
      ]),
    ),
  );
  lines.push(
    '## Limits',
    '',
    '- Only aggregates were used. The sim starts from an empty server with no real holdings, and new players joining later are not modelled.',
    "- Only trips sent, dungeon runs and the casual share are fitted. Destination, length and supply choices follow the sim's own policy.",
    "- A knob at 100% with the sim's rate still under the live rate means the sim cannot reach the live behaviour with its knobs (for example more than one dungeon run a day); the fit error shows how far off it is.",
    '- With a small player pool the numbers move a lot from week to week; treat crossings a few weeks apart as the same thing.',
    '',
  );
  return lines.join('\n');
}
