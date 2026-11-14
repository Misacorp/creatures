/**
 * The room itself (housing C5, `docs/design/housing-interior.md`): a room's wallpaper and floor in a generated pattern and colour, its
 * trim and ceiling, and the house's frame. Patterns are owned by pattern (any of its colours), starters by rule; the layers share the
 * existing columns, so a house that chose nothing reads exactly as before.
 */
import {
  CraftAnswerSchema,
  HouseAnswerSchema,
  SkinAnswerSchema,
  VisitAnswerSchema,
  skinPrice,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { houseLayers, packLayered, readLayered, roomLayers } from '../src/housing-store';
import type { Dev } from './dev-helpers';
import type { CoreContext } from './helpers';
import { content, householder, parsed, runHouse, stock } from './housing-helpers';
import { newKey } from './kit';

const HEARTH = 'hut:hearth';

const skin = (p: Dev, body: unknown) => p.call('PUT', '/api/house/skin', body);
const own = async (p: Dev) => parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));
const craft = (p: Dev, itemId: string, key = newKey()) =>
  p.call('POST', '/api/house/craft', { itemId, idempotencyKey: key });
const column = (ctx: CoreContext, userId: string, sql: string): unknown =>
  ctx.sql.exec(sql, userId).toArray()[0];

describe('the layered columns', () => {
  it('reads a plain column as before and keeps unknown keys out', () => {
    expect(readLayered('cosy-wall')).toEqual({ first: 'cosy-wall', extra: {} });
    expect(roomLayers({ wall: 'cosy-wall' })).toEqual({
      wall: 'cosy-wall',
      trim: null,
      ceiling: null,
    });
    expect(houseLayers({ walls: 'plaster' })).toEqual({ walls: 'plaster', frame: null });
    expect(
      roomLayers({
        wall: 'paper-damask:rose;ceiling=ceiling-beamed:dark;odd=1;trim=trim-skirting:paint-white',
      }),
    ).toEqual({
      wall: 'paper-damask:rose',
      trim: 'trim-skirting:paint-white',
      ceiling: 'ceiling-beamed:dark',
    });
  });

  it('writes a bare layer as nothing, so a cleared room is the plain value again', () => {
    expect(packLayered('cosy-wall', { trim: null, ceiling: null })).toBe('cosy-wall');
    expect(packLayered('cosy-wall', { trim: 't:a', ceiling: null })).toBe('cosy-wall;trim=t:a');
    expect(packLayered('w', { trim: 't', ceiling: 'c' })).toBe('w;ceiling=c;trim=t');
  });
});

