/**
 * The raid test bench (staging only, and only with the `COMBAT_V2` flag on; `docs/design/dev-tools.md`): four tools to set the board up,
 * run the fights and start again. Each runs inside the tool's one transaction and acts on the whole staging guild's current raid week
 * (the week the dev clock is in).
 *
 * - `raid-clear`: the week becomes fresh (nothing placed, nothing fought, a combat v2 week) with its Boss Rank kept; the dev clock goes
 *   back into the week's preparation (as far as the real time allows) and no event that is already due is left for the scheduler.
 * - `raid-fill`: N simulated players (the guests: v2 talents, the first Knack their form knows) take the board's empty slots, three
 *   creatures each, after whatever the caller placed. The caller's creatures never move.
 * - `raid-rank`: the week's Boss Rank (and so its boss), and the server's track slot, on a week that has not been fought.
 * - `raid-play`: plays stage 1, stage 2 or the finale now, by the scheduler's own code, and marks the event done so the calendar never
 *   plays it again. The finale plays to its end at once, or (`live`) starts its live fight now. The answer says which fight to open.
 */
import { content } from '@creatures/game';
import type * as v from 'valibot';
import { DevError, type ToolCtx } from './dev-context';
import type {
  RaidFillBodySchema,
  RaidPlayBodySchema,
  RaidRankBodySchema,
  RaidSeatsBodySchema,
} from './dev-schemas';
import { GUEST_PREFIX, createGuest, guestId, referenceLevel } from './dev-tools-raid';
import { GUEST_CREATURES_V2, ensureV2Talents, placeCreaturesV2 } from './dev-tools-raid-v2';
import { gameNow, retreatTo } from './dev-tools-clock';
import { MAX_BENCH_PLAYERS } from './dev-schemas';
import type { WeekRow } from './raid';
import { partyMembers, partyOf } from './raid-roster';
import { eventTimes, weekIdFor } from './raid-schedule';
import { arenaOf, colsFor, readTrack, slotBossInfo, weekCarries } from './raid-v2-core';
import { compactBoard } from './raid-v2-stage';
import { capPlacements, type PlacementRow } from './raid-teams';

type Body<S extends v.GenericSchema> = v.InferOutput<S>;

/** The calendar events a stage waits for (the done markers keep the events' names). */
type StageEvent = 'phase1' | 'phase2' | 'finale';
type Stage = 'stage1' | 'stage2' | 'finale';
const EVENT_OF: Record<Stage, StageEvent> = {
  stage1: 'phase1',
  stage2: 'phase2',
  finale: 'finale',
};
const STAGE_NO: Record<Stage, number> = { stage1: 1, stage2: 2, finale: 3 };

/** How far before stage 1 a cleared week's clock is put when it has to move back: still in the preparation, with days to spare. */
const BACK_BEFORE_STAGE1_MS = 2 * 86_400_000;
/** A guest owns one creature per line (the content's non-Festival lines): the most it can have. */
const GUEST_MAX_CREATURES = new Set(
  content.creatures.filter((c) => c.festival !== true).map((c) => c.line),
).size;
/** The first guest numbers tried (`dev-guest-1` and up); the Games' bots use the same ones. */
const MAX_GUEST_NUMBER = 40;

/** The tools exist only with the flag on (staging plays combat v2): anything else is a plain 404. */
function requireBench(ctx: ToolCtx): void {
  if (!ctx.combatV2) throw new DevError(404, 'not_found');
}

/** The week the clock is in, as it is stored (created if it is not yet: with the flag on, a combat v2 week). No due event runs. */
function clockWeek(ctx: ToolCtx): WeekRow {
  return ctx.raid.ensureWeek(weekIdFor(gameNow(ctx), ctx.tz));
}

/** A combat v2 week the bench can work on: a v1 week (made before the flag) is for `raid-clear` to remake. */
function benchWeek(ctx: ToolCtx): WeekRow {
  requireBench(ctx);
  const week = clockWeek(ctx);
  if (week.rules !== 2) throw new DevError(409, 'not_v2');
  return week;
}

