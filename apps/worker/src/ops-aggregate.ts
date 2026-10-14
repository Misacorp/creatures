/**
 * Pure helpers for the ops report (`ops-report.ts`): the strict query parser, the check every
 * rollup row passes before it may appear in a report, and the aggregation across guilds and days.
 * A report holds counts only: no user ids, no hashes, no guild ids, no names and no free text.
 */
import { addDays } from './time';

/** The longest range one report covers, in days. */
export const MAX_REPORT_DAYS = 92;

export type DimValue = string | number;

/** One metric row: the dims name what was counted, the value is a non-negative integer. */
export interface Row {
  metric: string;
  dims: Record<string, DimValue>;
  value: number;
}

/** A rollup row as a guild's Durable Object returns it. */
export interface RawRow {
  day: string;
  metric: string;
  dimsJson: string;
  value: number;
}

export interface Period {
  from: string;
  to: string;
  /** Days in the range, inclusive. */
  days: number;
  /** Guild-days that were rolled up in the range (how complete the data is). */
  rolledDays: number;
  totals: Row[];
}

export interface Report extends Period {
  version: 1;
  guilds: { known: number; reporting: number };
  /** A few series by game day, summed over guilds (see `DAILY_SERIES`). */
  daily: Record<string, Row[]>;
  /** The totals of every guild under its stable alias (never the guild id); only with `byGuild=1`. */
  byGuild?: Record<string, Row[]>;
  /** The period to compare with, when one was asked for. */
  previous?: Period;
}

/** Metrics worth a per-day series. Everything else is only summed over the range. */
export const DAILY_SERIES: ReadonlySet<string> = new Set([
  'dau',
  'sessions',
  'new_players',
  'starters',
  'flow',
  'dungeon.run',
  'expedition.send',
  'workshop.job_start',
  'raid.phase',
  'raid.live_join',
]);

// --- Row validation ---

const METRIC_RE = /^[a-z][a-z0-9_.]{0,63}$/;
const DIM_KEY_RE = /^[a-z][A-Za-z0-9_]{0,23}$/;
const DIM_VALUE_RE = /^[a-z0-9_.:-]{1,48}$/;
const HASH_LIKE_RE = /[0-9a-f]{24,}/;
/** A Discord snowflake: 15 or more digits and nothing else. */
const SNOWFLAKE_LIKE_RE = /^\d{15,}$/;
/** A UUID, with or without dashes, in any case. */
const UUID_LIKE_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIMS = 6;

/**
 * A stored rollup row as a safe `Row`, or null when anything about it is off (an odd metric name,
 * a dim that is not an id-like string or an integer, a hash-, snowflake- or UUID-like string, a negative or fractional
 * value). Nothing that fails here can reach a report.
 */
export function parseRow(raw: RawRow): Row | null {
  if (!METRIC_RE.test(raw.metric)) return null;
  if (!Number.isSafeInteger(raw.value) || raw.value < 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.dimsJson);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > MAX_DIMS) return null;
  const dims: Record<string, DimValue> = {};
  for (const [key, value] of entries) {
    if (!DIM_KEY_RE.test(key)) return null;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || value < 0) return null;
    } else if (
      typeof value !== 'string' ||
      !DIM_VALUE_RE.test(value) ||
      HASH_LIKE_RE.test(value) ||
      SNOWFLAKE_LIKE_RE.test(value) ||
      UUID_LIKE_RE.test(value)
    ) {
      return null;
    }
    dims[key] = value;
  }
  return { metric: raw.metric, dims, value: raw.value };
}

// --- Aggregation ---

const dimsKey = (dims: Record<string, DimValue>): string =>
  JSON.stringify(
    Object.keys(dims)
      .sort()
      .map((k) => [k, dims[k]]),
  );

/** Sums rows with the same metric and dims. */
export class Sums {
  private readonly map = new Map<string, Row>();

  add(row: Row): void {
    const key = `${row.metric}\u0000${dimsKey(row.dims)}`;
    const found = this.map.get(key);
    if (found === undefined) this.map.set(key, { ...row, dims: { ...row.dims } });
    else found.value += row.value;
  }

  /** The sums, sorted by metric then dims so the output is stable. */
  rows(): Row[] {
    return [...this.map.values()].sort(
      (a, b) => a.metric.localeCompare(b.metric) || dimsKey(a.dims).localeCompare(dimsKey(b.dims)),
    );
  }
}

