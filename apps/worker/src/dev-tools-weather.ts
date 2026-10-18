/**
 * The weather dev tool (staging only, see `dev-tools.ts`): sets the Boon and Omen of today or tomorrow by
 * hand, at the strength the server's Boss Rank gives, so each can be looked at and what it does can be
 * tested (a trip sent, a craft started or a dungeon run made under it). Not subject to the rules of the
 * real draw (no Omen below Boss Rank 3, none in a Festival week): the tool is for testing what they look like.
 */
import { RULES } from '@creatures/game';
import type { ToolCtx } from './dev-context';
import type { SetWeatherBodySchema } from './dev-schemas';
import type * as v from 'valibot';
import { addDays, gameDay } from './time';

export function setWeather(ctx: ToolCtx, body: v.InferOutput<typeof SetWeatherBodySchema>) {
  const today = gameDay(ctx.now, ctx.tz, RULES.daily.reset);
  const day = body.day === 'today' ? today : addDays(today, 1);
  ctx.weather.force(day, body.boon, body.omen);
  return { day, boon: body.boon, omen: body.omen };
}