const eventRan = (ctx: ToolCtx, weekId: string, event: string): boolean =>
  ctx.sql
    .exec(
      "SELECT 1 FROM raid_events WHERE week_id = ? AND event = ? AND outcome = 'ran'",
      weekId,
      event,
    )
    .toArray().length > 0;

const eventMarked = (ctx: ToolCtx, weekId: string, event: string): boolean =>
  ctx.sql.exec('SELECT 1 FROM raid_events WHERE week_id = ? AND event = ?', weekId, event).toArray()
    .length > 0;

const resultRows = (ctx: ToolCtx, weekId: string, phase?: string): number =>
  ctx.sql
    .exec<{ n: number }>(
      phase === undefined
        ? 'SELECT COUNT(*) AS n FROM raid_results WHERE week_id = ?'
        : 'SELECT COUNT(*) AS n FROM raid_results WHERE week_id = ? AND phase = ?',
      ...(phase === undefined ? [weekId] : [weekId, phase]),
    )
    .one().n;

/** A stage is played when a party has its result or the scheduler (or `raid-play`) ran its event. */
const stagePlayed = (ctx: ToolCtx, weekId: string, stage: Stage): boolean =>
  resultRows(ctx, weekId, stage) > 0 || eventRan(ctx, weekId, EVENT_OF[stage]);

/** True once anything of the weekend has been fought: a result, a live fight, an event that ran or a status past `open`. */
function fought(ctx: ToolCtx, week: WeekRow): boolean {
  if (week.status !== 'open' || resultRows(ctx, week.weekId) > 0) return true;
  if (
    ctx.sql.exec('SELECT 1 FROM raid_live WHERE week_id = ? LIMIT 1', week.weekId).toArray()
      .length > 0
  )
    return true;
  return (['phase1', 'phase2', 'finale'] as const).some((e) => eventRan(ctx, week.weekId, e));
}

/**
 * Refuses to work on a week whose calendar is past an event the scheduler has not run: the placing code runs due events, so the stage would
 * play by itself in the middle of the tool. `raid-clear` puts such a week right.
 */
function requireQuiet(ctx: ToolCtx, week: WeekRow): void {
  const times = eventTimes(week.weekId, ctx.tz, 2);
  const now = gameNow(ctx);
  for (const event of ['phase1', 'phase2', 'finale'] as const) {
    if (times[event] <= now && !eventMarked(ctx, week.weekId, event)) {
      throw new DevError(409, 'clear_first');
    }
  }
}

/** Sets a week's Boss Rank: its slot, the boss of that slot and the rank its rewards follow. */
function setWeekRank(ctx: ToolCtx, weekId: string, rank: number): void {
  const { bossId } = slotBossInfo(rank);
  ctx.sql.exec(
    'UPDATE raid_weeks SET boss_id = ?, rank = ?, effective_rank = ?, track_slot = ? WHERE week_id = ?',
    bossId,
    rank,
    rank,
    rank,
    weekId,
  );
}

/** Puts the track's slot at `rank`. A new rank starts with no best share and no failed weekend (they belong to the slot they were won on). */
function setTrackSlot(ctx: ToolCtx, rank: number, resetShare: boolean): void {
  ctx.sql.exec(
    'INSERT OR IGNORE INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 1, 0, 0)',
  );
  ctx.sql.exec('UPDATE raid_track SET slot = ? WHERE id = 1', rank);
  if (resetShare) {
    ctx.sql.exec(
      'UPDATE raid_track SET best_share_bp = 0, failed_weekends = 0, updated_week = NULL WHERE id = 1',
    );
  }
}

/** The week's slots, boss and rows as the board answers them (for the tools' answers). */
function rankAnswer(ctx: ToolCtx, weekId: string) {
  const row = ctx.sql
    .exec<{ boss_id: string; track_slot: number | null }>(
      'SELECT boss_id, track_slot FROM raid_weeks WHERE week_id = ?',
      weekId,
    )
    .one();
  return { rank: row.track_slot, bossId: row.boss_id };
}

