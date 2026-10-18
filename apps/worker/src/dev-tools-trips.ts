/**
 * Dev tools for expeditions and the daily dungeon. Staging only (see `dev-tools.ts`). Each function runs
 * inside the tool's one transaction and acts on `ctx.userId` (and the guild's day, for the dungeon).
 *
 * The "force" tools do not change game rules: they set a flag in `dev_state` that the game modules read
 * only when the dev tools are on (a forced push-on offer and result, forced night and Festival, the
 * dungeon day's modifiers), or they set stored numbers directly.
 */
import {
  MAX_EXPLORER_RANK,
  RULES,
  explorerRank,
  expeditionContent,
  goalDef,
  goalOddsBp,
  isLandmark,
  slotsFor,
  type ExpeditionLength,
} from '@creatures/game';
import type * as v from 'valibot';
import { DevError, type ToolCtx } from './dev-context';
import { parseState } from './dungeon-state';
import { devKey } from './dev-state';
import type {
  DungeonDepthBodySchema,
  DungeonModifiersBodySchema,
  DungeonStreakBodySchema,
  ForceGatesBodySchema,
  ForceOfferBodySchema,
  JournalBodySchema,
  SetSlotsBodySchema,
} from './dev-schemas';
import { addPage, explorersByCreature, foundPages, statsOf } from './expedition-store';
import { writeExplorer } from './dev-tools-goods';
import { getBalance, type Currency } from './ledger';
import { drawSeed } from './raid-resolve';
import { addDays, gameDay } from './time';

type Body<S extends v.GenericSchema> = v.InferOutput<S>;

// --- Expeditions ---

/** Makes every running trip of the caller finished now, and every push-on that runs, over. */
export function finishTrips(ctx: ToolCtx) {
  const trips = ctx.sql
    .exec(
      `UPDATE expeditions SET ends_at = ?
       WHERE user_id = ? AND status = 'active' AND ends_at > ? RETURNING id`,
      ctx.now,
      ctx.userId,
      ctx.now,
    )
    .toArray().length;
  const pushOns = ctx.sql
    .exec(
      `UPDATE expeditions SET push_ends_at = ?
       WHERE user_id = ? AND status = 'active' AND push_goal IS NOT NULL
         AND push_ends_at IS NOT NULL AND push_ends_at > ? RETURNING id`,
      ctx.now,
      ctx.userId,
      ctx.now,
    )
    .toArray().length;
  return { trips, pushOns };
}

/**
 * Forces the end-of-trip choice. `goal`: the offer of the caller's finished trips that have not chosen yet
 * becomes this goal (when it can be offered after that trip's length); with none of those, the next
 * offer that is rolled is this goal. `outcome`: the next push-on result is a success or a failure
 * (`random` takes the force off).
 */
export function forceOffer(ctx: ToolCtx, body: Body<typeof ForceOfferBodySchema>) {
  if (body.outcome === 'random') ctx.state.delete(devKey.pushOutcome(ctx.userId));
  else if (body.outcome !== undefined) ctx.state.set(devKey.pushOutcome(ctx.userId), body.outcome);

  let appliedToTrips = 0;
  let armed = false;
  if (body.goal !== undefined) {
    const goal = goalDef(body.goal);
    if (goal === undefined) throw new DevError(400, 'invalid_goal');
    const trips = ctx.sql
      .exec<{ id: string; duration: string }>(
        `SELECT id, duration FROM expeditions
         WHERE user_id = ? AND status = 'active' AND ends_at <= ? AND push_goal IS NULL`,
        ctx.userId,
        ctx.now,
      )
      .toArray();
    for (const trip of trips) {
      if (goalOddsBp(goal, trip.duration as ExpeditionLength) === undefined) continue;
      ctx.sql.exec(
        `INSERT INTO expedition_offers (expedition_id, user_id, goals_json, offered_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(expedition_id) DO UPDATE SET goals_json = excluded.goals_json`,
        trip.id,
        ctx.userId,
        JSON.stringify([goal.id]),
        ctx.now,
      );
      appliedToTrips++;
    }
    if (appliedToTrips === 0) {
      ctx.state.set(devKey.pushOffer(ctx.userId), goal.id);
      armed = true;
    } else {
      ctx.state.delete(devKey.pushOffer(ctx.userId));
    }
  }
  return { appliedToTrips, armed, outcome: body.outcome ?? null };
}

