/**
 * The Bait/Essence ledger: append-only rows plus a balances table, both in the guild's Durable
 * Object SQLite database. Every function here is synchronous so callers can compose them inside a
 * single `transactionSync` with no `await` between the check and the write.
 */

export const CURRENCIES = ['bait', 'essence'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Spend idempotency keys are client-generated (a UUID): 8-64 characters of this set. */
export const SPEND_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
/** Credit keys are server-built (for example `leet:<day id>`), so they may contain more. */
const CREDIT_KEY_RE = /^[A-Za-z0-9_:.-]{1,128}$/;
const MAX_META_CHARS = 1000;

export interface CreditInput {
  userId: string;
  currency: Currency;
  amount: number;
  source: string;
  idempotencyKey: string;
  meta?: Record<string, unknown>;
}

export interface SpendInput<T> {
  userId: string;
  currency: Currency;
  amount: number;
  /** Stored as the ledger `source` of the debit (for example 'expedition' or 'training'). */
  purpose: string;
  idempotencyKey: string;
  /** Does the grant. Runs inside the spend's transaction and must stay synchronous. */
  apply: () => T;
}

export type SpendResult<T> =
  | { status: 'ok'; result: T }
  | { status: 'replayed'; result: T }
  | { status: 'insufficient_funds'; balance: number }
  /** The key was already used for a different spend; nothing was charged. */
  | { status: 'key_conflict' };

export interface LedgerEntry {
  id: number;
  currency: Currency;
  amount: number;
  source: string;
  createdAt: number;
  meta: unknown;
}

export interface LedgerStorage {
  sql: SqlStorage;
  transactionSync<T>(closure: () => T): T;
}

function assertPositiveInt(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('amount must be a positive safe integer');
  }
}

function assertCurrency(currency: string): asserts currency is Currency {
  if (!(CURRENCIES as readonly string[]).includes(currency)) throw new Error('unknown currency');
}

function assertSource(source: string): void {
  if (source.length === 0 || source.length > 32) throw new Error('invalid ledger source');
}

export function getBalance(sql: SqlStorage, userId: string, currency: Currency): number {
  const row = sql
    .exec<{
      amount: number;
    }>('SELECT amount FROM balances WHERE user_id = ? AND currency = ?', userId, currency)
    .toArray()[0];
  return row?.amount ?? 0;
}

export function getBalances(sql: SqlStorage, userId: string): Record<Currency, number> {
  return {
    bait: getBalance(sql, userId, 'bait'),
    essence: getBalance(sql, userId, 'essence'),
  };
}

/**
 * Credits a balance once per (user, idempotency key). The caller may already be inside a
 * transaction; nested `transactionSync` calls are savepoints, so this is safe either way.
 */
export function credit(
  storage: LedgerStorage,
  input: CreditInput,
  now: number,
): { applied: boolean } {
  assertPositiveInt(input.amount);
  assertCurrency(input.currency);
  assertSource(input.source);
  if (!CREDIT_KEY_RE.test(input.idempotencyKey)) throw new Error('invalid idempotency key');
  const meta = input.meta === undefined ? null : JSON.stringify(input.meta);
  if (meta !== null && meta.length > MAX_META_CHARS) throw new Error('ledger meta too large');

  return storage.transactionSync(() => {
    const inserted = storage.sql
      .exec(
        `INSERT INTO ledger (user_id, currency, amount, source, idempotency_key, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, idempotency_key) DO NOTHING RETURNING id`,
        input.userId,
        input.currency,
        input.amount,
        input.source,
        input.idempotencyKey,
        meta,
        now,
      )
      .toArray();
    if (inserted.length === 0) return { applied: false };
    storage.sql.exec(
      `INSERT INTO balances (user_id, currency, amount) VALUES (?, ?, ?)
       ON CONFLICT(user_id, currency) DO UPDATE SET amount = amount + excluded.amount`,
      input.userId,
      input.currency,
      input.amount,
    );
    return { applied: true };
  });
}

