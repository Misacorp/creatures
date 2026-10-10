/**
 * The weekly raid: week lifecycle, scheduled events and player actions (team, placement, opt-out).
 * Phases are resolved by `raid-resolve.ts`; read models are in `raid-view.ts`.
 *
 * Everything is synchronous and runs inside `transactionSync`, so a check and the writes that
 * depend on it can never be interleaved with another request. The user is always an argument from
 * the verified session. The guild's timezone is always passed in, never defaulted.
 */
import { content, type Rng } from '@creatures/game';
import type { Outcome } from './collection';
import type { LedgerStorage } from './ledger';
import { queueBossReveal } from './raid-posts';
import { resolveParty } from './raid-resolve';
import { buildRaidView, buildReplayView, type RaidView, type ReplayView } from './raid-view';
import {
  eligiblePlayerIds,
  createParties,
  joinSmallestParty,
  leaveParty,
  partyMembers,
  partyOf,
} from './raid-roster';
import {
  RAID_PHASES,
  doneKey,
  eventTimes,
  nextDueEvent,
  weekIdFor,
  weekIndex,
  type RaidEvent,
  type RaidPhase,
  type ScheduledEvent,
} from './raid-schedule';
import {
  RaidError,
  chosenTeamIds,
  effectiveTeam,
  loadCreatures,
  rowLength,
  type RaidStatus,
} from './raid-teams';

export interface RaidDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness for fight seeds and jackpot rolls. */
  rng: Rng;
}

export interface WeekRow {
  weekId: string;
  bossId: string;
  status: RaidStatus;
  createdAt: number;
}

/** A guard against a runaway loop; a week has four events. */
const MAX_EVENTS_PER_RUN = 200;

export class Raid {
  /** The next not-done event, cached until its time: most requests then skip the calendar maths. */
  private nextCache: { tz: string; from: number; at: number } | null = null;