// --- Clear the board ---

/**
 * The week the clock is in becomes fresh and keeps its Boss Rank. Afterwards nothing fires by itself: when the game time is past the
 * week's stage 1, the dev clock goes back into the preparation (it cannot go behind the real time: when the real time is already past
 * stage 1, the events that are due are marked done so the scheduler skips them, and `raid-play` plays them).
 */
export function raidClear(ctx: ToolCtx) {
  requireBench(ctx);
  const weekId = weekIdFor(gameNow(ctx), ctx.tz);
  const before = ctx.raid.week(weekId);
  const keptRank = before?.trackSlot ?? readTrack(ctx.sql)?.slot ?? 1;
  const trackBefore = readTrack(ctx.sql);
  ctx.raid.clearWeek(weekId);
  // Every week of the bench has a raid: a Festival week (a calendar's, not a rule of the bench) has none.
  ctx.sql.exec(
    'UPDATE raid_weeks SET festival = 0, festival_species = NULL WHERE week_id = ?',
    weekId,
  );
  setWeekRank(ctx, weekId, keptRank);
  // A week that was played to its end moved the track: the rank it had comes back, with the shares that move belongs to.
  if (trackBefore?.slot !== keptRank) setTrackSlot(ctx, keptRank, true);
  else if (trackBefore?.updatedWeek === weekId) setTrackSlot(ctx, keptRank, true);

  const times = eventTimes(weekId, ctx.tz, 2);
  const clockBefore = gameNow(ctx);
  let clockNow = clockBefore;
  if (clockBefore >= times.phase1) {
    clockNow = retreatTo(
      ctx,
      Math.max(times.weekStart + 3_600_000, times.phase1 - BACK_BEFORE_STAGE1_MS),
    );
  }
  // Whatever is still due at that time (the clock could not go back far enough) would run on the next request: it is marked done.
  const marked: string[] = [];
  for (const event of ['weekStart', 'phase1', 'phase2', 'finale'] as const) {
    if (times[event] <= clockNow) {
      ctx.sql.exec(
        "INSERT OR IGNORE INTO raid_events (week_id, event, outcome, done_at) VALUES (?, ?, 'skipped', ?)",
        weekId,
        event,
        clockNow,
      );
      if (event !== 'weekStart') marked.push(event);
    }
  }
  ctx.raid.invalidateReadiness();
  ctx.raid.forgetSchedule();
  return {
    weekId,
    ...rankAnswer(ctx, weekId),
    clockMovedBack: clockNow < clockBefore,
    clockNow,
    /** The events the real time is already past, left for `raid-play`. */
    leftForPlay: marked,
  };
}

// --- Fill the board ---

/** The guests that have a creature on this week's board. */
function guestsOnBoard(ctx: ToolCtx, weekId: string): Set<string> {
  return new Set(
    ctx.sql
      .exec<{ user_id: string }>(
        'SELECT DISTINCT user_id FROM raid_placements WHERE week_id = ? AND user_id LIKE ?',
        weekId,
        `${GUEST_PREFIX}%`,
      )
      .toArray()
      .map((r) => r.user_id),
  );
}

/** The creatures a guest owns for a board of `seats` per player: the seats to place and as many spares, but no more lines than the content has. */
const guestCreatures = (seats: number): number =>
  Math.min(Math.max(GUEST_CREATURES_V2, seats * 2), GUEST_MAX_CREATURES);

/**
 * `count` more simulated players (default as many as fit, at most `MAX_BENCH_PLAYERS`) place the first creatures of the boss's piece (its seats: two to four) in the board's
 * empty slots through the placement code. A guest takes whatever room is left. The caller's creatures never
 * move: the guests only ever take empty slots. Stops when no guest can place a creature.
 */
