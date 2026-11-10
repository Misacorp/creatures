import {
  RULES,
  HouseAnswerSchema,
  HousemateAnswerSchema,
  PlaceAnswerSchema,
  SkinAnswerSchema,
  VisitAnswerSchema,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { gameDay } from '../src/time';
import { player, type Dev } from './dev-helpers';
import type { CoreContext } from './helpers';
import { householder, parsed, runHouse, stock } from './housing-helpers';
import { count } from './raid-helpers';

const HEARTH = 'hut:hearth';

const place = (p: Dev, roomId: string, spotId: string, pieceId: string | null) =>
  p.call('PUT', '/api/house/place', { roomId, spotId, pieceId });
const skin = (p: Dev, body: unknown) => p.call('PUT', '/api/house/skin', body);
const mate = (p: Dev, roomId: string, spotId: string, creatureId: string | null) =>
  p.call('PUT', '/api/house/housemate', { roomId, spotId, creatureId });
const own = async (p: Dev) => parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));

describe('placing pieces', () => {
  it('puts a piece in a spot, frees the piece it replaces, and empties a spot', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      const first = parsed(
        PlaceAnswerSchema,
        await place(p, HEARTH, 'floor-large-a', 'cosy-cupboard'),
      );
      expect(first.room.spots['floor-large-a']).toBe('cosy-cupboard');
      // The sofa that stood there is free again; the one cupboard is in use.
      expect(first.own.free['cosy-sofa']).toBe(1);
      expect(first.own.free['cosy-cupboard']).toBe(0);
      const back = parsed(PlaceAnswerSchema, await place(p, HEARTH, 'floor-large-a', 'cosy-sofa'));
      expect(back.room.spots['floor-large-a']).toBe('cosy-sofa');
      expect(back.own.free['cosy-cupboard']).toBe(1);
      const empty = parsed(PlaceAnswerSchema, await place(p, HEARTH, 'floor-large-a', null));
      expect(empty.room.spots['floor-large-a']).toBeNull();
      expect(empty.own.free['cosy-sofa']).toBe(1);
      // It sticks: the house view shows the empty spot.
      expect((await own(p)).house.rooms[0]?.spots['floor-large-a']).toBeNull();
    });
  });

  it('checks the fit, the room, the spot and the piece', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      // A lamp hangs from the ceiling, not on the rug.
      expect(await place(p, HEARTH, 'rug-a', 'cosy-lamp')).toMatchObject({
        status: 409,
        body: { error: 'spot_mismatch' },
      });
      // Displays take nothing placed.
      expect(await place(p, HEARTH, 'mantel', 'cosy-clock')).toMatchObject({
        status: 409,
        body: { error: 'spot_mismatch' },
      });
      // A room that is not built, a spot the room has not, a piece that does not exist.
      expect(await place(p, 'cottage:kitchen', 'rug-a', 'cosy-rug')).toMatchObject({ status: 404 });
      expect(await place(p, HEARTH, 'no-such-spot', 'cosy-rug')).toMatchObject({ status: 404 });
      expect(await place(p, HEARTH, 'rug-a', 'no-such-piece')).toMatchObject({ status: 404 });
      // Malformed ids never reach the game.
      expect(await place(p, 'hearth', 'rug-a', 'cosy-rug')).toMatchObject({ status: 400 });
      expect(
        (await p.call('PUT', '/api/house/place', { roomId: HEARTH, spotId: 'rug-a' })).status,
      ).toBe(400);
      expect(
        (
          await p.call('PUT', '/api/house/place', {
            roomId: HEARTH,
            spotId: 'rug-a',
            pieceId: null,
            owner: p.id,
          })
        ).status,
      ).toBe(400);
    });
  });

  it('never places more copies than are owned: none_free, until a copy is freed', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx);
        await p.tool('housing-build', { parts: ['cottage'] });
        // One cupboard: in the Loft once, then not a second time.
        expect((await place(p, 'cottage:loft', 'floor-large-a', 'cosy-cupboard')).status).toBe(200);
        expect(await place(p, 'cottage:loft', 'floor-large-b', 'cosy-cupboard')).toMatchObject({
          status: 409,
          body: { error: 'none_free' },
        });
        // A piece the player does not own at all is the same refusal.
        expect(await place(p, 'cottage:loft', 'floor-large-b', 'tidepool-cupboard')).toMatchObject({
          status: 409,
          body: { error: 'none_free' },
        });
        await place(p, 'cottage:loft', 'floor-large-a', null);
        expect((await place(p, 'cottage:loft', 'floor-large-b', 'cosy-cupboard')).status).toBe(200);
        // A second copy makes room for both.
        stock(ctx, p.id, { pieces: { 'cosy-cupboard': 1 } });
        expect((await place(p, 'cottage:loft', 'floor-large-a', 'cosy-cupboard')).status).toBe(200);
      },
      { dev: true },
    );
  });

  it('keeps one bed to a room', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx);
        await p.tool('housing-build', { parts: ['cottage'] });
        stock(ctx, p.id, { pieces: { hammock: 1 } });
        expect((await place(p, 'cottage:loft', 'floor-large-a', 'cosy-bed')).status).toBe(200);
        expect(await place(p, 'cottage:loft', 'floor-large-b', 'hammock')).toMatchObject({
          status: 409,
          body: { error: 'spot_mismatch' },
        });
        // Another room takes it.
        expect((await place(p, HEARTH, 'floor-large-a', 'hammock')).status).toBe(200);
      },
      { dev: true },
    );
  });

  it("changes only the caller's house, and another player's house is read-only", async () => {
    await runHouse(async (ctx) => {
      const a = await householder(ctx, 1);
      const b = await householder(ctx, 2);
      await place(a, HEARTH, 'floor-large-a', null);
      expect((await own(b)).house.rooms[0]?.spots['floor-large-a']).toBe('cosy-sofa');
      // A visit has no `own` part (the strict answer would fail with one) and no way to write.
      const visit = parsed(VisitAnswerSchema, await b.call('GET', `/api/houses/${a.id}`));
      expect(visit.house.rooms[0]?.spots['floor-large-a']).toBeNull();
      for (const method of ['PUT', 'POST', 'DELETE'] as const) {
        expect((await b.call(method, `/api/houses/${a.id}`, {})).status).toBe(405);
      }
      // The bodies take no owner: the room id means the caller's own room.
      expect(
        (
          await b.call('PUT', '/api/house/place', {
            roomId: HEARTH,
            spotId: 'floor-large-a',
            pieceId: null,
            userId: a.id,
          })
        ).status,
      ).toBe(400);
    });
  });
});

