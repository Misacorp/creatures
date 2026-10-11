/**
 * Posts to the guild's Discord announcement channel: a queue in the guild's Durable Object and the
 * sender that delivers it.
 *
 * Posts are queued inside the transaction that commits the thing they announce (`enqueuePost`), with
 * a unique key, so each is queued at most once even if an event runs again. Delivery happens later,
 * outside any transaction, and never blocks the game: failures are retried with backoff and then
 * given up on. Logs contain error kinds only, never tokens, ids, URLs or message text.
 */
import * as v from 'valibot';
import { SNOWFLAKE_RE } from './schemas';

const API_BASE = 'https://discord.com/api/v10';
const TIMEOUT_MS = 5000;
/** SUPPRESS_EMBEDS: link previews are never wanted in these messages. */
const FLAG_SUPPRESS_EMBEDS = 4;
/** Attempts before a post is given up on (the first try counts). */
export const MAX_POST_ATTEMPTS = 5;
/** Wait after the 1st, 2nd, 3rd and 4th failed attempt: 1 min, 5 min, 30 min, 2 h. */
export const POST_BACKOFF_MS: readonly number[] = [60_000, 300_000, 1_800_000, 7_200_000];
/** Longest wait a rate limit can ask for. */
const MAX_RETRY_AFTER_MS = 2 * 60 * 60 * 1000;
const MIN_RETRY_AFTER_MS = 1000;

export type PostFailureKind =
  | 'rate_limited'
  | 'server_error'
  | 'network'
  | 'timeout'
  | 'forbidden'
  | 'not_found'
  | 'rejected'
  | 'redirect';

export type SendOutcome =
  | { kind: 'sent' }
  /** Worth trying again; `afterMs` is Discord's own wait (429), or null for the usual backoff. */
  | { kind: 'retry'; error: PostFailureKind; afterMs: number | null }
  /** Will never work (no permission, unknown channel, bad request): give up at once. */
  | { kind: 'failed'; error: PostFailureKind };

/** Sends one message to one channel. Never throws. */
export type PostSender = (channelId: string, content: string) => Promise<SendOutcome>;

export interface PostSenderConfig {
  botToken: string;
  fetch?: typeof fetch;
}

const RateLimitBodySchema = v.object({ retry_after: v.number() });

function retryAfterMs(seconds: number | null): number | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(Math.max(Math.ceil(seconds * 1000), MIN_RETRY_AFTER_MS), MAX_RETRY_AFTER_MS);
}

async function readRetryAfter(res: Response): Promise<number | null> {
  try {
    const body = v.safeParse(RateLimitBodySchema, await res.json());
    if (body.success) return retryAfterMs(body.output.retry_after);
  } catch {
    // Fall through to the header.
  }
  const header = res.headers.get('Retry-After');
  return header !== null && /^\d{1,6}(\.\d+)?$/.test(header) ? retryAfterMs(Number(header)) : null;
}

async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // Nothing to free.
  }
}

