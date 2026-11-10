/**
 * Review fixes of the housing server: a part paid in full after a price drop is finished by itself, the mailbox has a cap and a small
 * read, the valley settles before housing's spending routes, a spot content no longer has releases its piece, and `dev-guest-N` houses
 * open only where the dev tools are on.
 */
import {
  BuildAnswerSchema,
  createSeededRng,
  HouseAnswerSchema,
  HOUSING_RULES,
  lineKey,
  type PriceLine,
} from '@creatures/game';
import { describe, expect, it, vi } from 'vitest';
import { ON, player } from './dev-helpers';
import { runCore } from './helpers';
import { content, householder, parsed, runHouse } from './housing-helpers';
import { isHousingNoSpendPath } from '../src/housing-routes';
import { newKey } from './kit';
import { count, nextGuild, rows } from './raid-helpers';

const cottage = content.parts.find((p) => p.id === 'cottage');
if (cottage === undefined) throw new Error('no cottage');

/** What a part's rows hold when every line is paid in full (as if the price had been lowered to it). */
function fullyPaidJson(lines: readonly PriceLine[]): string {
  const paid: Record<string, number | Record<string, number>> = {};
  for (const line of lines) {
    paid[lineKey(line)] = line.kind === 'family' ? { driftwood: line.amount } : line.amount;
  }
  return JSON.stringify(paid);
}

function markPaidNotBuilt(sql: SqlStorage, userId: string): void {
  sql.exec(
    'INSERT INTO house_parts (user_id, part_id, paid_json, built_at) VALUES (?, ?, ?, NULL)',
    userId,
    'cottage',
    fullyPaidJson(cottage?.price ?? []),
  );
}

describe('a part paid in full but not built (a price was lowered)', () => {
  it('is finished by a build request that takes nothing', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      markPaidNotBuilt(ctx.sql, p.id);
      const bait = ctx.core.balances(p.id).bait;
      const res = parsed(
        BuildAnswerSchema,
        await p.call('POST', '/api/house/build', {
          partId: 'cottage',
          pay: {},
          idempotencyKey: newKey(),
        }),
      );
      expect(res.built).toBe(true);
      expect(res.part.remaining).toEqual([]);
      expect(res.house?.built).toContain('cottage');
      expect(ctx.core.balances(p.id).bait).toBe(bait);
      expect(count(ctx.sql, 'house_parts', `user_id = '${p.id}' AND built_at IS NULL`)).toBe(0);
    });
  });

  it('is finished when the own house is opened, with no request from the player', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      markPaidNotBuilt(ctx.sql, p.id);
      const view = parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));
      expect(view.house.built).toContain('cottage');
      expect(view.own.progress.map((x) => x.partId)).not.toContain('cottage');
      expect(count(ctx.sql, 'house_parts', `user_id = '${p.id}' AND built_at IS NULL`)).toBe(0);
    });
  });
});

describe('the mailbox', () => {
  const insertOpen = (sql: SqlStorage, ownerId: string, n: number): void => {
    for (let i = 0; i < n; i++) {
      sql.exec(
        "INSERT INTO house_mail (owner_id, from_id, kind, amount, day, at) VALUES (?, ?, 'gift', 5, ?, 1)",
        ownerId,
        `giver-${String(i % 40)}`,
        `old-${String(i)}`,
      );
    }
  };

  it('refuses a new gift once the open mail reaches the cap', async () => {
    await runHouse(async (ctx) => {
      const owner = await householder(ctx, 1);
      insertOpen(ctx.sql, owner.id, HOUSING_RULES.gift.mailCap);
      const giver = await player(ctx, 2);
      expect(
        await giver.call('POST', `/api/houses/${owner.id}/gift`, { idempotencyKey: newKey() }),
      ).toMatchObject({ status: 409, body: { error: 'gift_cap_reached' } });
      // Collecting empties the box, and the gift is welcome again.
      const done = await owner.call('POST', '/api/house/mail/collect', {
        idempotencyKey: newKey(),
      });
      expect(done).toMatchObject({
        status: 200,
        body: { collected: 5 * HOUSING_RULES.gift.mailCap },
      });
      expect(
        (await giver.call('POST', `/api/houses/${owner.id}/gift`, { idempotencyKey: newKey() }))
          .status,
      ).toBe(200);
    });
  });

  it('reads a long box with an aggregate and names at most 32 givers; collect claims everything', async () => {
    await runHouse(async (ctx) => {
      const owner = await householder(ctx, 1);
      insertOpen(ctx.sql, owner.id, 80);
      const view = parsed(HouseAnswerSchema, await owner.call('GET', '/api/house'));
      expect(view.own.mailbox.gifts).toBe(80);
      expect(view.own.mailbox.acorns).toBe(400);
      expect(view.own.mailbox.from).toHaveLength(HOUSING_RULES.gift.giversShown);
      const done = await owner.call('POST', '/api/house/mail/collect', {
        idempotencyKey: newKey(),
      });
      expect(done).toMatchObject({ status: 200, body: { collected: 400 } });
      expect(count(ctx.sql, 'house_mail', `owner_id = '${owner.id}' AND claimed_at IS NULL`)).toBe(
        0,
      );
    });
  });
});

