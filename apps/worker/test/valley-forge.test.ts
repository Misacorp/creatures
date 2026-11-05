/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 3: the Forge loop on the server (migration 58, `valley-forge.ts`, `valley-orders.ts`, the anvil, order and exchange
 * routes). With the flag on a posted smith works its queue: pieces take scrap and a shard from the shelf when they start, pile on the
 * anvil's floor, and come home into the bag on arrival; the bag is a stored counter of the items not worn; Workshop jobs answer 404.
 * With the flag off the routes are not there and jobs work as before.
 */
import { VALLEY_RULES, ValleyViewSchema, createSeededRng, type Rng } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import { runCore, type CoreContext } from './helpers';
import { HOUR, give, newKey, sessionCaller, type SessionCaller } from './kit';
import { count, nextGuild, seedPlayer } from './raid-helpers';
import { creditParts, learnBlueprint } from '../src/gear-store';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true, dailyAllowance: true } as const;
const FLAG_OFF = { ...ON, dailyAllowance: true } as const;
const R = VALLEY_RULES;
/** A tide creature, and a tide hat blueprint (a base every blueprint list has from level 1). */
const TIDE = 'splashet';
const HAT = 'kelp-cap';
/**
 * A source whose first draw is the highest point of the odds (the first draw of a test is a piece's rarity), then a seeded stream
 * (a source stuck at the top would never end a rejection-sampled draw). WORST: always the lowest point, so commons and crits.
 */
const best = (): Rng => {
  const rest = createSeededRng('best-then');
  let first = true;
  return {
    nextU32: () => {
      if (!first) return rest.nextU32();
      first = false;
      return 0xffffffff;
    },
  };
};
const WORST: Rng = { nextU32: () => 0 };

interface P {
  id: string;
  creatureIds: string[];
  api: SessionCaller<Json['body']>;
  state: () => Promise<Json>;
}

async function newPlayer(
  ctx: CoreContext,
  n: number,
  species: string[] = [TIDE, 'mistnewt', 'coralynx'],
  level = 3,
): Promise<P> {
  const seeded = seedPlayer(ctx, n, { creatures: species.length, level, species });
  const api = await sessionCaller<Json['body']>(ctx, { id: seeded.id, displayName: seeded.name });
  return {
    id: seeded.id,
    creatureIds: seeded.creatureIds,
    api,
    state: () => api.call('GET', '/api/state'),
  };
}

const buyAnvil = (p: P, key = newKey('anvil')) =>
  p.api.call('POST', '/api/valley/anvil/buy', { idempotencyKey: key });
const order = (p: P, body: Record<string, unknown>) =>
  p.api.call('POST', '/api/valley/order', body);
const post = (p: P, body: Record<string, unknown>) => p.api.call('POST', '/api/valley/seat', body);
const view = async (p: P) => v.parse(ValleyViewSchema, (await p.state()).body.valley);

const bait = (sql: SqlStorage, userId: string): number =>
  sql
    .exec<{ amount: number }>(
      "SELECT amount FROM balances WHERE user_id = ? AND currency = 'bait'",
      userId,
    )
    .toArray()[0]?.amount ?? 0;
const part = (sql: SqlStorage, userId: string, kind: string): number =>
  sql
    .exec<{ amount: number }>(
      'SELECT amount FROM parts WHERE user_id = ? AND kind = ?',
      userId,
      kind,
    )
    .toArray()[0]?.amount ?? 0;
const seatRow = (sql: SqlStorage, seatId: string) =>
  sql.exec('SELECT * FROM valley_seats WHERE seat_id = ?', seatId).one();
const bagRows = (sql: SqlStorage, userId: string): number =>
  sql
    .exec<{
      n: number;
    }>('SELECT COUNT(*) AS n FROM gear_items WHERE user_id = ? AND equipped_on IS NULL', userId)
    .one().n;
const counter = (sql: SqlStorage, userId: string): number | null =>
  sql.exec<{ items: number }>('SELECT items FROM valley_bag WHERE user_id = ?', userId).toArray()[0]
    ?.items ?? null;

/** A player with the first anvil bought, a smith posted, the blueprint known and a stocked shelf. */
async function smithing(
  ctx: CoreContext,
  n: number,
  shelf: { scrap?: number; shards?: number } = {},
): Promise<P & { seatId: string; smithId: string }> {
  const p = await newPlayer(ctx, n);
  await p.state();
  const bought = await buyAnvil(p);
  expect(bought.status).toBe(200);
  const seatId = bought.body.seatId as string;
  const smithId = p.creatureIds[0] as string;
  expect((await post(p, { seatId, creatureId: smithId })).status).toBe(200);
  learnBlueprint(ctx.sql, p.id, HAT, ctx.clock.t);
  creditParts(ctx.sql, p.id, {
    scrap: shelf.scrap ?? 1000,
    'tide-shard': shelf.shards ?? 50,
  });
  return { ...p, seatId, smithId };
}