export function createPostSender(config: PostSenderConfig): PostSender {
  const doFetch = config.fetch ?? fetch;
  return async (channelId, content) => {
    // The id goes into the URL: only ever a snowflake.
    if (!SNOWFLAKE_RE.test(channelId)) return { kind: 'failed', error: 'rejected' };
    let res: Response;
    try {
      res = await doFetch(`${API_BASE}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${config.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          allowed_mentions: { parse: [] },
          flags: FLAG_SUPPRESS_EMBEDS,
        }),
        // workerd rejects 'error'. A redirect is never expected from the API; it is treated as a failure.
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      return { kind: 'retry', error: timedOut ? 'timeout' : 'network', afterMs: null };
    }
    if (res.ok) {
      await discard(res);
      return { kind: 'sent' };
    }
    if (res.status === 429) {
      const afterMs = await readRetryAfter(res);
      return { kind: 'retry', error: 'rate_limited', afterMs };
    }
    await discard(res);
    if (res.status >= 500) return { kind: 'retry', error: 'server_error', afterMs: null };
    if (res.status === 403) return { kind: 'failed', error: 'forbidden' };
    if (res.status === 404) return { kind: 'failed', error: 'not_found' };
    if (res.status >= 300 && res.status < 400) return { kind: 'failed', error: 'redirect' };
    return { kind: 'failed', error: 'rejected' };
  };
}

// --- The queue (guild Durable Object storage) ---

/**
 * The channel raid posts go to, or null if none is known: the pinned channel while one is pinned
 * (logins do not change it then), otherwise the channel the Activity was most recently launched from.
 */
export function announceChannelId(sql: SqlStorage): string | null {
  const row = sql
    .exec<{ announce_channel_id: string | null }>(
      'SELECT announce_channel_id FROM guild_meta WHERE id = 1',
    )
    .toArray()[0];
  const id = row?.announce_channel_id ?? null;
  return id !== null && SNOWFLAKE_RE.test(id) ? id : null;
}

/** True while a server admin has pinned the announcement channel. */
export function isChannelPinned(sql: SqlStorage): boolean {
  const row = sql
    .exec<{ pinned: number }>(
      'SELECT announce_channel_pinned AS pinned FROM guild_meta WHERE id = 1',
    )
    .toArray()[0];
  return row?.pinned === 1;
}

/** Pins `channelId` (a verified snowflake) as the announcement channel. False if the guild is not bound. */
export function pinAnnounceChannel(sql: SqlStorage, channelId: string): boolean {
  if (!SNOWFLAKE_RE.test(channelId)) return false;
  return (
    sql
      .exec(
        'UPDATE guild_meta SET announce_channel_id = ?, announce_channel_pinned = 1 WHERE id = 1 RETURNING id',
        channelId,
      )
      .toArray().length > 0
  );
}

/** Unpins: the channel stays as it was until the next login, which then updates it again. */
export function unpinAnnounceChannel(sql: SqlStorage): void {
  sql.exec('UPDATE guild_meta SET announce_channel_pinned = 0 WHERE id = 1');
}

/**
 * Queues a post for the announcement channel. Call it inside the transaction that commits what is
 * being announced. Returns true if the post was queued now; false if there is no announcement
 * channel or a post with this key already exists (the existing one is never changed).
 */
export function enqueuePost(
  sql: SqlStorage,
  post: { key: string; content: string },
  now: number,
): boolean {
  const channelId = announceChannelId(sql);
  if (channelId === null) return false;
  return (
    sql
      .exec(
        `INSERT INTO discord_posts (key, channel_id, content, status, attempts, next_attempt_at, created_at)
         VALUES (?, ?, ?, 'pending', 0, ?, ?) ON CONFLICT(key) DO NOTHING RETURNING id`,
        post.key,
        channelId,
        post.content,
        now,
        now,
      )
      .toArray().length > 0
  );
}

export interface ClaimedPost {
  id: number;
  channelId: string;
  content: string;
  /** Attempts so far, this one included. */
  attempts: number;
}

/** How long a claimed post stays out of the queue, in case the object stops mid-send. */
const CLAIM_LEASE_MS = 10 * 60 * 1000;

/** True if a pending post is due. */
export function hasDuePosts(sql: SqlStorage, now: number): boolean {
  return (
    sql
      .exec(
        "SELECT 1 FROM discord_posts WHERE status = 'pending' AND next_attempt_at <= ? LIMIT 1",
        now,
      )
      .toArray().length > 0
  );
}

/** The earliest time a pending post is due, or null if none is pending. */
export function nextPostAt(sql: SqlStorage): number | null {
  return (
    sql
      .exec<{
        at: number | null;
      }>("SELECT MIN(next_attempt_at) AS at FROM discord_posts WHERE status = 'pending'")
      .one().at ?? null
  );
}

/**
 * Takes the next due post and counts the attempt. Call inside a transaction. The post is leased, so
 * nobody else sends it meanwhile; `recordOutcome` sets its real next state.
 */
export function claimNextPost(sql: SqlStorage, now: number): ClaimedPost | null {
  const row = sql
    .exec<{ id: number; channel_id: string; content: string; attempts: number }>(
      `SELECT id, channel_id, content, attempts FROM discord_posts
       WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY next_attempt_at, id LIMIT 1`,
      now,
    )
    .toArray()[0];
  if (row === undefined) return null;
  sql.exec(
    'UPDATE discord_posts SET attempts = attempts + 1, next_attempt_at = ? WHERE id = ?',
    now + CLAIM_LEASE_MS,
    row.id,
  );
  return {
    id: row.id,
    channelId: row.channel_id,
    content: row.content,
    attempts: row.attempts + 1,
  };
}

/**
 * Stores what happened to a claimed post. Returns the failure kind to log (null when sent). A retry
 * waits Discord's own `afterMs` or the backoff for the attempt number, and becomes `failed` once
 * `MAX_POST_ATTEMPTS` attempts have been made.
 */
export function recordOutcome(
  sql: SqlStorage,
  post: ClaimedPost,
  outcome: SendOutcome,
  now: number,
): PostFailureKind | null {
  if (outcome.kind === 'sent') {
    sql.exec("UPDATE discord_posts SET status = 'sent' WHERE id = ?", post.id);
    return null;
  }
  if (outcome.kind === 'failed' || post.attempts >= MAX_POST_ATTEMPTS) {
    sql.exec("UPDATE discord_posts SET status = 'failed' WHERE id = ?", post.id);
    return outcome.error;
  }
  const wait =
    outcome.afterMs ??
    POST_BACKOFF_MS[post.attempts - 1] ??
    POST_BACKOFF_MS[POST_BACKOFF_MS.length - 1] ??
    0;
  sql.exec('UPDATE discord_posts SET next_attempt_at = ? WHERE id = ?', now + wait, post.id);
  return outcome.error;
}