export function raidFill(ctx: ToolCtx, body: Body<typeof RaidFillBodySchema>) {
  const week = benchWeek(ctx);
  if (fought(ctx, week)) throw new DevError(409, 'fought');
  requireQuiet(ctx, week);
  const wanted = body.count ?? MAX_BENCH_PLAYERS;
  const level = referenceLevel(ctx);
  const there = guestsOnBoard(ctx, week.weekId);
  // The creatures a guest brings: the boss's piece, or the seats override.
  const seats = arenaOf(week.trackSlot ?? 1, week.seatOverride).seats;
  let added = 0;
  for (let n = 1; n <= MAX_GUEST_NUMBER && added < wanted; n++) {
    const id = guestId(n);
    if (there.has(id)) continue;
    createGuest(ctx, n, level, guestCreatures(seats));
    ensureV2Talents(ctx, id);
    const first = ctx.sql
      .exec<{ id: string }>(
        'SELECT id FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid LIMIT ?',
        id,
        seats,
      )
      .toArray()
      .map((r) => r.id);
    const placed = placeCreaturesV2(ctx, week.weekId, id, first, { knack: true });
    if (placed.length === 0) break;
    added += 1;
  }
  ctx.raid.invalidateReadiness();
  return {
    weekId: week.weekId,
    added,
    simulatedOnBoard: guestsOnBoard(ctx, week.weekId).size,
    /** True when the board ran out of room before `count` players were placed. */
    boardFull: added < wanted,
  };
}

// --- Boss and rank ---

/**
 * Fits the open board to the arena of `slot` (its rows and the seats a player brings, the override applied): a player's placements beyond
 * the seats come off (the earliest placed stay, `capPlacements`), and a placement beyond the board's new width moves to the first free
 * slot or comes off when none is free, as stage 1 does for a player who left. The board is still open, so it keeps its spare piece.
 */
function refitBoard(ctx: ToolCtx, weekId: string, slot: number, seatOverride: number | null): void {
  const arena = arenaOf(slot, seatOverride);
  const parties = ctx.sql
    .exec<{ party: number }>(
      'SELECT party FROM raid_parties WHERE week_id = ? ORDER BY party',
      weekId,
    )
    .toArray();
  for (const { party } of parties) {
    const all = ctx.sql
      .exec<PlacementRow>(
        'SELECT rowid, slot, user_id, creature_id FROM raid_placements WHERE week_id = ? AND party = ? ORDER BY rowid',
        weekId,
        party,
      )
      .toArray();
    const kept = new Set(capPlacements(all, new Set(), arena.seats).map((p) => p.creature_id));
    for (const p of all) {
      if (kept.has(p.creature_id)) continue;
      ctx.sql.exec(
        'DELETE FROM raid_placements WHERE week_id = ? AND creature_id = ?',
        weekId,
        p.creature_id,
      );
    }
    compactBoard(
      ctx.sql,
      weekId,
      party,
      arena.rows,
      colsFor(partyMembers(ctx.sql, weekId, party).length, true, arena),
    );
  }
}

/**
 * Sets the week's Boss Rank, and the boss that rank comes with, and the server's track slot. Only on a week that has not been fought:
 * after that, `raid-clear` first. The board's shape follows the new boss (its rows), so a placement beyond the new board moves to the
 * first free slot (or comes off when none is free), as stage 1 does for a player who left.
 */
export function raidRank(ctx: ToolCtx, body: Body<typeof RaidRankBodySchema>) {
  const week = benchWeek(ctx);
  if (fought(ctx, week)) throw new DevError(409, 'fought');
  requireQuiet(ctx, week);
  setWeekRank(ctx, week.weekId, body.rank);
  setTrackSlot(ctx, body.rank, true);
  refitBoard(ctx, week.weekId, body.rank, week.seatOverride);
  ctx.raid.invalidateReadiness();
  return { weekId: week.weekId, ...rankAnswer(ctx, week.weekId) };
}

// --- Creatures per player ---

/**
 * Sets how many creatures each player brings to the raid: a number of seats (1 to 8), or null for the boss's own piece. It is kept for the
 * guild (staging dev state), so it applies to the current week and to every later week until it is set back. Only on a week that has not
 * been fought (`409 fought`: clear the board first; the setting stays through a clear). The board is refitted at once. The boss is sized
 * for the seats on the board (`effectivePlayers` in `raid-v2-core.ts`).
 */