describe('migration 58: the Forge', () => {
  it('creates the tables, indexes and columns, empty, and valley-fresh clears them', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const columns = (table: string): string[] =>
          ctx.sql
            .exec<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`)
            .toArray()
            .map((r) => r.name);
        expect(columns('forge_orders')).toEqual([
          'order_id',
          'seat_id',
          'user_id',
          'position',
          'blueprint_id',
          'element',
          'count',
          'made',
          'reach',
          'for_team',
          'created_at',
        ]);
        expect(columns('forge_floor')).toContain('item_level');
        expect(columns('valley_bag')).toEqual(['user_id', 'items']);
        expect(columns('valley_creatures')).toContain('smith_hours');
        expect(columns('valley_players')).toContain('forge_carry');
        const indexes = (table: string): string[] =>
          ctx.sql
            .exec<{ name: string }>(`SELECT name FROM pragma_index_list('${table}')`)
            .toArray()
            .map((r) => r.name);
        expect(indexes('forge_orders')).toEqual(
          expect.arrayContaining(['forge_orders_user', 'forge_orders_seat']),
        );
        expect(indexes('forge_floor')).toEqual(
          expect.arrayContaining(['forge_floor_user', 'forge_floor_seat']),
        );
        const p = await smithing(ctx, 1);
        expect(
          (await order(p, { action: 'add', seatId: p.seatId, blueprintId: HAT, count: 2 })).status,
        ).toBe(200);
        ctx.sql.exec(
          `INSERT INTO forge_floor (piece_id, user_id, seat_id, blueprint_id, element, rarity, item_level, made_at)
           VALUES ('f1', ?, ?, ?, 0, 0, 1, 0)`,
          p.id,
          p.seatId,
          HAT,
        );
        expect(count(ctx.sql, 'forge_orders')).toBe(1);
        expect((await p.api.call('POST', '/api/dev/valley-fresh', {})).status).toBe(200);
        for (const table of ['forge_orders', 'forge_floor', 'valley_bag', 'valley_seats']) {
          expect(count(ctx.sql, table)).toBe(0);
        }
      },
      SYSTEMS,
    );
  });
});

describe('the flag: the Forge on, Workshop jobs off', () => {
  it('answers 404 on every Forge route with the flag off, before reading the body', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        for (const path of ['/api/valley/anvil/buy', '/api/valley/order', '/api/valley/exchange']) {
          const res = await p.api.call('POST', path, { nonsense: true });
          expect(res.status).toBe(404);
        }
        expect(count(ctx.sql, 'forge_orders')).toBe(0);
      },
      FLAG_OFF,
    );
  });

  it('answers 404 on the job routes with the flag on before the body is read, and keeps them with it off', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        expect((await p.api.call('POST', '/api/workshop/jobs', { nonsense: 1 })).status).toBe(404);
        expect(
          (await p.api.call('POST', `/api/workshop/jobs/${crypto.randomUUID()}/claim`, {})).status,
        ).toBe(404);
      },
      SYSTEMS,
    );
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        // Flag off: the route exists (a body no schema accepts is a 400, not a 404).
        expect((await p.api.call('POST', '/api/workshop/jobs', { nonsense: 1 })).status).toBe(400);
        expect(
          (await p.api.call('POST', `/api/workshop/jobs/${crypto.randomUUID()}/claim`, {})).status,
        ).toBe(400);
      },
      FLAG_OFF,
    );
  });

  it('keeps job DMs quiet with the flag on', async () => {
    const { scanDm, nextDmDueAt } = await import('../src/dm-notify');
    await runCore(
      nextGuild(),
      (ctx) => {
        const p = seedPlayer(ctx, 1, { creatures: 1 });
        ctx.sql.exec(
          'INSERT INTO dm_prefs (user_id, job_on_at) VALUES (?, ?)',
          p.id,
          ctx.clock.t - 10 * HOUR,
        );
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
           VALUES (?, ?, ?, 'craft', NULL, '{}', ?, ?)`,
          crypto.randomUUID(),
          p.id,
          p.creatureIds[0],
          ctx.clock.t - 3 * HOUR,
          ctx.clock.t - HOUR,
        );
        const context = { now: ctx.clock.t, tz: 'Europe/Helsinki', realAt: (t: number) => t };
        expect(scanDm(ctx.sql, { ...context, valleySystems: true })).toBe(0);
        expect(nextDmDueAt(ctx.sql, ctx.clock.t - 2 * HOUR, 'Europe/Helsinki', true)).toBeNull();
        expect(scanDm(ctx.sql, context)).toBe(1);
      },
      SYSTEMS,
    );
  });
});

