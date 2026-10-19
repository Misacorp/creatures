/**
 * The analytics event log of a guild (table `analytics_events`, migration 16; plan in
 * `docs/design/analytics.md`). Append-only and private by construction:
 *
 * - An event has a kind and typed props. Props hold only ids from content (species, boss, ability),
 *   enums, integers and booleans. There is no free-text field, and every value is checked again when
 *   the event is written, so an unknown id becomes `"unknown"` instead of whatever a caller passed.
 *   Never put a user id, nickname, guild name or other player-typed text in an event.
 * - `actor_hash` is the first 128 bits (32 hex characters) of an HMAC-SHA256 of the Discord user id,
 *   with a key HKDF-derived from the Discord client secret (the same secret source as session
 *   tokens, a distinct `info` label). It is stable for one user and cannot be reversed from reports.
 *   Rotating the secret changes every hash (and invalidates every session): continuity across a
 *   rotation is not promised.
 * - Web Crypto is asynchronous but Durable Object transactions are synchronous, so the hash is
 *   computed once per request, before any transaction (`prepare`), and cached per user in memory;
 *   `record` only reads the cache. A user whose hash is not cached gets a NULL actor.
 * - Events are written inside the transaction where the action happens, as a single INSERT, so an
 *   event exists if and only if the action committed. Idempotent retries that replay a stored result
 *   write nothing.
 * - Times are UTC epoch milliseconds. Raw events are kept `RETENTION_MS` (90 days) and pruned from
 *   the guild alarm.
 */
import type { AnalyticsEvent } from './analytics-events';
import { serializeProps } from './analytics-props';
import { derivedHmacKey, hmacHex } from './keys';

export { GEAR_SOURCES } from './analytics-events';
export { MAX_PROPS_CHARS, capJson, propsOf, serializeProps } from './analytics-props';
export type {
  AnalyticsEvent,
  CampChoice,
  CatchProps,
  CatchResult,
  FestivalResult,
  GearSource,
  PhaseName,
  PushOnOutcome,
} from './analytics-events';

/** Raw events and the rows that support them are kept this long. */
export const RETENTION_MS = 90 * 86_400_000;
/** Silence longer than this makes the next authenticated request a new session. */
export const SESSION_GAP_MS = 30 * 60_000;
/** The "last seen" mark of a player is refreshed at most this often (a write per request is too much). */
const SEEN_REFRESH_MS = 60_000;
/** Most rows one prune batch deletes, and most batches one alarm runs. */
const PRUNE_BATCH = 500;
const PRUNE_MAX_BATCHES = 20;
/** Bound on the in-memory caches (one entry per player who was active). */
const CACHE_MAX = 512;

// --- The actor hash ---

const actorKey = derivedHmacKey({
  salt: 'leet-creatures/analytics',
  info: 'analytics-actor-v1',
  usages: ['sign'],
});

/** 32 lowercase hex characters (128 bits) of HMAC-SHA256(user id), keyed from `secret`. */
export async function actorHash(secret: string, userId: string): Promise<string> {
  return hmacHex(await actorKey(secret), userId, 16);
}

// --- The writer ---

interface AnalyticsStorage {
  sql: SqlStorage;
  transactionSync<T>(fn: () => T): T;
}

export interface AnalyticsOptions {
  storage: AnalyticsStorage;
  now: () => number;
  /**
   * The secret the actor key is derived from (the Discord client secret). Empty or absent: no actor
   * is ever identified, so events carry a NULL actor and sessions are not tracked.
   */
  secret?: string;
}

function remember<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (!map.has(key) && map.size >= CACHE_MAX) {
    const oldest = map.keys().next();
    if (oldest.done !== true) map.delete(oldest.value);
  }
  map.set(key, value);
}

export class Analytics {
  /** Actor hash per user id, filled by `prepare` before a request enters any transaction. */
  private readonly hashes = new Map<string, string>();
  /** When each actor's "last seen" mark was last written, to keep that write rare. */
  private readonly seenWritten = new Map<string, number>();
  /** Once-per-key marks already stored by this isolate (see `once`). */
  private readonly onceDone = new Set<string>();

  constructor(private readonly options: AnalyticsOptions) {}

  private get sql(): SqlStorage {
    return this.options.storage.sql;
  }

