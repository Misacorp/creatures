/**
 * The `valley-fresh` dev tool (staging only; `docs/design/valley/phase5-plan.md`, step 0): wipes every player's progress in the
 * caller's guild and opens a day-0 valley, so a step can be tried from nothing and the simulated month starts clean. It is the
 * first half of phase 6's reset, on staging.
 *
 * It exists only when the dev tools and the valley systems are both on (`VALLEY_SYSTEMS`, which needs `VALLEY` and `COMBAT_V2`;
 * anything else answers 404). Production has the dev tools off, so the route is a 404 there before this code runs, and its
 * `VALLEY_SYSTEMS` is off as well (a test pins both).
 *
 * What it clears: every table with a `user_id` column (`purgeUser`: creatures, balances, gear, trips, jobs, runs ... everything but
 * sign-in and the guild's own rows), the players' dev state, and the valley's guild-level tables in `VALLEY_GUILD_TABLES`. Players
 * stay signed in with their rows in `players`; each starts again at the starter choice. The dev clock goes back to real time.
 */
import { DevError, ownCreature, purgeUser, type ToolCtx } from './dev-context';
import type { ValleySimDayBodySchema } from './dev-schemas';
import type * as v from 'valibot';
import {
  clearSim,
  dropSimTables,
  valleyBots,
  valleyReport,
  valleySimDay,
  type BotsResult,
  type ReportResult,
  type SimDayResult,
} from './valley-bots';

/**
 * The valley's tables that are NOT keyed by `user_id` (the guild-level ones), cleared whole. Per-player valley tables carry a
 * `user_id` column and are cleared by `purgeUser` with everything else, so they need no entry. Step 5 added `valley_server` (the
 * server's middle); step 6 added the commons' `valley_places`, `valley_collections`, `valley_fire_log` and `valley_keystones`
 * (`valley_gifts` has a `user_id`, so `purgeUser` clears it); step 8 added the visitor's `visitor_weeks` (`visitor_rerolls` has a `user_id`); step 9 added the School's `school_weeks` (`school_students` has a `user_id`); later steps add theirs here, in one place.
 */
export const VALLEY_GUILD_TABLES: readonly string[] = [
  'valley_server',
  'valley_places',
  'valley_collections',
  'valley_fire_log',
  'valley_keystones',
  'visitor_weeks',
  'school_weeks',
];

export interface ValleyFreshResult {
  /** Players whose progress was wiped. */
  players: number;
  /** The valley's guild-level tables that were cleared. */
  tablesCleared: string[];
}

export function valleyFresh(ctx: ToolCtx): ValleyFreshResult {
  if (!ctx.valleySystems) throw new DevError(404, 'not_found');
  const sql = ctx.sql;
  const ids = sql
    .exec<{ user_id: string }>('SELECT user_id FROM players ORDER BY user_id')
    .toArray()
    .map((r) => r.user_id);
  for (const userId of ids) {
    purgeUser(sql, userId, true);
    ctx.state.clearUser(userId);
  }
  // Names come from the constant above, never from a request.
  for (const table of VALLEY_GUILD_TABLES) sql.exec(`DELETE FROM "${table}"`);
  // The simulated month's own state (the bots' flows are per player and went with `purgeUser`).
  clearSim(ctx);
  // The month's dev triggers on `parts` and its two tables (made by `valley-bots`): staging pays nothing for them after a fresh start.
  dropSimTables(sql);
  ctx.raid.invalidateReadiness();
  ctx.offset.set(0);
  return { players: ids.length, tablesCleared: [...VALLEY_GUILD_TABLES] };
}

export interface VisitorArriveResult {
  /** The guild-local Monday of the week he was brought for. */
  weekKey: string;
  /** The week's blueprint (a craftable base id). */
  blueprintId: string;
  /** Whether his arrival post was queued (false: no channel known, or the week already had its post). */
  posted: boolean;
}

/**
 * The `visitor-arrive` dev tool (staging only, with the valley systems on; 404 otherwise): brings the weekly visitor now for the current
 * week, whatever the weekday, so his stall can be tried at any time. He stays until the week ends (Monday 00:00 guild-local); the
 * tool is safe to repeat (the week's blueprint and its post are made once).
 */
export function visitorArrive(ctx: ToolCtx): VisitorArriveResult {
  if (!ctx.valleySystems || ctx.visitor === null) throw new DevError(404, 'not_found');
  const now = ctx.visitor.arriveNow(ctx.now);
  if (now.row === null) throw new DevError(409, 'not_here');
  return {
    weekKey: now.weekKey,
    blueprintId: now.row.blueprint_id,
    posted: now.row.posted_at !== null,
  };
}