/** A previous spend under an idempotency key, as stored by `spend`. */
export interface PriorSpend {
  currency: Currency;
  /** Positive: the amount that was charged. */
  amount: number;
  /** The ledger `source` (the spend's purpose). */
  purpose: string;
  /** The stored result of `apply`, or null if the row is not a completed spend. */
  result: unknown;
}

/**
 * Looks up a previous spend by key, so callers whose price depends on mutable state (training)
 * can replay with the originally charged amount instead of re-pricing a retry.
 */
export function lookupSpend(sql: SqlStorage, userId: string, key: string): PriorSpend | null {
  const row = sql
    .exec<{ currency: Currency; amount: number; source: string; result: string | null }>(
      'SELECT currency, amount, source, result FROM ledger WHERE user_id = ? AND idempotency_key = ?',
      userId,
      key,
    )
    .toArray()[0];
  if (row === undefined) return null;
  return {
    currency: row.currency,
    amount: Math.abs(row.amount),
    purpose: row.source,
    result: parseMeta(row.result),
  };
}

/**
 * Charges a balance and runs `apply` (the grant) in one synchronous transaction. A retry with the
 * same idempotency key returns the stored result and charges nothing. If `apply` throws, the
 * debit rolls back with it.
 */
export function spend<T>(
  storage: LedgerStorage,
  input: SpendInput<T>,
  now: number,
): SpendResult<T> {
  assertPositiveInt(input.amount);
  assertCurrency(input.currency);
  assertSource(input.purpose);
  if (!SPEND_KEY_RE.test(input.idempotencyKey)) throw new Error('invalid idempotency key');

  return storage.transactionSync((): SpendResult<T> => {
    const sql = storage.sql;
    const existing = sql
      .exec<{ currency: string; amount: number; result: string | null }>(
        'SELECT currency, amount, result FROM ledger WHERE user_id = ? AND idempotency_key = ?',
        input.userId,
        input.idempotencyKey,
      )
      .toArray()[0];
    if (existing !== undefined) {
      if (
        existing.result === null ||
        existing.currency !== input.currency ||
        existing.amount !== -input.amount
      ) {
        return { status: 'key_conflict' };
      }
      return { status: 'replayed', result: JSON.parse(existing.result) as T };
    }

    const balance = getBalance(sql, input.userId, input.currency);
    if (balance < input.amount) return { status: 'insufficient_funds', balance };

    const inserted = sql
      .exec<{ id: number }>(
        `INSERT INTO ledger (user_id, currency, amount, source, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        input.userId,
        input.currency,
        -input.amount,
        input.purpose,
        input.idempotencyKey,
        now,
      )
      .one();
    sql.exec(
      'UPDATE balances SET amount = amount - ? WHERE user_id = ? AND currency = ?',
      input.amount,
      input.userId,
      input.currency,
    );
    const result = input.apply();
    if (typeof (result as { then?: unknown } | null)?.then === 'function') {
      throw new Error('spend apply must be synchronous');
    }
    sql.exec(
      'UPDATE ledger SET result = ? WHERE id = ?',
      JSON.stringify(result) ?? 'null',
      inserted.id,
    );
    return { status: 'ok', result };
  });
}

/** Newest-first ledger entries of one user. */
export function listEntries(sql: SqlStorage, userId: string, limit: number): LedgerEntry[] {
  return sql
    .exec<{
      id: number;
      currency: Currency;
      amount: number;
      source: string;
      created_at: number;
      meta: string | null;
    }>(
      `SELECT id, currency, amount, source, created_at, meta FROM ledger
       WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
      userId,
      limit,
    )
    .toArray()
    .map((row) => ({
      id: row.id,
      currency: row.currency,
      amount: row.amount,
      source: row.source,
      createdAt: row.created_at,
      meta: parseMeta(row.meta),
    }));
}

/**
 * The meta of an entry as clients see it. The `jackpot` flag of a raid payout stays in storage but is
 * left out here: the jackpot is hidden from players.
 */
function parseMeta(meta: string | null): unknown {
  if (meta === null) return null;
  try {
    const parsed: unknown = JSON.parse(meta);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const visible: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
      delete visible['jackpot'];
      return visible;
    }
    return parsed;
  } catch {
    return null;
  }
}