describe('anvils: the price ladder and the keyed buy (V-POST-2, V-FORGE-6)', () => {
  it('sells the first anvil free, the second for Acorns and scrap, and no more at Forge level 1', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const before = await view(p);
        expect(before.anvilPrices).toEqual({
          owned: 0,
          max: 2,
          next: { acorns: 0, scrap: 0 },
          ladder: [
            { acorns: R.seats.anvilPrices[0], scrap: R.seats.anvilScrap[0] },
            { acorns: R.seats.anvilPrices[1], scrap: R.seats.anvilScrap[1] },
          ],
        });
        const first = await buyAnvil(p);
        expect(first.status).toBe(200);
        expect(first.body.price).toEqual({ acorns: 0, scrap: 0 });
        // Too poor in Acorns, then in scrap: nothing is charged either time.
        const poor = await buyAnvil(p);
        expect(poor.status).toBe(409);
        expect(poor.body).toEqual({ error: 'insufficient_funds' });
        give(ctx, p.id, { bait: 500 });
        const acorns = bait(ctx.sql, p.id);
        const noScrap = await buyAnvil(p);
        expect(noScrap.status).toBe(409);
        expect(noScrap.body).toEqual({ error: 'insufficient_parts' });
        expect(bait(ctx.sql, p.id)).toBe(acorns);
        const scrap0 = part(ctx.sql, p.id, 'scrap');
        creditParts(ctx.sql, p.id, { scrap: 100 });
        const second = await buyAnvil(p);
        expect(second.status).toBe(200);
        expect(second.body.price).toEqual({
          acorns: R.seats.anvilPrices[1],
          scrap: R.seats.anvilScrap[1],
        });
        expect(bait(ctx.sql, p.id)).toBe(acorns - (R.seats.anvilPrices[1] as number));
        expect(part(ctx.sql, p.id, 'scrap')).toBe(scrap0 + 100 - (R.seats.anvilScrap[1] as number));
        const third = await buyAnvil(p);
        expect(third.status).toBe(409);
        expect(third.body).toEqual({ error: 'no_more_anvils' });
        expect((await view(p)).anvils).toHaveLength(2);
        expect(count(ctx.sql, 'valley_seats')).toBe(2);
      },
      SYSTEMS,
    );
  });

  it('is idempotent: a retry returns the stored anvil, charges nothing, and a reused key is a conflict', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        await buyAnvil(p);
        give(ctx, p.id, { bait: 500 });
        creditParts(ctx.sql, p.id, { scrap: 100 });
        const key = newKey('anvil-twice');
        const a = await buyAnvil(p, key);
        const acorns = bait(ctx.sql, p.id);
        const scrap = part(ctx.sql, p.id, 'scrap');
        const b = await buyAnvil(p, key);
        expect(b.status).toBe(200);
        expect(b.body.seatId).toBe(a.body.seatId);
        expect(bait(ctx.sql, p.id)).toBe(acorns);
        expect(part(ctx.sql, p.id, 'scrap')).toBe(scrap);
        expect(count(ctx.sql, 'valley_seats')).toBe(2);
        const clash = await p.api.call('POST', '/api/valley/seat/buy', { idempotencyKey: key });
        expect(clash.status).toBe(409);
        expect(clash.body).toEqual({ error: 'key_conflict' });
        const rows = ctx.sql
          .exec<{ idempotency_key: string }>(
            "SELECT idempotency_key FROM ledger WHERE user_id = ? AND source = 'valley_anvil'",
            p.id,
          )
          .toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.idempotency_key).toBe(`anvil:${key}`);
      },
      SYSTEMS,
    );
  });

  it('keeps scouts and anvils apart: an anvil is no scout seat and a destination is refused', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1);
        expect((await post(p, { seatId: p.seatId, destination: 'tidepools' })).status).toBe(400);
        const v1 = await view(p);
        expect(v1.seats).toHaveLength(0);
        expect(v1.anvils).toHaveLength(1);
        expect(v1.creatures.find((c) => c.id === p.smithId)).toMatchObject({
          state: 'smithing',
          seatId: p.seatId,
        });
        // A scout seat takes no anvil kit, an anvil no scout kit.
        const scout = await p.api.call('POST', '/api/valley/seat/buy', {
          idempotencyKey: newKey('seat'),
        });
        expect(scout.status).toBe(200);
        give(ctx, p.id, { bait: 3000 });
        for (const kit of ['tongs', 'lure']) {
          expect(
            (
              await p.api.call('POST', '/api/valley/kit', {
                action: 'buy',
                kit,
                idempotencyKey: newKey('kit'),
              })
            ).status,
          ).toBe(200);
        }
        const set = (seatId: string, kit: string) =>
          p.api.call('POST', '/api/valley/kit', { action: 'set', seatId, kit });
        expect((await set(p.seatId, 'lure')).status).toBe(400);
        expect((await set(scout.body.seatId as string, 'tongs')).status).toBe(400);
        expect((await set(p.seatId, 'tongs')).status).toBe(200);
        expect((await set(p.seatId, 'loupe')).status).toBe(409);
        expect((await view(p)).anvils[0]?.kit).toBe('tongs');
      },
      SYSTEMS,
    );
  });
});

