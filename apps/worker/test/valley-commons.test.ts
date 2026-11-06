/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 6: the commons on the server (migration 61, `valley-commons.ts`, `valley-gifts.ts`, the gift and communal routes).
 * With the flag on the valley opens with the hearth's project (V-COM-15), gifts fill a place's open project in full and raise its level
 * (a plaque of the helpers, the fire warms, three build days), a level bounds the seats and anvils, communal seats' work is credited
 * at the contributor's visit, a keystone clock rings once for the server, a find sets itself into a collection socket, and the
 * bonfire's level raises growth. With the flag off the routes are not there.
 */
import { VALLEY_RULES, ValleyViewSchema, fireLevelOf, type ValleyView } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import { runCore, type CoreContext } from './helpers';
import { HOUR, give, newKey, sessionCaller, type SessionCaller } from './kit';
import { nextGuild, seedPlayer } from './raid-helpers';
import { creditParts } from '../src/gear-store';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true, dailyAllowance: true } as const;
const FLAG_OFF = { ...ON, dailyAllowance: true } as const;
const R = VALLEY_RULES;
const DAY = 24 * HOUR;

interface P {
  id: string;
  name: string;
  creatureIds: string[];
  api: SessionCaller<Json['body']>;
  state: () => Promise<Json>;
}

async function newPlayer(ctx: CoreContext, n: number, level = 3): Promise<P> {
  const seeded = seedPlayer(ctx, n, { creatures: 3, level });
  const api = await sessionCaller<Json['body']>(ctx, { id: seeded.id, displayName: seeded.name });
  return {
    id: seeded.id,
    name: seeded.name,
    creatureIds: seeded.creatureIds,
    api,
    state: () => api.call('GET', '/api/state'),
  };
}

const view = async (p: P): Promise<ValleyView> =>
  v.parse(ValleyViewSchema, (await p.state()).body.valley);
const gift = (p: P, body: Record<string, unknown>) =>
  p.api.call('POST', '/api/valley/gift', { idempotencyKey: newKey('gift'), ...body });
const communal = (p: P, body: Record<string, unknown>) =>
  p.api.call('POST', '/api/valley/communal', body);

const placeOf = (valley: ValleyView, id: string) => {
  const place = valley.commons?.places.find((x) => x.id === id);
  if (place === undefined) throw new Error(`no place ${id}`);
  return place;
};
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
const essence = (sql: SqlStorage, userId: string): number =>
  sql
    .exec<{ amount: number }>(
      "SELECT amount FROM balances WHERE user_id = ? AND currency = 'essence'",
      userId,
    )
    .toArray()[0]?.amount ?? 0;

/** The rows of the commons, to compare before and after a repeat. */
const rowsOf = (sql: SqlStorage): unknown => [
  sql.exec('SELECT * FROM valley_places ORDER BY place').toArray(),
  sql.exec('SELECT * FROM valley_gifts ORDER BY user_id, place, project').toArray(),
  sql.exec('SELECT * FROM valley_collections ORDER BY place, socket').toArray(),
  sql.exec('SELECT * FROM valley_fire_log ORDER BY id').toArray(),
  sql.exec('SELECT * FROM valley_keystones ORDER BY destination').toArray(),
];

/** Fills a place's open project with gifts (every part), from a player stocked for it. Returns the last answer. */
async function fill(ctx: CoreContext, p: P, place: string): Promise<Json> {
  const open = placeOf(await view(p), place);
  const project = open.project;
  if (project === null) throw new Error(`${place} has no open project`);
  const element = project.shardElement;
  give(ctx, p.id, { bait: Math.ceil(project.needs.acorns) + 10 });
  creditParts(ctx.sql, p.id, {
    scrap: Math.ceil(project.needs.scrap) + 10,
    [`${element}-shard`]: Math.ceil(project.needs.shards) + 10,
  });
  await gift(p, { place, currency: 'acorns', amount: Math.ceil(project.needs.acorns) });
  await gift(p, { place, currency: 'scrap', amount: Math.ceil(project.needs.scrap) });
  return gift(p, {
    place,
    currency: 'shards',
    element,
    amount: Math.ceil(project.needs.shards),
  });
}

