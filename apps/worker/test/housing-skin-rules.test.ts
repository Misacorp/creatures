/**
 * The rules behind a ground skin and a stored look (`docs/design/housing.md`, skins): a ground skin that comes with a part is owned by rule once
 * the part is built (so a house made before it existed can wear it, with no row), a ground skin fits only the room kinds its content lists,
 * a look that content no longer has shows as the room was built, and the layered column reads only what it knows.
 */
import { CatalogueViewSchema, HouseAnswerSchema, SkinAnswerSchema } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { readLayered } from '../src/housing-store';
import type { Dev } from './dev-helpers';
import type { CoreContext } from './helpers';
import { content, householder, parsed, runHouse } from './housing-helpers';
import { newKey } from './kit';

const skin = (p: Dev, body: unknown) => p.call('PUT', '/api/house/skin', body);
const own = async (p: Dev) => parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));
const craft = (p: Dev, itemId: string) =>
  p.call('POST', '/api/house/craft', { itemId, idempotencyKey: newKey() });
const floorOf = (roomId: string, floor: string) => ({ target: 'room', roomId, floor });

/** A house made before the skin rows were written for ground skins: no skin rows at all. */
const oldHouse = (ctx: CoreContext, userId: string): void => {
  ctx.sql.exec("DELETE FROM house_items WHERE user_id = ? AND kind = 'skin'", userId);
};

describe('a ground skin that comes with a part', () => {
  it('is worn in an old house once the part is built, and refused before, with no row either way', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx);
        oldHouse(ctx, p.id);
        await p.tool('housing-build', { parts: ['cottage', 'garden'] });
        // Not built: there is no orchard room to dress, and the skin cannot be made either.
        expect((await skin(p, floorOf('orchard:orchard', 'orchard-plum'))).status).toBe(404);
        expect(await craft(p, 'orchard-plum')).toMatchObject({
          status: 409,
          body: { error: 'not_known' },
        });
        await p.tool('housing-build', { parts: ['orchard'] });
        oldHouse(ctx, p.id);
        const ok = await skin(p, floorOf('orchard:orchard', 'orchard-plum'));
        expect(parsed(SkinAnswerSchema, ok)).toMatchObject({
          target: 'room',
          room: { id: 'orchard:orchard', floor: 'orchard-plum' },
        });
        // Owned by rule: the picker data and the catalogue agree, and crafting it is refused as already owned.
        const mine = await own(p);
        expect(mine).toBeDefined();
        const view = parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));
        expect(view.own.items.skins).toEqual(
          expect.arrayContaining(['orchard-plum', 'orchard-pear']),
        );
        const cat = parsed(CatalogueViewSchema, await p.call('GET', '/api/house/catalogue'));
        expect(cat.skins.find((s) => s.id === 'orchard-plum')).toMatchObject({
          owned: true,
          known: true,
        });
        expect(await craft(p, 'orchard-plum')).toMatchObject({
          status: 409,
          body: { error: 'already_owned' },
        });
        expect(
          ctx.sql
            .exec("SELECT 1 FROM house_items WHERE user_id = ? AND kind = 'skin'", p.id)
            .toArray(),
        ).toHaveLength(0);
      },
      { dev: true },
    );
  });

  it('is not owned before its part is built (catalogue and picker data)', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      oldHouse(ctx, p.id);
      const mine = parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));
      expect(mine.own.items.skins).not.toContain('orchard-plum');
      expect(mine.own.items.skins).toContain('lawn');
      const cat = parsed(CatalogueViewSchema, await p.call('GET', '/api/house/catalogue'));
      expect(cat.skins.find((s) => s.id === 'orchard-plum')).toMatchObject({
        owned: false,
        known: false,
      });
      expect(cat.skins.find((s) => s.id === 'lawn')).toMatchObject({ owned: true });
    });
  });
});

