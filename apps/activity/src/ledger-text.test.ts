import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from './api';
import { describeEntry } from './ledger-text';

const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: 1,
  currency: 'bait',
  amount: 30,
  source: 'leet',
  createdAt: 0,
  meta: null,
  ...over,
});

describe('describeEntry', () => {
  it('describes a leet credit with its date and players', () => {
    expect(describeEntry(entry({ meta: { date: '2026-10-09', participants: 3 } }))).toBe(
      '+30 Bait · leet on 2026-10-09 with 3 players',
    );
    expect(describeEntry(entry({ meta: { date: '2026-10-09', participants: 1 } }))).toBe(
      '+30 Bait · solo leet on 2026-10-09',
    );
  });

  it('calls the gear debit a gear upgrade', () => {
    expect(describeEntry(entry({ currency: 'essence', amount: -30, source: 'gear' }))).toBe(
      '-30 Essence · gear upgrade',
    );
  });

  it('falls back to the source for the others', () => {
    expect(describeEntry(entry({ amount: -10, source: 'train' }))).toBe('-10 Bait · train');
  });
});
