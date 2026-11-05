import * as v from 'valibot';
import { levelOf, band, type Band } from './stats';
import type { PlayerRun } from './sim';
import { R, type WeekRecord } from './types';

/**
 * The live report and how it is judged against the lab (phase 5 plan, section 4 item 3). The dev route `valley-report` (step 10) returns a
 * `LiveReport`; `pnpm --filter @creatures/econ compare <live-report.json>` prints agree or disagree per metric.
 *
 * The margin: an EXPECTED quantity (a rate times a time: levels, scrap, shards, Acorns, pieces) agrees when it is within 10% of the lab's median
 * over the seeds; a DRAWN quantity (a count of random finds: kinds owned) agrees when it lies inside the lab's 10th to 90th percentile
 * over the seeds. Rows read and written are INFO: the lab counts rows from the shape of a visit, so they are shown beside the lab's number,
 * never judged (the gate for them is the daily limit).
 *
 * The lab records weeks, so days are multiples of 7 (7, 14, 28). Flows (in and out, pieces, rows) are totals since the player joined; levels
 * and kinds are the state on that day.
 */

export const EXPECTED_MARGIN = 0.1;

export type MetricKind = 'expected' | 'drawn' | 'info';

interface MetricDef {
  readonly kind: MetricKind;
  /** The lab's value for one player at the end of week `week` (1-based), given the player's weeks so far. */
  readonly lab: (weeks: readonly WeekRecord[], week: number) => number;
}

const cumulative =
  (pick: (w: WeekRecord) => number) =>
  (weeks: readonly WeekRecord[], week: number): number =>
    weeks.slice(0, week).reduce((n, w) => n + pick(w), 0);

/** Every metric a live report may carry. The names are the report's contract: the worker's `valley-report` uses these. */
export const METRICS = {
  levelBest: { kind: 'expected', lab: (w, k) => levelOf(w[k - 1] as WeekRecord, 1) },
  levelThird: { kind: 'expected', lab: (w, k) => levelOf(w[k - 1] as WeekRecord, 3) },
  kindsOwned: { kind: 'drawn', lab: (w, k) => (w[k - 1] as WeekRecord).species },
  acornsIn: { kind: 'expected', lab: cumulative((w) => w.inn[R.acorns] ?? 0) },
  acornsOut: { kind: 'expected', lab: cumulative((w) => w.out[R.acorns] ?? 0) },
  scrapIn: { kind: 'expected', lab: cumulative((w) => w.inn[R.scrap] ?? 0) },
  scrapOut: { kind: 'expected', lab: cumulative((w) => w.out[R.scrap] ?? 0) },
  shardsIn: { kind: 'expected', lab: cumulative((w) => w.inn[R.shards] ?? 0) },
  shardsOut: { kind: 'expected', lab: cumulative((w) => w.out[R.shards] ?? 0) },
  piecesMade: { kind: 'expected', lab: cumulative((w) => w.piecesMade) },
  rowsRead: { kind: 'info', lab: cumulative((w) => w.rowsRead) },
  rowsWritten: { kind: 'info', lab: cumulative((w) => w.rowsWritten) },
} as const satisfies Record<string, MetricDef>;

export type MetricName = keyof typeof METRICS;
const METRIC_NAMES = Object.keys(METRICS) as [MetricName, ...MetricName[]];

const amount = v.pipe(v.number(), v.finite(), v.minValue(0));

/**
 * What the future `valley-report` dev route returns: per profile, the metrics on each reported day. `scenario` is the lab server the bots
 * mirrored (an id of `servers.ts`, such as `mixed8`). Strict: an unknown metric name is an error, not silently ignored.
 */
export const LiveReportSchema = v.strictObject({
  version: v.literal(1),
  scenario: v.pipe(v.string(), v.minLength(1), v.maxLength(60)),
  profiles: v.record(
    v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), v.maxLength(40)),
    v.strictObject({
      days: v.pipe(
        v.array(
          v.strictObject({
            day: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(730)),
            metrics: v.partial(
              v.strictObject(
                Object.fromEntries(METRIC_NAMES.map((m) => [m, amount])) as Record<
                  MetricName,
                  typeof amount
                >,
              ),
            ),
          }),
        ),
        v.maxLength(120),
      ),
    }),
  ),
});
export type LiveReport = v.InferOutput<typeof LiveReportSchema>;