describe('a ground skin fits only its room kinds', () => {
  it('refuses a ground skin on a room kind it does not fit, and takes one that fits', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx);
        await p.tool('housing-build', {
          parts: ['cottage', 'house', 'garden', 'pool', 'balcony', 'orchard', 'terrace', 'pond'],
        });
        const refused = async (roomId: string, id: string) =>
          expect(await skin(p, floorOf(roomId, id)), `${roomId} ${id}`).toMatchObject({
            status: 409,
            body: { error: 'skin_mismatch' },
          });
        await refused('garden:garden', 'orchard-plum');
        await refused('balcony:balcony', 'orchard-apple');
        await refused('pool:pool', 'lawn');
        await refused('garden:garden', 'deck');
        for (const [room, id] of [
          ['garden:garden', 'lawn'],
          ['pond:pond', 'lawn'],
          ['terrace:terrace', 'deck'],
          ['balcony:balcony', 'deck'],
          ['pool:pool', 'pool-tile'],
          ['orchard:orchard', 'orchard-pear'],
        ] as const) {
          expect((await skin(p, floorOf(room, id))).status, `${room} ${id}`).toBe(200);
        }
      },
      { dev: true },
    );
  });
});

describe('a stored look that content no longer has', () => {
  it('shows as the room, or the house, was built', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      const kind = content.rooms.find((r) => r.id === 'hearth');
      ctx.sql.exec(
        "UPDATE house_rooms SET wall = 'gone-wall;trim=trim-gone:nope;ceiling=nothing', floor = 'gone-floor' WHERE user_id = ? AND room_id = 'hut:hearth'",
        p.id,
      );
      ctx.sql.exec(
        "UPDATE houses SET roof = 'gone-roof', walls = 'gone-walls;frame=frame-gone:grey' WHERE user_id = ?",
        p.id,
      );
      const { house } = await own(p);
      const hearth = house.rooms.find((r) => r.id === 'hut:hearth');
      expect(hearth).toMatchObject({
        wall: kind?.wall,
        floor: kind?.floor,
        trim: null,
        ceiling: null,
      });
      expect(house.exterior).toEqual({
        roof: content.starter.roof,
        walls: content.starter.walls,
        frame: null,
      });
    });
  });

  it('keeps a look that still validates, and drops a colour the skin no longer lists', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      const trim = content.skins.find((s) => s.kind === 'trim' && s.gen !== undefined);
      const good = `${trim?.id ?? ''}:${trim?.gen?.colours[0] ?? ''}`;
      ctx.sql.exec(
        'UPDATE house_rooms SET wall = ? WHERE user_id = ? AND room_id = ?',
        `cosy-wall;trim=${good};ceiling=${trim?.id ?? ''}:no-such-colour`,
        p.id,
        'hut:hearth',
      );
      const hearth = (await own(p)).house.rooms.find((r) => r.id === 'hut:hearth');
      expect(hearth?.trim).toBe(good);
      expect(hearth?.ceiling).toBeNull();
    });
  });
});

describe('the layered column reads only what it knows', () => {
  it('ignores empty keys and values, doubled equals signs and keys that are not layers', () => {
    expect(readLayered('a;trim=').extra).toEqual({});
    expect(readLayered('a;trim==x').extra).toEqual({});
    expect(readLayered('a;constructor=x').extra).toEqual({});
    expect(readLayered('a;__proto__=x').extra).toEqual({});
    expect(readLayered('a;;')).toMatchObject({ first: 'a', extra: {} });
    expect(readLayered('a;=x;ceiling=c:d;frame=f:g;trim=t:u').extra).toEqual({
      ceiling: 'c:d',
      frame: 'f:g',
      trim: 't:u',
    });
    const { extra } = readLayered('a;constructor=x');
    expect(Object.getPrototypeOf(extra)).toBeNull();
    expect(extra.constructor).toBeUndefined();
    expect(extra.toString).toBeUndefined();
  });
});
