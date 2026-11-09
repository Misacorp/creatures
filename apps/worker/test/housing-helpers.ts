/**
 * Shared by the housing tests: a guild core with housing on and a seeded hook RNG, a player with a session, and shortcuts that put
 * holdings straight into the tables (the way a long-running game would have them).
 */
import { createSeededRng, housing as content } from '@creatures/game';
import * as v from 'valibot';
import { expect } from 'vitest';
import { creditParts } from '../src/gear-store';
import { addItem } from '../src/housing-store';
import { ON, player, type Dev } from './dev-helpers';
import { runCore, type CoreContext } from './helpers';
import { give } from './kit';
import { nextGuild } from './raid-helpers';

export { content };

/** Runs `fn` in a guild with housing on. */
export function runHouse<R>(
  fn: (ctx: CoreContext) => Promise<R>,
  options: { dev?: boolean; housing?: boolean } = {},
): Promise<R> {
  return runCore(nextGuild(), fn, {
    housing: options.housing ?? true,
    housingRng: createSeededRng('housing-tests'),
    ...(options.dev === true ? ON : {}),
  });
}

/** The body of a response parsed with a housing answer schema (the answers must match exactly). */
export function parsed<S extends v.GenericSchema>(
  schema: S,
  res: { status: number; body: unknown },
) {
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return v.parse(schema, res.body);
}

/** Puts luxury materials, Acorns and scrap straight into a player's holdings. */
export function stock(
  ctx: CoreContext,
  userId: string,
  what: {
    materials?: Record<string, number>;
    bait?: number;
    scrap?: number;
    pieces?: Record<string, number>;
    blueprints?: string[];
  },
): void {
  for (const [id, n] of Object.entries(what.materials ?? {})) {
    addItem(ctx.sql, userId, 'material', id, n, n, ctx.clock.t);
  }
  for (const [id, n] of Object.entries(what.pieces ?? {})) {
    addItem(ctx.sql, userId, 'piece', id, n, 0, ctx.clock.t);
  }
  for (const id of what.blueprints ?? []) {
    ctx.sql.exec(
      `INSERT INTO house_items (user_id, kind, item_id, count, fresh, at) VALUES (?, 'blueprint', ?, 1, 0, ?)
       ON CONFLICT DO NOTHING`,
      userId,
      id,
      ctx.clock.t,
    );
  }
  if (what.bait !== undefined) give(ctx, userId, { bait: what.bait });
  if (what.scrap !== undefined) creditParts(ctx.sql, userId, { scrap: what.scrap });
}

/** A seeded player (creatures, a session) whose house is already made. */
export async function householder(ctx: CoreContext, n = 1): Promise<Dev> {
  const p = await player(ctx, n);
  expect((await p.call('GET', '/api/house')).status).toBe(200);
  return p;
}