describe('orders: the queue (V-FORGE-1)', () => {
  it('adds, edits and removes orders, at most the queue size, for known blueprints only', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1);
        const add = (body: Record<string, unknown>) =>
          order(p, { action: 'add', seatId: p.seatId, ...body });
        expect((await add({ blueprintId: 'nonsense', count: 1 })).status).toBe(400);
        expect((await add({ blueprintId: 'brine-hood', count: 1 })).status).toBe(409);
        expect((await add({ blueprintId: HAT })).status).toBe(400);
        expect((await add({ blueprintId: HAT, count: 0 })).status).toBe(400);
        expect((await add({ blueprintId: HAT, count: 100 })).status).toBe(400);
        expect((await add({ forTeam: true, blueprintId: HAT })).status).toBe(400);
        const first = await add({ blueprintId: HAT, count: 3, reach: 'rare' });
        expect(first.status).toBe(200);
        const team = await add({ forTeam: true });
        expect(team.status).toBe(200);
        expect((await add({ blueprintId: HAT, count: 1 })).status).toBe(200);
        const full = await add({ blueprintId: HAT, count: 1 });
        expect(full.status).toBe(409);
        expect(full.body).toEqual({ error: 'queue_full' });
        const queue = (await view(p)).anvils[0]!.orders;
        expect(queue.map((o) => [o.blueprintId, o.count, o.forTeam, o.reach])).toEqual([
          [HAT, 3, false, 'rare'],
          [null, 0, true, 'none'],
          [HAT, 1, false, 'none'],
        ]);
        expect(queue[0]?.needs).toEqual({
          scrap: R.forge.scrap,
          shardElement: 'tide',
          shard: R.forge.shard,
          essence: R.forge.reach.rare.essence,
        });
        const id = first.body.orderId as string;
        expect(
          (await order(p, { action: 'edit', orderId: id, count: 5, reach: 'none' })).status,
        ).toBe(200);
        expect((await order(p, { action: 'edit', orderId: id, count: 0 })).status).toBe(400);
        expect(
          (await order(p, { action: 'edit', orderId: team.body.orderId, count: 2 })).status,
        ).toBe(400);
        expect(
          ctx.sql.exec('SELECT count, reach FROM forge_orders WHERE order_id = ?', id).one(),
        ).toEqual({ count: 5, reach: 'none' });
        expect((await order(p, { action: 'remove', orderId: id })).status).toBe(200);
        expect(count(ctx.sql, 'forge_orders')).toBe(2);
        expect((await add({ blueprintId: HAT, count: 1 })).status).toBe(200);
      },
      SYSTEMS,
    );
  });

  it("answers the same 404 for another player's anvil or order, and for a scout seat", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1);
        const q = await newPlayer(ctx, 2);
        await q.state();
        learnBlueprint(ctx.sql, q.id, HAT, ctx.clock.t);
        const theirs = await order(q, {
          action: 'add',
          seatId: p.seatId,
          blueprintId: HAT,
          count: 1,
        });
        expect(theirs.status).toBe(404);
        const mine = await order(p, {
          action: 'add',
          seatId: p.seatId,
          blueprintId: HAT,
          count: 1,
        });
        const stolen = await order(q, { action: 'remove', orderId: mine.body.orderId });
        expect(stolen.status).toBe(404);
        expect(count(ctx.sql, 'forge_orders')).toBe(1);
        const scout = await p.api.call('POST', '/api/valley/seat/buy', {
          idempotencyKey: newKey('seat'),
        });
        const wrong = await order(p, {
          action: 'add',
          seatId: scout.body.seatId,
          blueprintId: HAT,
          count: 1,
        });
        expect(wrong.status).toBe(404);
        expect(wrong.body).toEqual(theirs.body);
        expect((await order(p, { action: 'add', seatId: p.seatId, extra: 1 })).status).toBe(400);
      },
      SYSTEMS,
    );
  });
});