/** Forces night and/or the Festival gate of the caller's expeditions (`auto` hands it back to the clock). */
export function forceGates(ctx: ToolCtx, body: Body<typeof ForceGatesBodySchema>) {
  const set = (key: string, value: 'on' | 'off' | 'auto' | undefined): void => {
    if (value === undefined) return;
    if (value === 'auto') ctx.state.delete(key);
    else ctx.state.set(key, value);
  };
  set(devKey.night(ctx.userId), body.night);
  set(devKey.festival(ctx.userId), body.festival);
  return {
    night: ctx.state.get(devKey.night(ctx.userId)) ?? 'auto',
    festival: ctx.state.get(devKey.festival(ctx.userId)) ?? 'auto',
  };
}

/** Sets a stat counter to an exact value. */
function writeStat(ctx: ToolCtx, stat: string, value: number): void {
  ctx.sql.exec(
    `INSERT INTO account_stats (user_id, stat, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, stat) DO UPDATE SET value = excluded.value`,
    ctx.userId,
    stat,
    value,
  );
}

/**
 * Spreads a rank sum over the caller's creatures (as many as it takes, each at most the top rank, the
 * rest at rank 1) by writing their explorer XP. Their finished trips stay.
 */
function assignRankSum(ctx: ToolCtx, target: number): void {
  const ids = ctx.sql
    .exec<{ id: string }>(
      'SELECT id FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
      ctx.userId,
    )
    .toArray()
    .map((r) => r.id);
  const perCreature = MAX_EXPLORER_RANK - 1;
  if (target > ids.length * perCreature) throw new DevError(409, 'not_enough_creatures');
  const explorers = explorersByCreature(ctx.sql, ctx.userId);
  let left = target;
  for (const id of ids) {
    const above = Math.min(left, perCreature);
    left -= above;
    // Rank `above + 1` starts at the XP in slot `above` of the table.
    writeExplorer(
      ctx,
      id,
      RULES.expeditions.rank.xpForRank[above] ?? 0,
      explorers.get(id)?.trips ?? 0,
    );
  }
}

export function setSlots(ctx: ToolCtx, body: Body<typeof SetSlotsBodySchema>) {
  const { secondAfterTrips, thresholds } = RULES.expeditions.slots;
  let rankSum = body.rankSum;
  let tripsFinished = body.tripsFinished;
  if (body.slots !== undefined) {
    // Slot 1 needs neither, slot 2 the trips, slot 3 and up the rank sum of the threshold before it.
    tripsFinished = body.slots >= 2 ? secondAfterTrips : 0;
    rankSum = body.slots >= 3 ? (thresholds[body.slots - 3] ?? 0) : 0;
  }
  if (rankSum !== undefined) assignRankSum(ctx, rankSum);
  if (tripsFinished !== undefined) writeStat(ctx, 'trips_finished', tripsFinished);

  const ranks = ctx.sql
    .exec<{ id: string }>('SELECT id FROM creatures WHERE user_id = ?', ctx.userId)
    .toArray();
  const explorers = explorersByCreature(ctx.sql, ctx.userId);
  let sum = 0;
  for (const { id } of ranks) sum += explorerRank(explorers.get(id)?.xp ?? 0) - 1;
  const trips = statsOf(ctx.sql, ctx.userId).trips_finished ?? 0;
  return { slots: slotsFor(sum, trips), rankSum: sum, tripsFinished: trips };
}