describe('skins', () => {
  const grantSkin = (ctx: CoreContext, userId: string, id: string): void => {
    ctx.sql.exec(
      "INSERT INTO house_items (user_id, kind, item_id, count, fresh, at) VALUES (?, 'skin', ?, 1, 0, ?)",
      userId,
      id,
      ctx.clock.t,
    );
  };

  it("changes a room's wallpaper and floor and the house's roof and walls, from owned skins of the right kind", async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      grantSkin(ctx, p.id, 'tidepool-wall');
      grantSkin(ctx, p.id, 'tidepool-floor');
      grantSkin(ctx, p.id, 'slate');
      grantSkin(ctx, p.id, 'timber');
      const room = parsed(
        SkinAnswerSchema,
        await skin(p, {
          target: 'room',
          roomId: HEARTH,
          wall: 'tidepool-wall',
          floor: 'tidepool-floor',
        }),
      );
      expect(room.house.rooms[0]).toMatchObject({ wall: 'tidepool-wall', floor: 'tidepool-floor' });
      const outside = parsed(
        SkinAnswerSchema,
        await skin(p, { target: 'exterior', roof: 'slate', walls: 'timber' }),
      );
      expect(outside.house.exterior).toEqual({ roof: 'slate', walls: 'timber' });
      // Only the named side changes.
      const roofOnly = parsed(
        SkinAnswerSchema,
        await skin(p, { target: 'exterior', roof: 'thatch' }),
      );
      expect(roofOnly.house.exterior).toEqual({ roof: 'thatch', walls: 'timber' });
    });
  });

  it('refuses a skin that is not owned, of the wrong kind, unknown, or for a room that is not built', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      grantSkin(ctx, p.id, 'tidepool-wall');
      expect(await skin(p, { target: 'room', roomId: HEARTH, wall: 'moonlit-wall' })).toMatchObject(
        {
          status: 409,
          body: { error: 'not_owned' },
        },
      );
      expect(
        await skin(p, { target: 'room', roomId: HEARTH, floor: 'tidepool-wall' }),
      ).toMatchObject({
        status: 409,
        body: { error: 'skin_mismatch' },
      });
      expect(await skin(p, { target: 'exterior', roof: 'tidepool-wall' })).toMatchObject({
        status: 409,
        body: { error: 'skin_mismatch' },
      });
      expect(await skin(p, { target: 'room', roomId: HEARTH, wall: 'no-such-skin' })).toMatchObject(
        {
          status: 404,
        },
      );
      expect(
        await skin(p, { target: 'room', roomId: 'cottage:kitchen', wall: 'tidepool-wall' }),
      ).toMatchObject({ status: 404 });
      // Neither side named, or a stray key: not a body.
      expect((await skin(p, { target: 'room', roomId: HEARTH })).status).toBe(400);
      expect((await skin(p, { target: 'exterior' })).status).toBe(400);
      expect((await skin(p, { target: 'exterior', roof: 'thatch', price: 0 })).status).toBe(400);
      // Nothing changed.
      expect((await own(p)).house.rooms[0]?.wall).toBe('cosy-wall');
    });
  });

  it('gives outdoor rooms their ground skins', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx);
        await p.tool('housing-build', { parts: ['cottage', 'garden'] });
        const ok = await skin(p, { target: 'room', roomId: 'garden:garden', floor: 'deck' });
        expect(
          parsed(SkinAnswerSchema, ok).house.rooms.find((r) => r.id === 'garden:garden')?.floor,
        ).toBe('deck');
        expect(
          await skin(p, { target: 'room', roomId: 'garden:garden', floor: 'cosy-floor' }),
        ).toMatchObject({
          status: 409,
          body: { error: 'skin_mismatch' },
        });
      },
      { dev: true },
    );
  });
});