describe('making pieces (V-FORGE-3, 4, 5, 7, 9)', () => {
  it('takes scrap and a shard when a piece starts, piles pieces on the floor, brings them home on arrival at the fire level', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1);
        const added = await order(p, {
          action: 'add',
          seatId: p.seatId,
          blueprintId: HAT,
          count: 3,
        });
        expect(added.status).toBe(200);
        // The first piece starts at the settle that follows the order (inputs are taken when it starts).
        const scrap0 = part(ctx.sql, p.id, 'scrap');
        const shards0 = part(ctx.sql, p.id, 'tide-shard');
        // Small steps (inside a visit) so pieces pile up on the floor: 3 pieces take 48 h.
        for (let i = 0; i < 100; i++) {
          ctx.clock.t += 25 * 60_000;
          await p.state();
        }
        // 100 x 25 min = 41.7 h: two pieces done and a third on its way (it took its inputs when it started, after the order was placed).
        const seat = seatRow(ctx.sql, p.seatId);
        expect(seat.floor_count).toBe(2);
        expect(seat.piece_active).toBe(1);
        expect(part(ctx.sql, p.id, 'scrap')).toBe(scrap0 - 2 * R.forge.scrap);
        expect(part(ctx.sql, p.id, 'tide-shard')).toBe(shards0 - 2 * R.forge.shard);
        expect(count(ctx.sql, 'forge_floor')).toBe(2);
        expect(bagRows(ctx.sql, p.id)).toBe(0);
        // Coming back after a break is an arrival: the floor comes home, rolled now, best first.
        ctx.clock.t += 40 * HOUR;
        const home = await view(p);
        expect(home.arrived).toBe(true);
        expect(count(ctx.sql, 'forge_floor')).toBe(0);
        expect(bagRows(ctx.sql, p.id)).toBe(3);
        const items = ctx.sql
          .exec<{ base_id: string; item_level: number; equipped_on: string | null }>(
            'SELECT base_id, item_level, equipped_on FROM gear_items WHERE user_id = ?',
            p.id,
          )
          .toArray();
        expect(items.every((i) => i.base_id === HAT && i.item_level === 1)).toBe(true);
        expect(home.forge.bag).toEqual({ count: 3, cap: R.forge.bag });
        expect(counter(ctx.sql, p.id)).toBe(3);
        // The order made its count and left the queue; the smith tinkers now.
        expect(home.anvils[0]?.orders).toEqual([]);
        expect(home.anvils[0]?.tinkering?.reason).toBe('idle');
        expect(home.anvils[0]?.floor.count).toBe(0);
        expect(home.anvils[0]?.mastery.hours).toBeGreaterThan(70);
      },
      { ...SYSTEMS, gearRng: WORST },
    );
  });

  it('draws the rarity when the piece starts, from the server source, and rolls the item at the piece rarity', async () => {
    for (const [rng, rarity] of [
      [best(), 'epic'],
      [WORST, 'common'],
    ] as const) {
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await smithing(ctx, 1);
          await order(p, { action: 'add', seatId: p.seatId, blueprintId: HAT, count: 1 });
          const started = await view(p);
          expect(started.anvils[0]?.piece?.rarity).toBe(rarity === 'epic' ? 2 : 0);
          ctx.clock.t += 20 * HOUR;
          await p.state();
          const made = ctx.sql
            .exec<{ rarity: string }>('SELECT rarity FROM gear_items WHERE user_id = ?', p.id)
            .toArray();
          expect(made.map((m) => m.rarity)).toEqual([rarity]);
        },
        { ...SYSTEMS, gearRng: rng },
      );
    }
  });

  it('waits on a missing shard and says which, then goes on when it arrives (V-FORGE-4)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1, { shards: 0 });
        await order(p, { action: 'add', seatId: p.seatId, blueprintId: HAT, count: 1 });
        ctx.clock.t += 30 * HOUR;
        const waiting = await view(p);
        const anvil = waiting.anvils[0]!;
        expect(anvil.piece).toBeNull();
        expect(anvil.tinkering).toMatchObject({ reason: 'shard', shardElement: 'tide' });
        expect(anvil.tinkering?.sinceHours).toBeGreaterThan(0);
        expect(anvil.orders[0]?.waiting).toBe('shard');
        expect(count(ctx.sql, 'forge_floor')).toBe(0);
        // The tinkering trickle paid some scrap meanwhile and the smith grew in smithing.
        expect(waiting.forge.shelf.scrap).toBeGreaterThan(1000);
        creditParts(ctx.sql, p.id, { 'tide-shard': 1 });
        ctx.clock.t += 20 * HOUR;
        await p.state();
        expect(bagRows(ctx.sql, p.id)).toBe(1);
      },
      { ...SYSTEMS, gearRng: WORST },
    );
  });

  it('settling twice at the same now changes nothing, and splitting the time changes nothing', async () => {
    const snapshot = (ctx: CoreContext, userId: string): unknown => ({
      seats: ctx.sql.exec('SELECT * FROM valley_seats WHERE user_id = ?', userId).toArray(),
      parts: ctx.sql.exec('SELECT * FROM parts WHERE user_id = ? ORDER BY kind', userId).toArray(),
      orders: ctx.sql
        .exec('SELECT made, count FROM forge_orders WHERE user_id = ?', userId)
        .toArray(),
      floor: count(ctx.sql, 'forge_floor'),
      bag: counter(ctx.sql, userId),
    });
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1);
        await order(p, { action: 'add', seatId: p.seatId, blueprintId: HAT, count: 9 });
        ctx.clock.t += 40 * HOUR;
        await p.state();
        const once = snapshot(ctx, p.id);
        await p.api.call('GET', '/api/state');
        expect(snapshot(ctx, p.id)).toEqual(once);
      },
      { ...SYSTEMS, gearRng: WORST },
    );
    const run = async (steps: number): Promise<unknown> => {
      let out: unknown;
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await smithing(ctx, 1);
          await order(p, { action: 'add', seatId: p.seatId, blueprintId: HAT, count: 9 });
          for (let i = 0; i < steps; i++) {
            ctx.clock.t += (40 * HOUR) / steps;
            await p.state();
          }
          const seat = seatRow(ctx.sql, p.seatId);
          out = {
            made: ctx.sql.exec('SELECT made FROM forge_orders WHERE user_id = ?', p.id).one(),
            // Pieces on the floor plus the ones brought home (every long step is an arrival that brings the floor home).
            pieces: (seat.floor_count as number) + bagRows(ctx.sql, p.id),
            smith: Math.round(
              ctx.sql
                .exec<{ h: number }>(
                  'SELECT smith_hours AS h FROM valley_creatures WHERE creature_id = ?',
                  p.smithId,
                )
                .one().h * 100,
            ),
            scrap: part(ctx.sql, p.id, 'scrap'),
          };
        },
        { ...SYSTEMS, gearRng: WORST },
      );
      return out;
    };
    // One long absence, or the same 40 hours (inside the full away share) in 2 or 4 long steps: the same pieces, the same shelf, the same hours.
    const whole = await run(1);
    expect(await run(2)).toEqual(whole);
    expect(await run(4)).toEqual(whole);
  });
});