export interface SchoolTeacherResult {
  /** The guild-local Monday of the stay the teacher was made for. */
  weekKey: string;
  /** Where he stands now: here (brought) or announced. */
  phase: 'here' | 'announced';
  /** The week's talent (an id), or null when no talent benefits anyone on the server. */
  talentId: string | null;
  /** Whether the announcement post was queued (false: no channel known, no talent, or the week already had its post). */
  posted: boolean;
}

/**
 * The `school-teacher` dev tool (staging only, with the valley systems on; 404 otherwise). `arrive` brings the School's teacher now for the
 * current week's stay, whatever the weekday (he then counts as here until the week ends); `announce` announces next week's teacher now
 * (it counts as announced until his stay). Either makes the week's row if there is none (the talent drawn by the band rule from the
 * server's books with live dice, the announcement post queued once) and is safe to repeat.
 */
export function schoolTeacher(
  ctx: ToolCtx,
  body: { mode: 'arrive' | 'announce' },
): SchoolTeacherResult {
  if (!ctx.valleySystems || ctx.school === null) throw new DevError(404, 'not_found');
  const now =
    body.mode === 'arrive' ? ctx.school.arriveNow(ctx.now) : ctx.school.announceNow(ctx.now);
  if (now.weekKey === null || now.row === null || now.phase === 'away') {
    throw new DevError(409, 'not_here');
  }
  return {
    weekKey: now.weekKey,
    phase: now.phase,
    talentId: now.row.talent_id,
    posted: now.row.posted_at !== null,
  };
}

export interface TrialsTickResult {
  /** Whether a trial's boxes were ticked (false: the creature already holds Gold). */
  ticked: boolean;
}

/**
 * The `trials-tick` dev tool (staging only, with the valley systems on; 404 otherwise): ticks every box of the next trial of one of the
 * caller's creatures now, whatever its level, so a graduation can be seen. It then graduates at the next ceremony, or at `trials-ceremony`.
 */
export function trialsTick(ctx: ToolCtx, body: { creatureId: string }): TrialsTickResult {
  if (!ctx.valleySystems || ctx.trials === null) throw new DevError(404, 'not_found');
  ownCreature(ctx, body.creatureId);
  return { ticked: ctx.trials.forceTicks(ctx.userId, body.creatureId, ctx.now) };
}

export interface TrialsCeremonyResult {
  /** The caller's creatures that graduated now. */
  graduated: number;
}

/** The `trials-ceremony` dev tool (staging only, with the valley systems on; 404 otherwise): the School's ceremony now, for the caller's ready creatures. */
export function trialsCeremony(ctx: ToolCtx): TrialsCeremonyResult {
  if (!ctx.valleySystems || ctx.trials === null) throw new DevError(404, 'not_found');
  const ids = ctx.sql
    .exec<{ id: string }>('SELECT id FROM creatures WHERE user_id = ?', ctx.userId)
    .toArray()
    .map((r) => r.id);
  return { graduated: ctx.trials.ceremonyNow(ctx.userId, ids, ctx.now) };
}

/**
 * The `valley-bots` dev tool (staging only, with the valley systems on; 404 otherwise): moves the dev clock to the next Monday 00:00 (guild
 * time) and makes the month's bots, `dev-guest-0` to `-7`, the lab's mixed server of 8 (bot 0 stands in for the human's seat; see `valley-bots.ts`). Safe to repeat.
 */
export const valleyBotsTool = (ctx: ToolCtx): BotsResult => valleyBots(ctx);

/**
 * The `valley-sim-day` dev tool (staging only; 404 otherwise): plays the next game day of the bots: the clock moves through the day, the
 * server's own daily work runs, and each bot whose visit is due plays its policy through the real settle and the valley's intents.
 * `maxVisits` splits a long day over several calls. Answers the day, the visits and the rows read and written.
 */
export const valleySimDayTool = (
  ctx: ToolCtx,
  body: v.InferOutput<typeof ValleySimDayBodySchema>,
): SimDayResult => valleySimDay(ctx, body);

/** The `valley-report` dev tool (staging only; 404 otherwise): the lab-shaped report of the bots and the real players, plus the month's rows. */
export const valleyReportTool = (ctx: ToolCtx): ReportResult => valleyReport(ctx);
