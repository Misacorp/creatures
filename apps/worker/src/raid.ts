/**
 * The weekly raid: week lifecycle, scheduled events and player actions (placement, abilities, Auto fire).
 * A player joins the week's raid by placing their first creature and leaves by removing the last one before Phase 1.
 * Phases are resolved by `raid-resolve.ts`; read models are in `raid-view.ts`.
 *
 * Everything is synchronous and runs inside `transactionSync`, so a check and the writes that
 * depend on it can never be interleaved with another request. The user is always an argument from
 * the verified session. The guild's timezone is always passed in, never defaulted.
 */
import { basicAbilities, content, RULES, type ReadinessBand, type Rng } from '@creatures/game';
import type { Analytics } from './analytics';
import { GameError, atomically, type Outcome } from './outcome';
import { liveRng } from './rng';
import type { LedgerStorage } from './ledger';
import {
  LATE_START_LIMIT_MS,
  LOBBY_MS,
  PRACTICE_BLOCK_MS,
  PRACTICE_LOBBY_MS,
  practiceOverAt,
  START_GRACE_MS,
  WATCH_WINDOW_MS,
  applyAction,
  evaluate,
  finaleResolved,
  loadLive,
  settleLive,
  startFinaleParty,
  startPracticeParty,
  unresolvedReal,
  type ActionInput,
  type LiveRow,
} from './raid-live';
import {
  emptySnapshot,
  liveSnapshot,
  lobbySnapshot,
  type LiveContext,
  type LiveSnapshot,
} from './raid-live-view';
import { BASIC_TARGET, loadAutofire, storeAutofire, targetOf } from './raid-autofire';
import { convertLegacyWeek, ensureWeekRank, seasonColumns } from './raid-ladder';
import { RAID_DIFFICULTY_VERSION } from './raid-difficulty';
import { queueBossReveal } from './raid-posts';
import { ReadinessCache } from './raid-readiness';
import { redeclareWeek, staleOpenWeeks } from './raid-redeclare';
import { buildPhaseInput, resolveParty } from './raid-resolve';
import { markRevealSeen } from './raid-reveal';
import { readStats, type AfterActionStats } from './raid-stats';
import {
  buildRaidView,
  buildReplayView,
  displayNames,
  nextPendingEvent,
  type RaidView,
  type ReplayView,
} from './raid-view';
import {
  eligiblePlayerIds,
  joinSmallestParty,
  leaveParty,
  partyMembers,
  partyOf,
  partyRowLength,
  partyToJoin,
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
import { boardPush, type BoardChange, type BoardPush } from './raid-board-change';
import { capPlacements, partyPlacements, type PlacementRow, type RaidStatus } from './raid-teams';

export interface RaidDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness for fight seeds and jackpot rolls. */
  rng: Rng;
  /** Staging only: lets players start a practice finale (`RAID_PRACTICE` is "on"). */
  practice?: boolean;
  /**
   * Fresh randomness for the readiness band. Crypto in production. It is separate from `rng`, so a
   * forecast never consumes the draws of a real fight and never touches a stored seed.
   */
  readinessRng?: Rng;
  /** Live randomness for the quirk of a Festival creature. Crypto in production. */
  quirkRng?: Rng;
  /** Live randomness for the talent of a Festival creature. Crypto in production. */
  talentRng?: Rng;
  /** Live randomness for gear drops (a cleared phase, a won finale, a Festival piece). Crypto in production. */
  gearRng?: Rng;
  /** The analytics event log (see `analytics.ts`). Optional: without it nothing is logged. */
  analytics?: Analytics;
  /**
   * The players of a party who have the finale's live socket open (`finale-live.ts`). They count as
   * watching without polling: a socket only gets a push when the stage moves.
   */
  socketWatchers?: (weekId: string, party: number) => ReadonlySet<string>;
  /**
   * The live raid board (`raid-live.ts`). `listening` says whether anyone but the actor has the party's
   * board socket open (no listener: nothing is read for a push); `send` gives them the small message of
   * a change. Both are called after the change committed and must not throw (a failure is logged here).
   */
  board?: {
    listening: (weekId: string, party: number, actorId: string) => boolean;
    send: (actorId: string, push: BoardPush) => void;
  };
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
  /**
   * Set once a scan has found no open week with an older difficulty version. New weeks are created
   * with the current version, so after that the check costs nothing until the object restarts (a
   * deploy, which is the only way the version changes).
   */
  private difficultyChecked = false;
  /** The next not-done event, cached until its time: most requests then skip the calendar maths. */
  private nextCache: { tz: string; from: number; at: number } | null = null;
  /** When each player last polled the live finale. In memory and best effort: it is only "who is here". */
  private readonly watchers = new Map<string, number>();
  /** The readiness bands per party, cached in memory (see `raid-readiness.ts`). */
  private readonly readinessCache: ReadinessCache;

  constructor(private readonly deps: RaidDeps) {
    this.readinessCache = new ReadinessCache({
      storage: deps.storage,
      now: deps.now,
      rng: deps.readinessRng ?? liveRng(),
    });
  }

  /**
   * The readiness band of a party for the view, or null (see `ReadinessCache`). Cheap when cached:
   * a forecast runs at most every 30 seconds per party, and only when something changed.
   */
  readiness(week: WeekRow, party: number): ReadinessBand | null {
    return this.readinessCache.get(week, party);
  }

  /** Dev tools only: forgets the cached readiness bands after a tool changed the roster or the week directly. */
  invalidateReadiness(): void {
    this.readinessCache.invalidate();
  }

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private atomically<T>(fn: () => T): Outcome<T> {
    return atomically(this.deps.storage, fn);
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
   * Creates the week if it does not exist: its boss (`content.bosses[weekIndex % length]`). It has no
   * members and no parties: a party is made when its first player joins (`joinSmallestParty`). Safe to
   * call again.
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
      const season = seasonColumns(weekId);
      this.sql.exec(
        `INSERT INTO raid_weeks (week_id, boss_id, status, created_at, season_index, festival, festival_species, difficulty_version)
         VALUES (?, ?, 'open', ?, ?, ?, ?, ?)`,
        weekId,
        boss.id,
        now,
        season.seasonIndex,
        season.festival,
        season.festivalSpecies,
        RAID_DIFFICULTY_VERSION,
      );
      // The week's rank is fixed now when the server has one. A server that has no rank yet is placed
      // when the first player joins.
      ensureWeekRank(this.sql, weekId);
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
   * Whether a player may still join the week's raid (by placing a creature): until Phase 1 resolves.
   * After that the parties are fixed; the players who joined can still move their own creatures.
   */
  private joiningOpen(week: WeekRow): boolean {
    if (week.status !== 'open') return false;
    return (
      this.sql.exec('SELECT 1 FROM raid_results WHERE week_id = ? LIMIT 1', week.weekId).toArray()
        .length === 0
    );
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
    this.redeclareStaleWeeks();
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

  /**
   * Re-declares every open week whose numbers were declared under older difficulty rules, if no stage
   * of it has resolved (see `raid-redeclare.ts`). Runs first on every path that reads the raid (the
   * alarm and every authenticated request call `runDue`). Never throws: a failure is logged (type
   * only) and the scan is tried again on the next call.
   */
  redeclareStaleWeeks(): void {
    if (this.difficultyChecked) return;
    try {
      for (const weekId of staleOpenWeeks(this.sql)) this.redeclareOne(weekId);
      this.difficultyChecked = true;
    } catch (err) {
      console.error('raid redeclare failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /** Dev tools and tests: makes the next `runDue` scan for stale weeks again (after a week's version was edited directly). */
  invalidateDifficultyCheck(): void {
    this.difficultyChecked = false;
  }

  /** Re-declares one week in its own transaction (race-safe, idempotent) and logs it. */
  private redeclareOne(weekId: string): void {
    this.deps.storage.transactionSync(() => {
      const done = redeclareWeek(this.sql, weekId);
      if (done === null) return;
      this.readinessCache.invalidate();
      this.deps.analytics?.record({
        kind: 'raid_week_redeclared',
        boss: done.bossId,
        versionBefore: done.versionBefore,
        versionAfter: done.versionAfter,
        rankBefore: done.rankBefore,
        rankAfter: done.rankAfter,
        effectiveRankBefore: done.effectiveRankBefore,
        effectiveRankAfter: done.effectiveRankAfter,
        placedAgain: done.placedAgain,
      });
    });
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
    if (event === 'finale') {
      this.startFinale(week, scheduled.at);
      return;
    }
    this.resolvePhase(week, event);
  }

  /**
   * The finale event: each party starts its live fight (see `raid-live.ts`) and the week locks
   * (status 'finale'). If the event runs too late for anyone to watch (the object slept through it),
   * it resolves instantly with every ability at its default round, as a phase does.
   */
  private startFinale(week: WeekRow, scheduledAt: number): void {
    if (this.isDone(week.weekId, 'finale')) return;
    const now = this.deps.now();
    if (now - scheduledAt > LATE_START_LIMIT_MS) {
      this.resolvePhase(week, 'finale');
      return;
    }
    // A start a moment after the scheduled time still counts from it, so the lobby countdown and the
    // rounds line up with the schedule players were shown.
    const startedAt = now - scheduledAt <= START_GRACE_MS ? scheduledAt : now;
    const parties = this.sql
      .exec<{
        party: number;
      }>('SELECT party FROM raid_parties WHERE week_id = ? ORDER BY party', week.weekId)
      .toArray();
    for (const { party } of parties) startFinaleParty(this.deps, week, party, startedAt);
    this.deps.storage.transactionSync(() => {
      this.sql.exec('UPDATE raid_weeks SET status = ? WHERE week_id = ?', 'finale', week.weekId);
      this.markDone(week.weekId, 'finale', 'ran');
    });
  }

  /**
   * Resolves one phase for every party of a week, then marks the week and the event done. Each party
   * resolves in its own transaction, so a crash half-way leaves the finished parties finished and
   * the rest is picked up on the next run.
   */
  resolvePhase(week: WeekRow, phase: RaidPhase): void {
    if (this.isDone(week.weekId, phase)) return;
    if (phase === 'phase1') {
      // A server that has no rank yet is placed now if anyone joined (nobody joins after this).
      this.deps.storage.transactionSync(() => ensureWeekRank(this.sql, week.weekId));
      // Whatever happened before, the week's numbers follow the current rules when Phase 1 fixes the pool.
      this.redeclareOne(week.weekId);
      // A week from before the ladder, with no pool yet, is ranked now (see `convertLegacyWeek`).
      this.deps.storage.transactionSync(() => convertLegacyWeek(this.sql, week.weekId));
    }
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

  /** The current week and the caller's party (they joined by placing), or throws the matching error. */
  private memberContext(userId: string, tz: string): { week: WeekRow; party: number } {
    const week = this.ensureWeek(weekIdFor(this.deps.now(), tz));
    const party = partyOf(this.sql, week.weekId, userId);
    if (party === null) throw new GameError(409, 'not_in_roster');
    return { week, party };
  }

  /** Placement edits are allowed until the finale starts. */
  private requireEditable(week: WeekRow): void {
    if (week.status === 'finale') throw new GameError(409, 'locked');
  }

  /**
   * Puts one of the player's creatures into a slot of the party row. Placing the first creature joins
   * the week's raid (the party with the fewest players, see `partyToJoin`), until Phase 1 resolves
   * (`raid_closed` after); after that the players who joined can still move their own creatures. A
   * player brings exactly the creatures they place, at most three: one that is not on the board yet
   * needs a free place (`board_full` otherwise); one that is already there moves. An empty slot just
   * takes it; a slot held by another of the player's own creatures swaps places; a slot held by
   * someone else's creature is refused. Nothing is added for them.
   */
  place(userId: string, tz: string, creatureId: string, slot: number): Outcome<null> {
    this.runDue(tz);
    const changes: BoardChange[] = [];
    const outcome = this.atomically(() => {
      const week = this.ensureWeek(weekIdFor(this.deps.now(), tz));
      this.requireEditable(week);
      const species = this.requireOwnedCreature(userId, creatureId);
      let party = partyOf(this.sql, week.weekId, userId);
      const joining = party === null;
      if (party === null) {
        if (!this.joiningOpen(week)) throw new GameError(409, 'raid_closed');
        party = joinSmallestParty(this.sql, week.weekId, userId, this.deps.now());
        // A server that has no rank yet is placed as soon as its week has someone in.
        ensureWeekRank(this.sql, week.weekId);
      }
      this.readinessCache.invalidate();
      const length = partyRowLength(this.sql, week.weekId, party);
      if (!Number.isInteger(slot) || slot < 0 || slot >= length) {
        throw new GameError(400, 'invalid_slot');
      }
      // A player never has more than three creatures on the board. Stale rows beyond that (from
      // before this rule) are dropped first, by the one rule in `capPlacements`.
      const { kept: onBoard, droppedSlots } = this.enforcePlacementCap(week.weekId, userId);
      const mine = onBoard.find((p) => p.creature_id === creatureId);
      if (mine?.slot === slot) return null;
      // A creature that is not on the board yet needs a free place among the three.
      if (mine === undefined && onBoard.length >= RULES.raid.teamSize) {
        throw new GameError(409, 'board_full');
      }
      const occupant = this.sql
        .exec<{ user_id: string; creature_id: string }>(
          'SELECT user_id, creature_id FROM raid_placements WHERE week_id = ? AND party = ? AND slot = ?',
          week.weekId,
          party,
          slot,
        )
        .toArray()[0];
      if (occupant !== undefined && occupant.user_id !== userId) {
        throw new GameError(409, 'slot_taken');
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
      // What the party's board looks like now, for the live push (nothing is read for it here).
      changes.push({
        userId,
        week: week.weekId,
        party,
        slots: [
          ...droppedSlots.map((s) => ({ slot: s, creatureId: null })),
          ...(mine === undefined
            ? []
            : [{ slot: mine.slot, creatureId: occupant?.creature_id ?? null }]),
          { slot, creatureId },
        ],
        rowLength: length,
        ...(joining ? { joined: true } : {}),
      });
      this.deps.analytics?.record(
        {
          kind: 'placement',
          action: 'place',
          species,
          slot,
          swap: occupant !== undefined,
        },
        userId,
      );
      return null;
    });
    const change = changes[0];
    if (outcome.ok && change !== undefined) this.pushBoard(change);
    return outcome;
  }

  /**
   * Tells the party's other board sockets what a committed placement change did. Reads nothing when
   * nobody listens; never throws (the change already happened).
   */
  private pushBoard(change: BoardChange): void {
    const board = this.deps.board;
    if (board === undefined) return;
    try {
      if (!board.listening(change.week, change.party, change.userId)) return;
      // A player who left may shrink the row (it follows the joined players): the one read the push does.
      const rowLength =
        change.rowLength ??
        (change.joined === false ? partyRowLength(this.sql, change.week, change.party) : undefined);
      board.send(
        change.userId,
        boardPush(this.sql, { ...change, ...(rowLength === undefined ? {} : { rowLength }) }),
      );
    } catch (err) {
      console.error('raid board push failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /**
   * Deletes the player's placements beyond three (see `capPlacements`) and returns the ones left,
   * earliest placed first, and the slots of the ones it dropped. Run inside a transaction. Normally it
   * deletes nothing.
   */
  private enforcePlacementCap(
    weekId: string,
    userId: string,
  ): { kept: PlacementRow[]; droppedSlots: number[] } {
    const all = this.sql
      .exec<PlacementRow>(
        'SELECT rowid, slot, user_id, creature_id FROM raid_placements WHERE week_id = ? AND user_id = ? ORDER BY rowid',
        weekId,
        userId,
      )
      .toArray();
    const kept = capPlacements(all);
    const keptIds = new Set(kept.map((p) => p.creature_id));
    const droppedSlots: number[] = [];
    for (const row of all) {
      if (!keptIds.has(row.creature_id)) {
        droppedSlots.push(row.slot);
        this.sql.exec(
          'DELETE FROM raid_placements WHERE week_id = ? AND creature_id = ?',
          weekId,
          row.creature_id,
        );
      }
    }
    return { kept, droppedSlots };
  }

  /**
   * Takes a creature off the board. Before Phase 1, taking the last one off leaves the raid again (the
   * player is out until they place a creature); after Phase 1 they stay in the party, and with nothing
   * on the board they do not fight. Idempotent.
   */
  unplace(userId: string, tz: string, creatureId: string): Outcome<null> {
    this.runDue(tz);
    const changes: BoardChange[] = [];
    const outcome = this.atomically(() => {
      const week = this.ensureWeek(weekIdFor(this.deps.now(), tz));
      this.requireEditable(week);
      const species = this.requireOwnedCreature(userId, creatureId);
      this.readinessCache.invalidate();
      const removed = this.sql
        .exec<{ slot: number; party: number }>(
          'DELETE FROM raid_placements WHERE week_id = ? AND user_id = ? AND creature_id = ? RETURNING slot, party',
          week.weekId,
          userId,
          creatureId,
        )
        .toArray()[0];
      // Taking out a creature that was not placed changes nothing and is not logged.
      if (removed !== undefined) {
        const left = this.sql
          .exec<{ n: number }>(
            'SELECT COUNT(*) AS n FROM raid_placements WHERE week_id = ? AND user_id = ?',
            week.weekId,
            userId,
          )
          .one().n;
        const leaving = left === 0 && this.joiningOpen(week);
        if (leaving) leaveParty(this.sql, week.weekId, userId);
        changes.push({
          userId,
          week: week.weekId,
          party: removed.party,
          slots: [{ slot: removed.slot, creatureId: null }],
          ...(leaving ? { joined: false } : {}),
        });
        this.deps.analytics?.record(
          {
            kind: 'placement',
            action: 'unplace',
            species,
            slot: removed.slot,
            swap: false,
          },
          userId,
        );
      }
      return null;
    });
    const change = changes[0];
    if (outcome.ok && change !== undefined) this.pushBoard(change);
    return outcome;
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

  /** The species id of one of the player's creatures (one row, by id), or `not_your_creature`. */
  private requireOwnedCreature(userId: string, creatureId: string): string {
    const row = this.sql
      .exec<{
        user_id: string;
        species: string;
      }>('SELECT user_id, species FROM creatures WHERE id = ?', creatureId)
      .toArray()[0];
    if (row === undefined || row.user_id !== userId) throw new GameError(409, 'not_your_creature');
    return row.species;
  }

  /**
   * Picks the finale ability the player brings, until the finale starts. Without a pick they get the
   * round-robin default. Idempotent.
   */
  setAbility(userId: string, tz: string, abilityId: string): Outcome<null> {
    this.runDue(tz);
    return this.atomically(() => {
      const { week } = this.memberContext(userId, tz);
      if (week.status === 'finale' || this.deps.now() >= eventTimes(week.weekId, tz).finale) {
        throw new GameError(409, 'locked');
      }
      if (!basicAbilities().some((a) => a.id === abilityId)) {
        throw new GameError(400, 'invalid_body');
      }
      this.readinessCache.invalidate();
      const previous = this.sql
        .exec<{
          ability_id: string;
        }>(
          'SELECT ability_id FROM raid_abilities WHERE week_id = ? AND user_id = ?',
          week.weekId,
          userId,
        )
        .toArray()[0];
      this.sql.exec(
        `INSERT INTO raid_abilities (week_id, user_id, ability_id) VALUES (?, ?, ?)
         ON CONFLICT(week_id, user_id) DO UPDATE SET ability_id = excluded.ability_id`,
        week.weekId,
        userId,
        abilityId,
      );
      // Only a change is logged: picking the same ability again is a repeat.
      if (previous?.ability_id !== abilityId) {
        this.deps.analytics?.record({ kind: 'ability_pick', ability: abilityId }, userId);
      }
      return null;
    });
  }

  /**
   * The caller's Auto fire preference for one ability of this week's finale: `target` is `basic` or the
   * id of one of their own team creatures. It sets the ability's first mode at the live start (off is
   * 'held': it waits for its owner, with the last-round safety net). Allowed until the finale starts
   * (`locked` after); after that the live `hold` and `unhold` actions apply. A practice fight that is
   * still in its lobby takes the change too. Idempotent.
   */
  setAutofire(userId: string, tz: string, target: string, on: boolean): Outcome<null> {
    this.runDue(tz);
    return this.atomically(() => {
      const { week, party } = this.memberContext(userId, tz);
      const now = this.deps.now();
      if (week.status === 'finale' || now >= eventTimes(week.weekId, tz).finale) {
        throw new GameError(409, 'locked');
      }
      const wasOn = loadAutofire(this.sql, week.weekId).isOn(userId, target);
      storeAutofire(this.sql, week.weekId, userId, target, on);
      // Only a change is logged: setting the same value again is a repeat.
      if (wasOn !== on) {
        this.deps.analytics?.record(
          {
            kind: 'autofire_toggle',
            target: target === BASIC_TARGET ? 'basic' : 'creature',
            species: target === BASIC_TARGET ? null : this.speciesOfCreature(target),
            on,
          },
          userId,
        );
      }
      // A practice fight that has not started yet takes the new setting too.
      const practice = loadLive(this.sql, week.weekId, party, true);
      if (practice !== null && now < practice.startedAt) {
        const me = practice.members.find((m) => m.userId === userId);
        const ability = practice.abilities.find(
          (a) => a.alias === me?.alias && targetOf(a) === target,
        );
        if (ability !== undefined && ability.mode !== 'fired') {
          ability.mode = on ? 'default' : 'held';
          this.sql.exec(
            'UPDATE raid_live SET abilities = ? WHERE week_id = ? AND party = ? AND practice = 1',
            JSON.stringify(practice.abilities),
            week.weekId,
            party,
          );
        }
      }
      return null;
    });
  }

  /** Marks the loot reveal of a finale as seen. Idempotent. 404 if the player was not in that finale. */
  markRevealSeen(userId: string, weekId: string): Outcome<null> {
    return this.atomically(() => {
      if (!markRevealSeen(this.sql, userId, weekId, this.deps.now())) {
        throw new GameError(404, 'not_found');
      }
      return null;
    });
  }

  // --- The live finale ---

  /**
   * What the caller's party has right now. A real finale that is still going comes first, then the
   * lobby, then a practice fight that is still visible, then the resolved real finale.
   */
  private selectLive(
    week: Pick<WeekRow, 'weekId'>,
    party: number,
    tz: string,
    now: number,
  ): { row: LiveRow } | { lobbyAt: number } | null {
    const real = loadLive(this.sql, week.weekId, party, false);
    if (real !== null && !finaleResolved(this.sql, week.weekId, party)) return { row: real };
    const finaleAt = eventTimes(week.weekId, tz).finale;
    if (real === null && !this.isDone(week.weekId, 'finale') && now >= finaleAt - LOBBY_MS) {
      return { lobbyAt: finaleAt };
    }
    const practice = loadLive(this.sql, week.weekId, party, true);
    if (practice !== null && now < practiceOverAt(practice)) {
      return { row: practice };
    }
    return real === null ? null : { row: real };
  }

  /** Resolves a real fight that is over. Never throws: a failure is retried on the next read. */
  private trySettle(weekId: string, party: number, now: number): boolean {
    try {
      return settleLive(this.deps, weekId, party, now);
    } catch (err) {
      console.error('live finale resolve failed', err instanceof Error ? err.name : 'unknown');
      return false;
    }
  }

  /**
   * Resolves every real fight that is over: its last round has played, or the rounds shown include
   * the boss falling. The alarm and every request run this. Between fights the table has no
   * unresolved rows, so it costs one empty query.
   */
  settleDueLive(): number {
    const now = this.deps.now();
    let settled = 0;
    for (const fight of unresolvedReal(this.sql)) {
      if (this.trySettle(fight.weekId, fight.party, now)) settled++;
    }
    return settled;
  }

  /** When the last round of the earliest unresolved real fight ends (the alarm wakes for it), or null. */
  nextLiveEndAt(): number | null {
    return unresolvedReal(this.sql)[0]?.endsAt ?? null;
  }

  /** True when `userId` is in `party` of the week (a finale socket's ticket needs it). */
  isPartyMember(userId: string, weekId: string, party: number): boolean {
    return partyOf(this.sql, weekId, userId) === party;
  }

  /**
   * True when the raid view of `userId` shows `party`'s board this week (the live board's ticket needs
   * it): they are in it, or they have not joined, joining is open, they have a creature to place and it
   * is the party they would join (`partyToJoin`, as the view picks it).
   */
  canWatchBoard(userId: string, week: WeekRow, party: number): boolean {
    const mine = partyOf(this.sql, week.weekId, userId);
    if (mine !== null) return mine === party;
    if (!this.joiningOpen(week)) return false;
    const hasCreature =
      this.sql.exec('SELECT 1 FROM creatures WHERE user_id = ? LIMIT 1', userId).toArray().length >
      0;
    return hasCreature && partyToJoin(this.sql, week.weekId).party === party;
  }

  /**
   * The next moment the snapshot of this party changes shape, for the live socket's alarm: the lobby
   * opening, the lobby ending (the start), the next round's start, or the end of the fight. Null when
   * there is nothing to wait for. Read-only; always later than now.
   */
  nextPushAt(weekId: string, party: number, tz: string): number | null {
    const now = this.deps.now();
    const selected = this.selectLive({ weekId }, party, tz, now);
    let at: number | null = null;
    if (selected === null) {
      const lobbyOpens = eventTimes(weekId, tz).finale - LOBBY_MS;
      if (loadLive(this.sql, weekId, party, false) === null && !this.isDone(weekId, 'finale')) {
        at = lobbyOpens;
      }
    } else if ('lobbyAt' in selected) {
      at = selected.lobbyAt;
    } else if (selected.row.practice && now < selected.row.startedAt) {
      at = selected.row.startedAt;
    } else {
      at = evaluate(selected.row, now).nextRoundAt;
    }
    return at !== null && at > now ? at : null;
  }

  /** Notes that the player is here and lists who is, by display name (the caller's party only). */
  private touchWatching(
    userId: string,
    weekId: string,
    party: number,
    now: number,
    names: ReadonlyMap<string, string>,
  ): string[] {
    this.watchers.set(userId, now);
    for (const [id, at] of this.watchers) {
      if (now - at >= WATCH_WINDOW_MS) this.watchers.delete(id);
    }
    const sockets = this.deps.socketWatchers?.(weekId, party);
    return partyMembers(this.sql, weekId, party)
      .filter((id) => this.watchers.has(id) || sockets?.has(id) === true)
      .map((id) => names.get(id) ?? 'Unknown');
  }

  /**
   * The live finale as the caller's party sees it right now: nothing soon, the lobby, the fight or
   * the finished fight with the caller's loot. A read that sees the end resolves the fight. Never
   * contains the seed.
   */
  liveSnapshot(userId: string, tz: string): LiveSnapshot {
    const week = this.currentWeek(tz);
    const now = this.deps.now();
    const party = partyOf(this.sql, week.weekId, userId);
    const names = displayNames(this.sql);
    const base: LiveContext = {
      sql: this.sql,
      now,
      weekId: week.weekId,
      bossId: week.bossId,
      party,
      userId,
      names,
      watching: [],
    };
    const selected = party === null ? null : this.selectLive(week, party, tz, now);
    if (party === null || selected === null) return emptySnapshot(base, 'none', null);
    const watching = this.touchWatching(userId, week.weekId, party, now, names);
    const ctx = { ...base, watching };
    if ('lobbyAt' in selected) {
      this.logJoin(userId, `join:${week.weekId}:real`, 'lobby', false);
      return this.realLobby(ctx, week, party, selected.lobbyAt);
    }
    const { row } = selected;
    const joinLabel = `join:${week.weekId}:${row.practice ? `practice${String(row.startedAt)}` : 'real'}`;
    // A practice fight is a lobby until its start (the 30 second countdown), with the row as frozen.
    if (row.practice && now < row.startedAt) {
      this.logJoin(userId, joinLabel, 'lobby', true);
      return lobbySnapshot(ctx, row.startedAt, true, {
        input: row.input,
        members: row.members,
        abilities: row.abilities.map((a) => ({
          key: a.key,
          alias: a.alias,
          abilityId: a.abilityId,
          creatureId: a.creatureId,
          held: a.mode === 'held',
        })),
      });
    }
    const state = evaluate(row, now);
    // Looking at a finished fight is not joining it.
    if (!state.ended) this.logJoin(userId, joinLabel, 'fight', row.practice);
    let resolved = false;
    if (!row.practice) {
      resolved = finaleResolved(this.sql, row.weekId, row.party);
      if (!resolved && state.ended) resolved = this.trySettle(row.weekId, row.party, now);
    }
    return liveSnapshot(ctx, row, state, resolved);
  }

  /**
   * Logs the player's first look at a live fight or its lobby (once per finale, however often they
   * poll). A read that writes: the mark and the event commit together, and only on the first look.
   */
  private logJoin(
    userId: string,
    label: string,
    stage: 'lobby' | 'fight',
    practice: boolean,
  ): void {
    const analytics = this.deps.analytics;
    if (analytics === undefined) return;
    this.deps.storage.transactionSync(() => {
      if (analytics.once(userId, label)) {
        analytics.record({ kind: 'live_join', stage, practice }, userId);
      }
    });
  }

  /**
   * The lobby of the real finale: the caller's party's row as it would fight now, with the caller's
   * abilities and their Auto fire settings. If the preview cannot be built (it should always be) the
   * plain lobby is shown instead; a read never fails because of it.
   */
  private realLobby(ctx: LiveContext, week: WeekRow, party: number, lobbyAt: number): LiveSnapshot {
    try {
      const built = buildPhaseInput(this.sql, week, party, 'finale');
      if (built !== null) {
        return lobbySnapshot(ctx, lobbyAt, false, {
          input: built.input,
          members: built.memberIds.map((userId, i) => ({
            alias: built.aliases[i] as string,
            userId,
          })),
          abilities: built.input.finaleAbilities.map((a) => ({
            key: a.key,
            alias: a.playerId,
            abilityId: a.abilityId,
            creatureId: a.creatureId ?? null,
            held: built.held.has(a.key),
          })),
        });
      }
    } catch (err) {
      console.error('lobby preview failed', err instanceof Error ? err.name : 'unknown');
    }
    return emptySnapshot(ctx, 'lobby', lobbyAt);
  }

  /**
   * The caller's Fire or Hold, written in a transaction with the round taken from the clock at that
   * moment. Returns the new snapshot.
   */
  liveAction(userId: string, tz: string, body: ActionInput): Outcome<LiveSnapshot> {
    const week = this.currentWeek(tz);
    const now = this.deps.now();
    const party = partyOf(this.sql, week.weekId, userId);
    const selected = party === null ? null : this.selectLive(week, party, tz, now);
    if (party === null || selected === null || !('row' in selected)) {
      return { ok: false, status: 409, error: 'not_in_fight' };
    }
    const { practice } = selected.row;
    // A fight that is over is resolved first, so the action is judged against the final state.
    if (!practice) this.trySettle(week.weekId, party, now);
    const outcome = this.atomically(() => {
      const row = loadLive(this.sql, week.weekId, party, practice);
      if (row === null) throw new GameError(409, 'not_in_fight');
      const done = applyAction(this.sql, row, userId, body, now);
      if (done !== null) {
        this.deps.analytics?.record(
          {
            kind: 'live_action',
            action: done.action,
            ability: done.abilityId,
            round: done.round,
            defaultRound: done.defaultRound,
            practice,
          },
          userId,
        );
      }
      return null;
    });
    if (!outcome.ok) return outcome;
    return { ok: true, value: this.liveSnapshot(userId, tz) };
  }

  /** True when the staging-only practice finale is available. */
  practiceEnabled(): boolean {
    return this.deps.practice === true;
  }

  /**
   * Staging only: starts a practice fight for the caller's party (this week's boss, the current
   * row, full HP, no adaptation, the current ability picks and Auto fire preferences). It starts after
   * a 30 second lobby (the countdown) and pays nothing and stores no result.
   * Refused from 30 minutes before the finale until it has resolved, and once per party per 10
   * minutes. 404 unless the `RAID_PRACTICE` var is "on".
   *
   * `options` is for the dev tools only (`DEV_TOOLS` is "on", see `dev-tools.ts`): `lobbyMs` is a shorter
   * countdown, and `unrestricted` lifts the finale block and the cooldown and allows it without
   * `RAID_PRACTICE`. Nothing else passes them.
   */
  startPractice(
    userId: string,
    tz: string,
    options: { lobbyMs?: number; unrestricted?: boolean } = {},
  ): Outcome<LiveSnapshot> {
    const unrestricted = options.unrestricted === true;
    if (this.deps.practice !== true && !unrestricted) {
      return { ok: false, status: 404, error: 'not_found' };
    }
    this.runDue(tz);
    const started = this.atomically(() => {
      const { week, party } = this.memberContext(userId, tz);
      const now = this.deps.now();
      const finaleAt = eventTimes(week.weekId, tz).finale;
      if (
        !unrestricted &&
        now >= finaleAt - PRACTICE_BLOCK_MS &&
        !finaleResolved(this.sql, week.weekId, party)
      ) {
        throw new GameError(409, 'practice_blocked');
      }
      const last = loadLive(this.sql, week.weekId, party, true);
      if (!unrestricted && last !== null && now < practiceOverAt(last)) {
        throw new GameError(409, 'practice_cooldown');
      }
      // The fight starts after a 30 second lobby with the countdown; the party sees a lobby until then.
      const lobbyMs = options.lobbyMs ?? PRACTICE_LOBBY_MS;
      if (!startPracticeParty(this.deps, week, party, now + lobbyMs)) {
        throw new GameError(409, 'not_in_roster');
      }
      return null;
    });
    if (!started.ok) return started;
    return { ok: true, value: this.liveSnapshot(userId, tz) };
  }

  /** The species id of a creature, for the analytics log. */
  private speciesOfCreature(creatureId: string): string {
    return (
      this.sql
        .exec<{ species: string }>('SELECT species FROM creatures WHERE id = ?', creatureId)
        .toArray()[0]?.species ?? 'unknown'
    );
  }

  /** The current week as the caller sees it (creates the week if needed). */
  view(userId: string, tz: string): RaidView {
    this.settleDueLive();
    return buildRaidView(this, this.sql, userId, tz, this.deps.now());
  }

  /**
   * The light read behind the Activity's raid pip and the Home notice: whether the Raid tab would ask the
   * caller to place creatures, and when the next raid event is due (`nextAt`, as `view.next.at`: the
   * answer can change then). True for an active player who has not joined while joining is still open,
   * and for a joined player with fewer on the board than they could bring (up to three), until the
   * finale starts. It builds none of the view.
   */
  needsPlacement(userId: string, tz: string): { needed: boolean; nextAt: number | null } {
    this.settleDueLive();
    const week = this.currentWeek(tz);
    const schedule = this.schedule(week.weekId, tz);
    const nextEvent = nextPendingEvent(week.status);
    const nextAt = nextEvent === undefined ? null : schedule[nextEvent];
    if (week.status === 'finale') return { needed: false, nextAt };
    const party = partyOf(this.sql, week.weekId, userId);
    if (party === null) {
      // Not joined: nudged while joining is open, if they are on the active roster (a creature and recent activity).
      const needed =
        this.joiningOpen(week) && eligiblePlayerIds(this.sql, this.deps.now()).includes(userId);
      return { needed, nextAt };
    }
    const placed = partyPlacements(this.sql, week.weekId, party).filter(
      (p) => p.user_id === userId,
    ).length;
    // Up to three; a player who owns fewer cannot place more.
    const could = this.sql
      .exec<{
        n: number;
      }>(
        'SELECT COUNT(*) AS n FROM (SELECT 1 FROM creatures WHERE user_id = ? LIMIT ?)',
        userId,
        RULES.raid.teamSize,
      )
      .one().n;
    return { needed: placed < could, nextAt };
  }

  /** A resolved phase's stored events, or null if it has not resolved. */
  replay(userId: string, weekId: string, party: number, phase: RaidPhase): ReplayView | null {
    return buildReplayView(this.sql, userId, weekId, party, phase);
  }

  /** The after-action stats of a resolved stage, for a member of that fight; null otherwise. */
  stats(userId: string, weekId: string, party: number, phase: RaidPhase): AfterActionStats | null {
    return readStats(this.sql, userId, weekId, party, phase, displayNames(this.sql));
  }

  /** Event times of a week in the guild's timezone. */
  schedule(weekId: string, tz: string): Record<RaidEvent, number> {
    return eventTimes(weekId, tz);
  }
}

export { RAID_PHASES };