describe('room layers', () => {
  it('a new house has no trim, ceiling or frame: it looks as built', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      const { house } = await own(p);
      expect(house.rooms[0]).toMatchObject({ wall: 'cosy-wall', trim: null, ceiling: null });
      expect(house.exterior).toEqual({ roof: 'thatch', walls: 'plaster', frame: null });
      // The rows hold the plain values, as before this change.
      expect(column(ctx, p.id, 'SELECT wall FROM house_rooms WHERE user_id = ?')).toEqual({
        wall: 'cosy-wall',
      });
      expect(column(ctx, p.id, 'SELECT walls FROM houses WHERE user_id = ?')).toEqual({
        walls: 'plaster',
      });
    });
  });

  it('wears a starter pattern in any of its colours, with no row (owned by rule)', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      // A house made before the patterns existed has no rows for them.
      ctx.sql.exec("DELETE FROM house_items WHERE user_id = ? AND kind = 'skin'", p.id);
      const answer = parsed(
        SkinAnswerSchema,
        await skin(p, {
          target: 'room',
          roomId: HEARTH,
          wall: 'paper-pinstripe:sage',
          floor: 'floor-boards:walnut',
          trim: 'trim-skirting:dark-walnut',
          ceiling: 'ceiling-plain:cream-walnut',
        }),
      );
      expect(answer).toEqual({
        target: 'room',
        room: expect.objectContaining({
          id: HEARTH,
          wall: 'paper-pinstripe:sage',
          floor: 'floor-boards:walnut',
          trim: 'trim-skirting:dark-walnut',
          ceiling: 'ceiling-plain:cream-walnut',
        }) as unknown,
      });
      const { house, own: mine } = await own(p);
      expect(house.rooms[0]).toMatchObject({
        wall: 'paper-pinstripe:sage',
        trim: 'trim-skirting:dark-walnut',
        ceiling: 'ceiling-plain:cream-walnut',
      });
      // The starters show as owned in the view and the catalogue.
      expect(mine.items.skins).toContain('paper-plain');
      const cat = (await p.call('GET', '/api/house/catalogue')).body as {
        skins: { id: string; owned: boolean }[];
      };
      expect(cat.skins.find((s) => s.id === 'frame-timber')?.owned).toBe(true);
      expect(cat.skins.find((s) => s.id === 'paper-damask')?.owned).toBe(false);
    });
  });

  it('changes one layer and keeps the others, and takes a trim or ceiling off with null', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      await skin(p, {
        target: 'room',
        roomId: HEARTH,
        trim: 'trim-skirting:paint-white',
        ceiling: 'ceiling-plain:white-oak',
      });
      const wall = parsed(
        SkinAnswerSchema,
        await skin(p, { target: 'room', roomId: HEARTH, wall: 'paper-plain:rose' }),
      );
      expect(wall).toMatchObject({
        room: {
          wall: 'paper-plain:rose',
          floor: 'cosy-floor',
          trim: 'trim-skirting:paint-white',
          ceiling: 'ceiling-plain:white-oak',
        },
      });
      const off = parsed(
        SkinAnswerSchema,
        await skin(p, { target: 'room', roomId: HEARTH, trim: null, ceiling: null }),
      );
      expect(off).toMatchObject({ room: { wall: 'paper-plain:rose', trim: null, ceiling: null } });
      // Back to a set wallpaper: the row is the plain value it always was.
      await skin(p, { target: 'room', roomId: HEARTH, wall: 'cosy-wall' });
      expect(column(ctx, p.id, 'SELECT wall FROM house_rooms WHERE user_id = ?')).toEqual({
        wall: 'cosy-wall',
      });
    });
  });

  it('sets the same look twice with the same answer (setting is its own retry)', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      const body = { target: 'room', roomId: HEARTH, ceiling: 'ceiling-plain:dark' };
      const first = parsed(SkinAnswerSchema, await skin(p, body));
      const again = parsed(SkinAnswerSchema, await skin(p, body));
      expect(again).toEqual(first);
    });
  });

  it('refuses a pattern not owned, a colour it does not come in, a wrong layer, an unknown pattern and a bad value', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      const room = (extra: object) => skin(p, { target: 'room', roomId: HEARTH, ...extra });
      expect(await room({ wall: 'paper-damask:rose' })).toMatchObject({
        status: 409,
        body: { error: 'not_owned' },
      });
      expect(await room({ wall: 'paper-plain:oak' })).toMatchObject({
        status: 409,
        body: { error: 'bad_colour' },
      });
      expect(await room({ wall: 'paper-plain' })).toMatchObject({
        status: 409,
        body: { error: 'bad_colour' },
      });
      expect(await room({ wall: 'cosy-wall:rose' })).toMatchObject({
        status: 409,
        body: { error: 'bad_colour' },
      });
      expect(await room({ trim: 'paper-plain:rose' })).toMatchObject({
        status: 409,
        body: { error: 'skin_mismatch' },
      });
      expect(await room({ ceiling: 'trim-skirting:paint-white' })).toMatchObject({
        status: 409,
        body: { error: 'skin_mismatch' },
      });
      expect(await room({ wall: 'paper-nothing:rose' })).toMatchObject({ status: 404 });
      for (const bad of ['Paper', 'a:b:c', 'paper-plain;trim=x', 'paper-plain:rose ', '']) {
        expect((await room({ wall: bad })).status, bad).toBe(400);
      }
      expect((await skin(p, { target: 'exterior', frame: 'frame-timber:oak', x: 1 })).status).toBe(
        400,
      );
      // Nothing changed.
      expect((await own(p)).house.rooms[0]).toMatchObject({
        wall: 'cosy-wall',
        trim: null,
        ceiling: null,
      });
    });
  });

  it('gives an outdoor room no trim or ceiling', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx);
        await p.tool('housing-build', { parts: ['cottage', 'garden'] });
        expect(
          await skin(p, {
            target: 'room',
            roomId: 'garden:garden',
            trim: 'trim-skirting:paint-white',
          }),
        ).toMatchObject({ status: 409, body: { error: 'skin_mismatch' } });
        expect(
          await skin(p, { target: 'room', roomId: 'garden:garden', ceiling: null }),
        ).toMatchObject({ status: 409, body: { error: 'skin_mismatch' } });
      },
      { dev: true },
    );
  });
});

