import type { LedgerEntry } from '../api';

/** What the workbench's currency popover shows for its Bait income list. */
export const INCOME_CASES = ['typical', 'only spends', 'nothing yet', 'loading', 'failed'] as const;

const NOW = Date.UTC(2026, 9, 24, 12);
const entry = (
  id: number,
  hoursAgo: number,
  amount: number,
  source: string,
  meta: LedgerEntry['meta'] = null,
  currency = 'bait',
): LedgerEntry => ({ id, currency, amount, source, createdAt: NOW - hoursAgo * 3_600_000, meta });

/** Sample ledgers (newest first) with spends and Essence mixed in, which the list must leave out. */
const TYPICAL: readonly LedgerEntry[] = [
  entry(9, 1, -25, 'train'),
  entry(8, 2, 30, 'leet', { date: '2026-10-23', participants: 4 }),
  entry(7, 5, 12, 'allowance', { day: '2026-10-24' }),
  entry(6, 9, 3, 'dungeon', null, 'essence'),
  entry(5, 20, 8, 'games'),
  entry(4, 30, -40, 'send'),
  entry(3, 50, 25, 'rank_gift'),
  entry(2, 70, 18, 'leet', { date: '2026-10-21', participants: 1 }),
  entry(1, 90, 12, 'allowance', { day: '2026-10-20' }),
];

const SPENDS: readonly LedgerEntry[] = [entry(2, 1, -25, 'train'), entry(1, 4, -40, 'send')];

/** A ledger loader for a case; `loading` never answers and `failed` rejects. */
export function incomeLoader(kind: string): () => Promise<LedgerEntry[]> {
  switch (kind) {
    case 'only spends':
      return () => Promise.resolve([...SPENDS]);
    case 'nothing yet':
      return () => Promise.resolve([]);
    case 'loading':
      return () => new Promise<LedgerEntry[]>(() => undefined);
    case 'failed':
      return () => Promise.reject(new Error('sample failure'));
    default:
      return () => Promise.resolve([...TYPICAL]);
  }
}
