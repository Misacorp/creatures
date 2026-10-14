/**
 * Idempotent actions: the one place that decides what a repeated or reused client key means.
 *
 * Key namespace rule (see `docs/design/decisions.md`): a client key (`SPEND_KEY_RE`, no `:`) is one
 * namespace per player, shared by the ledger's spends, `gear_actions` (gear, workshop and expedition
 * sends) and `dungeon_runs`. A repeat of the same action returns the stored result; the same key on a
 * different action is a `key_conflict`. Server-built keys (`<source>:<scope...>`) contain a `:`, so
 * they can never collide with a client key.
 *
 * Everything here is synchronous and must run inside the caller's `transactionSync`.
 */
import { lookupSpend, type SpendResult } from './ledger';
import { GameError } from './outcome';

/** Where a key can already be in use besides the table a caller owns. */
export type KeyTable = 'ledger' | 'gear_actions';

/** Whether the player's key is already used in any of `tables` (by any kind of action). */
export function keyTaken(
  sql: SqlStorage,
  userId: string,
  key: string,
  tables: readonly KeyTable[],
): boolean {
  return tables.some((table) =>
    table === 'ledger'
      ? lookupSpend(sql, userId, key) !== null
      : sql.exec('SELECT 1 FROM gear_actions WHERE user_id = ? AND key = ?', userId, key).toArray()
          .length > 0,
  );
}

export interface KeyedAction {
  userId: string;
  /** The client's idempotency key. */
  key: string;
  /** What kind of action this is, for example `upgrade` or `expedition_send`. */
  kind: string;
  /** What the action was about; a repeat must match it exactly. */
  fingerprint: string;
}

/**
 * Runs an action once per (player, key), storing its result in `gear_actions`. A repeat of the same
 * action returns the stored result and does nothing else; the same key on a different action, or one
 * already used by a ledger spend, is a `key_conflict`. If `run` throws, nothing is stored (the caller's
 * transaction rolls back). `now` is read only after `run` finished.
 */
export function runKeyed<T>(
  sql: SqlStorage,
  now: () => number,
  action: KeyedAction,
  run: () => T,
): T {
  const { userId, key, kind, fingerprint } = action;
  const prior = sql
    .exec<{ kind: string; fingerprint: string; result_json: string }>(
      'SELECT kind, fingerprint, result_json FROM gear_actions WHERE user_id = ? AND key = ?',
      userId,
      key,
    )
    .toArray()[0];
  if (prior !== undefined) {
    if (prior.kind !== kind || prior.fingerprint !== fingerprint) {
      throw new GameError(409, 'key_conflict');
    }
    return JSON.parse(prior.result_json) as T;
  }
  if (keyTaken(sql, userId, key, ['ledger'])) throw new GameError(409, 'key_conflict');
  const result = run();
  sql.exec(
    `INSERT INTO gear_actions (user_id, key, kind, fingerprint, result_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    userId,
    key,
    kind,
    fingerprint,
    JSON.stringify(result) ?? 'null',
    now(),
  );
  return result;
}

/**
 * Turns the answer of a ledger `spend` into its result, or throws the error to answer with. A replay is
 * a `key_conflict` unless `acceptReplay` says the stored result is of this very action (a retry of a
 * training or evolution, which has no stored row of its own).
 */
export function settleSpend<T>(spent: SpendResult<T>, acceptReplay?: (stored: T) => boolean): T {
  switch (spent.status) {
    case 'insufficient_funds':
      throw new GameError(409, 'insufficient_funds');
    case 'key_conflict':
      throw new GameError(409, 'key_conflict');
    case 'replayed':
      if (acceptReplay?.(spent.result) !== true) throw new GameError(409, 'key_conflict');
      return spent.result;
    case 'ok':
      return spent.result;
  }
}