describe('a full bag holds pieces on the floor, a full floor pauses the anvil (F-1, V-GEAR-6)', () => {
  it('leaves the pieces on the floor when the bag holds its 200, and delivers them when room is made', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1);
        await order(p, { action: 'add', seatId: p.seatId, blueprintId: HAT, count: 3 });
        ctx.sql.exec(
          'INSERT OR REPLACE INTO valley_bag (user_id, items) VALUES (?, ?)',
          p.id,
          R.forge.bag,
        );
        ctx.clock.t += 60 * HOUR;
        const held = await view(p);
        expect(held.forge.bag).toEqual({ count: R.forge.bag, cap: R.forge.bag });
        expect(held.anvils[0]?.floor.count).toBe(3);
        expect(count(ctx.sql, 'forge_floor')).toBe(3);
        expect(bagRows(ctx.sql, p.id)).toBe(0);
        // Room for two: the best two come home, one stays.
        ctx.sql.exec('UPDATE valley_bag SET items = ? WHERE user_id = ?', R.forge.bag - 2, p.id);
        ctx.clock.t += 40 * 60_000;
        await p.state();
        expect(count(ctx.sql, 'forge_floor')).toBe(1);
        expect(bagRows(ctx.sql, p.id)).toBe(2);
        expect(counter(ctx.sql, p.id)).toBe(R.forge.bag);
      },
      { ...SYSTEMS, gearRng: WORST },
    );
  });

  it('pauses a smith whose floor is full: the finished piece is held and the smith tinkers', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1);
        await order(p, { action: 'add', seatId: p.seatId, blueprintId: HAT, count: 30 });
        ctx.sql.exec(
          'INSERT OR REPLACE INTO valley_bag (user_id, items) VALUES (?, ?)',
          p.id,
          R.forge.bag,
        );
        // Keep the visit going so nothing is brought home but the bag is full anyway: 5 pieces fill the floor in 80 h.
        for (let i = 0; i < 12; i++) {
          ctx.clock.t += 10 * HOUR;
          await p.state();
        }
        const paused = await view(p);
        const anvil = paused.anvils[0]!;
        expect(anvil.floor).toMatchObject({ count: R.forge.floorPiecesPerAnvil, full: true });
        expect(anvil.tinkering?.reason).toBe('floor');
        expect(anvil.piece?.leftHours).toBeNull();
        expect(count(ctx.sql, 'forge_floor')).toBe(R.forge.floorPiecesPerAnvil);
        // Making room brings the floor home and the held piece goes to the floor at the next pass.
        ctx.sql.exec('UPDATE valley_bag SET items = 0 WHERE user_id = ?', p.id);
        ctx.clock.t += 2 * 60_000;
        await p.state();
        expect(count(ctx.sql, 'forge_floor')).toBeLessThanOrEqual(1);
        expect(bagRows(ctx.sql, p.id)).toBeGreaterThanOrEqual(5);
      },
      { ...SYSTEMS, gearRng: WORST },
    );
  });
});

