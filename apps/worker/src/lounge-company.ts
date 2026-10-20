/**
 * Lounging with company (`docs/design/living-room.md`, "Lounging with company"): a player's lounger
 * earns a little experience for the time the player has the room open while another player who has a
 * lounging creature has it open too. Alone it earns nothing.
 *
 * Who is here comes from the lounge's live sockets (`lounge-live.ts`), whose owner is proven by a
 * one-time ticket from an authenticated request, never from anything a client says. The time is paid
 * lazily, without timers: when someone joins or leaves (`settleAll`, the socket's own events) and when a
 * player who has a socket makes a request (`settle`, so a change of lounger pays the old one first).
 * Each player's row remembers up to when they were paid, so no stretch is paid twice (and a swap never
 * pays the new lounger for time the old one sat). Time before the current game day's start is never paid.
 * Each creature gets at most the daily cap a game day (then it is Rested: the time passes unpaid until
 * another creature takes its place); a player has no cap of their own.
 *
 * Synchronous; one transaction per paid player.
 */
import { RULES, companyMs, isRested, loungeExperience, type Span } from '@creatures/game';
import type { Analytics } from './analytics';
import { awardExperience } from './creature-exp';
import type { LedgerStorage } from './ledger';
import type { Presence } from './lounge-live';
import { gameDay, zonedTimeToEpoch } from './time';

export function loungeCompanyMigration(sql: SqlStorage): void {
  // Per player: company time up to `credited_until` is paid; `carry_ms` is time short of one more XP.
  sql.exec(`CREATE TABLE IF NOT EXISTS lounge_company (
    user_id TEXT PRIMARY KEY,
    carry_ms INTEGER NOT NULL,
    credited_until INTEGER NOT NULL
  )`);
  // Per creature: what lounging paid it on game day `day` (a row of an older day means 0 today).
  sql.exec(`CREATE TABLE IF NOT EXISTS lounge_rest (
    creature_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    paid INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX IF NOT EXISTS lounge_rest_user ON lounge_rest (user_id, day)');
}

/** The current game day of `now` in `tz`, and when it started. */
export function loungeDay(now: number, tz: string): { day: string; start: number } {
  const { reset } = RULES.daily;
  const day = gameDay(now, tz, reset);
  return { day, start: zonedTimeToEpoch(day, reset.hour, reset.minute, tz) };
}

/** What lounging paid each of the player's creatures on game day `day` (creatures with nothing are left out). */
export function loungePaidToday(sql: SqlStorage, userId: string, day: string): Map<string, number> {
  const rows = sql
    .exec<{ creature_id: string; paid: number }>(
      'SELECT creature_id, paid FROM lounge_rest WHERE user_id = ? AND day = ?',
      userId,
      day,
    )
    .toArray();
  return new Map(rows.map((r) => [r.creature_id, r.paid]));
}

export interface LoungeCompanyDeps {
  storage: LedgerStorage;
  analytics: Analytics | undefined;
  timezone: () => string;
  /** The game clock minus real time (the dev clock's shift; 0 in production). Spans are real time. */
  gameOffset?: () => number;
  /** The player's lounger (re-picked when gone or busy), or null when every creature is busy. */
  loungerOf: (userId: string) => string | null;
}

export class LoungeCompany {
  constructor(private readonly deps: LoungeCompanyDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** Pays everyone who has a socket open (someone is joining or leaving). `now` is real time. Never throws. */
  settleAll(presence: Presence, now: number): void {
    this.run(presence, now, [...presence.keys()]);
  }

  /** Pays one player, if they have a socket open (they are making a request). Never throws. */
  settle(presence: Presence, now: number, userId: string): void {
    if (presence.has(userId)) this.run(presence, now, [userId]);
  }

  private run(presence: Presence, now: number, userIds: readonly string[]): void {
    // Company needs two players.
    if (presence.size < 2 || userIds.length === 0) return;
    try {
      const offset = this.deps.gameOffset?.() ?? 0;
      const game = loungeDay(now + offset, this.deps.timezone());
      const today = { day: game.day, start: game.start - offset };
      const loungers = new Map<string, string | null>();
      const loungerOf = (userId: string): string | null => {
        if (!loungers.has(userId)) loungers.set(userId, this.deps.loungerOf(userId));
        return loungers.get(userId) ?? null;
      };
      for (const userId of userIds) this.pay(userId, presence, now, today, loungerOf);
    } catch (err) {
      console.error('lounge company failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  private pay(
    userId: string,
    presence: Presence,
    now: number,
    today: { day: string; start: number },
    loungerOf: (userId: string) => string | null,
  ): void {
    const own = presence.get(userId);
    if (own === undefined) return;
    // Company: other players with a creature in the room (one without a starter or with every creature
    // busy has none to keep anyone company).
    const others: Span[] = [];
    for (const [otherId, spans] of presence) {
      if (otherId !== userId && loungerOf(otherId) !== null) others.push(...spans);
    }
    if (others.length === 0) return;
    const row = this.sql
      .exec<{ carry_ms: number; credited_until: number }>(
        'SELECT carry_ms, credited_until FROM lounge_company WHERE user_id = ?',
        userId,
      )
      .toArray()[0];
    const since = Math.max(row?.credited_until ?? 0, today.start);
    const ms = companyMs(own, others, since, now);
    if (ms <= 0) return;

    const lounger = loungerOf(userId);
    const paid =
      lounger === null ? 0 : (loungePaidToday(this.sql, userId, today.day).get(lounger) ?? 0);
    // With every creature busy the time passes unpaid; a Rested lounger takes nothing more today.
    const gain =
      lounger === null || isRested(paid)
        ? null
        : loungeExperience({ paid, carryMs: row?.carry_ms ?? 0 }, ms);
    this.deps.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO lounge_company (user_id, carry_ms, credited_until) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET carry_ms = excluded.carry_ms,
           credited_until = excluded.credited_until`,
        userId,
        gain?.tally.carryMs ?? 0,
        now,
      );
      if (lounger === null || gain === null || gain.xp === 0) return;
      this.sql.exec(
        `INSERT INTO lounge_rest (creature_id, user_id, day, paid) VALUES (?, ?, ?, ?)
         ON CONFLICT(creature_id) DO UPDATE SET user_id = excluded.user_id, day = excluded.day,
           paid = excluded.paid`,
        lounger,
        userId,
        today.day,
        gain.tally.paid,
      );
      awardExperience(this.sql, this.deps.analytics, userId, lounger, gain.xp, 'lounge', false);
    });
  }
}