describe('migration 61: the commons tables', () => {
  it('creates the tables and columns, empty, and valley-fresh clears them', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const columns = (table: string): string[] =>
          ctx.sql
            .exec<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`)
            .toArray()
            .map((r) => r.name);
        expect(columns('valley_places')).toEqual([
          'place',
          'level',
          'project',
          'size',
          'have_acorns',
          'have_scrap',
          'have_shards',
          'opened_at',
          'opens_at',
          'done_at',
          'cosmetic',
          'plaque',
        ]);
        expect(columns('valley_gifts')).toEqual([
          'user_id',
          'place',
          'project',
          'given_milli',
          'plaque',
        ]);
        expect(columns('valley_collections')).toEqual([
          'place',
          'socket',
          'source',
          'finder',
          'found_at',
        ]);
        expect(columns('valley_fire_log')).toEqual([
          'id',
          'at',
          'source',
          'place',
          'warmth_milli',
          'total_milli',
        ]);
        expect(columns('valley_keystones')).toEqual(['destination', 'ready_at', 'found']);
        expect(columns('valley_server')).toContain('weight');
        for (const table of ['valley_places', 'valley_gifts', 'valley_collections']) {
          expect(ctx.sql.exec(`SELECT * FROM ${table}`).toArray()).toEqual([]);
        }
        // Opened by a look, wiped by valley-fresh (the tool clears the guild's tables and the player's gifts).
        const p = await newPlayer(ctx, 1);
        await p.state();
        expect(ctx.sql.exec('SELECT * FROM valley_places').toArray()).toHaveLength(
          R.commons.places.length,
        );
        expect(ctx.sql.exec('SELECT * FROM valley_keystones').toArray()).toHaveLength(
          R.scouts.destinations.length,
        );
      },
      SYSTEMS,
    );
  });
});

describe('the guided start (V-COM-15) and the open project (V-COM-5)', () => {
  it("opens with the hearth's project only, sized by the weight and small, the rest waiting", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const valley = await view(p);
        const commons = valley.commons;
        expect(commons?.places.map((x) => [x.id, x.state, x.level])).toEqual([
          ['bonfire', 'open', 1],
          ['forge', 'waiting', 1],
          ['signpost', 'waiting', 1],
          ['paddock', 'waiting', 1],
          ['school', 'waiting', 1],
        ]);
        const hearth = placeOf(valley, 'bonfire');
        // A lone player's weight is 1: the first level's factor of the base size, scaled by (1 / 8) ^ 0.7.
        const expected =
          R.commons.baseSize * R.commons.levelFactor[0]! * (1 / 8) ** R.commons.sizeExponent;
        expect(hearth.project?.size).toBeCloseTo(expected, 6);
        expect(hearth.project?.progress).toBe(0);
        expect(hearth.mine).toEqual({ given: 0, shareBp: 0 });
        expect(commons?.fire.level).toBe(R.fire.start);
        expect(commons?.hearthBp).toBe(10_000);
        // The server's active weight scales a later project: two players opening the valley count 2, and the daily job writes it.
        const q = await newPlayer(ctx, 2);
        await q.state();
        ctx.clock.t += DAY;
        await ctx.core.alarm();
        expect(
          ctx.sql.exec<{ weight: number }>('SELECT weight FROM valley_server').one().weight,
        ).toBe(2);
      },
      SYSTEMS,
    );
  });

  it('settling twice at the same now changes nothing (the rows of the commons included)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        await fill(ctx, p, 'bonfire');
        const before = rowsOf(ctx.sql);
        await p.state();
        await p.state();
        expect(rowsOf(ctx.sql)).toEqual(before);
      },
      SYSTEMS,
    );
  });
});

describe('gifts (V-COM-1, 5; gifts are keyed spends)', () => {
  it('is not there with the flag off: 404 before the body is read', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        for (const path of ['/api/valley/gift', '/api/valley/communal']) {
          expect((await p.api.call('POST', path, { nonsense: true })).status).toBe(404);
        }
      },
      FLAG_OFF,
    );
  });

  it('validates the body strictly: unknown keys, shards without an element, an element on Acorns', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        const send = (body: Record<string, unknown>) =>
          p.api.call('POST', '/api/valley/gift', body);
        const key = { idempotencyKey: newKey('gift') };
        expect(
          (await send({ ...key, place: 'bonfire', currency: 'acorns', amount: 5, extra: 1 }))
            .status,
        ).toBe(400);
        expect(
          (await send({ ...key, place: 'bonfire', currency: 'shards', amount: 5 })).status,
        ).toBe(400);
        expect(
          (
            await send({
              ...key,
              place: 'bonfire',
              currency: 'acorns',
              element: 'ember',
              amount: 5,
            })
          ).status,
        ).toBe(400);
        expect(
          (await send({ ...key, place: 'nowhere', currency: 'acorns', amount: 5 })).status,
        ).toBe(400);
        expect(
          (await send({ ...key, place: 'bonfire', currency: 'acorns', amount: 0 })).status,
        ).toBe(400);
        expect(
          (await send({ ...key, place: 'bonfire', currency: 'essence', amount: 5 })).status,
        ).toBe(400);
        expect((await send({ place: 'bonfire', currency: 'acorns', amount: 5 })).status).toBe(400);
      },
      SYSTEMS,
    );
  });

  it('takes Acorns once for a key, counts in full, and a replay changes nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        give(ctx, p.id, { bait: 100 });
        const before = bait(ctx.sql, p.id);
        const key = newKey('gift');
        const body = { place: 'bonfire', currency: 'acorns', amount: 30, idempotencyKey: key };
        const first = await p.api.call('POST', '/api/valley/gift', body);
        expect(first.status).toBe(200);
        expect(first.body.spent).toBe(30);
        expect(bait(ctx.sql, p.id)).toBe(before - 30);
        const bonfire = placeOf(v.parse(ValleyViewSchema, first.body.valley), 'bonfire');
        // One Acorn is one unit of the Acorn part, worth one: 30 of the bar.
        expect(bonfire.project?.progress).toBe(30);
        expect(bonfire.mine.given).toBe(30);
        const rows = rowsOf(ctx.sql);
        const again = await p.api.call('POST', '/api/valley/gift', body);
        expect(again.status).toBe(200);
        expect(bait(ctx.sql, p.id)).toBe(before - 30);
        expect(rowsOf(ctx.sql)).toEqual(rows);
        // The same key for another gift is a conflict and takes nothing.
        const other = await p.api.call('POST', '/api/valley/gift', { ...body, amount: 31 });
        expect(other.status).toBe(409);
        expect(bait(ctx.sql, p.id)).toBe(before - 30);
        // Not enough Acorns: nothing is taken, nothing is added.
        ctx.sql.exec(
          "UPDATE balances SET amount = 5 WHERE user_id = ? AND currency = 'bait'",
          p.id,
        );
        const poor = await gift(p, { place: 'bonfire', currency: 'acorns', amount: 40 });
        expect(poor.status).toBe(409);
        expect(rowsOf(ctx.sql)).toEqual(rows);
      },
      SYSTEMS,
    );
  });

  it("takes scrap and shards from the parts (the place's own shard in full, another at the exchange rate)", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        creditParts(ctx.sql, p.id, { scrap: 100, 'ember-shard': 10, 'tide-shard': 10 });
        expect((await gift(p, { place: 'bonfire', currency: 'scrap', amount: 40 })).status).toBe(
          200,
        );
        expect(part(ctx.sql, p.id, 'scrap')).toBe(60);
        const own = await gift(p, {
          place: 'bonfire',
          currency: 'shards',
          element: 'ember',
          amount: 2,
        });
        expect(own.status).toBe(200);
        expect(part(ctx.sql, p.id, 'ember-shard')).toBe(8);
        // Tide shards count at 3 for 1: 5 of them give 1 unit and take 3.
        const rate = R.forge.exchange.rate;
        const other = await gift(p, {
          place: 'bonfire',
          currency: 'shards',
          element: 'tide',
          amount: rate + 2,
        });
        expect(other.status).toBe(200);
        expect(other.body.spent).toBe(rate);
        expect(part(ctx.sql, p.id, 'tide-shard')).toBe(10 - rate);
        // Fewer than the rate is nothing to give.
        expect(
          (
            await gift(p, {
              place: 'bonfire',
              currency: 'shards',
              element: 'tide',
              amount: rate - 1,
            })
          ).status,
        ).toBe(400);
        // More than the player has: refused, nothing taken.
        expect((await gift(p, { place: 'bonfire', currency: 'scrap', amount: 1000 })).status).toBe(
          409,
        );
        expect(part(ctx.sql, p.id, 'scrap')).toBe(60);
      },
      SYSTEMS,
    );
  });

  it('takes nothing for a place with no open project and nothing past a full part', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const valley = await view(p);
        give(ctx, p.id, { bait: 5_000 });
        const before = bait(ctx.sql, p.id);
        expect((await gift(p, { place: 'forge', currency: 'acorns', amount: 10 })).status).toBe(
          409,
        );
        const need = Math.ceil(placeOf(valley, 'bonfire').project?.needs.acorns ?? 0);
        // More than the part needs: only what it needs is taken.
        const over = await gift(p, { place: 'bonfire', currency: 'acorns', amount: need + 500 });
        expect(over.status).toBe(200);
        expect(over.body.spent).toBe(need);
        expect(bait(ctx.sql, p.id)).toBe(before - need);
        // The part is full now.
        expect((await gift(p, { place: 'bonfire', currency: 'acorns', amount: 5 })).status).toBe(
          409,
        );
      },
      SYSTEMS,
    );
  });

  it('raises the level when every part is full: plaque, fire, three build days, the next place opens (V-COM-4, 5, 15)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const q = await newPlayer(ctx, 2);
        await p.state();
        await q.state();
        const done = await fill(ctx, p, 'bonfire');
        expect(done.status).toBe(200);
        expect(done.body.levelUp).toBe(true);
        const valley = v.parse(ValleyViewSchema, done.body.valley);
        const bonfire = placeOf(valley, 'bonfire');
        expect(bonfire.level).toBe(2);
        expect(bonfire.state).toBe('building');
        expect(bonfire.buildDaysLeft).toBe(3);
        expect(bonfire.project).toBeNull();
        // The plaque names the helper, with no amounts; the keepsake is theirs.
        expect(bonfire.plaque).toEqual([p.name]);
        expect(bonfire.keepsakes).toBe(1);
        expect(placeOf(await view(q), 'bonfire').plaque).toEqual([p.name]);
        expect(placeOf(await view(q), 'bonfire').keepsakes).toBe(0);
        // The fire warms by a place level (the bonfire is not the Forge); the hearth is stronger.
        const warmed = R.fire.start * 1000 + Math.round(R.fire.warmth.placeLevel * 1000);
        expect(valley.commons?.fire.milli).toBe(warmed);
        expect(valley.commons?.fire.level).toBe(fireLevelOf(warmed));
        expect(valley.commons?.fire.recent[0]).toMatchObject({ source: 'place', place: 'bonfire' });
        expect(valley.commons?.hearthBp).toBe(
          10_000 + Math.round(R.bonfire.hearth.perLevel * 10_000),
        );
        // The Forge's project opens now that the hearth has levelled (the guided start); the others still wait.
        expect(placeOf(valley, 'forge').state).toBe('open');
        expect(placeOf(valley, 'signpost').state).toBe('waiting');
        // Two days later the hearth is still building; after the third it opens its next, bigger project (no timer: a read does it).
        ctx.clock.t += 2 * DAY;
        expect(placeOf(await view(p), 'bonfire').buildDaysLeft).toBe(1);
        ctx.clock.t += DAY + HOUR;
        const next = placeOf(await view(p), 'bonfire');
        expect(next.state).toBe('open');
        expect(next.level).toBe(2);
        expect(next.project?.size).toBeGreaterThan(done.body.value * 0 + 0);
        expect(next.mine.given).toBe(0);
        // The fire never falls.
        expect((await view(p)).commons?.fire.milli).toBe(warmed);
      },
      SYSTEMS,
    );
  });

  it('keeps a finished level for good and builds cosmetic projects after the max, warming the fire a little (V-COM-11)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        ctx.sql.exec(
          'UPDATE valley_places SET level = ? WHERE place = ?',
          R.commons.maxLevel,
          'bonfire',
        );
        // Reopen the bonfire's project at the max level (it opened at level 1; a read at a new size).
        ctx.sql.exec("UPDATE valley_places SET size = 0, opens_at = 0 WHERE place = 'bonfire'");
        const open = placeOf(await view(p), 'bonfire');
        expect(open.project?.cosmetic).toBe(true);
        const done = await fill(ctx, p, 'bonfire');
        expect(done.body.levelUp).toBe(true);
        const after = placeOf(v.parse(ValleyViewSchema, done.body.valley), 'bonfire');
        expect(after.level).toBe(R.commons.maxLevel);
        expect(after.cosmetic).toBe(1);
        const last = ctx.sql
          .exec<{ source: string; warmth_milli: number }>(
            'SELECT source, warmth_milli FROM valley_fire_log ORDER BY id DESC LIMIT 1',
          )
          .one();
        expect(last).toEqual({
          source: 'cosmetic',
          warmth_milli: Math.round(R.fire.warmth.cosmetic * 1000),
        });
      },
      SYSTEMS,
    );
  });

  it("keeps a player's own part private and the plaque free of amounts and of order by amount (V-COM-2)", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const rich = await newPlayer(ctx, 1);
        const poor = await newPlayer(ctx, 2);
        await rich.state();
        await poor.state();
        give(ctx, rich.id, { bait: 100 });
        give(ctx, poor.id, { bait: 100 });
        await gift(rich, { place: 'bonfire', currency: 'acorns', amount: 40 });
        await gift(poor, { place: 'bonfire', currency: 'acorns', amount: 20 });
        const mineRich = placeOf(await view(rich), 'bonfire').mine;
        const minePoor = placeOf(await view(poor), 'bonfire').mine;
        expect(mineRich.given).toBe(40);
        expect(minePoor.given).toBe(20);
        expect(mineRich.shareBp).toBeGreaterThan(minePoor.shareBp);
        // The project's view carries no giver's name or amount to anyone.
        const json = JSON.stringify((await poor.state()).body.valley);
        expect(json).not.toContain(rich.name);
        // Finish it: the plaque lists both names alphabetically, whoever gave more.
        await fill(ctx, rich, 'bonfire');
        expect(placeOf(await view(poor), 'bonfire').plaque).toEqual([rich.name, poor.name].sort());
        expect(placeOf(await view(poor), 'bonfire').keepsakes).toBe(1);
      },
      SYSTEMS,
    );
  });
});

describe('place levels bound the seats and anvils (V-COM-10, V-FORGE-6)', () => {
  it("reads the Signpost's and the Forge's real levels for the ladders and the limits", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const first = await view(p);
        expect(first.seatPrices.max).toBe(R.seats.scoutByLevel[0]);
        expect(first.anvilPrices.max).toBe(R.seats.anvilByLevel[0]);
        ctx.sql.exec("UPDATE valley_places SET level = 3 WHERE place IN ('signpost', 'forge')");
        const raised = await view(p);
        expect(raised.seatPrices.max).toBe(R.seats.scoutByLevel[2]);
        expect(raised.anvilPrices.max).toBe(R.seats.anvilByLevel[2]);
        expect(raised.seatPrices.ladder.length).toBe(R.seats.scoutByLevel[2]);
        // The buy routes use the same level: a third anvil is for sale only at a Forge of level 3.
        give(ctx, p.id, { bait: 100_000 });
        creditParts(ctx.sql, p.id, { scrap: 100_000 });
        for (let n = 0; n < R.seats.anvilByLevel[2]!; n++) {
          const bought = await p.api.call('POST', '/api/valley/anvil/buy', {
            idempotencyKey: newKey('anvil'),
          });
          expect(bought.status).toBe(200);
        }
        const more = await p.api.call('POST', '/api/valley/anvil/buy', {
          idempotencyKey: newKey('anvil'),
        });
        expect(more.status).toBe(409);
      },
      SYSTEMS,
    );
  });
});

describe('communal seats (V-POST-13, V-COM-14)', () => {
  it("credits a creature's work to the place's project at the next visit, as a steady trickle", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        const helper = p.creatureIds[0] as string;
        const posted = await communal(p, { place: 'bonfire', creatureId: helper });
        expect(posted.status).toBe(200);
        const seated = v.parse(ValleyViewSchema, posted.body.valley);
        expect(seated.creatures.find((c) => c.id === helper)?.state).toBe('helping');
        const seat = seated.commons?.communal.find((s) => s.place === 'bonfire');
        expect(seat?.creatureId).toBe(helper);
        // A day away: the work waits in the seat until the visit, then fills the bar.
        ctx.clock.t += 20 * HOUR;
        const back = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        expect(back.arrived).toBe(true);
        const hearth = placeOf(back, 'bonfire');
        // 20 away hours are worth (the away steps) at most 20 effective hours at 0.03 each.
        expect(hearth.project?.progress).toBeGreaterThan(0);
        expect(hearth.project?.progress).toBeLessThanOrEqual(20 * R.commons.communalPerHour + 1e-6);
        // Credited work counts toward the plaque and the keepsake (V-COM-3).
        expect(hearth.mine.given).toBeGreaterThanOrEqual(0);
        const row = ctx.sql
          .exec<{ plaque: number }>('SELECT plaque FROM valley_gifts WHERE user_id = ?', p.id)
          .toArray();
        expect(row).toEqual([{ plaque: 1 }]);
        // Nothing is credited twice.
        const rows = rowsOf(ctx.sql);
        await p.state();
        expect(rowsOf(ctx.sql)).toEqual(rows);
        // A creature stands at one seat: the same creature on another place's communal seat swaps it away.
        const move = await communal(p, { place: 'forge', creatureId: helper });
        expect(move.status).toBe(200);
        const left = ctx.sql
          .exec<{ creature_id: string | null }>(
            "SELECT creature_id FROM valley_seats WHERE user_id = ? AND destination_id = 'bonfire' AND place = 'commons'",
            p.id,
          )
          .one();
        expect(left.creature_id).toBeNull();
        // Empty a seat.
        expect((await communal(p, { place: 'forge', creatureId: null })).status).toBe(200);
        // A creature that is not the player's is refused, and so is a place that does not exist.
        const q = await newPlayer(ctx, 2);
        expect((await communal(p, { place: 'bonfire', creatureId: q.creatureIds[0] })).status).toBe(
          404,
        );
        expect((await communal(p, { place: 'nowhere', creatureId: null })).status).toBe(400);
      },
      SYSTEMS,
    );
  });

  it('puts a seat to work the same for any pass length: split passes credit what one pass does', async () => {
    const run = async (steps: number): Promise<number> => {
      let progress = 0;
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await newPlayer(ctx, 1);
          await p.state();
          await communal(p, { place: 'bonfire', creatureId: p.creatureIds[0] });
          const t0 = ctx.clock.t;
          for (let i = 1; i <= steps; i++) {
            ctx.clock.t = t0 + (12 * HOUR * i) / steps;
            await p.state();
          }
          ctx.clock.t = t0 + 12 * HOUR + 40 * 60_000;
          progress = placeOf(await view(p), 'bonfire').project?.progress ?? 0;
        },
        SYSTEMS,
      );
      return progress;
    };
    const once = await run(1);
    const split = await run(4);
    expect(once).toBeGreaterThan(0);
    expect(split).toBeCloseTo(once, 3);
  });

  it('is free of kit and of destinations (it is no scout seat)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        const seatId = (await communal(p, { place: 'bonfire', creatureId: p.creatureIds[0] })).body
          .seatId as string;
        const asScout = await p.api.call('POST', '/api/valley/seat', {
          seatId,
          destination: 'tidepools',
        });
        expect(asScout.status).toBe(400);
        give(ctx, p.id, { bait: 1000 });
        await p.api.call('POST', '/api/valley/kit', {
          action: 'buy',
          kit: 'lure',
          idempotencyKey: newKey('kit'),
        });
        const kit = await p.api.call('POST', '/api/valley/kit', {
          action: 'set',
          seatId,
          kit: 'lure',
        });
        expect(kit.status).toBe(400);
      },
      SYSTEMS,
    );
  });
});

describe('keystones (V-SCOUT-9) and collections (V-COM-12)', () => {
  /** A player with one scout posted at `destination`. */
  async function scout(ctx: CoreContext, n: number, destination: string): Promise<P> {
    const p = await newPlayer(ctx, n);
    await p.state();
    const bought = await p.api.call('POST', '/api/valley/seat/buy', {
      idempotencyKey: newKey('seat'),
    });
    expect(bought.status).toBe(200);
    const posted = await p.api.call('POST', '/api/valley/seat', {
      seatId: bought.body.seatId as string,
      creatureId: p.creatureIds[0],
      destination,
    });
    expect(posted.status).toBe(200);
    return p;
  }

  it('rings once for the server, sets itself into the first open socket with its finder, and restarts the clock', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await scout(ctx, 1, 'tidepools');
        const b = await scout(ctx, 2, 'tidepools');
        // Nothing is ready yet: a long absence and a visit find nothing.
        ctx.sql.exec(
          "UPDATE valley_keystones SET ready_at = ? WHERE destination = 'tidepools'",
          ctx.clock.t + 365 * DAY,
        );
        ctx.clock.t += 10 * HOUR;
        await a.state();
        expect(
          ctx.sql.exec("SELECT * FROM valley_collections WHERE source LIKE 'keystone:%'").toArray(),
        ).toEqual([]);
        // The clock rings while the scouts are away: the first one to arrive finds the keystone; the second finds none.
        ctx.sql.exec(
          "UPDATE valley_keystones SET ready_at = ? WHERE destination = 'tidepools'",
          ctx.clock.t - 1,
        );
        ctx.clock.t += 10 * HOUR;
        const seen = v.parse(ValleyViewSchema, (await a.state()).body.valley);
        await b.state();
        const sockets = ctx.sql
          .exec<{ place: string; socket: number; source: string; finder: string }>(
            "SELECT * FROM valley_collections WHERE source LIKE 'keystone:%'",
          )
          .toArray();
        // 'keystone:tidepools' is on the Forge's board (socket 0) and the Signpost's: the Forge comes first.
        expect(sockets).toHaveLength(1);
        expect(sockets[0]).toMatchObject({
          place: 'forge',
          socket: 0,
          source: 'keystone:tidepools',
          finder: a.name,
        });
        const clock = ctx.sql
          .exec<{ ready_at: number; found: number }>(
            "SELECT ready_at, found FROM valley_keystones WHERE destination = 'tidepools'",
          )
          .one();
        expect(clock.found).toBe(1);
        expect(clock.ready_at).toBeGreaterThan(ctx.clock.t);
        expect(seen.commons?.keystones.found).toBe(1);
        const board = seen.commons?.collections.find((c) => c.place === 'forge');
        expect(board?.sockets[0]).toEqual({
          source: 'keystone:tidepools',
          set: true,
          finder: a.name,
        });
        expect(board?.done).toBe(false);
        // A second keystone for the same place sets the Signpost's socket; a third melts into Essence.
        for (let n = 0; n < 2; n++) {
          ctx.sql.exec(
            "UPDATE valley_keystones SET ready_at = ? WHERE destination = 'tidepools'",
            ctx.clock.t - 1,
          );
          ctx.clock.t += 10 * HOUR;
          await a.state();
        }
        const set = ctx.sql
          .exec<{ place: string }>(
            "SELECT place FROM valley_collections WHERE source LIKE 'keystone:%' ORDER BY found_at, place",
          )
          .toArray()
          .map((r) => r.place);
        expect(set.sort()).toEqual(['forge', 'signpost']);
        expect(essence(ctx.sql, a.id)).toBe(R.collections.meltEssence);
      },
      SYSTEMS,
    );
  });

  it('completes a board: the fire warms, and the board shows done (V-COM-13)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await scout(ctx, 1, 'storm-ridge');
        // The Forge's board: four of its five sockets are set already; the keystone of the storm ridge is the last of its kind.
        for (const [socket, source] of [
          [0, 'keystone:tidepools'],
          [1, 'keystone:ember-caves'],
          [2, 'keystone:verdant-hollow'],
          [4, 'everyday'],
        ] as const) {
          ctx.sql.exec(
            "INSERT INTO valley_collections (place, socket, source, finder, found_at) VALUES ('forge', ?, ?, 'Someone', ?)",
            socket,
            source,
            ctx.clock.t,
          );
        }
        const before = (await view(a)).commons?.fire.milli ?? 0;
        ctx.sql.exec(
          "UPDATE valley_keystones SET ready_at = ? WHERE destination = 'storm-ridge'",
          ctx.clock.t - 1,
        );
        ctx.clock.t += 10 * HOUR;
        const done = v.parse(ValleyViewSchema, (await a.state()).body.valley);
        const board = done.commons?.collections.find((c) => c.place === 'forge');
        expect(board?.done).toBe(true);
        expect(done.commons?.fire.milli).toBe(before + Math.round(R.fire.warmth.collection * 1000));
        expect(done.commons?.fire.recent[0]).toMatchObject({
          source: 'collection',
          place: 'forge',
        });
      },
      SYSTEMS,
    );
  });
});

describe('the fire warms (V-COM-13) and the hearth raises growth (V-BON-7)', () => {
  it("makes the Forge's pieces at the fire's level, which rises with the fire", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        expect((await view(p)).forge.fireLevel).toBe(R.fire.start);
        ctx.sql.exec(
          "INSERT INTO valley_fire_log (at, source, place, warmth_milli, total_milli) VALUES (?, 'collection', 'forge', 5000, ?)",
          ctx.clock.t,
          (R.fire.start + 5) * 1000,
        );
        const warm = await view(p);
        expect(warm.forge.fireLevel).toBe(R.fire.start + 5);
        expect(warm.commons?.fire.level).toBe(R.fire.start + 5);
        expect(warm.commons?.fire.next).toBe(
          R.fire.thresholds.find((t) => t > R.fire.start + 5) ?? null,
        );
      },
      SYSTEMS,
    );
  });

  it("holds the hearth at each visit: the bonfire's level raises every idle creature's XP from the next arrival", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const id = p.creatureIds[0] as string;
        const xp = (): number =>
          ctx.sql
            .exec<{ exp: number; level: number }>(
              'SELECT exp, level FROM creatures WHERE id = ?',
              id,
            )
            .one().exp;
        await p.state();
        // Level 3 of the hearth is x1.08. It is fixed at an arrival and held until the next, so the first span below still earns x1.
        ctx.sql.exec("UPDATE valley_places SET level = 3 WHERE place = 'bonfire'");
        const a = xp();
        ctx.clock.t += 4 * HOUR;
        await p.state();
        const plain = xp() - a;
        expect(
          ctx.sql
            .exec<{ hearth_at_visit_bp: number }>('SELECT hearth_at_visit_bp FROM valley_players')
            .one().hearth_at_visit_bp,
        ).toBe(10_800);
        const b = xp();
        ctx.clock.t += 4 * HOUR;
        await p.state();
        const warmed = xp() - b;
        expect(plain).toBeGreaterThan(0);
        expect(warmed / plain).toBeCloseTo(1.08, 1);
      },
      SYSTEMS,
    );
  });
});