/** Unlocks one journal page or all of them, or empties the journal. The journal counters follow. */
export function journal(ctx: ToolCtx, body: Body<typeof JournalBodySchema>) {
  const entries = expeditionContent.journal.entries;
  if (body.action === 'reset') {
    ctx.sql.exec('DELETE FROM journal WHERE user_id = ?', ctx.userId);
  } else if (body.action === 'unlock') {
    addPage(ctx.sql, ctx.userId, body.entryId, ctx.now, null);
  } else {
    for (const entry of entries) addPage(ctx.sql, ctx.userId, entry.id, ctx.now, null);
  }
  const found = foundPages(ctx.sql, ctx.userId);
  const sets = expeditionContent.journal.sets.filter((s) =>
    entries.filter((e) => e.set === s.id).every((e) => found.has(e.id)),
  ).length;
  writeStat(ctx, 'journal_pages', found.size);
  writeStat(ctx, 'journal_sets', sets);
  return { pages: found.size, total: entries.length, sets };
}

/**
 * Shows the slot-wipe notice again: a cancelled trip (no refund) with the wipe's reason is added for one of the
 * caller's creatures. (The notice's "seen" flag lives in the client; the panel resets it.)
 */
export function slotWipeNotice(ctx: ToolCtx) {
  const creature = ctx.sql
    .exec<{ id: string }>(
      'SELECT id FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid LIMIT 1',
      ctx.userId,
    )
    .toArray()[0];
  if (creature === undefined) throw new DevError(409, 'no_creature');
  const id = crypto.randomUUID();
  ctx.sql.exec(
    `INSERT INTO expeditions
       (id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at, status,
        destination_id, cancel_reason)
     VALUES (?, ?, ?, 'short', 'basic', 0, 0, ?, ?, 'cancelled', 'old-crossroads', 'slot_wipe')`,
    id,
    ctx.userId,
    creature.id,
    ctx.now - 3_600_000,
    ctx.now + 3_600_000,
  );
  return { cancelledId: id };
}

// --- The daily dungeon ---

type ProgressRow = {
  depth: number;
  streak: number;
  last_day: string | null;
  first_day: string | null;
  runs: number;
  clears: number;
};

function progressOf(ctx: ToolCtx): ProgressRow {
  return (
    ctx.sql
      .exec<ProgressRow>(
        'SELECT depth, streak, last_day, first_day, runs, clears FROM dungeon_progress WHERE user_id = ?',
        ctx.userId,
      )
      .toArray()[0] ?? { depth: 1, streak: 0, last_day: null, first_day: null, runs: 0, clears: 0 }
  );
}

const todayOf = (ctx: ToolCtx): string => gameDay(ctx.now, ctx.tz, RULES.daily.reset);

/** Sets the depth the caller's next run fights at, or the next landmark depth above the current one. */
export function dungeonDepth(ctx: ToolCtx, body: Body<typeof DungeonDepthBodySchema>) {
  const every = RULES.dungeon.landmarkEvery;
  const depth =
    'depth' in body ? body.depth : (Math.floor(progressOf(ctx).depth / every) + 1) * every;
  ctx.sql.exec(
    `INSERT INTO dungeon_progress (user_id, depth) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET depth = excluded.depth`,
    ctx.userId,
    depth,
  );
  return { depth, landmark: isLandmark(depth) };
}

/**
 * Forgets the caller's runs of today's game day, so they can run again: the day's payouts are taken
 * back as far as the balances allow (never below zero), the streak and the depth go back to what
 * they were before the run, and the first-day mark goes if this was the only run ever. A run that is
 * still open is deleted too, with its steps (it was not counted in the progress, and its pack was not
 * paid); a treat it was paid with stays spent. An open run that has beaten the main boss at depth 8 or
 * more (`banked` in its state) is different: its chest was paid and its depth +1 locked in when the boss
 * fell, so it is taken back like a finished run (the chest's grants are deleted, the depth goes back),
 * though it never counted as a run or a clear.
 *
 * The ledger stays append-only: the credits are not deleted. Instead one negative `dev` entry per
 * currency is appended for the amount actually removed (the day's credits, less those an earlier
 * reset of the day already dealt with, capped at the balance). The credits keep their idempotency
 * keys, so a new run of the same attempt number is not paid Bait or Essence again; the gear
 * grants of the day are deleted, so those can be granted again.
 */
