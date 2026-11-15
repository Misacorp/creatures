/**
 * The reset's dry run (staging only, `docs/design/reset-build.md`): the answer of `GET /api/dev/reset-dry-run` read into plain rows for
 * `ui/DataTable`. It only reads; nothing here starts a reset.
 */
import { apiFetch } from '../api';
import { isRecord } from '../parse-core';
import type { DataRow } from '../ui/DataTable';

export interface DryRunView {
  settlers: number;
  creatures: number;
  feats: { feat: string; holders: { name: string; detail: string }[] }[];
  tables: { table: string; rows: number }[];
  rowsToDelete: number;
  dms: {
    count: number;
    longest: number;
    limit: number;
    over: number;
    previews: { name: string; length: number; content: string }[];
  };
  recordChars: number;
  leet: string;
}

const isNum = (value: unknown): value is number => typeof value === 'number';
const isStr = (value: unknown): value is string => typeof value === 'string';

function list<T>(value: unknown, item: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const entry of value as unknown[]) {
    const parsed = item(entry);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

/** Reads the answer; null for anything of another shape. */
export function parseDryRun(data: unknown): DryRunView | null {
  if (!isRecord(data) || !isRecord(data['dms'])) return null;
  const dms = data['dms'];
  const feats = list(data['feats'], (f) => {
    if (!isRecord(f) || !isStr(f['feat'])) return null;
    const holders = list(f['holders'], (h) =>
      isRecord(h) && isStr(h['name']) && isStr(h['detail'])
        ? { name: h['name'], detail: h['detail'] }
        : null,
    );
    return holders === null ? null : { feat: f['feat'], holders };
  });
  const tables = list(data['tables'], (t) =>
    isRecord(t) && isStr(t['table']) && isNum(t['rows'])
      ? { table: t['table'], rows: t['rows'] }
      : null,
  );
  const previews = list(dms['previews'], (p) =>
    isRecord(p) && isStr(p['name']) && isNum(p['length']) && isStr(p['content'])
      ? { name: p['name'], length: p['length'], content: p['content'] }
      : null,
  );
  if (
    feats === null ||
    tables === null ||
    previews === null ||
    !isNum(data['settlers']) ||
    !isNum(data['creatures']) ||
    !isNum(data['rowsToDelete']) ||
    !isNum(data['recordChars']) ||
    !isStr(data['leet']) ||
    !isNum(dms['count']) ||
    !isNum(dms['longest']) ||
    !isNum(dms['limit']) ||
    !isNum(dms['over'])
  ) {
    return null;
  }
  return {
    settlers: data['settlers'],
    creatures: data['creatures'],
    feats,
    tables,
    rowsToDelete: data['rowsToDelete'],
    dms: {
      count: dms['count'],
      longest: dms['longest'],
      limit: dms['limit'],
      over: dms['over'],
      previews,
    },
    recordChars: data['recordChars'],
    leet: data['leet'],
  };
}

/** The dry run, or null when the call failed. */
export async function fetchDryRun(): Promise<DryRunView | null> {
  try {
    return parseDryRun(await apiFetch('/api/dev/reset-dry-run'));
  } catch {
    return null;
  }
}

/** What the reset would record and send. */
export function summaryRows(view: DryRunView): DataRow[] {
  return [
    { label: 'Settlers recorded', value: String(view.settlers) },
    { label: 'Creatures recorded', value: String(view.creatures) },
    { label: 'Record size', value: `${String(view.recordChars)} chars` },
    { label: 'DMs to send', value: String(view.dms.count) },
    { label: 'Longest DM', value: `${String(view.dms.longest)} / ${String(view.dms.limit)}` },
    { label: 'DMs over the limit', value: String(view.dms.over) },
    { label: 'Rows the wipe deletes', value: String(view.rowsToDelete) },
  ];
}

/** One row per holder of a feat (a feat nobody holds has one row saying so). */
export function featRows(view: DryRunView): DataRow[] {
  return view.feats.flatMap((f) =>
    f.holders.length === 0
      ? [{ label: f.feat, value: 'nobody' }]
      : f.holders.map((h, i) => ({
          label: i === 0 ? f.feat : '',
          value: `${h.name}: ${h.detail}`,
        })),
  );
}

/** The tables that hold rows, the most first; the tables without any are counted in a last row. */
export function tableRows(view: DryRunView): DataRow[] {
  const full = view.tables.filter((t) => t.rows > 0).sort((a, b) => b.rows - a.rows);
  const empty = view.tables.length - full.length;
  return [
    ...full.map((t) => ({ label: t.table, value: String(t.rows) })),
    { label: `${String(empty)} empty tables`, value: '0' },
  ];
}