describe('"for my team" (V-FORGE-1)', () => {
  it('makes pieces for the creatures with empty slots and wears them at once; what the team still needs it waits on', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // One smith and one tide creature with three empty slots, so three pieces.
        // Level 13: the gear slots a creature may wear open at 1, 7 and 13 until combat v2's gear lands (V-GEAR-3).
        const p = await newPlayer(ctx, 1, [TIDE, 'cindle'], 13);
        await p.state();
        const bought = await buyAnvil(p);
        const seatId = bought.body.seatId as string;
        await post(p, { seatId, creatureId: p.creatureIds[1] });
        creditParts(ctx.sql, p.id, { scrap: 1000, 'tide-shard': 50 });
        expect((await order(p, { action: 'add', seatId, forTeam: true })).status).toBe(200);
        ctx.clock.t += 80 * HOUR;
        const done = await view(p);
        const worn = ctx.sql
          .exec<{ equipped_on: string; slot: string; item_level: number }>(
            'SELECT equipped_on, slot, item_level FROM gear_items WHERE user_id = ? AND equipped_on IS NOT NULL ORDER BY slot',
            p.id,
          )
          .toArray();
        expect(worn.map((w) => w.slot)).toEqual(['charm', 'hat', 'scarf']);
        expect(worn.every((w) => w.equipped_on === p.creatureIds[0])).toBe(true);
        // Worn items are not in the bag.
        expect(bagRows(ctx.sql, p.id)).toBe(0);
        expect(counter(ctx.sql, p.id)).toBe(0);
        expect(done.forge.bag.count).toBe(0);
        expect(done.anvils[0]?.orders).toHaveLength(1);
        // The tide creature is dressed; the smith (an ember creature) is on the team too and has empty slots, but the shelf holds
        // no ember shard: the anvil says so, and tinkers meanwhile.
        expect(done.anvils[0]?.tinkering).toMatchObject({ reason: 'shard', shardElement: 'ember' });
        expect(count(ctx.sql, 'forge_floor')).toBe(0);
      },
      { ...SYSTEMS, gearRng: WORST },
    );
  });
});

describe('the bag counter (V-GEAR-6)', () => {
  it('is kept in step by every insert, equip, swap, equip-best, dismantle and removal', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // Four pieces come home from the Forge: four inserts through the game's own code.
        const p = await smithing(ctx, 1);
        await order(p, { action: 'add', seatId: p.seatId, blueprintId: HAT, count: 4 });
        ctx.clock.t += 70 * HOUR;
        await p.state();
        const check = (expected: number): void => {
          expect(counter(ctx.sql, p.id)).toBe(expected);
          expect(bagRows(ctx.sql, p.id)).toBe(expected);
        };
        check(4);
        const ids = ctx.sql
          .exec<{ id: string }>('SELECT id FROM gear_items WHERE user_id = ? ORDER BY id', p.id)
          .toArray()
          .map((r) => r.id);
        const equip = (id: string, creatureId: string | null) =>
          p.api.call('POST', `/api/gear/${id}/equip`, { creatureId });
        const wearer = p.creatureIds[1] as string;
        expect((await equip(ids[0] as string, wearer)).status).toBe(200);
        check(3);
        // A swap: the displaced item returns to the bag, the new one leaves it.
        expect((await equip(ids[1] as string, wearer)).status).toBe(200);
        check(3);
        expect((await equip(ids[1] as string, null)).status).toBe(200);
        check(4);
        // Equip best dresses a creature from the bag.
        const best = await p.api.call('POST', '/api/gear/equip-best', {
          creatureIds: [p.creatureIds[2]],
        });
        expect(best.status).toBe(200);
        check(bagRows(ctx.sql, p.id));
        // The gear view reports the bag, not the worn items.
        const gear = await p.api.call('GET', '/api/gear');
        expect(gear.body.inventory).toEqual({
          cap: R.forge.bag,
          used: bagRows(ctx.sql, p.id),
          reserved: 0,
        });
        // A dismantle (a worn item goes too) takes its place off the counter.
        const dismantled = await p.api.call('POST', '/api/gear/dismantle', {
          creatureId: p.creatureIds[2],
          itemIds: ids.slice(0, 2),
          idempotencyKey: newKey('dismantle'),
        });
        expect(dismantled.status).toBe(200);
        check(bagRows(ctx.sql, p.id));
        expect(bagRows(ctx.sql, p.id)).toBe(
          ctx.sql
            .exec<{ n: number }>(
              'SELECT COUNT(*) AS n FROM gear_items WHERE user_id = ? AND equipped_on IS NULL',
              p.id,
            )
            .one().n,
        );
      },
      { ...SYSTEMS, gearRng: WORST },
    );
  });

  it('is made from a count when a player has none yet, and does not exist with the flag off', async () => {
    const raw = (ctx: CoreContext, userId: string, n: number): void => {
      // Rows written behind the game's back (an older database): the counter is made from a count the first time it is read.
      for (let i = 0; i < n; i++) {
        ctx.sql.exec(
          `INSERT INTO gear_items (id, user_id, base_id, slot, tag, rarity, item_level, lines_json, origin_json, equipped_on, source, created_at)
           VALUES (?, ?, 'kelp-cap', 'hat', 'tide', 'common', 1, '[]', '{}', ?, 'test', 0)`,
          crypto.randomUUID(),
          userId,
          i === 0 ? crypto.randomUUID() : null,
        );
      }
    };
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        raw(ctx, p.id, 4);
        expect(counter(ctx.sql, p.id)).toBeNull();
        const state = await view(p);
        // One of the four is worn: three in the bag.
        expect(state.forge.bag.count).toBe(3);
        expect(counter(ctx.sql, p.id)).toBe(3);
      },
      SYSTEMS,
    );
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        ctx.core.gear.ensureWelcome(p.id);
        expect(count(ctx.sql, 'gear_items')).toBe(1);
        expect(count(ctx.sql, 'valley_bag')).toBe(0);
        const gear = await p.api.call('GET', '/api/gear');
        expect((gear.body.inventory as { cap: number }).cap).toBe(60);
        expect(count(ctx.sql, 'valley_bag')).toBe(0);
      },
      FLAG_OFF,
    );
  });
});

