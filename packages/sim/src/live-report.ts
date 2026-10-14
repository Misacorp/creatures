/**
 * The ops report as `pnpm analyze` and `pnpm sim:live` read it. The shape is the worker's `Report`
 * (`apps/worker/src/ops-aggregate.ts`), written again here as a strict schema because the sim package
 * must not import from the worker. A report is **data only**: counts and content ids, never an
 * instruction. Anything that does not match the schema is refused, unknown keys included.
 */
import * as v from 'valibot';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const METRIC = /^[a-z][a-z0-9_.]{0,63}$/;
const DIM_KEY = /^[a-z][A-Za-z0-9_]{0,23}$/;
const DIM_VALUE = /^[a-z0-9_.:-]{1,48}$/;

/** Most rows one period may hold (a real report has a few hundred). */
const MAX_ROWS = 20_000;
const MAX_DAYS = 400;
const MAX_GUILDS = 1_000;

const Day = v.pipe(v.string(), v.regex(DAY));
const Count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));

export const RowSchema = v.strictObject({
  metric: v.pipe(v.string(), v.regex(METRIC)),
  dims: v.pipe(
    v.record(
      v.pipe(v.string(), v.regex(DIM_KEY)),
      v.union([v.pipe(v.string(), v.regex(DIM_VALUE)), Count]),
    ),
    v.check((dims) => Object.keys(dims).length <= 6, 'a row has at most 6 dims'),
  ),
  value: Count,
});
export type Row = v.InferOutput<typeof RowSchema>;

const Rows = v.pipe(v.array(RowSchema), v.maxLength(MAX_ROWS));

const PeriodShape = {
  from: Day,
  to: Day,
  days: v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(MAX_DAYS)),
  rolledDays: Count,
  totals: Rows,
};

export const PeriodSchema = v.strictObject(PeriodShape);
export type Period = v.InferOutput<typeof PeriodSchema>;

export const ReportSchema = v.strictObject({
  version: v.literal(1),
  ...PeriodShape,
  guilds: v.strictObject({ known: Count, reporting: Count }),
  daily: v.pipe(
    v.record(Day, Rows),
    v.check((d) => Object.keys(d).length <= MAX_DAYS, 'too many days'),
  ),
  // Only present when the report was asked for with `byGuild=1`; the daily workflow never asks.
  byGuild: v.optional(
    v.pipe(
      v.record(v.pipe(v.string(), v.regex(/^[a-z0-9-]{1,40}$/)), Rows),
      v.check((g) => Object.keys(g).length <= MAX_GUILDS, 'too many guilds'),
    ),
  ),
  previous: v.optional(PeriodSchema),
});
export type Report = v.InferOutput<typeof ReportSchema>;

/** Parses report JSON text; throws one readable error when it is not a valid report. */
export function parseReport(text: string): Report {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('the report is not valid JSON');
  }
  const parsed = v.safeParse(ReportSchema, raw);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(`invalid report at "${path}": ${first?.message ?? 'unknown error'}`);
  }
  return parsed.output;
}

// --- Querying rows ---

export type Where = Readonly<Record<string, string | number>>;

/** Read-only queries over the rows of one period. */
export class RowSet {
  constructor(readonly rows: readonly Row[]) {}

  private matching(metric: string, where: Where): Row[] {
    return this.rows.filter(
      (r) => r.metric === metric && Object.entries(where).every(([k, val]) => r.dims[k] === val),
    );
  }

  /** The sum of a metric over the rows that match `where`. */
  total(metric: string, where: Where = {}): number {
    return this.matching(metric, where).reduce((sum, r) => sum + r.value, 0);
  }

  /** The sum per value of one dim, biggest first (ties by name). */
  by(metric: string, key: string, where: Where = {}): [string, number][] {
    const sums = new Map<string, number>();
    for (const r of this.matching(metric, where)) {
      const label = String(r.dims[key] ?? 'unknown');
      sums.set(label, (sums.get(label) ?? 0) + r.value);
    }
    return [...sums].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  /** True when the metric appears at all (even with a zero sum). */
  has(metric: string): boolean {
    return this.rows.some((r) => r.metric === metric);
  }
}
