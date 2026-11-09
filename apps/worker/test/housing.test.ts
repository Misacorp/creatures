import {
  BuildAnswerSchema,
  CraftAnswerSchema,
  HouseAnswerSchema,
  piecePrice,
  skinPrice,
  type PriceLine,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { HOUSING_TABLES } from '../src/housing-migration';
import { createHandler } from '../src/index';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/migrations';
import wranglerText from '../wrangler.jsonc?raw';
import { player, type Dev } from './dev-helpers';
import { ORIGIN, callHandler } from './helpers';
import { content, householder, parsed, runHouse, stock } from './housing-helpers';
import { newKey } from './kit';
import { count } from './raid-helpers';

/** Holdings that exactly pay for these price lines (materials: the named one, or `any` of a family's common materials). */
function holdingsFor(lines: readonly PriceLine[]) {
  const commonOf = {
    wood: 'driftwood',
    stone: 'sea-glass',
    metal: 'cinder-iron',
    cloth: 'sea-silk',
  };
  const out = { bait: 0, scrap: 0, materials: {} as Record<string, number> };
  for (const line of lines) {
    if (line.kind === 'bait') out.bait += line.amount;
    else if (line.kind === 'scrap') out.scrap += line.amount;
    else if (line.kind === 'material')
      out.materials[line.id] = (out.materials[line.id] ?? 0) + line.amount;
    else if (line.kind === 'family') {
      const id = commonOf[line.family];
      out.materials[id] = (out.materials[id] ?? 0) + line.amount;
    }
  }
  return out;
}

describe('the HOUSING flag: configuration', () => {
  function vars(): Record<string, Record<string, string> | undefined> {
    const json = wranglerText
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    const config = JSON.parse(json) as {
      vars: Record<string, string>;
      env: Record<string, { vars: Record<string, string> }>;
    };
    return {
      local: config.vars,
      staging: config.env['staging']?.vars,
      production: config.env['production']?.vars,
    };
  }

  it('is on locally and on staging, and off in production until Misa turns it on', () => {
    const v = vars();
    expect(v['local']?.['HOUSING']).toBe('on');
    expect(v['staging']?.['HOUSING']).toBe('on');
    expect(v['production']?.['HOUSING']).toBe('off');
  });

  it('tells the client through /api/config only when on (absent, not false)', async () => {
    const handler = createHandler();
    const on = await callHandler(handler, new Request(`${ORIGIN}/api/config`));
    expect((await on.json<Record<string, unknown>>())['housing']).toBe(true);
    const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as never;
    const off = await handler.fetch?.(
      new Request(`${ORIGIN}/api/config`),
      { ...env, HOUSING: 'off' },
      ctx,
    );
    expect(Object.hasOwn((await off?.json()) as object, 'housing')).toBe(false);
  });
});

describe('migration 67', () => {
  it('is the housing migration, and creates the eight tables', async () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(67);
    expect(MIGRATIONS[66]?.name).toBe('housingMigration');
    await runHouse((ctx) => {
      for (const table of HOUSING_TABLES) {
        expect(count(ctx.sql, 'sqlite_master', `name = '${table}'`)).toBe(1);
      }
      return Promise.resolve();
    });
  });
});

describe('with the flag off', () => {
  it('every housing route answers like a missing route, and nothing is written', async () => {
    await runHouse(
      async (ctx) => {
        const p = await player(ctx, 1);
        const missing = await p.call('GET', '/api/no-such-route');
        const owner = '800000000000000002';
        const routes: [string, string, unknown?][] = [
          ['GET', '/api/house'],
          ['GET', '/api/house/catalogue'],
          ['POST', '/api/house/build', { partId: 'cottage', pay: {}, idempotencyKey: newKey() }],
          ['POST', '/api/house/craft', { itemId: 'rocking-chair', idempotencyKey: newKey() }],
          ['PUT', '/api/house/place', { roomId: 'hut:hearth', spotId: 'rug-a', pieceId: null }],
          ['PUT', '/api/house/skin', { target: 'exterior', roof: 'thatch' }],
          [
            'PUT',
            '/api/house/housemate',
            { roomId: 'hut:hearth', spotId: 'rug-a', creatureId: null },
          ],
          ['POST', '/api/house/mail/collect', { idempotencyKey: newKey() }],
          ['POST', '/api/house/seen', {}],
          ['GET', '/api/houses'],
          ['GET', `/api/houses/${owner}`],
          ['POST', `/api/houses/${owner}/gift`, { idempotencyKey: newKey() }],
          ['POST', `/api/houses/${owner}/stamp`, { stampId: 'paw-print' }],
        ];
        expect(missing.status).toBe(404);
        for (const [method, path, body] of routes) {
          const res = await p.call(method, path, body);
          expect({ path, ...res }).toEqual({ path, ...missing });
        }
        for (const table of HOUSING_TABLES) expect(count(ctx.sql, table)).toBe(0);
        expect(ctx.core.housing).toBeNull();
        expect(ctx.core.housingHook).toBeNull();
      },
      { housing: false },
    );
  });
});

