/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 7: the Market and the broker (migration 62, `valley-seats.ts`, `valley-settle.ts`, the `/api/valley/broker` route). The
 * Market is a place built once (its one project: Acorns and scrap, no shards); when it is built every player has the broker's seat, a
 * creature there trades spare shards for what the Forge's orders wait on, all the time, and grows in trading.
 */
import { VALLEY_RULES, ValleyViewSchema, type ValleyView } from '@creatures/game';
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
const HAT = 'kelp-cap';

interface P {
  id: string;
  creatureIds: string[];
  api: SessionCaller<Json['body']>;
  state: () => Promise<Json>;
}

async function newPlayer(ctx: CoreContext, n: number): Promise<P> {
  const seeded = seedPlayer(ctx, n, {
    creatures: 3,
    level: 3,
    species: ['splashet', 'mistnewt', 'coralynx'],
  });
  const api = await sessionCaller<Json['body']>(ctx, { id: seeded.id, displayName: seeded.name });
  return {
    id: seeded.id,
    creatureIds: seeded.creatureIds,
    api,
    state: () => api.call('GET', '/api/state'),
  };
}

const view = async (p: P): Promise<ValleyView> =>
  v.parse(ValleyViewSchema, (await p.state()).body.valley);
const post = (p: P, body: Record<string, unknown>) => p.api.call('POST', '/api/valley/seat', body);
const toward = (p: P, body: Record<string, unknown>) =>
  p.api.call('POST', '/api/valley/broker', body);
const gift = (p: P, body: Record<string, unknown>) =>
  p.api.call('POST', '/api/valley/gift', { idempotencyKey: newKey('gift'), ...body });
const part = (sql: SqlStorage, userId: string, kind: string): number =>
  sql
    .exec<{ amount: number }>(
      'SELECT amount FROM parts WHERE user_id = ? AND kind = ?',
      userId,
      kind,
    )
    .toArray()[0]?.amount ?? 0;
const tradeHours = (sql: SqlStorage, creatureId: string): number =>
  sql
    .exec<{
      trade_hours: number;
    }>('SELECT trade_hours FROM valley_creatures WHERE creature_id = ?', creatureId)
    .toArray()[0]?.trade_hours ?? 0;

/** Builds the Market (the level a finished project gives), as a test shortcut, after the valley has opened. */
function buildMarket(ctx: CoreContext): void {
  ctx.sql.exec("UPDATE valley_places SET level = 2 WHERE place = 'market'");
}

/** A player with a smith at the first anvil on a tide-hat order, no tide shards and a pile of mire shards, and the Market built. */
async function shortOnTide(ctx: CoreContext, n: number) {
  const p = await newPlayer(ctx, n);
  await p.state();
  buildMarket(ctx);
  const first = await view(p);
  const bought = await p.api.call('POST', '/api/valley/anvil/buy', { idempotencyKey: newKey('a') });
  expect(bought.status).toBe(200);
  const anvil = bought.body.seatId as string;
  expect((await post(p, { seatId: anvil, creatureId: p.creatureIds[0] })).status).toBe(200);
  learnBlueprint(ctx.sql, p.id, HAT, ctx.clock.t);
  creditParts(ctx.sql, p.id, { scrap: 1000, 'mire-shard': 60 });
  const added = await p.api.call('POST', '/api/valley/order', {
    action: 'add',
    seatId: anvil,
    blueprintId: HAT,
    count: 20,
  });
  expect(added.status).toBe(200);
  const brokerId = first.market?.seat?.id ?? (await view(p)).market?.seat?.id;
  if (brokerId === undefined) throw new Error('no broker seat');
  return { ...p, anvil, brokerId };
}

describe('migration 62: the broker', () => {
  it('adds the trading hours column, empty', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        const columns = ctx.sql
          .exec<{ name: string }>("SELECT name FROM pragma_table_info('valley_creatures')")
          .toArray()
          .map((r) => r.name);
        expect(columns).toContain('trade_hours');
      },
      SYSTEMS,
    );
  });
});