export function dungeonReset(ctx: ToolCtx) {
  const day = todayOf(ctx);
  // Today's runs, and any on a later day: those exist only when the dev clock was moved forward, run
  // and then moved back, and they would leave the day looking spent (a last day ahead of today).
  const all = ctx.sql
    .exec<{
      id: string;
      day: string;
      depth: number;
      cleared: number;
      status: string;
      state_json: string | null;
    }>(
      'SELECT id, day, depth, cleared, status, state_json FROM dungeon_runs WHERE user_id = ? AND day >= ? ORDER BY day, attempt',
      ctx.userId,
      day,
    )
    .toArray();
  if (all.length === 0) return { removed: 0, day };
  // Only the runs that ended were counted in the progress and paid ...
  const runs = all.filter((r) => r.status === 'done');
  // ... and an open run that banked its main chest paid its gear grants and locked the depth in.
  const banked = all.filter(
    (r) => r.status === 'active' && parseState(r.state_json)?.banked != null,
  );
  const touched = all.filter((r) => runs.includes(r) || banked.includes(r));
  for (const run of all) ctx.sql.exec('DELETE FROM dungeon_steps WHERE run_id = ?', run.id);
  ctx.sql.exec('DELETE FROM dungeon_runs WHERE user_id = ? AND day >= ?', ctx.userId, day);
  if (touched.length === 0) return { removed: all.length, day };

  for (const runDay of new Set(touched.map((r) => r.day))) takeBackDay(ctx, runDay);

  if (runs.length === 0) {
    // Only the depth lock to undo: the run was never counted.
    const first = touched[0];
    ctx.sql.exec(
      'UPDATE dungeon_progress SET depth = ? WHERE user_id = ?',
      Math.min(progressOf(ctx).depth, first?.depth ?? progressOf(ctx).depth),
      ctx.userId,
    );
    return { removed: all.length, day };
  }

  const progress = progressOf(ctx);
  const left = Math.max(0, progress.runs - runs.length);
  const clears = Math.max(0, progress.clears - runs.filter((r) => r.cleared === 1).length);
  const firstRun = runs[0];
  const lastRunDay =
    ctx.sql
      .exec<{ day: string | null }>(
        "SELECT MAX(day) AS day FROM dungeon_runs WHERE user_id = ? AND status = 'done'",
        ctx.userId,
      )
      .one().day ?? null;
  ctx.sql.exec(
    `UPDATE dungeon_progress SET runs = ?, clears = ?, depth = ?, streak = ?, last_day = ?, first_day = ?
     WHERE user_id = ?`,
    left,
    clears,
    Math.min(progress.depth, touched[0]?.depth ?? firstRun?.depth ?? progress.depth),
    progress.last_day !== null && progress.last_day >= day
      ? Math.max(0, progress.streak - 1)
      : progress.streak,
    lastRunDay,
    left === 0 ? null : progress.first_day,
    ctx.userId,
  );
  return { removed: all.length, day };
}

/**
 * Takes back what a game day's dungeon runs paid, as far as the balances allow (see `dungeonReset`), and
 * deletes that day's gear grants so they can be granted again.
 */
function takeBackDay(ctx: ToolCtx, day: string): void {
  const prefix = `dungeon:${day}:%`;
  const paid = ctx.sql
    .exec<{ currency: Currency; total: number }>(
      `SELECT currency, SUM(amount) AS total FROM ledger
       WHERE user_id = ? AND idempotency_key LIKE ? AND amount > 0 GROUP BY currency`,
      ctx.userId,
      prefix,
    )
    .toArray();
  for (const row of paid) {
    // Credits an earlier reset of the day already dealt with (taken back, or as much as the balance
    // allowed) are not taken back again: their rows stay in the ledger.
    const key = devKey.dungeonReset(ctx.userId, day, row.currency);
    const handled = Number(ctx.state.get(key) ?? '0');
    const balance = getBalance(ctx.sql, ctx.userId, row.currency);
    const remove = Math.min(Math.max(0, row.total - handled), balance);
    ctx.state.set(key, String(row.total));
    if (remove <= 0) continue;
    ctx.sql.exec(
      `INSERT INTO ledger (user_id, currency, amount, source, idempotency_key, meta, created_at)
       VALUES (?, ?, ?, 'dev', ?, ?, ?)`,
      ctx.userId,
      row.currency,
      -remove,
      `dev:${crypto.randomUUID()}`,
      JSON.stringify({ tool: 'dungeon-reset', day }),
      ctx.now,
    );
    ctx.sql.exec(
      'UPDATE balances SET amount = amount - ? WHERE user_id = ? AND currency = ?',
      remove,
      ctx.userId,
      row.currency,
    );
  }
  ctx.sql.exec('DELETE FROM gear_grants WHERE user_id = ? AND key LIKE ?', ctx.userId, prefix);
}