describe('the first visit', () => {
  it('makes the hut with the starter layout, once', async () => {
    await runHouse(async (ctx) => {
      const p = await player(ctx, 1);
      expect(count(ctx.sql, 'houses')).toBe(0);
      const first = parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));
      expect(first.house.built).toEqual(['hut']);
      expect(first.house.owner).toEqual({ userId: p.id, name: 'Player 1' });
      expect(first.house.exterior).toEqual({
        roof: content.starter.roof,
        walls: content.starter.walls,
      });
      expect(first.house.rooms).toHaveLength(1);
      const hearth = first.house.rooms[0];
      expect(hearth?.id).toBe('hut:hearth');
      for (const [spot, piece] of Object.entries(content.starter.layout)) {
        expect(hearth?.spots[spot]).toBe(piece);
      }
      // The mantel is a display spot of the Hearth.
      expect(first.house.displays.map((d) => d.kind)).toEqual(['raid-plaques']);
      // One of each Cosy piece, the starter stamp and skins, nothing else.
      const cosy = content.pieces.filter((x) => x.set === 'cosy');
      expect(Object.keys(first.own.items.pieces).sort()).toEqual(cosy.map((x) => x.id).sort());
      // The starter set is whole from the start, but it is not a finished set for the Matched Set stamp.
      expect(first.own.items.stamps).toEqual(['paw-print']);
      expect(first.own.items.skins).toContain('thatch');
      expect(first.own.items.skins).toContain('cosy-wall');
      // Everything the layout uses is in use; the rest of the Cosy set is free.
      expect(first.own.free['cosy-sofa']).toBe(0);
      expect(first.own.free['cosy-bed']).toBe(1);
      expect(first.own.buildable.sort()).toEqual(['cottage']);
      expect(first.own.purse.shards).toEqual({ tide: 0, ember: 0, grove: 0, spark: 0, mire: 0 });
      const again = parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));
      expect(again).toEqual(first);
      expect(count(ctx.sql, 'houses')).toBe(1);
      expect(count(ctx.sql, 'house_rooms')).toBe(1);
    });
  });

  it('does not touch the housing tables on /api/state, and a visit to another house never makes yours', async () => {
    await runHouse(async (ctx) => {
      const a = await player(ctx, 1);
      const b = await player(ctx, 2);
      expect((await a.call('GET', '/api/state')).status).toBe(200);
      expect(count(ctx.sql, 'houses')).toBe(0);
      expect((await b.call('GET', '/api/house')).status).toBe(200);
      expect((await a.call('GET', `/api/houses/${b.id}`)).status).toBe(200);
      expect(count(ctx.sql, 'houses', `user_id = '${a.id}'`)).toBe(0);
    });
  });
});

