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
import type { ClockBodySchema, RaidPhaseBodySchema } from './dev-schemas';
import { addWeeks, eventTimes, weekIdFor } from './raid-schedule';
import { gameDay, nextOccurrence } from './time';

/** The finale's live fight is over by this long after it starts (12 rounds of at most 22 s, plus playback). */
export const FINALE_WINDOW_MS = 10 * 60_000;

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

/** Moves the game clock forward to `target` (game time). A target that is not ahead changes nothing. */
export function advanceTo(ctx: ToolCtx, target: number): void {
  if (target > ctx.now) setOffset(ctx, ctx.offset.get() + (target - ctx.now));
}

/** The next time after `now` that a raid week event happens: this week's remaining ones, then next week's. */
function nextPhaseTarget(now: number, tz: string): number {
  const week = weekIdFor(now, tz);
  const times = [week, addWeeks(week, 1)].flatMap((id) => Object.values(eventTimes(id, tz)));
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
    advanceTo(ctx, nextPhaseTarget(ctx.now, ctx.tz));
  }
  return clockState(ctx);
}

/**
 * The earliest game time at or after `now` when the raid week is in a phase:
 * - `preparation`: from the week start to Phase 1;
 * - `phase1`: from Phase 1 to Phase 2 (Phase 1 has resolved);
 * - `phase2`: from Phase 2 to the finale;
 * - `finale`: the finale has started (its live fight is on), for `FINALE_WINDOW_MS`;
 * - `done`: the finale is over, until the next week starts.
 * If the clock is inside the phase already, that is `now`. Looks at this week and the next.
 */
export function phaseTarget(
  to: v.InferOutput<typeof RaidPhaseBodySchema>['to'],
  now: number,
  tz: string,
): number {
  const week = weekIdFor(now, tz);
  for (const id of [week, addWeeks(week, 1)]) {
    const t = eventTimes(id, tz);
    const nextStart = eventTimes(addWeeks(id, 1), tz).weekStart;
    const range: Record<typeof to, readonly [number, number]> = {
      preparation: [t.weekStart, t.phase1],
      phase1: [t.phase1, t.phase2],
      phase2: [t.phase2, t.finale],
      finale: [t.finale, t.finale + FINALE_WINDOW_MS],
      done: [t.finale + FINALE_WINDOW_MS, nextStart],
    };
    const [from, until] = range[to];
    const candidate = Math.max(now, from);
    if (candidate < until) return candidate;
  }
  throw new DevError(409, 'no_such_phase');
}
