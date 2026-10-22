/**
 * Dev tools for the Valley Games. Staging only (see `dev-tools.ts`). Each function runs inside the
 * tool's one transaction and acts on the caller's guild.
 *
 * - `games-bots`: makes sure the guild has `count` bots (default 6): the raid's guests (`dev-guest-<n>`,
 *   which stay in the raid roster as they were), each with at least `GAMES_BOT_CREATURES` creatures near
 *   the caller's level, auto-entered. Bots take part in the show and the post and get no prizes.
 * - `games-run-now`: locks the next show day now (auto-entry, snapshots and the live seed, as the
 *   scheduler would) and starts its show in `showInSeconds` (default 15); the award follows at its end.
 * - `games-reset`: forgets the latest locked day so it can be played again (what it paid stays).
 */
import type * as v from 'valibot';
import type { ToolCtx } from './dev-context';
import type { GamesBotsBodySchema, GamesRunNowBodySchema } from './dev-schemas';
import { createGuest, guestId, referenceLevel } from './dev-tools-raid';
import { setAuto } from './games-store';

type Body<S extends v.GenericSchema> = v.InferOutput<S>;

/** Creatures each bot has at least: four events and a team of three. */
export const GAMES_BOT_CREATURES = 6;
const DEFAULT_BOTS = 6;
const DEFAULT_SHOW_IN_S = 15;

export function gamesBots(ctx: ToolCtx, body: Body<typeof GamesBotsBodySchema>) {
  const count = body.count ?? DEFAULT_BOTS;
  const level = referenceLevel(ctx);
  for (let n = 1; n <= count; n++) {
    createGuest(ctx, n, level, GAMES_BOT_CREATURES);
    setAuto(ctx.sql, guestId(n), true, ctx.now);
  }
  return { bots: count };
}

export function gamesRunNow(ctx: ToolCtx, body: Body<typeof GamesRunNowBodySchema>) {
  return ctx.games.runNow((body.showInSeconds ?? DEFAULT_SHOW_IN_S) * 1000);
}

export function gamesReset(ctx: ToolCtx) {
  return ctx.games.resetLatest();
}
