/**
 * The Valley Games of a guild (docs/design/valley-games.md): a daily show of four events, one creature
 * per event. Server-authoritative: the client sends entries and purchases only; the lineup, the lock
 * (auto-entry, snapshots, the live seed, the engine), the awards and the post are the server's.
 *
 * Schedule (guild time, `games-calendar.ts`): entries for show day D are open from D-1's show to D's
 * lock (the daily reset); the lock resolves D's events; the show plays at D's `show_at`; the awards are
 * paid at its end. `runDue` runs whatever is due (late steps run late) and is idempotent: the lock checks
 * `locked_at`, the award `awarded_at`. `nextEventAt` gives the alarm its candidates.
 */
import { gamesEventDef, RULES } from '@creatures/game';
import { awardDay } from './games-award';
import { gamesLockAt, lockedDayAt } from './games-calendar';
import { ensureLineup, lockDay, type GamesDeps } from './games-lock';
import { gamesPostKey } from './games-posts';
import type { BuyBody, EntryBody } from './games-schemas';
import { buyOffer, stallView } from './games-stall';
import { addEntry, joinPlayer, readDay, setAuto, unawardedDays } from './games-store';
import {
  creatureGamesView,
  gamesView,
  nextDay,
  nextView,
  teamSizeOf,
  youView,
  type GamesView,
} from './games-view';
import { GameError, atomically, type Outcome } from './outcome';
import { nextOccurrence } from './time';

export type { GamesDeps } from './games-lock';

