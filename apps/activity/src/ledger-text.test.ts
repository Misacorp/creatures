import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from './api';
import { baitIncome, incomeLine } from './ledger-text';

const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: 1,
  currency: 'bait',
  amount: 30,
  source: 'leet',
  createdAt: 0,
  meta: null,
  ...over,
});

describe('incomeLine', () => {
  it('describes a leet credit with its date and players', () => {
    expect(incomeLine(entry({ meta: { date: '2026-10-09', participants: 3 } }))).toBe(
      '+30 · leet on 2026-10-09 with 3 players',
    );
    expect(incomeLine(entry({ meta: { date: '2026-10-09', participants: 1 } }))).toBe(
      '+30 · solo leet on 2026-10-09',
    );
    expect(incomeLine(entry({ meta: { date: 'not a date', participants: 3 } }))).toBe('+30 · leet');
  });

  it('names the other sources', () => {
    expect(incomeLine(entry({ amount: 25, source: 'allowance' }))).toBe('+25 · daily allowance');
    expect(incomeLine(entry({ amount: 40, source: 'rank_gift' }))).toBe('+40 · explorer rank gift');
    expect(incomeLine(entry({ amount: 8, source: 'games' }))).toBe('+8 · Prize Stall');
  });

  it('falls back to the source', () => {
    expect(incomeLine(entry({ amount: 10, source: 'refund' }))).toBe('+10 · refund');
  });
});

describe('baitIncome', () => {
  it('keeps only Bait credits: no spends, no other currency, no zero', () => {
    const got = baitIncome([
      entry({ id: 1, amount: 30 }),
      entry({ id: 2, amount: -10, source: 'train' }),
      entry({ id: 3, currency: 'essence', amount: 5 }),
      entry({ id: 4, amount: 0 }),
      entry({ id: 5, amount: 7, source: 'allowance' }),
    ]);
    expect(got.map((e) => e.id).sort()).toEqual([1, 5]);
  });

  it('orders newest first, ties by id, whatever the input order', () => {
    const got = baitIncome([
      entry({ id: 1, createdAt: 100 }),
      entry({ id: 3, createdAt: 300 }),
      entry({ id: 2, createdAt: 300 }),
      entry({ id: 4, createdAt: 200 }),
    ]);
    expect(got.map((e) => e.id)).toEqual([3, 2, 4, 1]);
  });

  it('stops at the limit (five by default) and does not change its input', () => {
    const input = Array.from({ length: 12 }, (_, i) => entry({ id: i + 1, createdAt: i }));
    expect(baitIncome(input)).toHaveLength(5);
    expect(baitIncome(input)[0]?.id).toBe(12);
    expect(baitIncome(input, 2).map((e) => e.id)).toEqual([12, 11]);
    expect(baitIncome(input, 0)).toEqual([]);
    expect(input[0]?.id).toBe(1);
  });
});