export type Verdict = 'agree' | 'disagree' | 'info' | 'skipped';

export interface Judged {
  readonly profile: string;
  readonly day: number;
  readonly metric: MetricName;
  readonly verdict: Verdict;
  readonly live: number;
  /** The lab's median and spread (absent when skipped). */
  readonly lab?: Band;
  /** What was asked of the live number, in words. */
  readonly rule: string;
  /** Why it was skipped. */
  readonly note?: string;
}

/** The lab's values of one metric for every player of a profile (across seeds) at the end of a week. */
export function labSamples(
  players: readonly PlayerRun[],
  metric: MetricName,
  week: number,
): number[] {
  const def: MetricDef = METRICS[metric];
  return players.flatMap((p) => (p.weeks.length >= week ? [def.lab(p.weeks, week)] : []));
}

const fmt = (x: number): string => String(Math.round(x * 100) / 100);

/** Judges one live number against the lab's samples. */
export function judgeMetric(
  kind: MetricKind,
  live: number,
  samples: readonly number[],
): Pick<Judged, 'verdict' | 'lab' | 'rule'> {
  const lab = band(samples);
  if (kind === 'info') return { verdict: 'info', lab, rule: 'shown, not judged' };
  if (kind === 'drawn') {
    const ok = live >= lab.p10 && live <= lab.p90;
    return {
      verdict: ok ? 'agree' : 'disagree',
      lab,
      rule: `inside ${fmt(lab.p10)} to ${fmt(lab.p90)}`,
    };
  }
  const slack = Math.abs(lab.median) * EXPECTED_MARGIN;
  const ok = Math.abs(live - lab.median) <= slack + 1e-9;
  return {
    verdict: ok ? 'agree' : 'disagree',
    lab,
    rule: `within ${fmt(lab.median - slack)} to ${fmt(lab.median + slack)} (10% of the median)`,
  };
}

/** Judges every number of a live report. `playersOf(profile)` gives the lab's runs of that profile over its seeds. */
export function compareReport(
  report: LiveReport,
  playersOf: (profile: string) => readonly PlayerRun[],
): Judged[] {
  const out: Judged[] = [];
  for (const [profile, entry] of Object.entries(report.profiles)) {
    const players = playersOf(profile);
    for (const { day, metrics } of entry.days) {
      for (const metric of METRIC_NAMES) {
        const live = metrics[metric];
        if (live === undefined) continue;
        const base = { profile, day, metric, live };
        const kind = METRICS[metric].kind;
        if (day % 7 !== 0) {
          out.push({
            ...base,
            verdict: 'skipped',
            rule: '',
            note: 'the lab records whole weeks: use days 7, 14, 28 ...',
          });
          continue;
        }
        const samples = labSamples(players, metric, day / 7);
        if (samples.length === 0) {
          out.push({
            ...base,
            verdict: 'skipped',
            rule: '',
            note: 'the lab has no player of this profile at that week',
          });
          continue;
        }
        out.push({ ...base, ...judgeMetric(kind, live, samples) });
      }
    }
  }
  return out;
}

/** The lines the command prints, and whether every judged metric agreed. */
export function formatComparison(judged: readonly Judged[]): { lines: string[]; ok: boolean } {
  const lines = judged.map((j) => {
    const head = `${j.verdict === 'disagree' ? 'DISAGREE' : j.verdict.padEnd(8)} ${j.profile} day ${j.day} ${j.metric}`;
    if (j.verdict === 'skipped') return `${head}: skipped, ${j.note ?? ''}`;
    const lab = j.lab as Band;
    return `${head}: live ${fmt(j.live)}, lab median ${fmt(lab.median)} (10th to 90th ${fmt(lab.p10)} to ${fmt(lab.p90)}); ${j.rule}`;
  });
  const count = (verdict: Verdict): number => judged.filter((j) => j.verdict === verdict).length;
  lines.push(
    '',
    `${count('agree')} agree, ${count('disagree')} disagree, ${count('info')} info, ${count('skipped')} skipped`,
  );
  return { lines, ok: count('disagree') === 0 };
}