describe('building a part', () => {
  const cottage = content.parts.find((p) => p.id === 'cottage');
  if (cottage === undefined) throw new Error('no cottage');

  const pay = (p: Dev, partId: string, body: unknown, key = newKey()) =>
    p.call('POST', '/api/house/build', { partId, pay: body, idempotencyKey: key });

  it('is paid in over three calls and built at the last unit, never taking more than is owed', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      stock(ctx, p.id, { bait: 100, scrap: 1000, materials: { heartbark: 4, driftwood: 4 } });
      const one = parsed(BuildAnswerSchema, await pay(p, 'cottage', { bait: 40 }));
      expect(one.built).toBe(false);
      expect(one.house).toBeUndefined();
      expect(one.part.paid).toEqual([{ kind: 'bait', amount: 40 }]);
      expect(one.part.remaining).toEqual([
        { kind: 'bait', amount: 35 },
        { kind: 'scrap', amount: 400 },
        { kind: 'family', family: 'wood', amount: 6 },
      ]);
      // The second call pays scrap and three heartbark (a family line takes the named materials).
      const two = parsed(
        BuildAnswerSchema,
        await pay(p, 'cottage', { scrap: 900, materials: { heartbark: 3 } }),
      );
      expect(two.built).toBe(false);
      expect(two.part.paid).toEqual([
        { kind: 'bait', amount: 40 },
        { kind: 'scrap', amount: 400 },
        { kind: 'family', family: 'wood', amount: 3 },
      ]);
      // The progress shows in the own view.
      const mid = parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));
      expect(mid.own.progress.map((x) => x.partId)).toEqual(['cottage']);
      expect(mid.own.purse.scrap).toBe(600);
      expect(mid.own.materials['heartbark']).toEqual({ have: 1, fresh: 1 });
      // The third call offers far more than is owed: only the rest is taken.
      const three = parsed(
        BuildAnswerSchema,
        await pay(p, 'cottage', { bait: 100, materials: { heartbark: 1, driftwood: 4 } }),
      );
      expect(three.built).toBe(true);
      expect(three.part.remaining).toEqual([]);
      expect(three.house?.built).toEqual(['hut', 'cottage']);
      expect(three.house?.rooms.map((r) => r.id).sort()).toEqual([
        'cottage:kitchen',
        'cottage:loft',
        'hut:hearth',
      ]);
      expect(three.own?.purse.bait).toBe(25);
      expect(three.own?.purse.scrap).toBe(600);
      // 6 wood in all: 3 heartbark, then 3 more (a family line takes the offered materials by id: driftwood first).
      expect(three.own?.materials['driftwood']).toEqual({ have: 1, fresh: 1 });
      expect(three.own?.materials['heartbark']).toEqual({ have: 1, fresh: 1 });
      expect(three.own?.progress).toEqual([]);
      // The cottage teaches its roof: the blueprint is learned, and the next parts open.
      expect(three.own?.items.blueprints).toContain('slate');
      expect(three.own?.buildable.sort()).toEqual(['cellar', 'garden', 'house', 'terrace']);
      expect(count(ctx.sql, 'house_rooms')).toBe(3);
    });
  });

  it('answers a repeat of the same key with the same result and takes nothing more', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      stock(ctx, p.id, { bait: 100, scrap: 100 });
      const key = newKey();
      const first = await pay(p, 'cottage', { bait: 30, scrap: 50 }, key);
      const again = await pay(p, 'cottage', { bait: 30, scrap: 50 }, key);
      expect(again).toEqual(first);
      expect(ctx.core.balances(p.id).bait).toBe(70);
      expect(count(ctx.sql, 'house_parts', `part_id = 'cottage'`)).toBe(1);
      // The same key on another amount, or another action, is a key conflict.
      expect(await pay(p, 'cottage', { bait: 31, scrap: 50 }, key)).toMatchObject({
        status: 409,
        body: { error: 'key_conflict' },
      });
      const craft = await p.call('POST', '/api/house/craft', {
        itemId: 'rocking-chair',
        idempotencyKey: key,
      });
      expect(craft).toMatchObject({ status: 409, body: { error: 'key_conflict' } });
      expect(ctx.core.balances(p.id).bait).toBe(70);
    });
  });

  it('two requests with one key at once pay once; two keys never pay more than is owed', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      stock(ctx, p.id, { bait: 500 });
      const key = newKey();
      const both = await Promise.all([
        pay(p, 'cottage', { bait: 50 }, key),
        pay(p, 'cottage', { bait: 50 }, key),
      ]);
      expect(both[0]).toEqual(both[1]);
      expect(ctx.core.balances(p.id).bait).toBe(450);
      const racing = await Promise.all([
        pay(p, 'cottage', { bait: 100 }),
        pay(p, 'cottage', { bait: 100 }),
      ]);
      expect(racing.map((r) => r.status).sort()).toEqual([200, 409]);
      // 50 + 25 were taken; the part is owed 75 in all.
      expect(ctx.core.balances(p.id).bait).toBe(425);
    });
  });

  it('refuses a part whose prerequisites are not built, an unknown part, a built part and an empty payment', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      stock(ctx, p.id, { bait: 500 });
      expect(await pay(p, 'house', { bait: 5 })).toMatchObject({
        status: 409,
        body: { error: 'part_locked' },
      });
      expect(await pay(p, 'pool', { bait: 5 })).toMatchObject({
        status: 409,
        body: { error: 'part_locked' },
      });
      expect(await pay(p, 'moat', { bait: 5 })).toMatchObject({
        status: 404,
        body: { error: 'not_found' },
      });
      expect(await pay(p, 'hut', { bait: 5 })).toMatchObject({
        status: 409,
        body: { error: 'already_built' },
      });
      expect(await pay(p, 'cottage', {})).toMatchObject({
        status: 409,
        body: { error: 'nothing_to_pay' },
      });
      expect(await pay(p, 'cottage', { materials: { 'no-such-wood': 3 } })).toMatchObject({
        status: 404,
        body: { error: 'not_found' },
      });
      // Nothing happened.
      expect(ctx.core.balances(p.id).bait).toBe(500);
      expect(count(ctx.sql, 'house_parts')).toBe(1);
    });
  });

  it('refuses what the player cannot pay, naming why, and changes nothing', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      stock(ctx, p.id, { materials: { 'sea-glass': 5 } });
      expect(await pay(p, 'cottage', { bait: 10 })).toMatchObject({
        status: 409,
        body: { error: 'insufficient_funds' },
      });
      expect(await pay(p, 'cottage', { scrap: 10 })).toMatchObject({
        status: 409,
        body: { error: 'insufficient_parts' },
      });
      // Sea glass is a stone: the cottage wants wood, so that offer pays nothing.
      expect(await pay(p, 'cottage', { materials: { 'sea-glass': 5 } })).toMatchObject({
        status: 409,
        body: { error: 'nothing_to_pay' },
      });
      expect(await pay(p, 'cottage', { materials: { driftwood: 2 } })).toMatchObject({
        status: 409,
        body: { error: 'insufficient_materials' },
      });
      expect(count(ctx.sql, 'house_parts')).toBe(1);
    });
  });

  it('pays shard lines and specific materials of a part', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx);
        // Build the cottage for free, then pay the cellar: 10 Mire shards, 6 any stone, 4 Bog Oak.
        expect(await p.tool('housing-build', { parts: ['cottage'] })).toMatchObject({
          built: ['cottage'],
        });
        ctx.sql.exec(
          "INSERT INTO parts (user_id, kind, amount) VALUES (?, 'mire-shard', 12) ON CONFLICT(user_id, kind) DO UPDATE SET amount = 12",
          p.id,
        );
        stock(ctx, p.id, { bait: 125, scrap: 800, materials: { 'bog-oak': 5, 'sea-glass': 6 } });
        const res = parsed(
          BuildAnswerSchema,
          await pay(p, 'cellar', {
            bait: 125,
            scrap: 800,
            shards: { mire: 12 },
            materials: { 'bog-oak': 5, 'sea-glass': 6 },
          }),
        );
        expect(res.built).toBe(true);
        expect(res.own?.purse.shards.mire).toBe(2);
        expect(res.own?.materials['bog-oak']).toEqual({ have: 1, fresh: 1 });
        expect(res.house?.rooms.map((r) => r.id)).toContain('cellar:cellar');
      },
      { dev: true },
    );
  });

  it('rejects malformed bodies: unknown keys, bad keys, negative or fractional amounts, unknown elements', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      const send = (body: unknown) => p.call('POST', '/api/house/build', body);
      const k = newKey();
      expect(
        (await send({ partId: 'cottage', pay: {}, idempotencyKey: k, userId: p.id })).status,
      ).toBe(400);
      expect((await send({ partId: 'cottage', pay: {}, idempotencyKey: 'x' })).status).toBe(400);
      expect((await send({ partId: 'cottage', pay: { bait: -1 }, idempotencyKey: k })).status).toBe(
        400,
      );
      expect(
        (await send({ partId: 'cottage', pay: { bait: 1.5 }, idempotencyKey: k })).status,
      ).toBe(400);
      expect(
        (await send({ partId: 'cottage', pay: { shards: { dust: 1 } }, idempotencyKey: k })).status,
      ).toBe(400);
      expect((await send({ partId: 'cottage', pay: { price: 1 }, idempotencyKey: k })).status).toBe(
        400,
      );
      expect((await send({ partId: 'Cottage!', pay: {}, idempotencyKey: k })).status).toBe(400);
      expect(
        (await send({ partId: 'cottage', pay: { bait: 2_000_000 }, idempotencyKey: k })).status,
      ).toBe(400);
      expect((await send([])).status).toBe(400);
    });
  });
});