describe('housemates', () => {
  /** A player with four creatures, a cottage and a house built, and a bed in four rooms' worth of stock. */
  async function homebody(ctx: CoreContext, n = 1): Promise<Dev> {
    const p = await player(ctx, n, { creatures: 4 });
    await p.tool('housing-build', { parts: ['cottage', 'house'] });
    stock(ctx, p.id, { pieces: { hammock: 1, 'tidepool-bed': 1, 'emberhold-bed': 1 } });
    return p;
  }

  it('puts a creature on a bed, shows it at home, and moves it when it is put on another bed', async () => {
    await runHouse(
      async (ctx) => {
        const p = await homebody(ctx);
        const [a] = p.creatureIds;
        expect((await place(p, HEARTH, 'floor-large-a', 'cosy-bed')).status).toBe(200);
        expect((await place(p, 'cottage:loft', 'floor-large-a', 'hammock')).status).toBe(200);
        const one = parsed(HousemateAnswerSchema, await mate(p, HEARTH, 'floor-large-a', a ?? ''));
        expect(one.housemates).toHaveLength(1);
        expect(one.housemates[0]).toMatchObject({
          roomId: HEARTH,
          spotId: 'floor-large-a',
          home: true,
        });
        expect(one.housemates[0]?.creature.id).toBe(a);
        // On the other bed it moves: the first bed is made.
        const moved = parsed(
          HousemateAnswerSchema,
          await mate(p, 'cottage:loft', 'floor-large-a', a ?? ''),
        );
        expect(moved.housemates.map((h) => h.roomId)).toEqual(['cottage:loft']);
        // It shows in the house view too, and clears with null.
        expect((await own(p)).house.housemates).toHaveLength(1);
        const cleared = parsed(
          HousemateAnswerSchema,
          await mate(p, 'cottage:loft', 'floor-large-a', null),
        );
        expect(cleared.housemates).toEqual([]);
      },
      { dev: true },
    );
  });

  it("takes the caller's own creatures only, and only on a bed", async () => {
    await runHouse(
      async (ctx) => {
        const p = await homebody(ctx, 1);
        const q = await player(ctx, 2);
        await place(p, HEARTH, 'floor-large-a', 'cosy-bed');
        expect(await mate(p, HEARTH, 'floor-large-a', q.creatureIds[0] ?? '')).toMatchObject({
          status: 404,
          body: { error: 'creature_not_found' },
        });
        expect(
          await mate(p, HEARTH, 'floor-large-a', '00000000-0000-4000-8000-000000000000'),
        ).toMatchObject({ status: 404, body: { error: 'creature_not_found' } });
        // The wall-large spot has a shelf, not a bed; an empty spot is not a bed either.
        expect(await mate(p, HEARTH, 'wall-large-a', p.creatureIds[0] ?? '')).toMatchObject({
          status: 409,
          body: { error: 'not_a_bed' },
        });
        expect(await mate(p, HEARTH, 'rug-a', null)).toMatchObject({
          status: 409,
          body: { error: 'not_a_bed' },
        });
        expect(await mate(p, 'cellar:cellar', 'rug-a', null)).toMatchObject({ status: 404 });
        expect((await mate(p, HEARTH, 'floor-large-a', 'not-a-uuid')).status).toBe(400);
        expect(count(ctx.sql, 'house_rooms', `spots_json LIKE '%"m"%'`)).toBe(0);
      },
      { dev: true },
    );
  });

  it('keeps at most three housemates', async () => {
    await runHouse(
      async (ctx) => {
        const p = await homebody(ctx);
        const [a, b, c, d] = p.creatureIds as [string, string, string, string];
        await place(p, HEARTH, 'floor-large-a', 'cosy-bed');
        await place(p, 'cottage:loft', 'floor-large-a', 'hammock');
        await place(p, 'cottage:kitchen', 'floor-large-a', 'tidepool-bed');
        await place(p, 'house:study', 'floor-large-a', 'emberhold-bed');
        expect((await mate(p, HEARTH, 'floor-large-a', a)).status).toBe(200);
        expect((await mate(p, 'cottage:loft', 'floor-large-a', b)).status).toBe(200);
        expect((await mate(p, 'cottage:kitchen', 'floor-large-a', c)).status).toBe(200);
        expect(await mate(p, 'house:study', 'floor-large-a', d)).toMatchObject({
          status: 409,
          body: { error: 'housemate_cap' },
        });
        // Swapping a sleeper in a full house is fine; so is moving one.
        expect((await mate(p, HEARTH, 'floor-large-a', d)).status).toBe(200);
        expect((await mate(p, 'house:study', 'floor-large-a', c)).status).toBe(200);
      },
      { dev: true },
    );
  });

  it('shows a creature away while on a trip or in an open dungeon run, and drops one that was released', async () => {
    await runHouse(
      async (ctx) => {
        const p = await homebody(ctx);
        const [a, b, c] = p.creatureIds as [string, string, string];
        await place(p, HEARTH, 'floor-large-a', 'cosy-bed');
        await place(p, 'cottage:loft', 'floor-large-a', 'hammock');
        await place(p, 'cottage:kitchen', 'floor-large-a', 'tidepool-bed');
        await mate(p, HEARTH, 'floor-large-a', a);
        await mate(p, 'cottage:loft', 'floor-large-a', b);
        await mate(p, 'cottage:kitchen', 'floor-large-a', c);
        const homes = async (): Promise<Record<string, boolean>> =>
          Object.fromEntries((await own(p)).house.housemates.map((h) => [h.creature.id, h.home]));
        expect(await homes()).toEqual({ [a]: true, [b]: true, [c]: true });
        // A trip.
        ctx.sql.exec('UPDATE creatures SET away_expedition_id = ? WHERE id = ?', 'trip-1', a);
        // An open dungeon run of today that has the creature in its row.
        const today = gameDay(ctx.clock.t, ctx.core.timezone(), RULES.daily.reset);
        ctx.sql.exec(
          `INSERT INTO dungeon_runs (id, user_id, day, attempt, idempotency_key, fingerprint, depth, seed, cleared,
             rooms_cleared, summary_json, rewards_json, created_at, status, state_json)
           VALUES ('run-1', ?, ?, 1, 'run-key-1', 'f', 1, '', 0, 0, '{}', '{}', ?, 'active', ?)`,
          p.id,
          today,
          ctx.clock.t,
          // An id that only appears in some other field of the state (`note`) is not in the row.
          JSON.stringify({ v: 1, everyone: [b], note: c }),
        );
        const away = await homes();
        expect(away[a]).toBe(false);
        expect(away[b]).toBe(false);
        expect(away[c]).toBe(true);
        // A released creature drops off its bed (the read cleans the spot).
        ctx.sql.exec('DELETE FROM creatures WHERE id = ?', c);
        expect(Object.keys(await homes()).sort()).toEqual([a, b].sort());
        expect(count(ctx.sql, 'house_rooms', `spots_json LIKE '%${c}%'`)).toBe(0);
      },
      { dev: true },
    );
  });
});
