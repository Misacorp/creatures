import type { LedgerEntry } from './api';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** How many Bait credits the currency popover lists. */
export const INCOME_LIMIT = 5;

/** How many ledger entries to ask for so that spends mixed in still leave `INCOME_LIMIT` credits. */
export const INCOME_FETCH = 30;

/** Where a ledger entry's Bait came from, in the game's words: "leet on 2026-10-09 with 3 players". */
function sourceText(entry: LedgerEntry): string {
  const meta = entry.meta;
  if (
    entry.source === 'leet' &&
    meta !== null &&
    typeof meta['date'] === 'string' &&
    DATE_RE.test(meta['date']) &&
    typeof meta['participants'] === 'number'
  ) {
    return meta['participants'] === 1
      ? `solo leet on ${meta['date']}`
      : `leet on ${meta['date']} with ${String(meta['participants'])} players`;
  }
  if (entry.source === 'leet') return 'leet';
  if (entry.source === 'allowance') return 'daily allowance';
  if (entry.source === 'rank_gift') return 'explorer rank gift';
  if (entry.source === 'games') return 'Prize Stall';
  return entry.source;
}

/**
 * The newest Bait credits (income only: never a spend, never another currency), newest first, at most
 * `limit`. The server answers newest first; the order is made certain here (time, then id).
 */
export function baitIncome(
  entries: readonly LedgerEntry[],
  limit: number = INCOME_LIMIT,
): LedgerEntry[] {
  return entries
    .filter((e) => e.currency === 'bait' && e.amount > 0)
    .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
    .slice(0, Math.max(0, limit));
}

/** One compact line for a Bait credit, for example "+30 · leet on 2026-10-09 with 3 players". */
export function incomeLine(entry: LedgerEntry): string {
  return `+${String(entry.amount)} · ${sourceText(entry)}`;
}