describe('the Market before and after it is built (V-FORGE-11, V-COM-15)', () => {
  it('is a place of the valley, waiting for the guided start, with no broker seat yet', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const valley = await view(p);
        expect(valley.market).toEqual({ open: false, seat: null });
        const market = valley.commons?.places.find((x) => x.id === 'market');
        expect(market?.state).toBe('waiting');
        expect(count(ctx.sql, 'valley_seats')).toBe(0);
      },
      SYSTEMS,
    );
  });

  it('opens its one project with the rest once the hearth and the Forge have levelled, paid in Acorns and scrap only', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        ctx.sql.exec("UPDATE valley_places SET level = 2 WHERE place IN ('bonfire', 'forge')");
        const open = (await view(p)).commons?.places.find((x) => x.id === 'market');
        expect(open?.state).toBe('open');
        expect(open?.project?.needs.shards).toBe(0);
        expect(open?.project?.needs.acorns).toBeGreaterThan(0);
        // Sized like a level-2 project (the lab's Market).
        const weight = 1;
        expect(open?.project?.size).toBeCloseTo(
          R.commons.baseSize * R.commons.levelFactor[1]! * (weight / 8) ** R.commons.sizeExponent,
          6,
        );
        // Shards are not taken for it.
        creditParts(ctx.sql, p.id, { 'mire-shard': 5 });
        const shards = await gift(p, {
          place: 'market',
          currency: 'shards',
          element: 'mire',
          amount: 3,
        });
        expect(shards.status).toBe(409);
        expect(part(ctx.sql, p.id, 'mire-shard')).toBe(5);
        // Acorns and scrap fill it: the level is raised and no other project follows.
        const needs = open?.project?.needs ?? { acorns: 0, scrap: 0 };
        give(ctx, p.id, { bait: Math.ceil(needs.acorns) + 10 });
        creditParts(ctx.sql, p.id, { scrap: Math.ceil(needs.scrap) + 10 });
        await gift(p, { place: 'market', currency: 'acorns', amount: Math.ceil(needs.acorns) });
        const done = await gift(p, {
          place: 'market',
          currency: 'scrap',
          amount: Math.ceil(needs.scrap),
        });
        expect(done.status).toBe(200);
        expect(done.body.levelUp).toBe(true);
        const after = v.parse(ValleyViewSchema, done.body.valley);
        expect(after.commons?.places.find((x) => x.id === 'market')).toMatchObject({
          level: 2,
          state: 'done',
          project: null,
          buildDaysLeft: 0,
        });
        expect(after.market?.open).toBe(true);
        expect(after.market?.seat?.creatureId).toBeNull();
        // Days later the Market still opens nothing more.
        ctx.clock.t += 10 * 24 * HOUR;
        const later = await view(p);
        expect(later.commons?.places.find((x) => x.id === 'market')?.state).toBe('done');
      },
      SYSTEMS,
    );
  });

  it("makes each player's broker seat once, when they first look after it is built", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await newPlayer(ctx, 1);
        await a.state();
        buildMarket(ctx);
        const first = await view(a);
        expect(first.market?.open).toBe(true);
        const id = first.market?.seat?.id;
        expect(id).toBeDefined();
        await a.state();
        await view(a);
        expect(count(ctx.sql, 'valley_seats', "place = 'market'")).toBe(1);
        expect((await view(a)).market?.seat?.id).toBe(id);
        const b = await newPlayer(ctx, 2);
        const seatB = (await view(b)).market?.seat?.id;
        expect(seatB).toBeDefined();
        expect(seatB).not.toBe(id);
        expect(count(ctx.sql, 'valley_seats', "place = 'market'")).toBe(2);
      },
      SYSTEMS,
    );
  });
});

describe('posting the broker and its setting', () => {
  it('posts a creature through the seat route, shows it as trading, and swaps with an anvil', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await shortOnTide(ctx, 1);
        const smith = p.creatureIds[0] as string;
        const trader = p.creatureIds[1] as string;
        expect((await post(p, { seatId: p.brokerId, creatureId: trader })).status).toBe(200);
        let valley = await view(p);
        expect(valley.market?.seat?.creatureId).toBe(trader);
        expect(valley.creatures.find((c) => c.id === trader)?.state).toBe('trading');
        expect(valley.creatures.find((c) => c.id === trader)?.seatId).toBe(p.brokerId);
        // Dragging the smith onto the broker's seat swaps: the trader takes the anvil.
        expect((await post(p, { seatId: p.brokerId, creatureId: smith })).status).toBe(200);
        valley = await view(p);
        expect(valley.market?.seat?.creatureId).toBe(smith);
        expect(valley.anvils[0]?.creatureId).toBe(trader);
        // An empty seat is allowed.
        expect((await post(p, { seatId: p.brokerId, creatureId: null })).status).toBe(200);
        expect((await view(p)).market?.seat?.creatureId).toBeNull();
        // A destination or a kit never fits the broker's seat.
        expect((await post(p, { seatId: p.brokerId, destination: 'tidepools' })).status).toBe(400);
        const kit = await p.api.call('POST', '/api/valley/kit', {
          action: 'set',
          seatId: p.brokerId,
          kit: 'tongs',
        });
        expect(kit.status).toBe(400);
      },
      SYSTEMS,
    );
  });

  it('sets what it trades toward, validates it, and refuses a seat that is not a broker or not yours', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await shortOnTide(ctx, 1);
        expect((await view(p)).market?.seat?.toward).toBeNull();
        const set = await toward(p, { seatId: p.brokerId, toward: 'grove' });
        expect(set.status).toBe(200);
        expect(v.parse(ValleyViewSchema, set.body.valley).market?.seat?.toward).toBe('grove');
        expect(
          (await toward(p, { seatId: p.brokerId, toward: null })).body.valley.market.seat.toward,
        ).toBeNull();
        expect((await toward(p, { seatId: p.brokerId, toward: 'plasma' })).status).toBe(400);
        expect((await toward(p, { seatId: p.brokerId, toward: 'grove', extra: 1 })).status).toBe(
          400,
        );
        expect((await toward(p, { seatId: p.anvil, toward: 'grove' })).status).toBe(400);
        const other = await newPlayer(ctx, 2);
        await other.state();
        expect((await toward(other, { seatId: p.brokerId, toward: 'grove' })).status).toBe(404);
        expect((await post(other, { seatId: p.brokerId, creatureId: null })).status).toBe(404);
      },
      SYSTEMS,
    );
  });

  it('answers 404 on the broker route with the flag off, before the body is read', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        expect((await toward(p, { nonsense: true })).status).toBe(404);
        expect((await p.state()).body.valley).toBeUndefined();
      },
      FLAG_OFF,
    );
  });
});

