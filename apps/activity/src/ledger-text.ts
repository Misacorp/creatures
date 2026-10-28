import type { LedgerEntry } from './api';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** How many Bait credits the currency popover lists. */
export const INCOME_LIMIT = 5;

/** How many Bait credits to ask for (the server leaves out the spends): a few spare over `INCOME_LIMIT`. */
export const INCOME_FETCH = 10;

/** The other places Bait comes from (ledger ids), in the game's words. Unknown ids read plainly. */
const SOURCE_NAMES: Readonly<Record<string, string>> = {
  allowance: 'daily allowance',
  rank_gift: 'explorer rank gift',
  games: 'Prize Stall',
  gear: 'gear upgrade',
  raid_phase: 'raid phase',
  raid_finale: 'raid finale',
  festival: 'festival',
  expedition: 'trip',
  trip: 'trip',
  welcome: 'welcome gift',
  dungeon: 'dungeon',
  level_reset: 'level reset refund',
  dev: 'dev tools',
};

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
  return SOURCE_NAMES[entry.source] ?? entry.source.replace(/_/g, ' ');
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

/** A Bait credit as a table row: where it came from ("leet on 2026-10-09 with 3 players") and the amount ("+30"). */
export function incomeRow(entry: LedgerEntry): { source: string; amount: string } {
  return { source: sourceText(entry), amount: `+${String(entry.amount)}` };
}

/** One compact line for a Bait credit, for example "+30 · leet on 2026-10-09 with 3 players". */
export function incomeLine(entry: LedgerEntry): string {
  const row = incomeRow(entry);
  return `${row.amount} · ${row.source}`;
}