describe('the valley settles before housing spends', () => {
  it('settles for build, craft, gift and collect, and not for decorating writes', () => {
    for (const path of [
      '/api/house/build',
      '/api/house/craft',
      '/api/house/mail/collect',
      '/api/houses/800000000000000001/gift',
    ]) {
      expect(isHousingNoSpendPath(path), path).toBe(false);
    }
    for (const path of [
      '/api/house/place',
      '/api/house/skin',
      '/api/house/housemate',
      '/api/house/seen',
      '/api/houses/800000000000000001/stamp',
    ]) {
      expect(isHousingNoSpendPath(path), path).toBe(true);
    }
  });

  it('runs the valley pass on a build request with the valley on, not on a placement', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await householder(ctx);
        const valley = ctx.core.valley;
        if (valley === null) throw new Error('the valley is off');
        const settle = vi.spyOn(valley, 'settle');
        await p.call('POST', '/api/house/build', {
          partId: 'cottage',
          pay: { bait: 1 },
          idempotencyKey: newKey(),
        });
        expect(settle).toHaveBeenCalledWith(p.id, 'intent');
        settle.mockClear();
        await p.call('PUT', '/api/house/place', {
          roomId: 'hut:hearth',
          spotId: 'x',
          pieceId: null,
        });
        expect(settle).not.toHaveBeenCalled();
      },
      {
        ...ON,
        valleySystems: true,
        combatV2: true,
        housing: true,
        housingRng: createSeededRng('housing-tests'),
      },
    );
  });
});

describe('a spot content no longer has', () => {
  it('releases its piece when the own house is opened', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx);
      const [spotId, pieceId] = Object.entries(content.starter.layout)[0] ?? [];
      if (spotId === undefined || pieceId === undefined) throw new Error('no starter layout');
      const room = rows<{ room_id: string; spots_json: string }>(
        ctx.sql,
        'SELECT room_id, spots_json FROM house_rooms WHERE user_id = ?',
        p.id,
      ).find((r) => r.spots_json.includes(spotId));
      if (room === undefined) throw new Error('no starter room');
      const spots = JSON.parse(room.spots_json) as Record<string, { p: string }>;
      spots['gone-spot'] = { p: pieceId };
      ctx.sql.exec(
        'UPDATE house_rooms SET spots_json = ? WHERE user_id = ? AND room_id = ?',
        JSON.stringify(spots),
        p.id,
        room.room_id,
      );
      const view = parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));
      expect(
        Object.keys(view.house.rooms.find((r) => r.id === room.room_id)?.spots ?? {}),
      ).not.toContain('gone-spot');
      const after = rows<{ spots_json: string }>(
        ctx.sql,
        'SELECT spots_json FROM house_rooms WHERE user_id = ? AND room_id = ?',
        p.id,
        room.room_id,
      )[0];
      expect(after?.spots_json).not.toContain('gone-spot');
    });
  });
});

describe('dev guests', () => {
  it('open only where the dev tools are on', async () => {
    for (const dev of [false, true]) {
      await runHouse(
        async (ctx) => {
          const a = await householder(ctx, 1);
          ctx.core.housing?.ensure('dev-guest-1');
          const res = await a.call('GET', '/api/houses/dev-guest-1');
          expect(res.status).toBe(dev ? 200 : 404);
        },
        { dev },
      );
    }
  });
});
