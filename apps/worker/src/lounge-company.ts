/**
 * Lounging with company (`docs/design/living-room.md`, "Lounging with company"): a player's lounger
 * earns a little experience while the player is in the Activity together with another player who has a
 * lounging creature. Alone it earns nothing.
 *
 * Who is here comes from Discord: the lounge check (`guild-core.ts`, about once a minute while anyone
 * plays) asks Discord for each tracked Activity instance's participants with the bot token, never from
 * anything a client says. Discord keeps a player listed while their tab is hidden or their phone sleeps,
 * until they leave the Activity, so a hiccup costs nothing and everyone in the room keeps earning. When
 * Discord cannot be asked, the last list it gave stands.
 *
 * At each check, players who were in company at the previous check and still are earn the time between
 * the two (at most `LOUNGE_MAX_GAP_MS`, so a stalled alarm never pays a long gap, and never time from
 * before the game day's start). The time collects in memory and is paid (a few rows written) when it
 * reaches `LOUNGE_FLUSH_MS` (one XP: each XP is paid as it is earned), when the player leaves company, at
 * the game day's turn, and at the start of the player's own request (`flush`, so a swap pays the old
 * lounger first and the state they read is fresh). A restart of the object (a deploy, an eviction) loses at
 * most that unpaid part, under 2 minutes a player. A Rested lounger collects nothing, so it writes nothing.
 * Each creature gets at most the daily cap a game day (then it is Rested: the time passes unpaid until
 * another creature takes its place); a player has no cap of their own.
 *
 * Synchronous; one transaction per payment.
 */
import { RULES, isRested, loungeExperience } from '@creatures/game';
import type { Analytics } from './analytics';
import { awardExperience } from './creature-exp';
import type { LedgerStorage } from './ledger';
import { gameDay, zonedTimeToEpoch } from './time';

/** The most time one check pays (it is about a minute apart): a stalled alarm never pays a long gap. */
export const LOUNGE_MAX_GAP_MS = 3 * 60_000;
/**
 * Unpaid company time is paid once it reaches this: one XP, so a restart of the object (every deploy does
 * one) loses at most one XP's worth a player. Was 10 minutes until 2026-10-20 (players lost XP at deploys).
 * Writes stay bounded by the daily cap: at most `dailyCap` payments a creature a day.
 */
export const LOUNGE_FLUSH_MS: number = RULES.experience.lounge.msPerXp;

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

/** One Activity instance as the lounge check saw it: its participants and when Discord last said so. */
export interface SeenInstance {
  users: readonly string[];
  checkedAt: number;
}

export interface LoungeCompanyDeps {
  storage: LedgerStorage;
  analytics: Analytics | undefined;
  timezone: () => string;
  /** The game clock minus real time (the dev clock's shift; 0 in production). Checks keep real time. */
  gameOffset?: () => number;
  /** The player's lounger (re-picked when gone or busy), or null when every creature is busy. */
  loungerOf: (userId: string) => string | null;
}

interface Pending {
  /** The game day the time belongs to. */
  day: string;
  ms: number;
}

/**
 * The players in company: in an instance with at least one other player who has a lounger (one without a
 * starter, or with every creature busy, keeps nobody company and earns nothing).
 */
function companyOf(
  instances: readonly SeenInstance[],
  loungerOf: (userId: string) => string | null,
): Set<string> {
  const company = new Set<string>();
  for (const instance of instances) {
    const players = [...new Set(instance.users)].filter((u) => loungerOf(u) !== null);
    if (players.length >= 2) for (const u of players) company.add(u);
  }
  return company;
}

export class LoungeCompany {
  /** When the previous check ran (real time); after an eviction, the instances' own check times. */
  private lastCheckAt: number | null = null;
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly deps: LoungeCompanyDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** The current game day (on the game clock) and its start in real time. */
  private today(now: number): { day: string; start: number } {
    const offset = this.deps.gameOffset?.() ?? 0;
    const game = loungeDay(now + offset, this.deps.timezone());
    return { day: game.day, start: game.start - offset };
  }

  /**
   * A lounge check ran at `now` (real time): `before` is what the instances held before Discord was asked,
   * `after` what they hold now. Credits the time since the previous check to everyone in company at both,
   * and pays whoever reached `LOUNGE_FLUSH_MS` or left company. Never throws.
   */
  observe(before: readonly SeenInstance[], after: readonly SeenInstance[], now: number): void {
    try {
      const loungers = new Map<string, string | null>();
      const loungerOf = (userId: string): string | null => {
        if (!loungers.has(userId)) loungers.set(userId, this.deps.loungerOf(userId));
        return loungers.get(userId) ?? null;
      };
      const today = this.today(now);
      const was = companyOf(before, loungerOf);
      const is = companyOf(after, loungerOf);
      const previous = this.lastCheckAt ?? Math.max(0, ...before.map((i) => i.checkedAt));
      this.lastCheckAt = now;
      const ms = Math.max(0, now - Math.max(previous, now - LOUNGE_MAX_GAP_MS, today.start));
      if (ms > 0) {
        for (const userId of is) {
          if (was.has(userId) && !this.restedToday(userId, today.day, loungerOf)) {
            this.add(userId, ms, today.day, now);
          }
        }
      }
      for (const [userId, entry] of [...this.pending]) {
        if (entry.ms >= LOUNGE_FLUSH_MS || !is.has(userId) || entry.day !== today.day) {
          this.pay(userId, entry, now);
        }
      }
    } catch (err) {
      console.error('lounge company failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /** Pays what the player has collected (they are making a request). Never throws. */
  flush(userId: string, now: number): void {
    const entry = this.pending.get(userId);
    if (entry === undefined) return;
    try {
      this.pay(userId, entry, now);
    } catch (err) {
      console.error('lounge company failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /** The player's lounger has had all of `day`'s lounging XP (or there is none): nothing to collect. */
  private restedToday(
    userId: string,
    day: string,
    loungerOf: (userId: string) => string | null,
  ): boolean {
    const lounger = loungerOf(userId);
    if (lounger === null) return true;
    return isRested(loungePaidToday(this.sql, userId, day).get(lounger) ?? 0);
  }

  /** Collects `ms` for the player on `day`; time of an earlier day is paid to that day first. */
  private add(userId: string, ms: number, day: string, now: number): void {
    const entry = this.pending.get(userId);
    if (entry !== undefined && entry.day !== day) this.pay(userId, entry, now);
    const current = this.pending.get(userId);
    this.pending.set(userId, { day, ms: (current?.ms ?? 0) + ms });
  }

  /** Pays the collected time to the player's lounger now, on the time's own game day, and forgets it. */
  private pay(userId: string, entry: Pending, now: number): void {
    this.pending.delete(userId);
    const lounger = this.deps.loungerOf(userId);
    const row = this.sql
      .exec<{ carry_ms: number }>('SELECT carry_ms FROM lounge_company WHERE user_id = ?', userId)
      .toArray()[0];
    const paid =
      lounger === null ? 0 : (loungePaidToday(this.sql, userId, entry.day).get(lounger) ?? 0);
    // With every creature busy the time passes unpaid; a Rested lounger takes nothing more that day.
    const gain =
      lounger === null || isRested(paid)
        ? null
        : loungeExperience({ paid, carryMs: row?.carry_ms ?? 0 }, entry.ms);
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
        entry.day,
        gain.tally.paid,
      );
      awardExperience(this.sql, this.deps.analytics, userId, lounger, gain.xp, 'lounge', false);
    });
  }
}
