/**
 * The dev clock tool (see `dev-tools.ts` and `docs/design/dev-tools.md`): moves the guild's time offset
 * forward (never back, except a full reset to zero). Everything that reads game time follows, because
 * `GuildCore` hands every game module the same shifted `now`. Sessions, the rate limit and analytics
 * keep real time.
 *
 * Moving forward means "to the next X": the target is computed on the game clock in the guild's
 * timezone (DST-safe, through `time.ts` and `raid-schedule.ts`) and the offset grows by the distance.
 */
import { RULES } from '@creatures/game';
import type * as v from 'valibot';
import { DevError, type ToolCtx } from './dev-context';
import { MAX_CLOCK_OFFSET_MS } from './dev-state';
import type { ClockBodySchema } from './dev-schemas';
import { addWeeks, eventTimes, weekIdFor, type RaidRules } from './raid-schedule';
import { gameDay, nextOccurrence } from './time';

/** Where the dev clock stands: the offset, the game time it gives and the real time. */
export function clockState(ctx: ToolCtx) {
  const offsetMs = ctx.offset.get();
  const now = ctx.realNow + offsetMs;
  return {
    offsetMs,
    now,
    realNow: ctx.realNow,
    timezone: ctx.tz,
    gameDay: gameDay(now, ctx.tz, RULES.daily.reset),
  };
}

function setOffset(ctx: ToolCtx, ms: number): void {
  if (ms > MAX_CLOCK_OFFSET_MS) throw new DevError(409, 'offset_too_large');
  ctx.offset.set(ms);
}

/** The game time right now: the real time plus the offset as it stands (`ctx.now` is read once, when the tool started). */
export function gameNow(ctx: ToolCtx): number {
  return ctx.realNow + ctx.offset.get();
}

/**
 * Moves the game clock forward to `target` (game time). A target that is not ahead changes nothing. It reads the clock as it stands, so
 * a tool that moves it several times lands on each target.
 */
export function advanceTo(ctx: ToolCtx, target: number): void {
  const now = gameNow(ctx);
  if (target > now) setOffset(ctx, ctx.offset.get() + (target - now));
}

/**
 * Moves the game clock back to `target`, or as far back as it goes: the offset is never negative, so the game time stops at the real
 * time. A target that is not behind changes nothing. Returns the game time the clock ended at.
 */
export function retreatTo(ctx: ToolCtx, target: number): number {
  const now = gameNow(ctx);
  if (target < now) ctx.offset.set(Math.max(0, ctx.offset.get() - (now - target)));
  return gameNow(ctx);
}

/** The rules version of a raid week, for the calendar (`eventTimes`). */
type RulesOf = (weekId: string) => RaidRules;

/**
 * The rules each week plays under, as the scheduler reads them: a stored week's own version, and for a week that is not stored yet the
 * one `ensureWeek` will give it (v2 with the `COMBAT_V2` flag on). The v2 calendar is Saturday 13:37, Sunday 13:37 and Sunday 20:00.
 */
export const weekRulesOf =
  (ctx: Pick<ToolCtx, 'sql' | 'combatV2'>): RulesOf =>
  (weekId) => {
    const stored = ctx.sql
      .exec<{ rules_version: number }>(
        'SELECT rules_version FROM raid_weeks WHERE week_id = ?',
        weekId,
      )
      .toArray()[0];
    if (stored === undefined) return ctx.combatV2 ? 2 : 1;
    return stored.rules_version === 2 ? 2 : 1;
  };

/** The next time after `now` that a raid week event happens: this week's remaining ones, then next week's. */
function nextPhaseTarget(now: number, tz: string, rulesOf: RulesOf): number {
  const week = weekIdFor(now, tz);
  const times = [week, addWeeks(week, 1)].flatMap((id) =>
    Object.values(eventTimes(id, tz, rulesOf(id))),
  );
  const next = times.filter((t) => t > now).sort((a, b) => a - b)[0];
  if (next === undefined) throw new DevError(409, 'no_next_phase');
  return next;
}

export function clockTool(ctx: ToolCtx, body: v.InferOutput<typeof ClockBodySchema>) {
  if ('reset' in body) {
    ctx.offset.set(0);
  } else if ('advanceMs' in body) {
    setOffset(ctx, ctx.offset.get() + body.advanceMs);
  } else if (body.to === 'next-reset') {
    const { hour, minute } = RULES.daily.reset;
    advanceTo(ctx, nextOccurrence(ctx.now, hour, minute, ctx.tz));
  } else {
    advanceTo(ctx, nextPhaseTarget(gameNow(ctx), ctx.tz, weekRulesOf(ctx)));
  }
  return clockState(ctx);
}
