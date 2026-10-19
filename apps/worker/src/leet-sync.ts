/**
 * The daily leet sync of a guild: pulls finalised leet days from the source and credits Bait, keeping
 * its cursor and health in the one-row table `leet_sync`. `GuildCore` (`guild-core.ts`) keeps one-line
 * delegates and the schedule (the 13:40 alarm slot). The game only reads the leet source and keeps its
 * own ledger; credits are keyed by day id, so a repeat or a backfill never pays a day twice. The await
 * on the source happens between page transactions, never inside one.
 */
import { leetBonusForDay, leetPointsForDay } from '@creatures/game';
import {
  LEET_BACKFILL_DAYS,
  LeetSourceError,
  type LeetSource,
  type LeetSyncErrorKind,
} from './leet';
import { credit, type LedgerStorage } from './ledger';
import { addDays, zonedDate } from './time';

/** A sync triggered by /api/me only runs when the last one is older than this. */
const SYNC_STALE_MS = 15 * 60 * 1000;
/** After a failed sync, wait this long before /api/me triggers another attempt. */
const SYNC_RETRY_MS = 60 * 1000;
/**
 * How long /api/me waits for a sync before answering with stale data. Longer than the HTTP
 * source's 5000 ms timeout, so one slow upstream call (a cold start) can still finish in time.
 */
export const SYNC_BUDGET_MS = 6000;
const SYNC_MAX_PAGES = 20;
const SYNC_PAGE_LIMIT = 31;

export interface LeetSyncResult {
  daysProcessed: number;
  creditsApplied: number;
}

/** How healthy the leet sync is, as shown to players. Contains no messages, URLs or keys. */
export interface LeetSyncStatus {
  source: 'http' | 'mock' | 'disabled';
  lastAttemptAt: number | null;
  lastSyncedAt: number | null;
  lastError: LeetSyncErrorKind | null;
  lastDays: number | null;
}

export interface LeetSyncDeps {
  storage: LedgerStorage;
  /** The game clock. */
  now: () => number;
  /** The leet source. Null disables syncing (fail closed). */
  source: LeetSource | null;
  /** The guild's timezone (an IANA name), read when it is needed. */
  timezone: () => string;
  /** The Discord guild id the source is asked about, or undefined while it is not known. */
  guildId: () => string | undefined;
  /** How long `syncIfStale` waits for a sync before answering with stale data. */
  budgetMs: number;
}

export class LeetSync {
  private syncInFlight: Promise<LeetSyncResult> | null = null;
  private lastSyncAttemptAt: number | null = null;

