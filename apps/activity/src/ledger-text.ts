import type { LedgerEntry } from './api';

const CURRENCY_NAMES: Record<string, string> = { bait: 'Bait', essence: 'Essence' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** One plain-text line for a ledger entry, for example "+30 Bait · leet on 2026-10-09 with 3 players". */
export function describeEntry(entry: LedgerEntry): string {
  const sign = entry.amount >= 0 ? '+' : '-';
  const currency = CURRENCY_NAMES[entry.currency] ?? entry.currency;
  const head = `${sign}${String(Math.abs(entry.amount))} ${currency}`;
  const meta = entry.meta;
  if (
    entry.source === 'leet' &&
    meta !== null &&
    typeof meta['date'] === 'string' &&
    DATE_RE.test(meta['date']) &&
    typeof meta['participants'] === 'number'
  ) {
    return meta['participants'] === 1
      ? `${head} · solo leet on ${meta['date']}`
      : `${head} · leet on ${meta['date']} with ${String(meta['participants'])} players`;
  }
  if (entry.source === 'gear') return `${head} · gear upgrade`;
  if (entry.source === 'rank_gift') return `${head} · explorer rank gift`;
  return `${head} · ${entry.source}`;
}