  constructor(private readonly deps: RaidDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private atomically<T>(fn: () => T): Outcome<T> {
    try {
      return { ok: true, value: this.deps.storage.transactionSync(fn) };
    } catch (err) {
      if (err instanceof RaidError) {
        return { ok: false, status: err.status, error: err.code };
      }
      throw err;
    }
  }

  // --- Weeks ---

  week(weekId: string): WeekRow | null {
    const row = this.sql
      .exec<{
        week_id: string;
        boss_id: string;
        status: RaidStatus;
        created_at: number;
      }>('SELECT week_id, boss_id, status, created_at FROM raid_weeks WHERE week_id = ?', weekId)
      .toArray()[0];
    return row === undefined
      ? null
      : { weekId: row.week_id, bossId: row.boss_id, status: row.status, createdAt: row.created_at };
  }

  /**
   * Creates the week if it does not exist: its boss (`content.bosses[weekIndex % length]`) and its
   * parties, from the players who are active now. Safe to call again.
   */
  ensureWeek(weekId: string): WeekRow {
    const existing = this.week(weekId);
    if (existing !== null) return existing;
    return this.deps.storage.transactionSync(() => {
      const again = this.week(weekId);
      if (again !== null) return again;
      const bosses = content.bosses;
      const boss = bosses[weekIndex(weekId) % bosses.length];
      if (boss === undefined) throw new Error('content has no bosses');
      const now = this.deps.now();
      this.sql.exec(
        "INSERT INTO raid_weeks (week_id, boss_id, status, created_at) VALUES (?, ?, 'open', ?)",
        weekId,
        boss.id,
        now,
      );
      createParties(this.sql, weekId, eligiblePlayerIds(this.sql, weekId, now), now);
      return { weekId, bossId: boss.id, status: 'open' as const, createdAt: now };
    });
  }

  /**
   * The week the clock is in, created on first use. Due events run first, so the answer never
   * shows a week that should already have moved on. Call it outside a transaction.
   */
  currentWeek(tz: string): WeekRow {
    this.runDue(tz);
    return this.ensureWeek(weekIdFor(this.deps.now(), tz));
  }

  /**
   * Late joiners: before phase 1 resolves, eligible players who are not in a party yet join the
   * smallest one. After that membership is fixed.
   */
  syncRoster(weekId: string): void {
    this.deps.storage.transactionSync(() => {
      const week = this.week(weekId);
      if (week === null || week.status !== 'open') return;
      const started = this.sql
        .exec('SELECT 1 FROM raid_results WHERE week_id = ? LIMIT 1', weekId)
        .toArray();
      if (started.length > 0) return;
      const now = this.deps.now();
      for (const userId of eligiblePlayerIds(this.sql, weekId, now)) {
        if (partyOf(this.sql, weekId, userId) === null) {
          joinSmallestParty(this.sql, weekId, userId, now);
        }
      }
    });
  }

  // --- Scheduled events ---

  private doneSet(fromWeekId: string): Set<string> {
    const rows = this.sql
      .exec<{ week_id: string; event: RaidEvent }>(
        'SELECT week_id, event FROM raid_events WHERE week_id >= ?',
        fromWeekId,
      )
      .toArray();
    return new Set(rows.map((r) => doneKey(r.week_id, r.event)));
  }

  /** The oldest week that has not finished, so a finale missed over a long sleep still runs. */
  private oldestOpenWeek(): string | undefined {
    return (
      this.sql
        .exec<{
          id: string | null;
        }>("SELECT MIN(week_id) AS id FROM raid_weeks WHERE status <> 'finale'")
        .one().id ?? undefined
    );
  }

  private findNext(now: number, tz: string): ScheduledEvent | null {
    const from = this.oldestOpenWeek();
    const lowest = from !== undefined && from < weekIdFor(now, tz) ? from : undefined;
    // Done markers older than the week before the current one cannot matter.
    const floor = lowest ?? weekIdFor(now - 8 * 86_400_000, tz);
    return nextDueEvent(now, tz, this.doneSet(floor), lowest);
  }

  /** When the next raid event is due (it may be in the past if one keeps failing), or null. */
  nextEventAt(tz: string): number | null {
    const now = this.deps.now();
    const cache = this.nextCache;
    if (cache !== null && cache.tz === tz && now >= cache.from && now < cache.at) return cache.at;
    const next = this.findNext(now, tz);
    this.nextCache = next === null ? null : { tz, from: now, at: next.at };
    return next === null ? null : next.at;
  }

  /**
   * Runs every raid event that is due, in order and each at most once per (week, event). Missed
   * events run late. With `until`, only events at or before that instant run (the alarm uses it to
   * order the leet sync among them). A failing event is logged (type only) and stops the run;
   * the alarm retries it later. Returns how many events ran.
   */
  runDue(tz: string, until?: number): number {
    const now = this.deps.now();
    if (until === undefined) {
      const cache = this.nextCache;
      if (cache !== null && cache.tz === tz && now >= cache.from && now < cache.at) return 0;
    }
    const limit = until === undefined ? now : Math.min(now, until);
    let ran = 0;
    for (let i = 0; i < MAX_EVENTS_PER_RUN; i++) {
      const next = this.findNext(now, tz);
      if (next === null || next.at > limit) {
        if (until === undefined)
          this.nextCache = next === null ? null : { tz, from: now, at: next.at };
        return ran;
      }
      try {
        this.runEvent(next, tz);
      } catch (err) {
        console.error('raid event failed', err instanceof Error ? err.name : 'unknown');
        this.nextCache = null;
        return ran;
      }
      ran++;
    }
    return ran;
  }

  private markDone(weekId: string, event: RaidEvent, outcome: 'ran' | 'skipped'): void {
    this.sql.exec(
      'INSERT OR IGNORE INTO raid_events (week_id, event, outcome, done_at) VALUES (?, ?, ?, ?)',
      weekId,
      event,
      outcome,
      this.deps.now(),
    );
  }

  private isDone(weekId: string, event: RaidEvent): boolean {
    return (
      this.sql
        .exec('SELECT 1 FROM raid_events WHERE week_id = ? AND event = ?', weekId, event)
        .toArray().length > 0
    );
  }

  /** Runs one event. Idempotent: an event that is already done does nothing. */
  runEvent(scheduled: ScheduledEvent, tz: string): void {
    const { weekId, event } = scheduled;
    if (this.isDone(weekId, event)) return;
    if (event === 'weekStart') {
      // Only the week the clock is in is opened (an old week that was never opened stays absent).
      if (weekId === weekIdFor(this.deps.now(), tz) || this.week(weekId) !== null) {
        // The week, its boss reveal post and the done marker commit together.
        this.deps.storage.transactionSync(() => {
          const week = this.ensureWeek(weekId);
          queueBossReveal(this.sql, week, tz, this.deps.now());
          this.markDone(weekId, event, 'ran');
        });
      } else {
        this.markDone(weekId, event, 'skipped');
      }
      return;
    }
    const week = this.week(weekId);
    if (week === null) {
      this.markDone(weekId, event, 'skipped');
      return;
    }
    this.resolvePhase(week, event);
  }

  /**
   * Resolves one phase for every party of a week, then marks the week and the event done. Each party
   * resolves in its own transaction, so a crash half-way leaves the finished parties finished and
   * the rest is picked up on the next run.
   */
  resolvePhase(week: WeekRow, phase: RaidPhase): void {
    if (this.isDone(week.weekId, phase)) return;
    // Late joiners are added right before phase 1 locks the membership.
    if (phase === 'phase1') this.syncRoster(week.weekId);
    const parties = this.sql
      .exec<{
        party: number;
      }>('SELECT party FROM raid_parties WHERE week_id = ? ORDER BY party', week.weekId)
      .toArray();
    for (const { party } of parties) {
      resolveParty(this.deps, { weekId: week.weekId, bossId: week.bossId }, party, phase);
    }
    this.deps.storage.transactionSync(() => {
      this.sql.exec('UPDATE raid_weeks SET status = ? WHERE week_id = ?', phase, week.weekId);
      this.markDone(week.weekId, phase, 'ran');
    });
  }

  // --- Player actions ---

  /** The current week and the caller's party, or throws the matching error. */
  private memberContext(userId: string, tz: string): { week: WeekRow; party: number } {
    const week = this.ensureWeek(weekIdFor(this.deps.now(), tz));
    this.syncRoster(week.weekId);
    const party = partyOf(this.sql, week.weekId, userId);
    if (party === null) throw new RaidError(409, 'not_in_roster');
    return { week, party };
  }

  /** Team and placement edits are allowed until the finale resolves. */
  private requireEditable(week: WeekRow): void {
    if (week.status === 'finale') throw new RaidError(409, 'locked');
  }

  /**
   * Chooses the three creatures the player brings, or `null` for the automatic team. Placements of
   * creatures that are no longer in the team are removed.
   */
  setTeam(userId: string, tz: string, creatureIds: readonly string[] | null): Outcome<null> {
    this.runDue(tz);
    return this.atomically(() => {
      const { week } = this.memberContext(userId, tz);
      this.requireEditable(week);
      if (creatureIds !== null) {
        const owned = new Set(loadCreatures(this.sql, userId).map((c) => c.id));
        if (new Set(creatureIds).size !== creatureIds.length) {
          throw new RaidError(400, 'duplicate_creatures');
        }
        if (!creatureIds.every((id) => owned.has(id)))
          throw new RaidError(409, 'not_your_creature');
      }
      this.sql.exec(
        `INSERT INTO raid_teams (week_id, user_id, creature_ids) VALUES (?, ?, ?)
         ON CONFLICT(week_id, user_id) DO UPDATE SET creature_ids = excluded.creature_ids`,
        week.weekId,
        userId,
        creatureIds === null ? null : JSON.stringify(creatureIds),
      );
      const team = new Set(effectiveTeam(this.sql, week.weekId, userId).creatures.map((c) => c.id));
      for (const row of this.sql
        .exec<{
          creature_id: string;
        }>(
          'SELECT creature_id FROM raid_placements WHERE week_id = ? AND user_id = ?',
          week.weekId,
          userId,
        )
        .toArray()) {
        if (!team.has(row.creature_id)) {
          this.sql.exec(
            'DELETE FROM raid_placements WHERE week_id = ? AND creature_id = ?',
            week.weekId,
            row.creature_id,
          );
        }
      }
      return null;
    });
  }

  /**
   * Puts one of the player's team creatures into a slot of the party row. An empty slot just takes
   * it; a slot held by another of the player's own creatures swaps places; a slot held by someone
   * else's creature is refused.
   */
  place(userId: string, tz: string, creatureId: string, slot: number): Outcome<null> {
    this.runDue(tz);
    return this.atomically(() => {
      const { week, party } = this.memberContext(userId, tz);
      this.requireEditable(week);
      this.requireOwnTeamCreature(week.weekId, userId, creatureId);
      const length = rowLength(partyMembers(this.sql, week.weekId, party).length);
      if (!Number.isInteger(slot) || slot < 0 || slot >= length) {
        throw new RaidError(400, 'invalid_slot');
      }
      const mine = this.sql
        .exec<{
          slot: number;
        }>(
          'SELECT slot FROM raid_placements WHERE week_id = ? AND creature_id = ?',
          week.weekId,
          creatureId,
        )
        .toArray()[0];
      if (mine?.slot === slot) return null;
      const occupant = this.sql
        .exec<{ user_id: string; creature_id: string }>(
          'SELECT user_id, creature_id FROM raid_placements WHERE week_id = ? AND party = ? AND slot = ?',
          week.weekId,
          party,
          slot,
        )
        .toArray()[0];
      if (occupant !== undefined && occupant.user_id !== userId) {
        throw new RaidError(409, 'slot_taken');
      }
      // Delete first, insert after: the unique constraints never see two creatures in one slot.
      this.sql.exec(
        'DELETE FROM raid_placements WHERE week_id = ? AND creature_id = ?',
        week.weekId,
        creatureId,
      );
      if (occupant !== undefined) {
        this.sql.exec(
          'DELETE FROM raid_placements WHERE week_id = ? AND creature_id = ?',
          week.weekId,
          occupant.creature_id,
        );
      }
      this.insertPlacement(week.weekId, party, slot, userId, creatureId);
      if (occupant !== undefined && mine !== undefined) {
        this.insertPlacement(week.weekId, party, mine.slot, userId, occupant.creature_id);
      }
      return null;
    });
  }

  /** Takes a creature out of the row (it is auto-placed at resolve time). Idempotent. */
  unplace(userId: string, tz: string, creatureId: string): Outcome<null> {
    this.runDue(tz);
    return this.atomically(() => {
      const { week } = this.memberContext(userId, tz);
      this.requireEditable(week);
      const owned = loadCreatures(this.sql, userId).some((c) => c.id === creatureId);
      if (!owned) throw new RaidError(409, 'not_your_creature');
      this.sql.exec(
        'DELETE FROM raid_placements WHERE week_id = ? AND user_id = ? AND creature_id = ?',
        week.weekId,
        userId,
        creatureId,
      );
      return null;
    });
  }

  private insertPlacement(
    weekId: string,
    party: number,
    slot: number,
    userId: string,
    creatureId: string,
  ): void {
    this.sql.exec(
      'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, ?, ?, ?, ?)',
      weekId,
      party,
      slot,
      userId,
      creatureId,
    );
  }

  private requireOwnTeamCreature(weekId: string, userId: string, creatureId: string): void {
    const owned = loadCreatures(this.sql, userId).some((c) => c.id === creatureId);
    if (!owned) throw new RaidError(409, 'not_your_creature');
    const inTeam = effectiveTeam(this.sql, weekId, userId).creatures.some(
      (c) => c.id === creatureId,
    );
    if (!inTeam) throw new RaidError(409, 'not_in_team');
  }

  /**
   * Sits the week out or rejoins, until phase 1 locks. Opting out removes the player from their
   * party and their placements; opting back in joins the smallest party. Players who are not
   * eligible (no creature) can still set the flag. Idempotent.
   */
  setOptOut(userId: string, tz: string, optOut: boolean): Outcome<{ optOut: boolean }> {
    this.runDue(tz);
    return this.atomically(() => {
      const week = this.ensureWeek(weekIdFor(this.deps.now(), tz));
      if (week.status !== 'open') throw new RaidError(409, 'locked');
      if (optOut) {
        this.sql.exec(
          'INSERT OR IGNORE INTO raid_opt_outs (week_id, user_id) VALUES (?, ?)',
          week.weekId,
          userId,
        );
        leaveParty(this.sql, week.weekId, userId);
      } else {
        this.sql.exec(
          'DELETE FROM raid_opt_outs WHERE week_id = ? AND user_id = ?',
          week.weekId,
          userId,
        );
        this.syncRoster(week.weekId);
      }
      return { optOut };
    });
  }

  isOptedOut(weekId: string, userId: string): boolean {
    return (
      this.sql
        .exec('SELECT 1 FROM raid_opt_outs WHERE week_id = ? AND user_id = ?', weekId, userId)
        .toArray().length > 0
    );
  }

  /** The chosen team ids of a player (for views). */
  chosenTeam(weekId: string, userId: string): string[] | null {
    return chosenTeamIds(this.sql, weekId, userId);
  }

  /** The current week as the caller sees it (creates the week if needed). */
  view(userId: string, tz: string): RaidView {
    return buildRaidView(this, this.sql, userId, tz, this.deps.now());
  }

  /** A resolved phase's stored events, or null if it has not resolved. */
  replay(weekId: string, party: number, phase: RaidPhase): ReplayView | null {
    return buildReplayView(this.sql, weekId, party, phase);
  }

  /** Event times of a week in the guild's timezone. */
  schedule(weekId: string, tz: string): Record<RaidEvent, number> {
    return eventTimes(weekId, tz);
  }
}

export { RAID_PHASES };
