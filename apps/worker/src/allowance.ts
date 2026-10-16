/**
 * The daily Bait allowance: `dailyAllowance()` Bait once per player per game day (the 13:37
 * guild-local reset), granted on the player's first authenticated request of that day. Missed days
 * are never paid later. Everything here is synchronous so the grant is one transaction.
 *
 * Idempotency: the Bait ledger credit is keyed `allowance:<game day>` (unique per user), and the
 * `daily_allowance` row and the analytics event are written only when that credit applied. Retries
 * and parallel requests therefore never pay twice. The `daily_allowance` row also remembers whether
 * the player has been told (`announced`), so the client shows the allowance exactly once.
 */
import { RULES, dailyAllowance } from '@creatures/game';
import type { Analytics } from './analytics';
import { credit, type LedgerStorage } from './ledger';
import { gameDay, gameDayEnd, zonedTimeToEpoch } from './time';

/** The ledger source of the allowance (the leet credits use 'leet'). */
export const ALLOWANCE_SOURCE = 'allowance';
/** Bound on the in-memory "already covered today" marks (one per player who was active). */
const COVERED_MAX = 512;

/** The ledger idempotency key of one player's allowance on one game day. */
export function allowanceKey(day: string): string {
  return `${ALLOWANCE_SOURCE}:${day}`;
}

export interface AllowanceNotice {
  /** The game day the allowance is for. */
  day: string;
  amount: number;
}

export class DailyAllowance {
  /**
   * Players whose allowance for the current game day is known to be paid: the span of that game
   * day, so the common request skips the database and the timezone maths altogether.
   */
  private readonly covered = new Map<string, { start: number; end: number }>();

  constructor(
    private readonly storage: LedgerStorage,
    private readonly analytics: Analytics,
    private readonly now: () => number,
    private readonly timezone: () => string,
  ) {}

  /**
   * Pays the player's allowance for the game day of `now` if it has not been paid. Returns true when
   * this call paid it. Never throws into the request: a failure is logged and the request goes on.
   */
  grant(userId: string): boolean {
    const now = this.now();
    const span = this.covered.get(userId);
    if (span !== undefined && now >= span.start && now < span.end) return false;
    try {
      const tz = this.timezone();
      const day = gameDay(now, tz, RULES.daily.reset);
      const amount = dailyAllowance();
      const paid = this.storage.transactionSync(() => {
        const result = credit(
          this.storage,
          {
            userId,
            currency: 'bait',
            amount,
            source: ALLOWANCE_SOURCE,
            idempotencyKey: allowanceKey(day),
            meta: { day },
          },
          now,
        );
        if (!result.applied) return false;
        this.storage.sql.exec(
          `INSERT OR IGNORE INTO daily_allowance (user_id, day, amount, granted_at, announced)
           VALUES (?, ?, ?, ?, 0)`,
          userId,
          day,
          amount,
          now,
        );
        // Only the player's recent days are kept; the ledger is the permanent record.
        this.storage.sql.exec(
          'DELETE FROM daily_allowance WHERE user_id = ? AND day < ?',
          userId,
          day,
        );
        this.analytics.record({ kind: 'daily_allowance', amount }, userId);
        return true;
      });
      if (this.covered.size >= COVERED_MAX) this.covered.clear();
      this.covered.set(userId, {
        start: zonedTimeToEpoch(day, RULES.daily.reset.hour, RULES.daily.reset.minute, tz),
        end: gameDayEnd(day, tz, RULES.daily.reset),
      });
      return paid;
    } catch (err) {
      console.error('daily allowance failed', err instanceof Error ? err.name : 'unknown');
      return false;
    }
  }

  /**
   * The allowance the player has not been told about yet, marked as told in the same step (so it is
   * returned once). Null when there is nothing new.
   */
  takeNotice(userId: string): AllowanceNotice | null {
    return this.storage.transactionSync(() => {
      const row = this.storage.sql
        .exec<{ day: string; amount: number }>(
          `SELECT day, amount FROM daily_allowance
           WHERE user_id = ? AND announced = 0 ORDER BY day DESC LIMIT 1`,
          userId,
        )
        .toArray()[0];
      if (row === undefined) return null;
      this.storage.sql.exec('UPDATE daily_allowance SET announced = 1 WHERE user_id = ?', userId);
      return { day: row.day, amount: row.amount };
    });
  }
}