describe('the broker at work (V-FORGE-11)', () => {
  it('keeps an anvil making pieces that would wait for tide shards, and grows its trading hours', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await shortOnTide(ctx, 1);
        const trader = p.creatureIds[1] as string;
        // Without a broker the anvil waits for tide shards (it has none).
        ctx.clock.t += 30 * HOUR;
        let valley = await view(p);
        expect(valley.anvils[0]?.tinkering?.reason).toBe('shard');
        expect(valley.market?.seat?.blocked).toBeNull();
        expect(part(ctx.sql, p.id, 'mire-shard')).toBe(60);
        // With one posted it trades the mire pile for tide shards and the pieces come.
        expect((await post(p, { seatId: p.brokerId, creatureId: trader })).status).toBe(200);
        ctx.clock.t += 150 * HOUR;
        valley = await view(p);
        // The pieces came home on arrival, so the order's count is what shows them.
        const pieces = valley.anvils[0]?.orders[0]?.made ?? 0;
        expect(pieces).toBeGreaterThan(0);
        const mire = part(ctx.sql, p.id, 'mire-shard');
        expect(mire).toBeLessThan(60);
        // The shards paid are the mire that left; the rate holds on average (about 2.4 for 1 at the start).
        const tide = part(ctx.sql, p.id, 'tide-shard');
        expect(60 - mire).toBeGreaterThanOrEqual(
          Math.floor((pieces + tide) * R.broker.tiers[3]!.rate),
        );
        expect(tradeHours(ctx.sql, trader)).toBeGreaterThan(40);
        expect(valley.market?.seat?.mastery.hours).toBeGreaterThan(40);
        expect(valley.market?.seat?.mastery.step).toBeGreaterThanOrEqual(1);
      },
      SYSTEMS,
    );
  });

  it('never trades the shards the player keeps and says when an anvil is still stuck', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await shortOnTide(ctx, 1);
        ctx.sql.exec(
          "UPDATE parts SET amount = ? WHERE user_id = ? AND kind = 'mire-shard'",
          R.forge.giveReserveShards,
          p.id,
        );
        expect((await post(p, { seatId: p.brokerId, creatureId: p.creatureIds[1] })).status).toBe(
          200,
        );
        ctx.clock.t += 40 * HOUR;
        const valley = await view(p);
        expect(part(ctx.sql, p.id, 'mire-shard')).toBe(R.forge.giveReserveShards);
        expect(valley.anvils[0]?.tinkering?.reason).toBe('shard');
        expect(valley.market?.seat?.blocked).toBe('tide');
      },
      SYSTEMS,
    );
  });

  it('settles twice at the same moment to the same shelf, and a split of time to the same total', async () => {
    const run = async (steps: number[]): Promise<unknown> => {
      let seen: unknown;
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await shortOnTide(ctx, 1);
          expect((await post(p, { seatId: p.brokerId, creatureId: p.creatureIds[1] })).status).toBe(
            200,
          );
          for (const hours of steps) {
            ctx.clock.t += hours * HOUR;
            await view(p);
          }
          const first = [part(ctx.sql, p.id, 'mire-shard'), part(ctx.sql, p.id, 'tide-shard')];
          await view(p);
          await view(p);
          const second = [part(ctx.sql, p.id, 'mire-shard'), part(ctx.sql, p.id, 'tide-shard')];
          expect(second).toEqual(first);
          seen = {
            trade: Math.round(tradeHours(ctx.sql, p.creatureIds[1] as string)),
            made: (await view(p)).anvils[0]?.orders[0]?.made,
          };
        },
        SYSTEMS,
      );
      return seen;
    };
    // The same time passing as one look or as several (the draws are live, so the trading hours and pieces are what must agree).
    expect(await run([48])).toEqual(await run([6, 12, 30]));
  });
});