describe('the exchange (V-FORGE-10)', () => {
  const exchange = (p: P, body: Record<string, unknown>) =>
    p.api.call('POST', '/api/valley/exchange', {
      to: 'tide',
      idempotencyKey: newKey('xchg'),
      ...body,
    });

  it('trades the rate of another pile for one shard, with a crit that gives more', async () => {
    for (const [rng, got] of [
      [WORST, R.forge.exchange.critYield],
      [best(), 1],
    ] as const) {
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await newPlayer(ctx, 1);
          await p.state();
          creditParts(ctx.sql, p.id, { 'ember-shard': 7, 'grove-shard': 2 });
          const res = await exchange(p, {});
          expect(res.status).toBe(200);
          expect(res.body.gained).toBe(got);
          expect(res.body.trades).toEqual([
            {
              from: 1,
              to: 0,
              paid: R.forge.exchange.rate,
              got,
              crit: got > 1,
            },
          ]);
          expect(part(ctx.sql, p.id, 'ember-shard')).toBe(7 - R.forge.exchange.rate);
          expect(part(ctx.sql, p.id, 'tide-shard')).toBe(got);
          const shelf = v.parse(ValleyViewSchema, res.body.valley).forge.shelf.shards;
          expect(shelf.tide).toBe(got);
        },
        { ...SYSTEMS, gearRng: rng },
      );
    }
  });

  it('refuses when no pile can pay, takes a named donor, and is idempotent per key', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        creditParts(ctx.sql, p.id, { 'ember-shard': 2, 'grove-shard': 9 });
        const none = await exchange(p, { from: 'ember' });
        expect(none.status).toBe(409);
        expect(none.body).toEqual({ error: 'nothing_to_exchange' });
        expect((await exchange(p, { from: 'tide' })).status).toBe(409);
        expect((await exchange(p, { to: 'nonsense' })).status).toBe(400);
        const key = newKey('xchg-twice');
        const a = await exchange(p, { from: 'grove', times: 2, idempotencyKey: key });
        expect(a.status).toBe(200);
        expect((a.body.trades as unknown[]).length).toBe(2);
        const after = part(ctx.sql, p.id, 'grove-shard');
        expect(after).toBe(9 - 2 * R.forge.exchange.rate);
        const b = await exchange(p, { from: 'grove', times: 2, idempotencyKey: key });
        expect(b.status).toBe(200);
        expect(b.body.trades).toEqual(a.body.trades);
        expect(part(ctx.sql, p.id, 'grove-shard')).toBe(after);
        const clash = await exchange(p, { from: 'grove', times: 1, idempotencyKey: key });
        expect(clash.status).toBe(409);
        expect(clash.body).toEqual({ error: 'key_conflict' });
      },
      SYSTEMS,
    );
  });
});