  constructor(private readonly deps: LeetSyncDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** True when a source is configured (the alarm only schedules a sync then). */
  get enabled(): boolean {
    return this.deps.source !== null;
  }

  /** When the last attempt started (epoch ms), or null. The alarm uses it to tell whether a slot was tried. */
  lastAttemptAt(): number | null {
    return this.readSyncRow()?.last_attempt_at ?? null;
  }

  private getSyncState(timezone: string): {
    cursor: string | null;
    sinceDate: string;
    lastSyncedAt: number | null;
  } {
    const since = addDays(zonedDate(this.deps.now(), timezone), -LEET_BACKFILL_DAYS);
    this.sql.exec(
      'INSERT OR IGNORE INTO leet_sync (id, cursor, since_date) VALUES (1, NULL, ?)',
      since,
    );
    const row = this.sql
      .exec<{
        cursor: string | null;
        since_date: string;
        last_synced_at: number | null;
      }>('SELECT cursor, since_date, last_synced_at FROM leet_sync WHERE id = 1')
      .one();
    return { cursor: row.cursor, sinceDate: row.since_date, lastSyncedAt: row.last_synced_at };
  }

  /**
   * A cursor only means something to the source that issued it. When the configured source kind
   * changes (for example from the mock to the real leet bot), forget the cursor and backfill again
   * from the guild-local date `LEET_BACKFILL_DAYS` ago. Credits are keyed by day id, so days that
   * were already credited are not paid twice.
   */
  private resetSyncIfSourceChanged(kind: 'http' | 'mock', timezone: string): void {
    this.getSyncState(timezone);
    const row = this.sql
      .exec<{ source: string | null }>('SELECT source FROM leet_sync WHERE id = 1')
      .one();
    if (row.source === kind) return;
    const since = addDays(zonedDate(this.deps.now(), timezone), -LEET_BACKFILL_DAYS);
    this.sql.exec(
      'UPDATE leet_sync SET source = ?, cursor = NULL, since_date = ? WHERE id = 1',
      kind,
      since,
    );
  }

  /**
   * Pulls finalised leet days and credits Bait. Concurrent calls share one run. The await on the
   * source happens between page transactions, never inside one. Safe to repeat: credits are
   * keyed by day id.
   */
  sync(): Promise<LeetSyncResult> {
    if (this.syncInFlight !== null) return this.syncInFlight;
    const run = this.run().finally(() => {
      this.syncInFlight = null;
    });
    this.syncInFlight = run;
    return run;
  }

  private async run(): Promise<LeetSyncResult> {
    const source = this.deps.source;
    if (source === null) {
      this.recordSyncOutcome({ error: 'disabled' });
      return { daysProcessed: 0, creditsApplied: 0 };
    }
    const guildId = this.deps.guildId();
    if (guildId === undefined) {
      console.warn('leet sync skipped: guild id unknown');
      return { daysProcessed: 0, creditsApplied: 0 };
    }
    const timezone = this.deps.timezone();
    this.recordSyncAttempt(timezone);
    try {
      const result = await this.pull(source, guildId, timezone);
      this.recordSyncOutcome({ days: result.daysProcessed });
      return result;
    } catch (err) {
      this.recordSyncOutcome({ error: err instanceof LeetSourceError ? err.kind : 'internal' });
      throw err;
    }
  }

  private async pull(
    source: LeetSource,
    guildId: string,
    timezone: string,
  ): Promise<LeetSyncResult> {
    const result: LeetSyncResult = { daysProcessed: 0, creditsApplied: 0 };
    this.resetSyncIfSourceChanged(source.kind ?? 'mock', timezone);
    const state = this.getSyncState(timezone);
    let cursor = state.cursor;

    for (let page = 0; page < SYNC_MAX_PAGES; page++) {
      const data = await source.getDays(
        guildId,
        cursor === null
          ? { timezone, since: state.sinceDate, limit: SYNC_PAGE_LIMIT }
          : { timezone, after: cursor, limit: SYNC_PAGE_LIMIT },
      );
      const nextCursor = data.nextCursor ?? cursor;
      const applied = this.deps.storage.transactionSync(() => {
        let count = 0;
        for (const day of data.days) {
          const n = day.participants.length;
          const points = leetPointsForDay(n);
          // The leet bonus replaces the old points-based Bait (the allowance is paid separately).
          // `n` is the day's final count: the sync only sees finalised days, so nobody is topped up.
          const bait = leetBonusForDay(n);
          if (bait === 0) continue;
          for (const participant of day.participants) {
            const credited = credit(
              this.deps.storage,
              {
                userId: participant.userId,
                currency: 'bait',
                amount: bait,
                source: 'leet',
                idempotencyKey: `leet:${day.id}`,
                meta: { date: day.date, participants: n, points, bonus: bait },
              },
              this.deps.now(),
            );
            if (credited.applied) count++;
          }
        }
        this.sql.exec(
          'UPDATE leet_sync SET cursor = ?, last_synced_at = ? WHERE id = 1',
          nextCursor,
          this.deps.now(),
        );
        return count;
      });
      result.daysProcessed += data.days.length;
      result.creditsApplied += applied;
      const progressed = nextCursor !== cursor;
      cursor = nextCursor;
      if (!data.hasMore || !progressed) break;
    }
    return result;
  }

  /** Notes that a sync attempt started. Its own small transaction, apart from the credits. */
  private recordSyncAttempt(timezone: string): void {
    this.getSyncState(timezone);
    this.deps.storage.transactionSync(() => {
      this.sql.exec('UPDATE leet_sync SET last_attempt_at = ? WHERE id = 1', this.deps.now());
    });
  }

  /**
   * Stores how a sync attempt ended: an error kind (never a message), or success with the number of
   * days processed. Its own small transaction, apart from the credits.
   */
  private recordSyncOutcome(outcome: { days: number } | { error: LeetSyncErrorKind }): void {
    this.getSyncState(this.deps.timezone());
    const t = this.deps.now();
    this.deps.storage.transactionSync(() => {
      if ('error' in outcome) {
        this.sql.exec(
          'UPDATE leet_sync SET last_attempt_at = ?, last_error = ? WHERE id = 1',
          t,
          outcome.error,
        );
      } else {
        this.sql.exec(
          'UPDATE leet_sync SET last_error = NULL, last_days = ?, last_synced_at = ? WHERE id = 1',
          outcome.days,
          t,
        );
      }
    });
  }

  /** The sync's health for the API. Read-only; the source kind comes from the configured source. */
  private readSyncRow():
    | {
        last_attempt_at: number | null;
        last_synced_at: number | null;
        last_error: string | null;
        last_days: number | null;
      }
    | undefined {
    return this.sql
      .exec<{
        last_attempt_at: number | null;
        last_synced_at: number | null;
        last_error: string | null;
        last_days: number | null;
      }>(
        'SELECT last_attempt_at, last_synced_at, last_error, last_days FROM leet_sync WHERE id = 1',
      )
      .toArray()[0];
  }

  status(): LeetSyncStatus {
    const row = this.readSyncRow();
    const source = this.deps.source === null ? 'disabled' : (this.deps.source.kind ?? 'mock');
    return {
      source,
      lastAttemptAt: row?.last_attempt_at ?? null,
      lastSyncedAt: row?.last_synced_at ?? null,
      lastError: source === 'disabled' ? 'disabled' : toErrorKind(row?.last_error ?? null),
      lastDays: row?.last_days ?? null,
    };
  }

  /**
   * Runs a sync from /api/me when the last one is stale, waiting at most the budget. On timeout or
   * error it returns anyway: stale data is fine. The sync keeps going in the background.
   */
  async syncIfStale(): Promise<void> {
    if (this.deps.source === null) {
      // Nothing to sync: make the reason visible, writing only when it is not stored yet.
      if (this.readSyncRow()?.last_error !== 'disabled') {
        this.recordSyncOutcome({ error: 'disabled' });
      }
      return;
    }
    const t = this.deps.now();
    const last = this.getSyncState(this.deps.timezone()).lastSyncedAt;
    if (last !== null && t - last < SYNC_STALE_MS) return;
    if (
      this.syncInFlight === null &&
      this.lastSyncAttemptAt !== null &&
      t - this.lastSyncAttemptAt < SYNC_RETRY_MS
    ) {
      return;
    }
    this.lastSyncAttemptAt = t;
    const run = this.sync().then(
      () => undefined,
      (err: unknown) => {
        logSyncError(err);
      },
    );
    let timer: number | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.deps.budgetMs);
    });
    try {
      await Promise.race([run, timeout]);
    } finally {
      clearTimeout(timer ?? null);
    }
  }
}

const ERROR_KINDS: ReadonlySet<string> = new Set<LeetSyncErrorKind>([
  'unauthorized',
  'not_found',
  'rate_limited',
  'upstream',
  'timeout',
  'network',
  'invalid_response',
  'invalid_request',
  'disabled',
  'internal',
]);

/** Only known kinds leave the object, so a stored value can never leak anything else. */
function toErrorKind(stored: string | null): LeetSyncErrorKind | null {
  if (stored === null) return null;
  return ERROR_KINDS.has(stored) ? (stored as LeetSyncErrorKind) : 'internal';
}

/** Logs only the error kind or type: messages could carry upstream data. */
export function logSyncError(err: unknown): void {
  const kind =
    err instanceof LeetSourceError ? err.kind : err instanceof Error ? err.name : 'unknown';
  console.error('leet sync failed', kind);
}