export class Games {
  constructor(private readonly deps: GamesDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** `GET /api/games`. */
  view(userId: string): GamesView {
    return this.deps.storage.transactionSync(() => gamesView(this.deps, userId));
  }

  /** `PUT /api/games/entry`: the caller's creatures in one event of the next show day. */
  setEntry(userId: string, body: EntryBody): Outcome<{ next: GamesView['next'] }> {
    return atomically(this.deps.storage, () => {
      const sql = this.sql;
      const now = this.deps.now();
      const tz = this.deps.timezone();
      const day = nextDay(sql, now, tz);
      const row = ensureLineup(this.deps, day);
      if (body.day !== day || row.lockedAt !== null || now >= gamesLockAt(day, tz)) {
        throw new GameError(409, 'entries_closed');
      }
      if (!row.lineup.includes(body.eventId)) throw new GameError(409, 'not_in_lineup');
      const def = gamesEventDef(body.eventId);
      if (def === undefined) throw new GameError(409, 'not_in_lineup');
      const ids = body.creatureIds;
      if (ids.length > teamSizeOf(def) || new Set(ids).size !== ids.length) {
        throw new GameError(400, 'invalid_team');
      }
      for (const id of ids) {
        const owned = sql
          .exec('SELECT 1 FROM creatures WHERE id = ? AND user_id = ?', id, userId)
          .toArray();
        if (owned.length === 0) throw new GameError(404, 'creature_not_found');
        const elsewhere = sql
          .exec(
            'SELECT 1 FROM games_entries WHERE day = ? AND creature_id = ? AND event_id <> ?',
            day,
            id,
            body.eventId,
          )
          .toArray();
        if (elsewhere.length > 0) throw new GameError(409, 'already_entered');
      }
      sql.exec(
        'DELETE FROM games_entries WHERE day = ? AND user_id = ? AND event_id = ?',
        day,
        userId,
        body.eventId,
      );
      ids.forEach((creatureId, slot) => {
        addEntry(sql, { day, userId, eventId: body.eventId, slot, creatureId }, false, now);
      });
      if (ids.length > 0) joinPlayer(sql, userId, now);
      this.deps.analytics?.record(
        { kind: 'games_entry', event: body.eventId, creatures: ids.length },
        userId,
      );
      return { next: nextView(this.deps, userId) };
    });
  }

  /** `PUT /api/games/auto`: turns auto-entry on or off (and joins the player). */
  setAuto(userId: string, on: boolean): { auto: boolean; joined: true } {
    this.deps.storage.transactionSync(() => {
      setAuto(this.sql, userId, on, this.deps.now());
    });
    return { auto: on, joined: true };
  }

  /** `POST /api/games/stall/buy`. */
  buy(userId: string, body: BuyBody) {
    return atomically(this.deps.storage, () => {
      const purchase = buyOffer(this.deps, userId, body.offerId, body.idempotencyKey);
      return {
        purchase,
        you: youView(this.sql, userId),
        stall: stallView(this.sql, userId, this.deps.now(), this.deps.timezone()),
      };
    });
  }

  /** `GET /api/games/creature/:id`: the caller's creature's medals and records, or null. */
  creature(userId: string, creatureId: string) {
    return creatureGamesView(this.sql, userId, creatureId);
  }

  // --- The schedule ---

  /**
   * Runs what is due at `now`: the lock of the current show day (once its reset has passed; late is
   * fine), then the awards of every show that has ended. Each step is its own transaction and runs once.
   */
  runDue(): void {
    const now = this.deps.now();
    const tz = this.deps.timezone();
    const day = lockedDayAt(now, tz);
    const row = readDay(this.sql, day);
    // A day locks only when somebody had joined before its lock (an entry joins, so a day nobody
    // entered or was auto-entered in has no show).
    const lockAt = gamesLockAt(day, tz);
    const due = (row === null || row.lockedAt === null) && this.joinedBefore(lockAt);
    if (due && now >= lockAt) lockDay(this.deps, day);
    for (const r of unawardedDays(this.sql)) {
      if (r.endsAt !== null && r.endsAt <= now) awardDay(this.deps, r.day);
    }
  }

  /**
   * The next time `runDue` has something to do: the end of a show not awarded yet, and the next lock
   * (once anybody has joined). Possibly in the past (a step that keeps failing): the caller retries later.
   */
  nextEventAt(): number | null {
    const candidates: number[] = [];
    for (const r of unawardedDays(this.sql)) if (r.endsAt !== null) candidates.push(r.endsAt);
    if (this.anyoneJoined()) {
      const { hour, minute } = RULES.games.lockAt;
      candidates.push(nextOccurrence(this.deps.now(), hour, minute, this.deps.timezone()));
    }
    return candidates.length === 0 ? null : Math.min(...candidates);
  }

  private joinedBefore(at: number): boolean {
    return (
      this.sql.exec('SELECT 1 FROM games_players WHERE joined_at < ? LIMIT 1', at).toArray()
        .length > 0
    );
  }

  private anyoneJoined(): boolean {
    return this.sql.exec('SELECT 1 FROM games_players LIMIT 1').toArray().length > 0;
  }

  // --- Dev tools (staging only; see dev-tools-games.ts) ---

  /**
   * Locks the next show day now and starts its show in `showInMs` (a day already locked but not shown
   * yet just has its show moved). The next day's schedule is untouched: the day after has its own lock.
   */
  runNow(showInMs: number): { day: string; showAt: number; endsAt: number } {
    return this.deps.storage.transactionSync(() => {
      const now = this.deps.now();
      const day = nextDay(this.sql, now, this.deps.timezone());
      const showAt = now + showInMs;
      const row = ensureLineup(this.deps, day);
      if (row.lockedAt === null) {
        lockDay(this.deps, day, showAt);
      } else {
        const length = (row.endsAt ?? 0) - (row.showAt ?? 0);
        this.sql.exec(
          'UPDATE games_days SET show_at = ?, ends_at = ? WHERE day = ?',
          showAt,
          showAt + length,
          day,
        );
      }
      const after = readDay(this.sql, day);
      return { day, showAt, endsAt: after?.endsAt ?? showAt };
    });
  }

  /**
   * Forgets the latest locked day (its show, results, placings, the entries auto-entry made and its
   * post) so it can be played again. Medals, experience and records it paid stay. Null: nothing locked.
   * A day whose lock time has passed locks again at the next catch-up (its show 15 s later); a day the
   * dev tools played early is open for entries again.
   */
  resetLatest(): { day: string | null } {
    return this.deps.storage.transactionSync(() => {
      const day = this.sql
        .exec<{ day: string | null }>(
          'SELECT MAX(day) AS day FROM games_days WHERE locked_at IS NOT NULL',
        )
        .one().day;
      if (day === null) return { day: null };
      for (const table of ['games_days', 'games_results', 'games_placings'] as const) {
        this.sql.exec(`DELETE FROM ${table} WHERE day = ?`, day);
      }
      this.sql.exec('DELETE FROM games_entries WHERE day = ? AND auto = 1', day);
      this.sql.exec('DELETE FROM discord_posts WHERE key = ?', gamesPostKey(day));
      return { day };
    });
  }
}
