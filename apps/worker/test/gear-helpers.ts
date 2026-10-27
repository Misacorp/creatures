import {
  createSeededRng,
  itemOf,
  rollItem,
  type GearRarity,
  type PartsBundle,
} from '@creatures/game';
import { creditParts, insertItem } from '../src/gear-store';
import type { CoreContext } from './helpers';
import { sessionCaller, type Json } from './kit';
import { rows, seedPlayer, type SeedOptions } from './raid-helpers';

export interface GiveOptions {
  rarity?: GearRarity;
  /** Item level, 1 to 20. Default 1. */
  level?: number;
  /** Lines to give: `[id, tier index 0 to 4]`; rolled from a seed when absent. */
  lines?: [string, number][];
  seed?: string;
  now?: number;
  source?: string;
}

/**
 * Puts an item of a base straight in the table (not through a drop), for tests of what happens to
 * items: its lines are given, or rolled from a seeded stream. Returns the item's id.
 */
export function giveItem(
  sql: SqlStorage,
  userId: string,
  baseId: string,
  o: GiveOptions = {},
): string {
  const rarity = o.rarity ?? 'common';
  const level = o.level ?? 1;
  const item =
    o.lines === undefined
      ? rollItem(createSeededRng(`${o.seed ?? 'give'}:${baseId}:${rarity}`), {
          baseId,
          rarity,
          itemLevel: level,
        })
      : itemOf(
          baseId,
          rarity,
          level,
          o.lines.map(([id, tier]) => ({ id, tier })),
        );
  return insertItem(sql, userId, item, { source: o.source ?? 'test', now: o.now ?? 0 });
}

export interface Api {
  id: string;
  creatureIds: string[];
  call: (method: string, path: string, body?: unknown) => Promise<Json>;
}

/** A seeded player (creatures straight into the tables) with a session that is renewed as the test clock moves. */
export async function apiPlayer(
  ctx: CoreContext,
  n: number,
  options: SeedOptions = {},
): Promise<Api> {
  const seeded = seedPlayer(ctx, n, { level: 5, ...options });
  const { call } = await sessionCaller(ctx, { id: seeded.id, displayName: seeded.name });
  return { id: seeded.id, creatureIds: seeded.creatureIds, call };
}

/** The welcome kit is already given (so tests that count items start from nothing). */
export const skipWelcome = (ctx: CoreContext, userId: string): void => {
  ctx.sql.exec(
    "INSERT INTO gear_grants (user_id, key, source, result_json, created_at) VALUES (?, 'welcome', 'welcome', ?, ?)",
    userId,
    JSON.stringify({ gear: [], converted: [], parts: {}, blueprints: [] }),
    ctx.clock.t,
  );
};

/** Teaches a blueprint with some marks. */
export const learnBase = (ctx: CoreContext, userId: string, baseId: string, marks = 0): void => {
  ctx.sql.exec(
    "INSERT INTO blueprints (user_id, base_id, rarity, learned_at, marks) VALUES (?, ?, 'common', ?, ?)",
    userId,
    baseId,
    ctx.clock.t,
    marks,
  );
};

export const giveParts = (ctx: CoreContext, userId: string, bundle: PartsBundle): void =>
  creditParts(ctx.sql, userId, bundle);

/** Sets a creature's Crafting XP (level 2 from 100, 3 from 250, 6 from 1,000, 10 from 5,500). */
export const setCraftingXp = (
  ctx: CoreContext,
  userId: string,
  creatureId: string,
  xp: number,
): void => {
  ctx.sql.exec(
    `INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, ?)
     ON CONFLICT(user_id, creature_id) DO UPDATE SET xp = excluded.xp`,
    userId,
    creatureId,
    xp,
  );
};

export function essenceOf(ctx: CoreContext, userId: string): number {
  return (
    rows<{ amount: number }>(
      ctx.sql,
      "SELECT amount FROM balances WHERE user_id = ? AND currency = 'essence'",
      userId,
    )[0]?.amount ?? 0
  );
}

/** Marks items for dismantling (`marked` false unmarks them). */
export const markItems = (p: Api, itemIds: string[], marked = true) =>
  p.call('POST', '/api/gear/mark', { itemIds, marked });

/** Dismantles the marked pile with a creature: the exact items the player saw. */
export const dismantlePile = (
  p: Api,
  creatureId: string,
  itemIds: string[],
  idempotencyKey: string = crypto.randomUUID(),
) => p.call('POST', '/api/gear/dismantle', { creatureId, itemIds, idempotencyKey });

/** Marks the items and dismantles them with the creature, as the screen does (the answer of the dismantle). */
export async function markAndDismantle(
  p: Api,
  creatureId: string,
  itemIds: string[],
): Promise<Json> {
  const marked = await markItems(p, itemIds);
  if (marked.status !== 200) return marked;
  return dismantlePile(p, creatureId, itemIds);
}

/**
 * An open timed dismantle job as it was started before 2026-10-27 (the start is refused now, a running job
 * still finishes): the items are gone from the bag, and the row waits for its claim at `endsAt`.
 */
export function seedOldDismantleJob(
  ctx: CoreContext,
  userId: string,
  creatureId: string,
  items: { baseId: string; rarity: GearRarity; itemLevel: number }[],
  endsAt: number,
  extra: Record<string, unknown> = {},
): string {
  const id = crypto.randomUUID();
  ctx.sql.exec(
    `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
     VALUES (?, ?, ?, 'dismantle', NULL, ?, ?, ?)`,
    id,
    userId,
    creatureId,
    JSON.stringify({ cost: {}, items, level: 1, ...extra }),
    ctx.clock.t,
    endsAt,
  );
  return id;
}
