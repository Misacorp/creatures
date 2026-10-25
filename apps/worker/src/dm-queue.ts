/**
 * The queue of Discord DMs in the guild's Durable Object: queued by the scan (`dm-notify.ts`), claimed and
 * recorded by the delivery in `guild-core.ts`. It mirrors the announcement posts' queue
 * (`discord-posts.ts`): a unique key per message, leased claims, backoff, a limit of attempts.
 */
import type { Analytics } from './analytics';
import {
  MAX_POST_ATTEMPTS,
  POST_BACKOFF_MS,
  type PostFailureKind,
  type SendOutcome,
} from './discord-posts';

/** How long a claimed DM stays out of the queue, in case the object stops mid-send. */
const CLAIM_LEASE_MS = 10 * 60 * 1000;
/** Sent and failed DMs are kept this long, for a look at what happened. */
export const OUTBOX_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Queues one DM. False if a message with this key exists already (the existing one is never changed). */
export function enqueueDm(
  sql: SqlStorage,
  dm: { key: string; userId: string; content: string },
  now: number,
): boolean {
  return (
    sql
      .exec(
        `INSERT INTO dm_outbox (key, user_id, content, status, attempts, next_attempt_at, created_at)
         VALUES (?, ?, ?, 'pending', 0, ?, ?) ON CONFLICT(key) DO NOTHING RETURNING id`,
        dm.key,
        dm.userId,
        dm.content,
        now,
        now,
      )
      .toArray().length > 0
  );
}

export interface ClaimedDm {
  id: number;
  userId: string;
  content: string;
  /** Attempts so far, this one included. */
  attempts: number;
}

/** True if a pending DM is due. */
export function hasDueDms(sql: SqlStorage, now: number): boolean {
  return (
    sql
      .exec(
        "SELECT 1 FROM dm_outbox WHERE status = 'pending' AND next_attempt_at <= ? LIMIT 1",
        now,
      )
      .toArray().length > 0
  );
}

/** The earliest time a pending DM is due, or null if none is pending. */
export function nextDmAt(sql: SqlStorage): number | null {
  return (
    sql
      .exec<{
        at: number | null;
      }>("SELECT MIN(next_attempt_at) AS at FROM dm_outbox WHERE status = 'pending'")
      .one().at ?? null
  );
}

/** Takes the next due DM and counts the attempt (leased, like `claimNextPost`). Call inside a transaction. */
export function claimNextDm(sql: SqlStorage, now: number): ClaimedDm | null {
  const row = sql
    .exec<{ id: number; user_id: string; content: string; attempts: number }>(
      `SELECT id, user_id, content, attempts FROM dm_outbox
       WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY next_attempt_at, id LIMIT 1`,
      now,
    )
    .toArray()[0];
  if (row === undefined) return null;
  sql.exec(
    'UPDATE dm_outbox SET attempts = attempts + 1, next_attempt_at = ? WHERE id = ?',
    now + CLAIM_LEASE_MS,
    row.id,
  );
  return { id: row.id, userId: row.user_id, content: row.content, attempts: row.attempts + 1 };
}

/** Marks a claimed DM failed for good. */
export function failDm(sql: SqlStorage, dm: ClaimedDm): void {
  sql.exec("UPDATE dm_outbox SET status = 'failed' WHERE id = ?", dm.id);
}

/**
 * Stores what happened to a claimed DM and returns the failure kind to log (null when sent). A retry
 * waits Discord's own `afterMs` or the backoff for the attempt number, and becomes `failed` once
 * `MAX_POST_ATTEMPTS` attempts were made. A refusal (`blocked`) is final: the caller records the block.
 */
export function recordDmOutcome(
  sql: SqlStorage,
  dm: ClaimedDm,
  outcome: SendOutcome | { kind: 'blocked' },
  now: number,
  analytics?: Analytics,
): PostFailureKind | null {
  if (outcome.kind === 'blocked') {
    analytics?.record({
      kind: 'dm_result',
      result: 'blocked',
      error: 'forbidden',
      attempts: dm.attempts,
    });
    failDm(sql, dm);
    return 'forbidden';
  }
  if (outcome.kind === 'sent') {
    analytics?.record({ kind: 'dm_result', result: 'sent', error: null, attempts: dm.attempts });
    sql.exec("UPDATE dm_outbox SET status = 'sent' WHERE id = ?", dm.id);
    return null;
  }
  const final = outcome.kind === 'failed' || dm.attempts >= MAX_POST_ATTEMPTS;
  analytics?.record({
    kind: 'dm_result',
    result: final ? 'failed' : 'retry',
    error: outcome.error,
    attempts: dm.attempts,
  });
  if (final) {
    failDm(sql, dm);
    return outcome.error;
  }
  const wait =
    outcome.afterMs ??
    POST_BACKOFF_MS[dm.attempts - 1] ??
    POST_BACKOFF_MS[POST_BACKOFF_MS.length - 1] ??
    0;
  sql.exec('UPDATE dm_outbox SET next_attempt_at = ? WHERE id = ?', now + wait, dm.id);
  return outcome.error;
}

/** A player gets a welcome DM at most this often when they switch kinds on and off. */
export const WELCOME_GAP_MS = 60 * 60 * 1000;

/** True if a welcome DM was queued for this player at or after `since`. */
export function welcomedSince(sql: SqlStorage, userId: string, since: number): boolean {
  return (
    sql
      .exec(
        "SELECT 1 FROM dm_outbox WHERE user_id = ? AND key LIKE 'welcome:%' AND created_at >= ? LIMIT 1",
        userId,
        since,
      )
      .toArray().length > 0
  );
}

/** Drops sent and failed DMs older than a week. */
export function pruneOutbox(sql: SqlStorage, now: number): void {
  sql.exec(
    "DELETE FROM dm_outbox WHERE status <> 'pending' AND created_at < ?",
    now - OUTBOX_KEEP_MS,
  );
}