describe('the workbench', () => {
  const craft = (p: Dev, itemId: string, key = newKey()) =>
    p.call('POST', '/api/house/craft', { itemId, idempotencyKey: key });

  it('makes a known piece at once, taking the price once, and a repeat of the key makes no second copy', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      const price = piecePrice(content, 'rocking-chair');
      const h = holdingsFor(price);
      stock(ctx, p.id, { bait: h.bait + 10, scrap: h.scrap + 5, materials: h.materials });
      const key = newKey();
      const made = parsed(CraftAnswerSchema, await craft(p, 'rocking-chair', key));
      expect(made.count).toBe(1);
      expect(made.own.items.pieces['rocking-chair']).toBe(1);
      expect(made.own.free['rocking-chair']).toBe(1);
      expect(made.own.purse.bait).toBe(10);
      expect(made.own.purse.scrap).toBe(5);
      const again = parsed(CraftAnswerSchema, await craft(p, 'rocking-chair', key));
      expect(again.count).toBe(1);
      expect(again.own.purse.bait).toBe(10);
      // A second copy with a new key (the price is held for one more).
      stock(ctx, p.id, { bait: h.bait, scrap: h.scrap, materials: h.materials });
      const second = parsed(CraftAnswerSchema, await craft(p, 'rocking-chair'));
      expect(second.count).toBe(2);
    });
  });

  it('knows only blueprints the player has: starters, parts and learned ones', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      stock(ctx, p.id, {
        bait: 5000,
        scrap: 5000,
        materials: { 'sea-glass': 20, driftwood: 20, 'old-gold': 5 },
      });
      expect(await craft(p, 'ancient-stool')).toMatchObject({
        status: 409,
        body: { error: 'not_known' },
      });
      expect(await craft(p, 'slate')).toMatchObject({ status: 409, body: { error: 'not_known' } });
      expect(await craft(p, 'no-such-thing')).toMatchObject({
        status: 404,
        body: { error: 'not_found' },
      });
      expect(await craft(p, 'LOUD!')).toMatchObject({ status: 400 });
      stock(ctx, p.id, { blueprints: ['ancient-stool'] });
      const made = parsed(CraftAnswerSchema, await craft(p, 'ancient-stool'));
      expect(made.count).toBe(1);
      // The "any stone" primary came from the held stone; the gold accent twice (tier 2).
      const price = piecePrice(content, 'ancient-stool');
      expect(price.some((l) => l.kind === 'family' && l.family === 'stone')).toBe(true);
      expect(made.own.materials['old-gold']?.have).toBe(5 - 2);
      expect(made.own.materials['sea-glass']?.have).toBe(20 - 1);
    });
  });

  it('makes a skin once, from a blueprint a built part teaches', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx);
        const h = holdingsFor(skinPrice(content, 'slate'));
        stock(ctx, p.id, { bait: h.bait * 2, scrap: h.scrap * 2, materials: { driftwood: 12 } });
        expect(await craft(p, 'slate')).toMatchObject({
          status: 409,
          body: { error: 'not_known' },
        });
        await p.tool('housing-build', { parts: ['cottage'] });
        const made = parsed(CraftAnswerSchema, await craft(p, 'slate'));
        expect(made.own.items.skins).toContain('slate');
        expect(await craft(p, 'slate')).toMatchObject({
          status: 409,
          body: { error: 'already_owned' },
        });
        // A starter skin is already owned.
        expect(await craft(p, 'thatch')).toMatchObject({
          status: 409,
          body: { error: 'already_owned' },
        });
        expect(made.own.purse.bait).toBe(h.bait);
      },
      { dev: true },
    );
  });

  it('refuses short holdings and rolls everything back, even the Acorns already taken', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      stock(ctx, p.id, { blueprints: ['hammock'] });
      const price = piecePrice(content, 'hammock');
      const h = holdingsFor(price);
      // Acorns but no scrap: the Acorns are taken first, then the scrap is refused, and the Acorns come back.
      stock(ctx, p.id, { bait: h.bait });
      expect(await craft(p, 'hammock')).toMatchObject({
        status: 409,
        body: { error: 'insufficient_parts' },
      });
      expect(ctx.core.balances(p.id).bait).toBe(h.bait);
      // No Acorns.
      ctx.sql.exec("DELETE FROM balances WHERE user_id = ? AND currency = 'bait'", p.id);
      stock(ctx, p.id, { scrap: h.scrap });
      expect(await craft(p, 'hammock')).toMatchObject({
        status: 409,
        body: { error: 'insufficient_funds' },
      });
      expect(count(ctx.sql, 'house_items', `item_id = 'hammock' AND kind = 'piece'`)).toBe(0);
    });
  });

  it('refuses short materials without taking anything', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      stock(ctx, p.id, {
        blueprints: ['tidepool-bed'],
        bait: 1000,
        scrap: 1000,
        materials: { driftwood: 1 },
      });
      const price = piecePrice(content, 'tidepool-bed');
      expect(price.some((l) => l.kind === 'material' && l.amount > 1)).toBe(true);
      expect(await craft(p, 'tidepool-bed')).toMatchObject({
        status: 409,
        body: { error: 'insufficient_materials' },
      });
      expect(ctx.core.balances(p.id).bait).toBe(1000);
      expect(count(ctx.sql, 'house_items', `item_id = 'driftwood' AND count = 1`)).toBe(1);
    });
  });
});