/** Every day from `from` to `to` inclusive ('YYYY-MM-DD'). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) out.push(day);
  return out;
}

export interface GuildRows {
  alias: string;
  rows: readonly RawRow[];
}

/** Sums the rows of many guilds over a range. Rows outside the range or invalid are dropped. */
export function buildPeriod(
  from: string,
  to: string,
  guilds: readonly GuildRows[],
): { period: Period; daily: Record<string, Row[]>; byGuild: Record<string, Row[]> } {
  const totals = new Sums();
  const perDay = new Map<string, Sums>();
  const byGuild: Record<string, Row[]> = {};
  let rolledDays = 0;
  for (const guild of guilds) {
    const own = new Sums();
    for (const raw of guild.rows) {
      if (!DAY_RE.test(raw.day) || raw.day < from || raw.day > to) continue;
      const row = parseRow(raw);
      if (row === null) continue;
      if (row.metric === 'rolled') {
        rolledDays += row.value;
        continue;
      }
      totals.add(row);
      own.add(row);
      if (DAILY_SERIES.has(row.metric)) {
        const sums = perDay.get(raw.day) ?? new Sums();
        sums.add(row);
        perDay.set(raw.day, sums);
      }
    }
    byGuild[guild.alias] = own.rows();
  }
  const daily: Record<string, Row[]> = {};
  for (const day of [...perDay.keys()].sort()) daily[day] = perDay.get(day)?.rows() ?? [];
  return {
    period: {
      from,
      to,
      days: daysBetween(from, to).length,
      rolledDays,
      totals: totals.rows(),
    },
    daily,
    byGuild,
  };
}

// --- Query ---

export type OpsQuery =
  | {
      ok: true;
      from: string;
      to: string;
      format: 'json' | 'md';
      /** The period to compare with, if any. */
      compare: { from: string; to: string } | null;
      /** True only for `byGuild=1`: include the per-server breakdown. */
      byGuild: boolean;
    }
  | { ok: false };

const ALLOWED_PARAMS: ReadonlySet<string> = new Set([
  'from',
  'to',
  'format',
  'weekly',
  'compareFrom',
  'compareTo',
  'byGuild',
]);

/** A real 'YYYY-MM-DD' date, or null. */
function realDate(value: string | null): string | null {
  if (value === null || !DAY_RE.test(value)) return null;
  try {
    return addDays(value, 0) === value ? value : null;
  } catch {
    return null;
  }
}

/** The number of days from `from` to `to` inclusive (both real dates). */
function spanDays(from: string, to: string): number {
  const ms = (d: string): number => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((ms(to) - ms(from)) / 86_400_000) + 1;
}

/** One value of a query parameter that may appear at most once; undefined when it is repeated. */
function single(params: URLSearchParams, key: string): string | null | undefined {
  const all = params.getAll(key);
  if (all.length > 1) return undefined;
  return all[0] ?? null;
}

/** Parses the query strictly: unknown or repeated parameters, bad dates and ranges are refused. */
export function parseOpsQuery(url: URL): OpsQuery {
  const params = url.searchParams;
  for (const key of params.keys()) if (!ALLOWED_PARAMS.has(key)) return { ok: false };
  const fromRaw = single(params, 'from');
  const toRaw = single(params, 'to');
  const formatRaw = single(params, 'format');
  const weeklyRaw = single(params, 'weekly');
  const compareFromRaw = single(params, 'compareFrom');
  const compareToRaw = single(params, 'compareTo');
  const byGuildRaw = single(params, 'byGuild');
  if (
    fromRaw === undefined ||
    toRaw === undefined ||
    formatRaw === undefined ||
    weeklyRaw === undefined ||
    compareFromRaw === undefined ||
    compareToRaw === undefined ||
    byGuildRaw === undefined
  ) {
    return { ok: false };
  }
  if (byGuildRaw !== null && byGuildRaw !== '1') return { ok: false };
  const byGuild = byGuildRaw === '1';
  const from = realDate(fromRaw);
  const to = realDate(toRaw);
  if (from === null || to === null || from > to) return { ok: false };
  const days = spanDays(from, to);
  if (days > MAX_REPORT_DAYS) return { ok: false };
  const format = formatRaw ?? 'json';
  if (format !== 'json' && format !== 'md') return { ok: false };
  if (weeklyRaw !== null && weeklyRaw !== '0' && weeklyRaw !== '1') return { ok: false };
  const weekly = weeklyRaw === '1';

  if ((compareFromRaw === null) !== (compareToRaw === null)) return { ok: false };
  if (compareFromRaw !== null && compareToRaw !== null) {
    if (weekly) return { ok: false };
    const cFrom = realDate(compareFromRaw);
    const cTo = realDate(compareToRaw);
    if (cFrom === null || cTo === null || cFrom > cTo || spanDays(cFrom, cTo) > MAX_REPORT_DAYS) {
      return { ok: false };
    }
    return { ok: true, from, to, format, compare: { from: cFrom, to: cTo }, byGuild };
  }
  if (weekly) {
    // The previous period of the same length, ending the day before this one starts.
    return {
      ok: true,
      from,
      to,
      format,
      compare: { from: addDays(from, -days), to: addDays(from, -1) },
      byGuild,
    };
  }
  return { ok: true, from, to, format, compare: null, byGuild };
}