describe('the frame', () => {
  it('sets the house frame beside the roof and walls, and takes it off with null', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      const set = parsed(
        SkinAnswerSchema,
        await skin(p, { target: 'exterior', frame: 'frame-timber:dark' }),
      );
      expect(set).toEqual({
        target: 'exterior',
        exterior: { roof: 'thatch', walls: 'plaster', frame: 'frame-timber:dark' },
      });
      // Changing the walls keeps the frame.
      grant(ctx, p.id, 'timber');
      const walls = parsed(
        SkinAnswerSchema,
        await skin(p, { target: 'exterior', walls: 'timber' }),
      );
      expect(walls).toEqual({
        target: 'exterior',
        exterior: { roof: 'thatch', walls: 'timber', frame: 'frame-timber:dark' },
      });
      expect((await own(p)).house.exterior.frame).toBe('frame-timber:dark');
      const off = parsed(SkinAnswerSchema, await skin(p, { target: 'exterior', frame: null }));
      expect(off).toEqual({
        target: 'exterior',
        exterior: { roof: 'thatch', walls: 'timber', frame: null },
      });
      expect(column(ctx, p.id, 'SELECT walls FROM houses WHERE user_id = ?')).toEqual({
        walls: 'timber',
      });
      expect(await skin(p, { target: 'exterior', frame: 'frame-stone:grey' })).toMatchObject({
        status: 409,
        body: { error: 'not_owned' },
      });
      expect(await skin(p, { target: 'exterior', frame: 'frame-timber:grey' })).toMatchObject({
        status: 409,
        body: { error: 'bad_colour' },
      });
    });
  });

  it("shows a visitor the owner's layers, read only", async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx, 1);
      const q = await householder(ctx, 2);
      await skin(p, { target: 'exterior', frame: 'frame-timber:oak' });
      await skin(p, { target: 'room', roomId: HEARTH, wall: 'paper-plain:sky', trim: null });
      const visit = parsed(VisitAnswerSchema, await q.call('GET', `/api/houses/${p.id}`));
      expect(visit.house.exterior.frame).toBe('frame-timber:oak');
      expect(visit.house.rooms[0]).toMatchObject({ wall: 'paper-plain:sky', trim: null });
    });
  });
});

function grant(ctx: CoreContext, userId: string, id: string): void {
  ctx.sql.exec(
    "INSERT INTO house_items (user_id, kind, item_id, count, fresh, at) VALUES (?, 'skin', ?, 1, 0, ?) ON CONFLICT DO NOTHING",
    userId,
    id,
    ctx.clock.t,
  );
}

describe('making a pattern', () => {
  it('makes a workbench pattern once, keyed, then wears it in every colour', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      const price = skinPrice(content, 'paper-brick');
      const bait = price.find((l) => l.kind === 'bait')?.amount ?? 0;
      const scrap = price.find((l) => l.kind === 'scrap')?.amount ?? 0;
      stock(ctx, p.id, { bait: bait + 3, scrap: scrap + 4, materials: { 'sea-glass': 1 } });
      // Not owned yet.
      expect(
        await skin(p, { target: 'room', roomId: HEARTH, wall: 'paper-brick:ochre' }),
      ).toMatchObject({ status: 409, body: { error: 'not_owned' } });
      const key = newKey();
      const made = parsed(CraftAnswerSchema, await craft(p, 'paper-brick', key));
      expect(made).toMatchObject({ itemId: 'paper-brick', kind: 'skin', count: 1 });
      expect(made.purse).toMatchObject({ bait: 3, scrap: 4 });
      expect(made.materials['sea-glass']?.have).toBe(0);
      // The same key: the stored answer, nothing taken twice.
      expect(parsed(CraftAnswerSchema, await craft(p, 'paper-brick', key))).toEqual(made);
      // A new key: already owned (one make gives every colour).
      expect(await craft(p, 'paper-brick')).toMatchObject({
        status: 409,
        body: { error: 'already_owned' },
      });
      for (const colour of ['ochre', 'midnight', 'white']) {
        const worn = parsed(
          SkinAnswerSchema,
          await skin(p, { target: 'room', roomId: HEARTH, wall: `paper-brick:${colour}` }),
        );
        expect(worn).toMatchObject({ room: { wall: `paper-brick:${colour}` } });
      }
    });
  });

  it('cannot make a starter, nor a drop or feat pattern before its blueprint', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      stock(ctx, p.id, { bait: 999, scrap: 999, materials: { 'sea-silk': 9, driftwood: 9 } });
      expect(await craft(p, 'paper-plain')).toMatchObject({
        status: 409,
        body: { error: 'already_owned' },
      });
      expect(await craft(p, 'paper-damask')).toMatchObject({
        status: 409,
        body: { error: 'not_known' },
      });
      expect(await craft(p, 'ceiling-coffered')).toMatchObject({
        status: 409,
        body: { error: 'not_known' },
      });
      stock(ctx, p.id, { blueprints: ['paper-damask'] });
      parsed(CraftAnswerSchema, await craft(p, 'paper-damask'));
      parsed(
        SkinAnswerSchema,
        await skin(p, { target: 'room', roomId: HEARTH, wall: 'paper-damask:midnight' }),
      );
    });
  });
});