/**
 * Sets the caller's streak as it stands before today's run (so the next run makes it one more), or as it
 * stands now when they already ran today.
 */
export function dungeonStreak(ctx: ToolCtx, body: Body<typeof DungeonStreakBodySchema>) {
  const day = todayOf(ctx);
  const ranToday = progressOf(ctx).last_day === day;
  const lastDay = ranToday ? day : body.streak > 0 ? addDays(day, -1) : null;
  ctx.sql.exec(
    `INSERT INTO dungeon_progress (user_id, streak, last_day) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET streak = excluded.streak, last_day = excluded.last_day`,
    ctx.userId,
    body.streak,
    lastDay,
  );
  return { streak: body.streak, ranToday };
}

/**
 * Makes today the caller's first day (so it gives a second run) and, if they already ran, turns that
 * run into a failed one and drops any second run, so the free retry is open.
 */
export function dungeonRetry(ctx: ToolCtx) {
  const day = todayOf(ctx);
  ctx.sql.exec(
    `INSERT INTO dungeon_progress (user_id, first_day) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET first_day = excluded.first_day`,
    ctx.userId,
    day,
  );
  ctx.sql.exec(
    'DELETE FROM dungeon_runs WHERE user_id = ? AND day = ? AND attempt > 1',
    ctx.userId,
    day,
  );
  // A run that went home or cleared becomes a defeat: only a defeat opens the retry.
  const reopened = ctx.sql
    .exec(
      `UPDATE dungeon_runs SET cleared = 0, outcome = CASE WHEN outcome IS NULL THEN NULL ELSE 'defeat' END
       WHERE user_id = ? AND day = ? AND attempt = 1 AND status = 'done' RETURNING id`,
      ctx.userId,
      day,
    )
    .toArray().length;
  return { day, reopened: reopened > 0 };
}

/**
 * Picks the day's room modifiers (for everybody in the guild), or hands them back to the day's seed. A
 * pick is laid over the day's map when it is read, never stored: the first two entrance rooms and the
 * floor boss take it (written onto those map nodes); the other rooms keep what the seed drew.
 */
export function dungeonModifiers(ctx: ToolCtx, body: Body<typeof DungeonModifiersBodySchema>) {
  const day = todayOf(ctx);
  if ('clear' in body) ctx.state.delete(devKey.modifiers(day));
  else ctx.state.set(devKey.modifiers(day), JSON.stringify(body.ids));
  return { day, forced: 'ids' in body ? body.ids : null };
}

/**
 * Draws a new seed for today (live randomness), which redraws today's map (`map_json` is cleared: it is
 * drawn again from the new seed on the next look) and drops any picked modifiers. Runs that are open
 * keep the map they started with.
 */
export function dungeonSeed(ctx: ToolCtx) {
  const day = todayOf(ctx);
  const seed = drawSeed(ctx.rng);
  ctx.sql.exec(
    `INSERT INTO dungeon_days (day, modifier_seed, created_at, map_json) VALUES (?, ?, ?, NULL)
     ON CONFLICT(day) DO UPDATE SET modifier_seed = excluded.modifier_seed, map_json = NULL`,
    day,
    seed,
    ctx.now,
  );
  ctx.state.delete(devKey.modifiers(day));
  return { day };
}
