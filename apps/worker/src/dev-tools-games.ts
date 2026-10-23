/**
 * Dev tools for the Valley Games. Staging only (see `dev-tools.ts`). Each function runs inside the
 * tool's one transaction and acts on the caller's guild.
 *
 * - `games-bots`: makes sure the guild has `count` bots (default 6): the raid's guests (`dev-guest-<n>`,
 *   which stay in the raid roster as they were), each with at least `GAMES_BOT_CREATURES` creatures near
 *   the caller's level, entered in every event of the next show day. Bots take part in the show and get
 *   no prizes. There is no auto-entry: run it again for the next day (or use `games-run-now`).
 * - `games-run-now`: enters the guild's bots in the next show day's events they left empty, then locks
 *   that day now (snapshots and the live seed, as the scheduler would) and starts its show in
 *   `showInSeconds` (default 15); the award follows at its end.
 * - `games-reset`: forgets the latest locked day so it can be played again (what it paid stays).
 */
import type * as v from 'valibot';
import type { ToolCtx } from './dev-context';
import type { GamesBotsBodySchema, GamesRunNowBodySchema } from './dev-schemas';
import { createGuest, guestId, referenceLevel } from './dev-tools-raid';
import { BOT_PREFIX } from './games-store';

type Body<S extends v.GenericSchema> = v.InferOutput<S>;

/** Creatures each bot has at least: four events and a team of three. */
export const GAMES_BOT_CREATURES = 6;
const DEFAULT_BOTS = 6;
const DEFAULT_SHOW_IN_S = 15;

export function gamesBots(ctx: ToolCtx, body: Body<typeof GamesBotsBodySchema>) {
  const count = body.count ?? DEFAULT_BOTS;
  const level = referenceLevel(ctx);
  const ids: string[] = [];
  for (let n = 1; n <= count; n++) {
    createGuest(ctx, n, level, GAMES_BOT_CREATURES);
    ids.push(guestId(n));
  }
  ctx.games.enterBots(ids);
  return { bots: count };
}

/** The guild's bots: the dev guests that have creatures. */
function botIds(ctx: ToolCtx): string[] {
  return ctx.sql
    .exec<{ user_id: string }>(
      'SELECT DISTINCT user_id FROM creatures WHERE user_id LIKE ? ORDER BY user_id',
      `${BOT_PREFIX}%`,
    )
    .toArray()
    .map((r) => r.user_id);
}

export function gamesRunNow(ctx: ToolCtx, body: Body<typeof GamesRunNowBodySchema>) {
  ctx.games.enterBots(botIds(ctx));
  return ctx.games.runNow((body.showInSeconds ?? DEFAULT_SHOW_IN_S) * 1000);
}

export function gamesReset(ctx: ToolCtx) {
  return ctx.games.resetLatest();
}