  /**
   * Computes and remembers the actor hash of a user. Call it once per request, before any
   * transaction that may log an event for the user. Never throws: without a hash, events simply
   * have no actor.
   */
  async prepare(userId: string): Promise<void> {
    const secret = this.options.secret ?? '';
    if (secret === '' || this.hashes.has(userId)) return;
    try {
      remember(this.hashes, userId, await actorHash(secret, userId));
    } catch (err) {
      console.error('analytics hash failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /** The user's cached actor hash, or null (no secret, or `prepare` was not called). */
  hashFor(userId: string): string | null {
    return this.hashes.get(userId) ?? null;
  }

  /**
   * Appends one event: a single INSERT. Call it inside the transaction of the action it describes.
   * `actorId` is the Discord user id of the player who acted (hashed here, never stored); omit it for
   * guild-level events. Never throws, so logging can never undo a game action.
   */
  record(event: AnalyticsEvent, actorId?: string): void {
    try {
      this.sql.exec(
        'INSERT INTO analytics_events (at, kind, actor_hash, props_json) VALUES (?, ?, ?, ?)',
        this.options.now(),
        event.kind,
        actorId === undefined ? null : this.hashFor(actorId),
        serializeProps(event),
      );
    } catch (err) {
      console.error('analytics write failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /**
   * Notes that the player made an authenticated request, and logs `session_start` when their last
   * activity is more than `SESSION_GAP_MS` ago. The mark is refreshed at most once a minute. Call it
   * after `prepare`, outside a transaction (it opens its own small one when it must write).
   */
  touch(userId: string): void {
    const hash = this.hashFor(userId);
    if (hash === null) return;
    const now = this.options.now();
    const written = this.seenWritten.get(hash);
    if (written !== undefined && now - written < SEEN_REFRESH_MS) return;
    try {
      this.options.storage.transactionSync(() => {
        const row = this.sql
          .exec<{ last_at: number }>(
            'SELECT last_at FROM analytics_seen WHERE actor_hash = ?',
            hash,
          )
          .toArray()[0];
        if (row === undefined || now - row.last_at > SESSION_GAP_MS) {
          this.record({ kind: 'session_start', returning: row !== undefined }, userId);
        }
        this.sql.exec(
          `INSERT INTO analytics_seen (actor_hash, last_at) VALUES (?, ?)
           ON CONFLICT(actor_hash) DO UPDATE SET last_at = excluded.last_at`,
          hash,
          now,
        );
      });
      remember(this.seenWritten, hash, now);
    } catch (err) {
      console.error('analytics touch failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /**
   * True the first time `label` is seen for this player (for example one join per player per
   * finale). Stored as a hashed key, so it survives restarts; the check is remembered in memory, so
   * a hot read path writes at most once per key. False without an actor hash.
   */
  once(userId: string, label: string): boolean {
    const hash = this.hashFor(userId);
    if (hash === null) return false;
    const key = `${label}:${hash}`;
    if (this.onceDone.has(key)) return false;
    if (this.onceDone.size >= CACHE_MAX) this.onceDone.clear();
    this.onceDone.add(key);
    try {
      return (
        this.sql
          .exec(
            'INSERT OR IGNORE INTO analytics_once (key, at) VALUES (?, ?) RETURNING key',
            key,
            this.options.now(),
          )
          .toArray().length > 0
      );
    } catch (err) {
      console.error('analytics once failed', err instanceof Error ? err.name : 'unknown');
      return false;
    }
  }

  /**
   * Deletes events and support rows older than `RETENTION_MS`, in batches so one run is bounded.
   * Returns true when old rows may remain (the next alarm continues). Never throws.
   */
  prune(): boolean {
    const cutoff = this.options.now() - RETENTION_MS;
    try {
      let more = false;
      for (let i = 0; i < PRUNE_MAX_BATCHES; i++) {
        const deleted = this.sql
          .exec(
            `DELETE FROM analytics_events WHERE id IN
               (SELECT id FROM analytics_events WHERE at < ? ORDER BY at LIMIT ?) RETURNING id`,
            cutoff,
            PRUNE_BATCH,
          )
          .toArray().length;
        more = deleted >= PRUNE_BATCH;
        if (!more) break;
      }
      this.sql.exec('DELETE FROM analytics_seen WHERE last_at < ?', cutoff);
      this.sql.exec('DELETE FROM analytics_once WHERE at < ?', cutoff);
      return more;
    } catch (err) {
      console.error('analytics prune failed', err instanceof Error ? err.name : 'unknown');
      return false;
    }
  }
}