export function raidSeats(ctx: ToolCtx, body: Body<typeof RaidSeatsBodySchema>) {
  requireBench(ctx);
  const week = benchWeek(ctx);
  if (fought(ctx, week)) throw new DevError(409, 'fought');
  requireQuiet(ctx, week);
  ctx.state.writeRaidSeats(body.seats);
  const slot = week.trackSlot ?? 1;
  refitBoard(ctx, week.weekId, slot, body.seats);
  ctx.raid.invalidateReadiness();
  const arena = arenaOf(slot, body.seats);
  return {
    weekId: week.weekId,
    seats: body.seats,
    seatsPerPlayer: arena.seats,
    pieceSeats: arena.pieceSeats,
  };
}

// --- Play a stage ---

/** Whether any party still has a boss standing after the stages played so far. */
function bossStands(ctx: ToolCtx, weekId: string): boolean {
  for (const { carry } of weekCarries(ctx.sql, weekId).values()) {
    if (carry.bossHp > 0) return true;
  }
  return false;
}

/** The party whose fight to open: the caller's, or the lowest party that has the stage's result. */
function partyToWatch(ctx: ToolCtx, weekId: string, stage: Stage): number | null {
  const withResult = ctx.sql
    .exec<{ party: number }>(
      'SELECT party FROM raid_results WHERE week_id = ? AND phase = ? ORDER BY party',
      weekId,
      stage,
    )
    .toArray()
    .map((r) => r.party);
  const mine = partyOf(ctx.sql, weekId, ctx.userId);
  if (mine !== null && withResult.includes(mine)) return mine;
  return withResult[0] ?? null;
}

/**
 * Plays the stage now, by the scheduler's own code (`Raid.playEventNow`), and says which fight to open. Refuses, with a code the panel
 * turns into a plain sentence, when the stage was played already, when the stage before it has not been played, when the boss has fallen
 * or when nobody is left to fight.
 */
export function raidPlay(ctx: ToolCtx, body: Body<typeof RaidPlayBodySchema>) {
  const week = benchWeek(ctx);
  if (week.festival) throw new DevError(409, 'festival');
  const { stage } = body;
  const weekId = week.weekId;
  if (stagePlayed(ctx, weekId, stage)) throw new DevError(409, 'already_played');
  if (stage !== 'stage1' && !stagePlayed(ctx, weekId, 'stage1')) {
    throw new DevError(409, 'play_stage1_first');
  }
  if (stage !== 'stage1' && !bossStands(ctx, weekId)) throw new DevError(409, 'boss_fell');
  if (stage === 'finale' && !stagePlayed(ctx, weekId, 'stage2')) {
    throw new DevError(409, 'play_stage2_first');
  }
  const players = ctx.sql
    .exec<{ n: number }>('SELECT COUNT(*) AS n FROM raid_placements WHERE week_id = ?', weekId)
    .one().n;
  if (players === 0) throw new DevError(409, stage === 'stage1' ? 'nobody_placed' : 'nobody_left');

  const live = body.live === true;
  ctx.raid.playEventNow(weekId, EVENT_OF[stage], live ? 'live' : 'instant');
  ctx.raid.invalidateReadiness();

  const party = live ? null : partyToWatch(ctx, weekId, stage);
  if (!live && party === null) throw new DevError(409, 'nobody_left');
  const carries = [...weekCarries(ctx.sql, weekId).values()];
  return {
    weekId,
    stage: STAGE_NO[stage],
    live,
    /** The fight to open: the week, the party and the stage's name for the replay route. Null for a live finale (the finale screen shows it). */
    watch: party === null ? null : { week: weekId, party, phase: stage },
    /** True when no boss is left standing in any party after this stage. */
    bossFell: carries.length > 0 && !carries.some((c) => c.carry.bossHp > 0),
  };
}
